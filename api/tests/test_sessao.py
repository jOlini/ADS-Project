"""Logout com revogação do JWT, tentativas restantes no login e a CSP do
Swagger (Sistemas Web Seguros)."""

import re
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from app.config import Configuracoes
from app.documentacao import CDN_DO_SWAGGER
from app.limites import MAXIMO_POR_EMAIL, LimiteDeTentativas
from app.main import criar_app
from app.revogacao import RevogacaoEmMemoria
from tests.conftest import SEGREDO_DE_TESTE, SENHA_DE_TESTE

ADMIN = "administrador@exemplo.com"


def entrar(api, email=ADMIN, senha=SENHA_DE_TESTE):
    return api.post("/auth/login", json={"email": email, "senha": senha})


def bearer(resposta):
    return {"Authorization": f"Bearer {resposta.json()['token']}"}


# --- Logout e revogação --------------------------------------------------------


def test_logout_revoga_o_token_na_hora(api):
    cabecalho = bearer(entrar(api))
    assert api.get("/usuarios", headers=cabecalho).status_code == 200

    saida = api.post("/auth/logout", headers=cabecalho)
    depois = api.get("/usuarios", headers=cabecalho)

    assert saida.status_code == 204
    assert saida.content == b""
    # A assinatura e o exp ainda conferem, mas a sessão acabou.
    assert depois.status_code == 401
    assert depois.json()["detail"] == "Sessão encerrada. Faça login novamente."
    assert depois.headers["WWW-Authenticate"] == 'Bearer error="invalid_token"'


def test_logout_nao_derruba_outra_sessao_da_mesma_pessoa(api):
    uma_aba, outra_aba = bearer(entrar(api)), bearer(entrar(api))

    api.post("/auth/logout", headers=uma_aba)

    assert api.get("/usuarios", headers=outra_aba).status_code == 200


def test_logout_com_token_ja_revogado_responde_401(api):
    cabecalho = bearer(entrar(api))
    api.post("/auth/logout", headers=cabecalho)

    assert api.post("/auth/logout", headers=cabecalho).status_code == 401


def test_logout_sem_token_responde_401(api):
    assert api.post("/auth/logout").status_code == 401


def test_validade_padrao_do_token_e_de_15_minutos(repositorio, livro_caixa, verificador):
    config = Configuracoes(_env_file=None, jwt_secret=SEGREDO_DE_TESTE)
    with TestClient(criar_app(config, repositorio, livro_caixa, verificador)) as api:
        corpo = entrar(api).json()

    validade = datetime.fromisoformat(corpo["expira_em"]) - datetime.now(UTC)
    assert timedelta(minutes=14) < validade <= timedelta(minutes=15)


def test_revogacao_em_memoria_esquece_os_tokens_ja_vencidos():
    agora = datetime(2026, 9, 26, 12, 0, tzinfo=UTC)
    relogio = {"agora": agora}
    lista = RevogacaoEmMemoria(relogio=lambda: relogio["agora"])
    lista.revogar("vence-cedo", agora + timedelta(minutes=1))
    lista.revogar("vence-tarde", agora + timedelta(minutes=15))

    relogio["agora"] = agora + timedelta(minutes=2)
    lista.revogar("novo", agora + timedelta(minutes=17))

    # O vencido saiu da lista (o exp dele já o recusa); os outros continuam.
    assert not lista.revogado("vence-cedo")
    assert lista.revogado("vence-tarde")
    assert lista.revogado("novo")


# --- Tentativas restantes no login ---------------------------------------------


def test_cada_senha_errada_diz_quantas_tentativas_restam(api):
    restantes = [entrar(api, senha="errada").json()["tentativas_restantes"] for _ in range(MAXIMO_POR_EMAIL)]

    assert restantes == [4, 3, 2, 1, 0]
    assert entrar(api, senha="errada").status_code == 429


