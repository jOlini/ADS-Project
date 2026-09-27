"""Limites de uso da API: tentativas de login e tamanho do corpo.

Sem eles, o POST /auth/login (único endpoint público) aceita palpites de senha
sem parar (força bruta), e um corpo de qualquer tamanho chega inteiro à memória
antes de a validação recusar (negação de serviço).
"""

import threading
import time
from collections import deque
from math import ceil
from typing import Protocol

from fastapi import Request
from starlette.exceptions import HTTPException

from app.erros import MENSAGEM_CORPO_GRANDE, ErroMuitasTentativas, ErroMuitosPedidos, problema

# Força bruta: 5 senhas erradas para o mesmo e-mail, vindas do mesmo endereço,
# em 15 minutos, travam esse par até a falha mais antiga sair da janela. O
# limite por endereço (20) pega quem troca de e-mail a cada palpite (credential
# stuffing). O e-mail sozinho não é chave: qualquer um trancaria de propósito
# a conta do administrador.
MAXIMO_POR_EMAIL = 5
MAXIMO_POR_ENDERECO = 20
JANELA_EM_SEGUNDOS = 15 * 60

# Acima disto, as chaves vencidas são varridas de uma vez (memória limitada).
CHAVES_ANTES_DA_LIMPEZA = 10_000

# 2 MiB: folga para o maior corpo legítimo, a importação do extrato (CSV de até
# 500 mil caracteres, modelos.TAMANHO_MAXIMO_DO_CSV, com acentos e aspas).
TAMANHO_MAXIMO_DO_CORPO = 2 * 1024 * 1024


class ArmazenamentoDeFalhas(Protocol):
    """Onde ficam os instantes das senhas erradas de cada chave.

    O LimiteDeTentativas só decide (janela, máximos, espera); guardar é
    trabalho deste contrato. Hoje há uma implementação, em memória, que vale
    para uma instância da API (o docker compose sobe uma só). Com várias
    réplicas atrás de um balanceador, cada uma contaria à parte e o atacante
    ganharia 5 palpites por réplica: aí entra uma implementação com
    armazenamento comum, sem mudar mais nada no código. Duas opções:

    - Redis: um sorted set por chave, com o instante como score.
      registrar = ZADD chave agora agora + EXPIRE chave janela;
      recentes = ZREMRANGEBYSCORE chave -inf desde + ZRANGE chave 0 -1
      WITHSCORES; zerar = DEL chave. As duas primeiras numa transação
      (MULTI/EXEC) ou num script Lua, para as réplicas não se atropelarem.
    - MongoDB (já está no projeto): um documento por falha {chave, instante,
      expira_em} com índice TTL em expira_em e índice em (chave, instante).

    Com armazenamento comum, o relógio do LimiteDeTentativas passa a ser
    time.time (o time.monotonic de cada máquina começa num ponto diferente).
    """

    def registrar(self, chave: str, agora: float, janela: int) -> None: ...

    def recentes(self, chave: str, desde: float) -> list[float]:
        """Instantes posteriores a "desde", do mais antigo ao mais novo."""
        ...

    def zerar(self, chave: str) -> None: ...


class FalhasEmMemoria:
    """Implementação em memória, da instância que roda. As rotas síncronas do
    FastAPI rodam em threads, daí a trava."""

    def __init__(self):
        self._falhas: dict[str, deque[float]] = {}
        self._trava = threading.Lock()

    def registrar(self, chave: str, agora: float, janela: int) -> None:
        with self._trava:
            if len(self._falhas) > CHAVES_ANTES_DA_LIMPEZA:
                vencidas = [nome for nome, falhas in self._falhas.items() if falhas[-1] <= agora - janela]
                for nome in vencidas:
                    del self._falhas[nome]
            self._falhas.setdefault(chave, deque()).append(agora)

    def recentes(self, chave: str, desde: float) -> list[float]:
        with self._trava:
            falhas = self._falhas.get(chave)
            if falhas is None:
                return []
            while falhas and falhas[0] <= desde:
                falhas.popleft()
            if not falhas:
                del self._falhas[chave]
                return []
            return list(falhas)

    def zerar(self, chave: str) -> None:
        with self._trava:
            self._falhas.pop(chave, None)


# O endereço vem do socket e nunca tem "|": a barra separa as partes sem
# ambiguidade, mesmo com um e-mail que tenha "|" (é válido na parte local).
def _chave_do_par(endereco: str, email: str) -> str:
    return f"email|{endereco}|{email}"


def _chave_do_endereco(endereco: str) -> str:
    return f"endereco|{endereco}"


