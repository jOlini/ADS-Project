"""Monitoramento da API: alertas e telemetria no Discord, um webhook por canal.

Canais (cada um é um webhook do Discord; vazio = canal desligado, o padrão):
- sistema (#alertas-sistema): erro não tratado (500), e-mail da conta que não
  saiu e API no ar (só em produção, para a recarga do desenvolvimento não
  virar ruído).
- seguranca (#logs-seguranca): 429 do login (força bruta) e dos e-mails da
  conta, e rajada de 401 vinda do mesmo endereço (senha, token ou ID token
  testados em série).
- telemetria (#telemetria-custos): resumo de uso a cada
  TELEMETRIA_INTERVALO_HORAS (pedidos por grupo de rota, respostas 4xx e 5xx,
  e-mails enviados) e aviso quando os e-mails das últimas 24 horas chegam a
  80% e a 100% da cota do provedor (EMAIL_COTA_DIARIA).

Três regras valem para tudo:
- Nunca atrasa nem derruba uma resposta: o alerta entra numa fila e sai por
  uma thread própria. Se o Discord falhar, fica uma linha no log e a API segue.
- Nada de dado pessoal nem segredo: sem e-mail, token, corpo, cabeçalho,
  mensagem de exceção ou stack trace. O endereço IP vai só para o canal de
  segurança, onde é o dado que permite bloquear quem ataca (Cloudflare,
  firewall). A rota aparece como modelo (/espacos/{espaco_id}), nunca com o
  caminho digitado por quem chamou.
- O mesmo alerta (mesma chave) sai no máximo uma vez a cada 15 minutos; as
  repetições do intervalo aparecem no envio seguinte. Um ataque com milhares
  de pedidos vira uma mensagem, não milhares.
"""

import json
import logging
import queue
import threading
import time
import traceback
import urllib.error
import urllib.request
from collections import Counter
from datetime import UTC, datetime
from enum import StrEnum
from math import ceil
from pathlib import Path

from app.limites import FalhasEmMemoria

log = logging.getLogger("uvicorn.error")


class Canal(StrEnum):
    SISTEMA = "sistema"
    SEGURANCA = "seguranca"
    TELEMETRIA = "telemetria"


class Nivel(StrEnum):
    INFO = "info"
    AVISO = "aviso"
    CRITICO = "critico"


# Faixa lateral da mensagem no Discord: verde da marca OliFine, âmbar e vermelho.
COR_DO_NIVEL = {Nivel.INFO: 0x459B72, Nivel.AVISO: 0xC8872F, Nivel.CRITICO: 0xB94A44}

INTERVALO_ENTRE_REPETICOES = 15 * 60
# Rajada de 401: 10 recusas do mesmo endereço em 5 minutos. Um token vencido
# gera um 401 e o app renova a sessão; dez seguidos é script.
LIMITE_DE_401 = 10
JANELA_DE_401 = 5 * 60
DIA = 24 * 60 * 60
# Frações da cota diária de e-mails que geram aviso na telemetria.
AVISOS_DE_COTA = ((1.0, Nivel.CRITICO, "Cota diária de e-mails atingida"), (0.8, Nivel.AVISO, "E-mails perto da cota diária"))

TIMEOUT_DO_DISCORD = 5
TAMANHO_DA_FILA = 200
# Acima disto, as chaves de repetição vencidas são varridas (memória limitada).
CHAVES_ANTES_DA_LIMPEZA = 10_000

# Grupos de rota da telemetria. Caminho fora da lista conta como "outros": um
# robô que varre /wp-admin, /.env e afins não cria uma linha por endereço.
GRUPOS_DE_ROTA = {"auth", "usuarios", "espacos", "conta", "painel", "saude", "docs", "openapi.json"}
DESCRICAO_DO_429 = {
    "auth": "Login do back-office travado por excesso de senhas erradas (força bruta).",
    "conta": "Limite de e-mails da conta estourado (links de confirmação ou de nova senha em série).",
}

# O Cloudflare do Discord recusa o User-Agent padrão do urllib (erro 1010).
AGENTE = "OliFine-API (monitoramento)"


def grupo_da_rota(caminho: str) -> str:
    primeiro = caminho.strip("/").split("/", 1)[0]
    return primeiro if primeiro in GRUPOS_DE_ROTA else "outros"


def enviar_ao_discord(webhook: str, corpo: dict) -> None:
    """POST no webhook. Um 429 do Discord com espera curta ganha uma segunda
    tentativa; qualquer outra falha sobe para quem chamou (e vira log)."""
    dados = json.dumps(corpo).encode("utf-8")
    for tentativa in (1, 2):
        pedido = urllib.request.Request(
            webhook, data=dados, method="POST", headers={"Content-Type": "application/json", "User-Agent": AGENTE}
        )
        try:
            with urllib.request.urlopen(pedido, timeout=TIMEOUT_DO_DISCORD):
                return
        except urllib.error.HTTPError as falha:
            espera = float((falha.headers or {}).get("Retry-After") or 0)
            if falha.code != 429 or tentativa == 2 or espera > TIMEOUT_DO_DISCORD:
                raise
            time.sleep(espera)


