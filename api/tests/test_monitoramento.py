"""Alertas e telemetria no Discord (app/monitoramento.py): canal certo, nada de
dado pessoal, repetição controlada e a API nunca afetada por uma falha do
Discord (Sistemas Web Seguros: registro e monitoramento, OWASP A09)."""

import json
import logging

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import Configuracoes
from app.emails.correio import CorreioDaConta
from app.emails.envio import FalhaNoEnvio
from app.main import criar_app
from app.monitoramento import INTERVALO_ENTRE_REPETICOES, LIMITE_DE_401, Canal, Monitor, Nivel, grupo_da_rota
from tests.conftest import SEGREDO_DE_TESTE
from tests.test_emails_rotas import ENDERECO_DO_APP, EnviadorEmMemoria, LinksFalsos

WEBHOOKS = {
    Canal.SISTEMA: "https://discord.com/api/webhooks/1/sistema",
    Canal.SEGURANCA: "https://discord.com/api/webhooks/2/seguranca",
    Canal.TELEMETRIA: "https://discord.com/api/webhooks/3/telemetria",
}


class Discord:
    """Faz o papel do Discord: guarda cada mensagem com o canal de destino."""

    def __init__(self):
        self.mensagens = []
        self.falhar = False

    def __call__(self, webhook, mensagem):
        if self.falhar:
            raise OSError("sem rede")
        canal = next(canal for canal, url in WEBHOOKS.items() if url == webhook)
        self.mensagens.append((canal, mensagem))

    def do_canal(self, canal):
        return [mensagem["embeds"][0] for destino, mensagem in self.mensagens if destino == canal]

    @staticmethod
    def campos(embed):
        return {campo["name"]: campo["value"] for campo in embed["fields"]}


class Relogio:
    def __init__(self):
        self.agora = 1000.0

    def __call__(self):
        return self.agora


@pytest.fixture
def discord():
    return Discord()


@pytest.fixture
def relogio():
    return Relogio()


@pytest.fixture
def monitor(discord, relogio):
    return Monitor(WEBHOOKS, cota_de_emails=5, enviar=discord, relogio=relogio, em_segundo_plano=False)


@pytest.fixture
def api_monitorada(config, repositorio, livro_caixa, verificador, monitor):
    with TestClient(
        criar_app(config, repositorio, livro_caixa, verificador, monitor=monitor), raise_server_exceptions=False
    ) as cliente:
        yield cliente


# --- Envio -------------------------------------------------------------------------


def test_sem_webhook_nada_sai_e_nenhuma_thread_sobe(discord):
    monitor = Monitor({}, enviar=discord)
    monitor.iniciar("0.2.0")
    monitor.avisar(Canal.SISTEMA, "x", "Título", {}, Nivel.CRITICO)
    monitor.encerrar()
    assert discord.mensagens == []
    assert monitor.canais == []


def test_cada_alerta_vai_so_para_o_canal_dele(monitor, discord):
    monitor.avisar(Canal.SEGURANCA, "x", "Só segurança", {}, Nivel.AVISO)
    assert [canal for canal, _ in discord.mensagens] == [Canal.SEGURANCA]


def test_mesmo_alerta_sai_uma_vez_a_cada_15_minutos_com_a_contagem(monitor, discord, relogio):
    for _ in range(3):
        monitor.avisar(Canal.SISTEMA, "mesma-chave", "Falha", {"A": "1"}, Nivel.CRITICO)
    assert len(discord.mensagens) == 1

    relogio.agora += INTERVALO_ENTRE_REPETICOES
    monitor.avisar(Canal.SISTEMA, "mesma-chave", "Falha", {"A": "1"}, Nivel.CRITICO)
    segunda = discord.do_canal(Canal.SISTEMA)[1]
    assert Discord.campos(segunda)["Repetições desde o último aviso"] == "2"


def test_mensagem_nao_menciona_ninguem_e_respeita_os_limites_do_discord(monitor, discord):
    monitor.avisar(Canal.SISTEMA, "x", "@everyone " + "t" * 300, {"campo": "v" * 2000}, Nivel.INFO)
    _, mensagem = discord.mensagens[0]
    assert mensagem["allowed_mentions"] == {"parse": []}
    assert len(mensagem["embeds"][0]["title"]) == 256
    assert len(mensagem["embeds"][0]["fields"][0]["value"]) == 1024


def test_falha_do_discord_vira_log_sem_o_endereco_do_webhook(monitor, discord, caplog):
    discord.falhar = True
    with caplog.at_level(logging.WARNING, logger="uvicorn.error"):
        monitor.avisar(Canal.SISTEMA, "x", "Falha", {}, Nivel.CRITICO)
    assert "Alerta não chegou ao Discord" in caplog.text
    assert "webhooks" not in caplog.text


def test_em_segundo_plano_o_encerramento_entrega_o_resumo(discord):
    monitor = Monitor(WEBHOOKS, enviar=discord)
    monitor.iniciar("0.2.0")
    monitor.registrar_resposta("/saude", 200, "192.0.2.10")
    monitor.encerrar()
    assert [embed["title"] for embed in discord.do_canal(Canal.TELEMETRIA)] == ["Resumo de uso da API"]


def test_em_producao_avisa_que_a_api_subiu(discord):
    monitor = Monitor(WEBHOOKS, "producao", enviar=discord, em_segundo_plano=False)
    monitor.iniciar("0.2.0")
    assert Discord.campos(discord.do_canal(Canal.SISTEMA)[0]) == {"Versão": "0.2.0"}


# --- Segurança ---------------------------------------------------------------------