class LimiteDeTentativas:
    """Janela deslizante de falhas de login: 5 por e-mail + endereço e 20 por
    endereço em 15 minutos. Quem guarda as falhas é o ArmazenamentoDeFalhas
    (em memória, por padrão)."""

    def __init__(
        self,
        maximo_por_email: int = MAXIMO_POR_EMAIL,
        maximo_por_endereco: int = MAXIMO_POR_ENDERECO,
        janela_em_segundos: int = JANELA_EM_SEGUNDOS,
        relogio=time.monotonic,
        armazenamento: ArmazenamentoDeFalhas | None = None,
    ):
        self.maximo_por_email = maximo_por_email
        self.maximo_por_endereco = maximo_por_endereco
        self.janela = janela_em_segundos
        self._relogio = relogio
        self._armazenamento = armazenamento or FalhasEmMemoria()

    def conferir(self, endereco: str, email: str) -> None:
        """Lança ErroMuitasTentativas quando o par ou o endereço está travado.

        Roda antes de conferir a senha, com o e-mail existindo ou não: o 429
        não revela quais e-mails têm conta."""
        agora = self._relogio()
        espera = max(
            self._espera(_chave_do_par(endereco, email), self.maximo_por_email, agora),
            self._espera(_chave_do_endereco(endereco), self.maximo_por_endereco, agora),
        )
        if espera > 0:
            raise ErroMuitasTentativas(espera)

    def registrar_falha(self, endereco: str, email: str) -> None:
        agora = self._relogio()
        for chave in (_chave_do_par(endereco, email), _chave_do_endereco(endereco)):
            self._armazenamento.registrar(chave, agora, self.janela)

    def registrar_sucesso(self, endereco: str, email: str) -> None:
        # Só o par é zerado. Zerar o endereço deixaria quem tem uma conta
        # válida intercalar um login certo e seguir testando outros e-mails.
        self._armazenamento.zerar(_chave_do_par(endereco, email))

    def restantes(self, endereco: str, email: str) -> int:
        """Senhas erradas que ainda cabem antes do 429. Vai no 401 do login
        para a tela avisar. Não revela nada sobre a conta: a contagem é igual
        para e-mail com e sem cadastro."""
        desde = self._relogio() - self.janela
        por_email = self.maximo_por_email - len(self._armazenamento.recentes(_chave_do_par(endereco, email), desde))
        por_endereco = self.maximo_por_endereco - len(self._armazenamento.recentes(_chave_do_endereco(endereco), desde))
        return max(0, min(por_email, por_endereco))

    def _espera(self, chave: str, maximo: int, agora: float) -> int:
        return _espera(self._armazenamento, chave, maximo, self.janela, agora)


def _espera(armazenamento: ArmazenamentoDeFalhas, chave: str, maximo: int, janela: int, agora: float) -> int:
    """Segundos até a chave aceitar nova tentativa (0 = liberada)."""
    falhas = armazenamento.recentes(chave, agora - janela)
    if len(falhas) < maximo:
        return 0
    # Libera quando sobrarem menos que o máximo na janela, isto é, quando
    # a falha de número "máximo", contando da mais nova, sair dela.
    return max(1, ceil(falhas[-maximo] + janela - agora))


class LimiteDePedidos:
    """Janela deslizante que conta todo pedido, e não só as falhas: serve às
    rotas que mandam e-mail (/conta). Sem ela, um script mandaria centenas de
    links para a caixa de alguém (e o provedor suspenderia o remetente por
    spam).

    Cada regra é (chave, máximo, janela em segundos). O pedido que estoura
    qualquer regra recebe 429 e não conta; o que passa conta em todas. Guarda
    no mesmo ArmazenamentoDeFalhas do login (em memória, por padrão)."""

    def __init__(self, relogio=time.monotonic, armazenamento: ArmazenamentoDeFalhas | None = None):
        self._relogio = relogio
        self._armazenamento = armazenamento or FalhasEmMemoria()

    def consumir(self, regras: list[tuple[str, int, int]]) -> None:
        agora = self._relogio()
        # A janela entra no nome: a mesma chave com duas janelas (1 por minuto
        # e 5 por hora) fica em duas listas, e a limpeza da janela curta não
        # apaga o que a longa ainda precisa contar.
        chaves = [(f"{chave}|{janela}", maximo, janela) for chave, maximo, janela in regras]
        esperas = [_espera(self._armazenamento, chave, maximo, janela, agora) for chave, maximo, janela in chaves]
        espera = max(esperas, default=0)
        if espera > 0:
            raise ErroMuitosPedidos(espera)
        for chave, _, janela in chaves:
            self._armazenamento.registrar(chave, agora, janela)


def obter_limite_de_emails(requisicao: Request) -> LimiteDePedidos:
    return requisicao.app.state.limite_de_emails


def obter_limite_de_login(requisicao: Request) -> LimiteDeTentativas:
    return requisicao.app.state.limite_de_login


def endereco_de(requisicao: Request) -> str:
    """IP de quem conectou. O X-Forwarded-For não é lido aqui de propósito: é
    um cabeçalho que o próprio cliente escreve, e trocá-lo a cada palpite
    furaria o limite.

    Atrás de um proxy reverso (produção), quem troca o socket pelo IP real é
    o uvicorn, e só quando a conexão vem de um endereço listado em
    FORWARDED_ALLOW_IPS (o do proxy). Sem essa variável, todo mundo pareceria
    vir do proxy e dividiria o mesmo limite."""
    return requisicao.client.host if requisicao.client else "desconhecido"


class LimiteDoCorpo:
    """Middleware ASGI que recusa com 413 o corpo acima do limite.

    O Content-Length declarado é conferido antes de ler qualquer byte. Sem ele
    (envio em partes), os bytes são contados na leitura e a leitura para ao
    passar do limite, antes de o corpo inteiro ocupar a memória.
    """

    def __init__(self, app, maximo: int = TAMANHO_MAXIMO_DO_CORPO):
        self.app = app
        self.maximo = maximo

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declarado = dict(scope["headers"]).get(b"content-length", b"")
        if declarado.isdigit() and int(declarado) > self.maximo:
            await problema(413, MENSAGEM_CORPO_GRANDE, scope["path"])(scope, receive, send)
            return

        recebido = 0

        async def receber_com_limite():
            nonlocal recebido
            mensagem = await receive()
            if mensagem["type"] == "http.request":
                recebido += len(mensagem.get("body", b""))
                if recebido > self.maximo:
                    # O FastAPI repassa o HTTPException levantado na leitura do
                    # corpo, e o tratador de erros.py monta o Problem Details.
                    raise HTTPException(status_code=413)
            return mensagem

        await self.app(scope, receber_com_limite, send)