def test_a_contagem_e_igual_com_e_sem_conta(api):
    # A resposta de um e-mail sem conta tem o mesmo texto e o mesmo número:
    # a contagem não revela quais e-mails estão cadastrados.
    com_conta = entrar(api, senha="errada").json()
    sem_conta = entrar(api, email="ninguem@exemplo.com", senha="errada").json()

    assert com_conta["detail"] == sem_conta["detail"] == "E-mail ou senha inválidos."
    assert com_conta["tentativas_restantes"] == sem_conta["tentativas_restantes"] == MAXIMO_POR_EMAIL - 1


def test_as_tentativas_restantes_seguem_o_limite_do_endereco():
    # 20 por endereço: quem já errou 18 e-mails diferentes tem só mais 2,
    # mesmo num e-mail novo.
    limite = LimiteDeTentativas()
    for numero in range(18):
        limite.registrar_falha("203.0.113.9", f"alvo{numero}@exemplo.com")

    assert limite.restantes("203.0.113.9", "novo@exemplo.com") == 2
    assert limite.restantes("198.51.100.7", "novo@exemplo.com") == MAXIMO_POR_EMAIL


class ArmazenamentoDeTeste:
    """Outra implementação do ArmazenamentoDeFalhas, como seria a do Redis:
    o limite usa o que receber, sem conhecer o armazenamento."""

    def __init__(self):
        self.falhas = {}

    def registrar(self, chave, agora, janela):
        self.falhas.setdefault(chave, []).append(agora)

    def recentes(self, chave, desde):
        return [instante for instante in self.falhas.get(chave, []) if instante > desde]

    def zerar(self, chave):
        self.falhas.pop(chave, None)


def test_o_limite_funciona_com_outro_armazenamento():
    armazenamento = ArmazenamentoDeTeste()
    limite = LimiteDeTentativas(armazenamento=armazenamento, relogio=lambda: 1000.0)

    for _ in range(MAXIMO_POR_EMAIL):
        limite.registrar_falha("203.0.113.9", ADMIN)

    assert armazenamento.falhas[f"email|203.0.113.9|{ADMIN}"] == [1000.0] * MAXIMO_POR_EMAIL
    assert limite.restantes("203.0.113.9", ADMIN) == 0
    limite.registrar_sucesso("203.0.113.9", ADMIN)
    assert limite.restantes("203.0.113.9", ADMIN) == MAXIMO_POR_EMAIL


# --- Swagger com CSP própria ---------------------------------------------------


def test_swagger_tem_csp_sem_script_inline(api):
    resposta = api.get("/docs")
    csp = resposta.headers["Content-Security-Policy"]
    diretivas = dict(diretiva.split(" ", 1) for diretiva in csp.split("; "))

    assert resposta.status_code == 200
    assert diretivas["default-src"] == "'none'"
    assert diretivas["script-src"] == f"'self' {CDN_DO_SWAGGER}"
    assert diretivas["frame-ancestors"] == "'none'"
    assert "unsafe" not in csp
    # Nenhum <script> com código dentro: todos vêm por src.
    assert re.findall(r"<script>", resposta.text) == []
    # Uma CSP só (a do middleware não se soma à da rota).
    assert len(resposta.headers.get_list("Content-Security-Policy")) == 1


def test_swagger_vem_de_versao_fixa_com_integridade(api):
    pagina = api.get("/docs").text

    for arquivo in ("swagger-ui-bundle.js", "swagger-ui.css"):
        marca = re.search(rf'"{re.escape(CDN_DO_SWAGGER + arquivo)}" integrity="(sha384-[A-Za-z0-9+/=]+)"', pagina)
        assert marca, arquivo
    assert "swagger-ui-dist@5/" not in pagina


def test_inicio_do_swagger_e_um_arquivo_da_propria_api(api):
    resposta = api.get("/docs/iniciar.js")

    assert resposta.status_code == 200
    assert resposta.headers["Content-Type"].startswith("text/javascript")
    assert "validatorUrl: null" in resposta.text


def test_openapi_json_leva_a_csp_restritiva_e_o_redoc_nao_existe(api):
    assert "default-src 'self'" in api.get("/openapi.json").headers["Content-Security-Policy"]
    assert api.get("/redoc").status_code == 404