def test_login_travado_avisa_a_seguranca_com_o_endereco_e_sem_o_email(api_monitorada, discord):
    for _ in range(6):
        resposta = api_monitorada.post("/auth/login", json={"email": "alvo@exemplo.com", "senha": "errada-123"})
    assert resposta.status_code == 429

    [alerta] = discord.do_canal(Canal.SEGURANCA)
    campos = Discord.campos(alerta)
    assert campos["Rota"] == "auth"
    assert campos["Endereço"] == "testclient"
    assert "alvo@exemplo.com" not in json.dumps(discord.mensagens)


def test_rajada_de_401_do_mesmo_endereco_vira_um_alerta(api_monitorada, discord):
    for _ in range(LIMITE_DE_401 + 5):
        api_monitorada.get("/usuarios", headers={"Authorization": "Bearer token-forjado"})

    alertas = discord.do_canal(Canal.SEGURANCA)
    assert [alerta["title"] for alerta in alertas] == ["Muitas credenciais recusadas do mesmo endereço"]
    assert "token-forjado" not in json.dumps(discord.mensagens)


def test_poucos_401_nao_avisam(api_monitorada, discord):
    for _ in range(LIMITE_DE_401 - 1):
        api_monitorada.get("/usuarios")
    assert discord.do_canal(Canal.SEGURANCA) == []


# --- Sistema -----------------------------------------------------------------------


def test_erro_nao_tratado_avisa_o_sistema_sem_a_mensagem_da_excecao(api_monitorada, discord, repositorio, cabecalho_de):
    def quebrar():
        raise RuntimeError("dado de alguém: ana@exemplo.com")

    repositorio.listar = quebrar
    resposta = api_monitorada.get("/usuarios", headers=cabecalho_de("id-admin"))
    assert resposta.status_code == 500

    [alerta] = discord.do_canal(Canal.SISTEMA)
    campos = Discord.campos(alerta)
    assert campos["Rota"] == "GET /usuarios"
    assert campos["Exceção"] == "RuntimeError"
    assert campos["Onde"].startswith("app/")
    assert "ana@exemplo.com" not in json.dumps(discord.mensagens)


def test_email_que_nao_sai_avisa_o_sistema(config, repositorio, livro_caixa, verificador, monitor, discord):
    enviador = EnviadorEmMemoria()
    enviador.falhar = True
    correio = CorreioDaConta(enviador, LinksFalsos({"bia@exemplo.com"}), ENDERECO_DO_APP)
    app = criar_app(config, repositorio, livro_caixa, verificador, correio=correio, monitor=monitor)
    with TestClient(app) as cliente:
        assert cliente.post("/conta/nova-senha", json={"email": "bia@exemplo.com"}).status_code == 202

    [alerta] = discord.do_canal(Canal.SISTEMA)
    assert Discord.campos(alerta) == {"E-mail": "nova senha", "Falha": FalhaNoEnvio.__name__}
    assert "bia@exemplo.com" not in json.dumps(discord.mensagens)


# --- Telemetria --------------------------------------------------------------------


def test_email_enviado_conta_e_avisa_em_80_e_em_100_por_cento_da_cota(monitor, discord):
    for _ in range(5):
        monitor.registrar_email("confirmação", enviado=True)
    monitor.registrar_email("confirmação", enviado=False)

    titulos = [embed["title"] for embed in discord.do_canal(Canal.TELEMETRIA)]
    assert titulos == ["E-mails perto da cota diária", "Cota diária de e-mails atingida"]
    assert Discord.campos(discord.do_canal(Canal.TELEMETRIA)[1])["Últimas 24 horas"] == "5 de 5"


def test_resumo_agrupa_por_rota_e_zera_o_periodo(monitor):
    for caminho, status in [("/espacos/abc/lancamentos", 200), ("/espacos/abc", 404), ("/auth/login", 401), ("/.env", 404)]:
        monitor.registrar_resposta(caminho, status, "192.0.2.10")
    monitor.registrar_email("confirmação", enviado=True)

    resumo = monitor.resumo()
    assert resumo["Pedidos"] == "4"
    assert resumo["Por rota"] == "espacos 2, auth 1, outros 1"
    assert resumo["Respostas 4xx"] == "3"
    assert resumo["E-mails enviados"] == "1"
    assert resumo["E-mails nas últimas 24 h"] == "1 de 5"

    depois = monitor.resumo()
    assert depois["Pedidos"] == "0"
    assert depois["E-mails nas últimas 24 h"] == "1 de 5"


def test_caminho_desconhecido_nao_cria_grupo_novo():
    assert grupo_da_rota("/wp-admin/setup.php") == "outros"
    assert grupo_da_rota("/espacos/abc/relatorios/mensal") == "espacos"


# --- Configuração ------------------------------------------------------------------


def configuracao(**valores):
    return Configuracoes(_env_file=None, jwt_secret=SEGREDO_DE_TESTE, **valores)


def test_webhook_fora_do_discord_impede_a_api_de_subir_sem_mostrar_o_valor():
    with pytest.raises(ValidationError) as erro:
        configuracao(discord_webhook_seguranca="https://exemplo.com/coletor/segredo-123")
    assert "Webhook do Discord inválido" in str(erro.value)
    assert "segredo-123" not in str(erro.value)


def test_webhook_do_discord_e_aceito_e_liga_o_canal():
    config = configuracao(discord_webhook_telemetria=" https://discord.com/api/webhooks/123/abc-DEF_9 ")
    assert Monitor.da_config(config).canais == ["telemetria"]


def test_segredo_curto_nao_aparece_no_erro_da_subida():
    with pytest.raises(ValidationError) as erro:
        Configuracoes(_env_file=None, jwt_secret="curto-e-secreto")
    assert "curto-e-secreto" not in str(erro.value)
