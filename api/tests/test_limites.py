"""Limites de uso: força bruta no login, corpo grande demais, erro inesperado
e cabeçalhos de segurança (Sistemas Web Seguros)."""

import pytest
from fastapi.testclient import TestClient

from app.erros import ErroMuitasTentativas
from app.limites import MAXIMO_POR_EMAIL, MAXIMO_POR_ENDERECO, TAMANHO_MAXIMO_DO_CORPO, LimiteDeTentativas
from app.main import criar_app
from tests.conftest import SENHA_DE_TESTE

ADMIN = "administrador@exemplo.com"


def login(api, email=ADMIN, senha="senha-errada"):
    return api.post("/auth/login", json={"email": email, "senha": senha})


class Relogio:
    def __init__(self):
        self.agora = 1000.0

    def __call__(self):
        return self.agora


# --- Força bruta no login ------------------------------------------------------


def test_senhas_erradas_seguidas_travam_o_login_com_429(api):
    codigos = [login(api).status_code for _ in range(MAXIMO_POR_EMAIL)]
    travado = login(api, senha=SENHA_DE_TESTE)

    assert codigos == [401] * MAXIMO_POR_EMAIL
    # Nem a senha certa passa enquanto o par está travado: o palpite certo não
    # pode ser distinguido dos errados.
    assert travado.status_code == 429
    assert travado.headers["Content-Type"] == "application/problem+json"
    assert int(travado.headers["Retry-After"]) > 0
    assert travado.json()["detail"].startswith("Muitas tentativas de login.")


def test_o_429_nao_revela_se_o_email_existe(api):
    for email in (ADMIN, "ninguem@exemplo.com"):
        for _ in range(MAXIMO_POR_EMAIL):
            login(api, email=email)

    existente, inexistente = login(api, email=ADMIN), login(api, email="ninguem@exemplo.com")

    assert existente.status_code == inexistente.status_code == 429
    assert existente.json()["detail"] == inexistente.json()["detail"]


def test_o_email_e_normalizado_na_contagem(api):
    # Trocar maiúsculas e minúsculas não abre uma contagem nova.
    for email in ("Administrador@Exemplo.com", "ADMINISTRADOR@EXEMPLO.COM", "administrador@EXEMPLO.com"):
        login(api, email=email)
    login(api)
    login(api)

    assert login(api).status_code == 429


def test_login_certo_zera_a_contagem_do_email(api):
    for _ in range(MAXIMO_POR_EMAIL - 1):
        login(api)
    assert login(api, senha=SENHA_DE_TESTE).status_code == 200

    codigos = [login(api).status_code for _ in range(MAXIMO_POR_EMAIL - 1)]

    assert 429 not in codigos


def test_o_endereco_trava_quem_troca_de_email_a_cada_palpite():
    limite = LimiteDeTentativas(relogio=Relogio())
    for numero in range(MAXIMO_POR_ENDERECO):
        limite.conferir("203.0.113.9", f"alvo{numero}@exemplo.com")
        limite.registrar_falha("203.0.113.9", f"alvo{numero}@exemplo.com")

    with pytest.raises(ErroMuitasTentativas):
        limite.conferir("203.0.113.9", "mais-um@exemplo.com")
    # Outro endereço segue livre: o bloqueio não tranca a conta de ninguém.
    limite.conferir("198.51.100.7", "alvo0@exemplo.com")


def test_a_trava_se_desfaz_quando_a_janela_passa():
    relogio = Relogio()
    limite = LimiteDeTentativas(janela_em_segundos=900, relogio=relogio)
    for _ in range(MAXIMO_POR_EMAIL):
        limite.registrar_falha("203.0.113.9", ADMIN)

    with pytest.raises(ErroMuitasTentativas) as travado:
        limite.conferir("203.0.113.9", ADMIN)
    assert travado.value.cabecalhos["Retry-After"] == "900"
    assert "15 minutos" in travado.value.detalhe

    relogio.agora += 900
    limite.conferir("203.0.113.9", ADMIN)


def test_login_certo_nao_zera_a_contagem_do_endereco():
    limite = LimiteDeTentativas(relogio=Relogio())
    for numero in range(MAXIMO_POR_ENDERECO):
        limite.registrar_falha("203.0.113.9", f"alvo{numero}@exemplo.com")
    limite.registrar_sucesso("203.0.113.9", "minha-conta@exemplo.com")

    with pytest.raises(ErroMuitasTentativas):
        limite.conferir("203.0.113.9", "outro-alvo@exemplo.com")


# --- Tamanho do corpo ----------------------------------------------------------


def test_corpo_acima_do_limite_responde_413_sem_ser_lido(api):
    resposta = api.post(
        "/auth/login",
        content=b"{" + b" " * TAMANHO_MAXIMO_DO_CORPO + b"}",
        headers={"Content-Type": "application/json"},
    )

    assert resposta.status_code == 413
    assert resposta.headers["Content-Type"] == "application/problem+json"
    assert resposta.json()["detail"] == "Corpo da requisição grande demais."
    # O 413 também sai com os cabeçalhos de segurança.
    assert resposta.headers["X-Content-Type-Options"] == "nosniff"


def test_corpo_em_partes_para_de_ser_lido_ao_passar_do_limite(api):
    # Sem Content-Length (Transfer-Encoding: chunked): a contagem é na leitura.
    def partes():
        yield b'{"email": "a@exemplo.com", "senha": "'
        for _ in range(3):
            yield b"x" * (1024 * 1024)
        yield b'"}'

    resposta = api.post("/auth/login", content=partes(), headers={"Content-Type": "application/json"})

    assert resposta.status_code == 413
    assert resposta.json()["detail"] == "Corpo da requisição grande demais."


def test_corpo_dentro_do_limite_segue_normal(api):
    assert login(api, senha=SENHA_DE_TESTE).status_code == 200


# --- Erro inesperado e cabeçalhos ---------------------------------------------


def test_erro_inesperado_responde_500_sem_detalhe_interno(config, repositorio, livro_caixa, verificador, cabecalho_de):
    def falhar():
        raise RuntimeError("detalhe interno: mongodb://usuario:senha@servidor")

    repositorio.listar = falhar
    app = criar_app(config, repositorio, livro_caixa, verificador)
    # raise_server_exceptions=False: o cliente recebe a resposta, como o navegador.
    with TestClient(app, raise_server_exceptions=False) as api:
        resposta = api.get("/usuarios", headers=cabecalho_de("id-admin"))

    assert resposta.status_code == 500
    assert resposta.headers["Content-Type"] == "application/problem+json"
    assert resposta.json()["detail"] == "Erro interno do servidor. Tente de novo em instantes."
    assert "mongodb" not in resposta.text


def test_painel_leva_a_politica_de_seguranca_completa(api):
    resposta = api.get("/painel/")
    csp = resposta.headers["Content-Security-Policy"]

    for diretiva in ("default-src 'self'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'"):
        assert diretiva in csp
    assert resposta.headers["Permissions-Policy"] == "camera=(), microphone=(), geolocation=(), payment=()"
    assert resposta.headers["Cross-Origin-Opener-Policy"] == "same-origin"
    # Pelo HTTP, sem HSTS (o navegador ignoraria).
    assert "Strict-Transport-Security" not in resposta.headers


def test_hsts_so_quando_a_requisicao_chega_por_https(config, repositorio, livro_caixa, verificador):
    with TestClient(criar_app(config, repositorio, livro_caixa, verificador), base_url="https://testserver") as api:
        resposta = api.get("/painel/")

    assert resposta.headers["Strict-Transport-Security"] == "max-age=31536000; includeSubDomains"
