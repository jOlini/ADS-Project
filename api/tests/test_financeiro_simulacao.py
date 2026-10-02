"""Modo de teste dos planos (super admin): quem está em SUPER_ADMINS simula o
Free, o Família e o Empresarial com o cabeçalho X-Simular-Plano, com as travas
de verdade e sem trocar o plano gravado. Para as outras contas, o cabeçalho é
ignorado.

Tudo pelo HTTP, com os repositórios em memória (conftest.py).
"""

import pytest
from fastapi.testclient import TestClient

from app.config import Configuracoes
from app.main import criar_app
from tests.conftest import PROJETO_DE_TESTE, SEGREDO_DE_TESTE
from tests.test_financeiro_api import entrar

# E-mail fictício: o token de teste usa "<uid>@exemplo.com".
SUPER_ADMIN = "uid-dev@exemplo.com"


@pytest.fixture
def config():
    return Configuracoes(
        _env_file=None,
        jwt_secret=SEGREDO_DE_TESTE,
        jwt_expiration=30,
        cors_origens="http://localhost:5173",
        firebase_project_id=PROJETO_DE_TESTE,
        super_admins=f"  {SUPER_ADMIN.upper()} , outra@exemplo.com",
    )


@pytest.fixture
def api(config, repositorio, livro_caixa, verificador):
    with TestClient(criar_app(config, repositorio, livro_caixa, verificador)) as cliente:
        yield cliente


def com_plano(cabecalho, plano):
    return {**cabecalho, "X-Simular-Plano": plano}


def pessoal(api, cabecalho):
    return next(espaco for espaco in api.get("/espacos", headers=cabecalho).json() if espaco["tipo"] == "PF")


def ligar_familia(api, cabecalho, espaco_id):
    return api.put(f"/espacos/{espaco_id}/familia", headers=cabecalho, json={"ativa": True})


@pytest.fixture
def dev(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-dev"))


@pytest.fixture
def ana(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-ana"))


def test_lista_de_super_admins_ignora_caixa_e_espacos(config):
    assert config.lista_super_admins == frozenset({SUPER_ADMIN, "outra@exemplo.com"})


def test_acesso_diz_quem_e_super_admin(api, dev, ana):
    assert api.get("/espacos/acesso", headers=dev.cabecalho).json() == {"super_admin": True, "plano_simulado": None}
    assert api.get("/espacos/acesso", headers=ana.cabecalho).json() == {"super_admin": False, "plano_simulado": None}


def test_acesso_devolve_o_plano_simulado(api, dev):
    resposta = api.get("/espacos/acesso", headers=com_plano(dev.cabecalho, "familia"))

    assert resposta.json() == {"super_admin": True, "plano_simulado": "FAMILIA"}


def test_super_admin_ve_o_plano_simulado_sem_mudar_o_gravado(api, dev):
    assert pessoal(api, com_plano(dev.cabecalho, "EMPRESARIAL"))["plano"] == "EMPRESARIAL"
    assert pessoal(api, dev.cabecalho)["plano"] == "FREE"


def test_simular_o_familia_libera_o_modo_familia(api, dev):
    espaco_id = pessoal(api, dev.cabecalho)["id"]

    assert ligar_familia(api, dev.cabecalho, espaco_id).status_code == 403
    resposta = ligar_familia(api, com_plano(dev.cabecalho, "FAMILIA"), espaco_id)

    assert resposta.status_code == 200
    assert resposta.json()["ativa"] is True
    # Sem o cabeçalho, volta o Free gravado: a família fica guardada, mas desligada.
    assert pessoal(api, dev.cabecalho)["familia"]["ativa"] is False


def test_simular_o_free_mostra_as_travas_do_free(api, dev, assinar):
    assinar("uid-dev", "FAMILIA")
    espaco_id = pessoal(api, dev.cabecalho)["id"]

    assert ligar_familia(api, dev.cabecalho, espaco_id).status_code == 200
    assert ligar_familia(api, com_plano(dev.cabecalho, "FREE"), espaco_id).status_code == 403
    assert pessoal(api, com_plano(dev.cabecalho, "FREE"))["familia"]["ativa"] is False


def test_simulacao_vale_na_divisao_do_gasto(api, dev):
    conta = dev.criar_conta("Corrente", 50_000)
    corpo = {
        "tipo": "DESPESA",
        "descricao": "Pizza",
        "data": "2026-09-19",
        "valor_centavos": 9_000,
        "conta_id": conta,
        "categoria_id": dev.categorias["Lazer"],
        "divisao": [{"pessoa": "Bruno", "valor_centavos": 3_000}],
    }

    assert dev.post("/lancamentos", corpo).status_code == 403
    resposta = api.post(f"{dev.base}/lancamentos", headers=com_plano(dev.cabecalho, "FAMILIA"), json=corpo)
    assert resposta.status_code == 201


def test_cliente_comum_nao_se_promove_com_o_cabecalho(api, ana):
    espaco_id = pessoal(api, ana.cabecalho)["id"]

    assert pessoal(api, com_plano(ana.cabecalho, "FAMILIA"))["plano"] == "FREE"
    assert ligar_familia(api, com_plano(ana.cabecalho, "FAMILIA"), espaco_id).status_code == 403
    # Nem o valor inválido muda a resposta: o modo não existe para ela.
    assert api.get("/espacos", headers=com_plano(ana.cabecalho, "OURO")).status_code == 200


def test_super_admin_com_plano_que_nao_existe_recebe_400(api, dev):
    resposta = api.get("/espacos", headers=com_plano(dev.cabecalho, "OURO"))

    assert resposta.status_code == 400
    assert "plano" in resposta.json()["campos"]


def test_email_nao_confirmado_nao_e_super_admin(api, token_firebase):
    cabecalho = {"Authorization": f"Bearer {token_firebase('uid-dev', email_verified=False)}"}

    # A rota pede o e-mail confirmado antes de tudo: 403, sem simular nada.
    assert api.get("/espacos/acesso", headers=cabecalho).status_code == 403


def test_cors_aceita_o_cabecalho_da_simulacao(api):
    resposta = api.options(
        "/espacos",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,x-simular-plano",
        },
    )

    assert resposta.status_code == 200
    assert "x-simular-plano" in resposta.headers["access-control-allow-headers"].lower()
