"""Rotas /conta: link de confirmação e de nova senha mandados pela API, com
limite de pedidos e sem revelar quem tem conta (Sistemas Web Seguros)."""

import pytest
from fastapi.testclient import TestClient

from app.emails.correio import CorreioDaConta
from app.emails.envio import FalhaNoEnvio
from app.main import criar_app

ENDERECO_DO_APP = "http://localhost:5173/ADS-Project"


class EnviadorEmMemoria:
    def __init__(self):
        self.enviados = []
        self.falhar = False

    def enviar(self, email):
        if self.falhar:
            raise FalhaNoEnvio("provedor fora do ar")
        self.enviados.append(email)


class LinksFalsos:
    """Faz o papel do Firebase: só estes e-mails têm conta."""

    def __init__(self, contas):
        self.contas = set(contas)
        self.pedidos = []

    def codigo(self, tipo, email):
        self.pedidos.append((tipo, email))
        return f"{tipo}-{email}" if email in self.contas else None


@pytest.fixture
def enviador():
    return EnviadorEmMemoria()


@pytest.fixture
def links():
    return LinksFalsos({"uid-ana@exemplo.com", "bia@exemplo.com"})


@pytest.fixture
def api_com_email(config, repositorio, livro_caixa, verificador, enviador, links):
    correio = CorreioDaConta(enviador, links, ENDERECO_DO_APP)
    with TestClient(criar_app(config, repositorio, livro_caixa, verificador, correio=correio)) as cliente:
        yield cliente


def bearer(token):
    return {"Authorization": f"Bearer {token}"}


# --- Sem provedor --------------------------------------------------------------


def test_sem_provedor_as_rotas_respondem_503(api, token_firebase):
    resposta = api.post("/conta/confirmacao", headers=bearer(token_firebase("uid-ana", email_verified=False)))
    assert resposta.status_code == 503
    assert api.post("/conta/nova-senha", json={"email": "bia@exemplo.com"}).status_code == 503


# --- Confirmação do e-mail -----------------------------------------------------


def test_conta_sem_confirmacao_recebe_o_link_da_area_do_cliente(api_com_email, token_firebase, enviador):
    resposta = api_com_email.post("/conta/confirmacao", headers=bearer(token_firebase("uid-ana", email_verified=False)))
    assert resposta.status_code == 202
    (email,) = enviador.enviados
    assert email.para == "uid-ana@exemplo.com"
    assert f"{ENDERECO_DO_APP}/auth/verificar-email#oobCode=VERIFY_EMAIL-uid-ana%40exemplo.com" in email.mensagem.texto


def test_conta_ja_confirmada_nao_recebe_outro(api_com_email, token_firebase, enviador):
    resposta = api_com_email.post("/conta/confirmacao", headers=bearer(token_firebase("uid-ana")))
    assert resposta.status_code == 202
    assert enviador.enviados == []


def test_confirmacao_exige_o_id_token(api_com_email):
    assert api_com_email.post("/conta/confirmacao").status_code == 401
    assert api_com_email.post("/conta/confirmacao", headers=bearer("isto-nao-e-um-jwt")).status_code == 401


def test_confirmacao_um_link_por_minuto(api_com_email, token_firebase, enviador):
    cabecalho = bearer(token_firebase("uid-ana", email_verified=False))
    assert api_com_email.post("/conta/confirmacao", headers=cabecalho).status_code == 202
    segunda = api_com_email.post("/conta/confirmacao", headers=cabecalho)
    assert segunda.status_code == 429
    assert 0 < int(segunda.headers["Retry-After"]) <= 60
    assert "Muitos pedidos" in segunda.json()["detail"]
    assert len(enviador.enviados) == 1


def test_o_resto_da_api_continua_exigindo_o_email_confirmado(api_com_email, token_firebase):
    resposta = api_com_email.get("/espacos", headers=bearer(token_firebase("uid-ana", email_verified=False)))
    assert resposta.status_code == 403


# --- Nova senha ----------------------------------------------------------------


def test_nova_senha_responde_igual_com_e_sem_conta(api_com_email, enviador):
    com_conta = api_com_email.post("/conta/nova-senha", json={"email": " Bia@Exemplo.com "})
    sem_conta = api_com_email.post("/conta/nova-senha", json={"email": "ninguem@exemplo.com"})
    assert com_conta.status_code == sem_conta.status_code == 202
    assert com_conta.json() == sem_conta.json()
    # Só quem tem conta recebe, com o e-mail normalizado.
    (email,) = enviador.enviados
    assert email.para == "bia@exemplo.com"
    assert f"{ENDERECO_DO_APP}/auth/redefinir-senha#oobCode=" in email.mensagem.texto


def test_nova_senha_recusa_email_invalido_e_campo_extra(api_com_email):
    assert api_com_email.post("/conta/nova-senha", json={"email": "nao-e-email"}).status_code == 400
    extra = api_com_email.post("/conta/nova-senha", json={"email": "bia@exemplo.com", "nome": "x"})
    assert extra.status_code == 400


def test_nova_senha_limita_por_email_e_por_endereco(api_com_email, enviador):
    assert api_com_email.post("/conta/nova-senha", json={"email": "bia@exemplo.com"}).status_code == 202
    # Mesmo e-mail logo depois: 429, com ou sem conta.
    assert api_com_email.post("/conta/nova-senha", json={"email": "bia@exemplo.com"}).status_code == 429
    # Outros e-mails do mesmo endereço: até 10 em 15 minutos no total.
    respostas = [api_com_email.post("/conta/nova-senha", json={"email": f"p{i}@exemplo.com"}) for i in range(10)]
    assert [r.status_code for r in respostas].count(202) == 9
    assert respostas[-1].status_code == 429


def test_falha_do_provedor_nao_muda_a_resposta(api_com_email, enviador, caplog):
    enviador.falhar = True
    resposta = api_com_email.post("/conta/nova-senha", json={"email": "bia@exemplo.com"})
    assert resposta.status_code == 202
    assert "não saiu" in caplog.text
    # O log conta o que falhou, não para quem.
    assert "bia@exemplo.com" not in caplog.text


def test_respostas_da_conta_nao_ficam_em_cache(api_com_email):
    resposta = api_com_email.post("/conta/nova-senha", json={"email": "bia@exemplo.com"})
    assert resposta.headers["Cache-Control"] == "no-store"