def onde_falhou(erro: BaseException) -> str:
    """Arquivo e linha do código da API mais perto da falha ("app/rotas.py:42").
    Só o lugar no código: a mensagem da exceção pode carregar dado de quem
    chamou e não sai daqui."""
    quadros = traceback.extract_tb(erro.__traceback__)
    for quadro in reversed(quadros):
        partes = Path(quadro.filename).parts
        if "app" in partes:
            relativo = "/".join(partes[len(partes) - partes[::-1].index("app") - 1 :])
            return f"{relativo}:{quadro.lineno}"
    return "fora do código da API"


class Monitor:
    """Alertas por canal, com fila, repetição controlada e telemetria.

    em_segundo_plano=False manda na hora, na thread de quem chama: é o modo
    dos testes (com um "enviar" falso e um relógio controlado)."""

    def __init__(
        self,
        webhooks: dict[Canal, str],
        ambiente: str = "desenvolvimento",
        *,
        cota_de_emails: int = 0,
        intervalo_do_resumo: int = DIA,
        enviar=enviar_ao_discord,
        relogio=time.monotonic,
        em_segundo_plano: bool = True,
    ):
        self._webhooks = {canal: url for canal, url in webhooks.items() if url}
        self.ambiente = ambiente
        self.cota_de_emails = cota_de_emails
        self.intervalo_do_resumo = intervalo_do_resumo
        self._enviar = enviar
        self._relogio = relogio
        self._em_segundo_plano = em_segundo_plano
        self._trava = threading.Lock()
        self._ultimo_aviso: dict[str, float] = {}
        self._repeticoes: Counter[str] = Counter()
        # Telemetria do período atual (zerada a cada resumo).
        self._respostas: Counter[tuple[str, str]] = Counter()
        self._emails_enviados = 0
        self._emails_com_falha = 0
        self._inicio_do_periodo = datetime.now(UTC)
        # Janelas deslizantes, uma por assunto: a limpeza de uma (que usa a
        # janela dela) não apaga o que a outra ainda precisa contar.
        self._emails_24h = FalhasEmMemoria()
        self._recusas = FalhasEmMemoria()
        self._fila: queue.Queue = queue.Queue(maxsize=TAMANHO_DA_FILA)
        self._parar = threading.Event()
        self._threads: list[threading.Thread] = []

    @classmethod
    def da_config(cls, config) -> "Monitor":
        return cls(
            {
                Canal.SISTEMA: config.discord_webhook_sistema.get_secret_value(),
                Canal.SEGURANCA: config.discord_webhook_seguranca.get_secret_value(),
                Canal.TELEMETRIA: config.discord_webhook_telemetria.get_secret_value(),
            },
            config.ambiente,
            cota_de_emails=config.email_cota_diaria,
            intervalo_do_resumo=config.telemetria_intervalo_horas * 60 * 60,
        )

    def ligado(self, canal: Canal) -> bool:
        return canal in self._webhooks

    @property
    def canais(self) -> list[str]:
        return [canal.value for canal in Canal if self.ligado(canal)]

    # --- Ciclo de vida (lifespan da app) ----------------------------------
    def iniciar(self, versao: str) -> None:
        if not self._webhooks:
            return
        if self._em_segundo_plano:
            self._iniciar_thread(self._laco_de_envio, "monitor-envio")
            if self.ligado(Canal.TELEMETRIA):
                self._iniciar_thread(self._laco_do_resumo, "monitor-resumo")
        log.info("Alertas no Discord ligados: %s.", ", ".join(self.canais))
        if self.ambiente == "producao":
            self.avisar(Canal.SISTEMA, "inicio", "API no ar", {"Versão": versao}, Nivel.INFO)

    def encerrar(self) -> None:
        """Manda o resumo do que foi contado desde o último e espera a fila
        esvaziar (até alguns segundos): uma atualização da API não perde a
        telemetria do dia."""
        if self.ligado(Canal.TELEMETRIA) and self._houve_movimento():
            self.enviar_resumo()
        self._parar.set()
        if self._threads:
            self._fila.put(None)
            for thread in self._threads:
                thread.join(timeout=TIMEOUT_DO_DISCORD * 2)
            self._threads.clear()

    def _iniciar_thread(self, alvo, nome: str) -> None:
        thread = threading.Thread(target=alvo, name=nome, daemon=True)
        thread.start()
        self._threads.append(thread)

    def _laco_de_envio(self) -> None:
        while (item := self._fila.get()) is not None:
            self._entregar(*item)

    def _laco_do_resumo(self) -> None:
        while not self._parar.wait(self.intervalo_do_resumo):
            self.enviar_resumo()

    # --- Envio ------------------------------------------------------------
    def avisar(self, canal: Canal, chave: str, titulo: str, campos: dict[str, str], nivel: Nivel) -> None:
        """Manda o alerta, a menos que a mesma chave tenha saído há menos de
        15 minutos (aí só conta a repetição)."""
        if not self.ligado(canal):
            return
        agora = self._relogio()
        chave = f"{canal}|{chave}"
        with self._trava:
            ultimo = self._ultimo_aviso.get(chave)
            if ultimo is not None and agora - ultimo < INTERVALO_ENTRE_REPETICOES:
                self._repeticoes[chave] += 1
                return
            if len(self._ultimo_aviso) > CHAVES_ANTES_DA_LIMPEZA:
                self._varrer(agora)
            self._ultimo_aviso[chave] = agora
            repeticoes = self._repeticoes.pop(chave, 0)
        if repeticoes:
            campos = {**campos, "Repetições desde o último aviso": str(repeticoes)}
        self._despachar(canal, self._mensagem(titulo, campos, nivel))

    def _varrer(self, agora: float) -> None:
        vencidas = [chave for chave, quando in self._ultimo_aviso.items() if agora - quando >= INTERVALO_ENTRE_REPETICOES]
        for chave in vencidas:
            del self._ultimo_aviso[chave]
            self._repeticoes.pop(chave, None)

    def _mensagem(self, titulo: str, campos: dict[str, str], nivel: Nivel) -> dict:
        # allowed_mentions vazio: nenhum texto do alerta vira @everyone.
        # Limites do Discord: título 256, campo 256/1024, 25 campos.
        return {
            "username": "OliFine",
            "allowed_mentions": {"parse": []},
            "embeds": [
                {
                    "title": titulo[:256],
                    "color": COR_DO_NIVEL[nivel],
                    "fields": [
                        {"name": nome[:256], "value": (valor or "-")[:1024], "inline": len(valor or "") <= 40}
                        for nome, valor in list(campos.items())[:25]
                    ],
                    "footer": {"text": f"API · {self.ambiente}"},
                    "timestamp": datetime.now(UTC).isoformat(timespec="seconds"),
                }
            ],
        }

    def _despachar(self, canal: Canal, mensagem: dict) -> None:
        webhook = self._webhooks[canal]
        if not self._em_segundo_plano:
            self._entregar(webhook, mensagem)
            return
        try:
            self._fila.put_nowait((webhook, mensagem))
        except queue.Full:
            log.warning("Fila de alertas cheia: um alerta do canal %s foi descartado.", canal)

    def _entregar(self, webhook: str, mensagem: dict) -> None:
        try:
            self._enviar(webhook, mensagem)
        except Exception as falha:  # noqa: BLE001 - alerta nunca derruba a API
            # Só o tipo e o código: o endereço do webhook é segredo.
            codigo = getattr(falha, "code", "")
            log.warning("Alerta não chegou ao Discord (%s %s).", type(falha).__name__, codigo)

    # --- Eventos da API -----------------------------------------------------
    def registrar_resposta(self, caminho: str, status: int, endereco: str) -> None:
        """Chamado para toda resposta (ObservadorDeRespostas)."""
        grupo = grupo_da_rota(caminho)
        if self.ligado(Canal.TELEMETRIA):
            with self._trava:
                self._respostas[(grupo, f"{status // 100}xx")] += 1
        if not self.ligado(Canal.SEGURANCA):
            return
        if status == 429:
            self.avisar(
                Canal.SEGURANCA,
                f"429|{grupo}|{endereco}",
                "Limite de tentativas estourado",
                {
                    "Rota": grupo,
                    "Endereço": endereco,
                    "O que é": DESCRICAO_DO_429.get(grupo, "Pedidos acima do limite da rota."),
                },
                Nivel.AVISO,
            )
        elif status == 401:
            agora = self._relogio()
            chave = f"401|{endereco}"
            with self._trava:
                self._recusas.registrar(chave, agora, JANELA_DE_401)
                recusas = len(self._recusas.recentes(chave, agora - JANELA_DE_401))
            if recusas >= LIMITE_DE_401:
                self.avisar(
                    Canal.SEGURANCA,
                    chave,
                    "Muitas credenciais recusadas do mesmo endereço",
                    {
                        "Endereço": endereco,
                        "Recusas (401)": f"{recusas} em {JANELA_DE_401 // 60} minutos",
                        "Última rota": grupo,
                    },
                    Nivel.AVISO,
                )

    def registrar_erro(self, metodo: str, rota: str, erro: BaseException) -> None:
        """Erro não tratado (500). A chave junta rota e tipo: o mesmo defeito
        chamado mil vezes vira um alerta com a contagem."""
        tipo = type(erro).__name__
        self.avisar(
            Canal.SISTEMA,
            f"500|{metodo} {rota}|{tipo}",
            "Erro não tratado na API (500)",
            {"Rota": f"{metodo} {rota}", "Exceção": tipo, "Onde": onde_falhou(erro)},
            Nivel.CRITICO,
        )

    def registrar_email(self, assunto: str, enviado: bool, falha: BaseException | None = None) -> None:
        """Resultado de um e-mail da conta (emails/rotas.py)."""
        if falha is not None:
            with self._trava:
                self._emails_com_falha += 1
            self.avisar(
                Canal.SISTEMA,
                f"email|{assunto}|{type(falha).__name__}",
                "E-mail da conta não saiu",
                {"E-mail": assunto, "Falha": type(falha).__name__},
                Nivel.AVISO,
            )
            return
        if not enviado or not self.ligado(Canal.TELEMETRIA):
            return
        agora = self._relogio()
        with self._trava:
            self._emails_enviados += 1
            self._emails_24h.registrar("emails", agora, DIA)
            ultimas_24h = len(self._emails_24h.recentes("emails", agora - DIA))
        if not self.cota_de_emails:
            return
        for fracao, nivel, titulo in AVISOS_DE_COTA:
            if ultimas_24h == ceil(self.cota_de_emails * fracao):
                self.avisar(
                    Canal.TELEMETRIA,
                    f"cota|{fracao}",
                    titulo,
                    {
                        "Últimas 24 horas": f"{ultimas_24h} de {self.cota_de_emails}",
                        "O que fazer": "Acima da cota o provedor recusa o envio: confira o plano (Custos).",
                    },
                    nivel,
                )

    # --- Telemetria ---------------------------------------------------------
    def _houve_movimento(self) -> bool:
        with self._trava:
            return bool(self._respostas or self._emails_enviados or self._emails_com_falha)

    def resumo(self) -> dict[str, str]:
        """Campos do resumo do período e zera a contagem."""
        agora = datetime.now(UTC)
        with self._trava:
            respostas, self._respostas = self._respostas, Counter()
            enviados, self._emails_enviados = self._emails_enviados, 0
            com_falha, self._emails_com_falha = self._emails_com_falha, 0
            inicio, self._inicio_do_periodo = self._inicio_do_periodo, agora
            ultimas_24h = len(self._emails_24h.recentes("emails", self._relogio() - DIA))

        por_grupo: Counter[str] = Counter()
        por_classe: Counter[str] = Counter()
        for (grupo, classe), quantidade in respostas.items():
            por_grupo[grupo] += quantidade
            por_classe[classe] += quantidade
        horas = max(1, round((agora - inicio).total_seconds() / 3600))
        cota = f" de {self.cota_de_emails}" if self.cota_de_emails else ""
        return {
            "Período": f"últimas {horas} h",
            "Pedidos": str(sum(por_grupo.values())),
            "Por rota": ", ".join(f"{grupo} {total}" for grupo, total in por_grupo.most_common()) or "nenhum",
            "Respostas 4xx": str(por_classe["4xx"]),
            "Respostas 5xx": str(por_classe["5xx"]),
            "E-mails enviados": str(enviados),
            "E-mails com falha": str(com_falha),
            "E-mails nas últimas 24 h": f"{ultimas_24h}{cota}",
        }

    def enviar_resumo(self) -> None:
        if not self.ligado(Canal.TELEMETRIA):
            return
        campos = self.resumo()
        # Sem a trava de repetição: o resumo tem hora marcada.
        self._despachar(Canal.TELEMETRIA, self._mensagem("Resumo de uso da API", campos, Nivel.INFO))


class ObservadorDeRespostas:
    """Middleware ASGI que passa o status de toda resposta ao Monitor
    (app.state.monitor). Fica por fora dos outros middlewares: vê também o
    413 do limite do corpo e o 500 de uma exceção não tratada."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        status = 500

        async def enviar(mensagem):
            nonlocal status
            if mensagem["type"] == "http.response.start":
                status = mensagem["status"]
            await send(mensagem)

        try:
            await self.app(scope, receive, enviar)
        finally:
            monitor = getattr(scope["app"].state, "monitor", None) if "app" in scope else None
            if monitor is not None:
                cliente = scope.get("client")
                monitor.registrar_resposta(scope["path"], status, cliente[0] if cliente else "desconhecido")
