"""Modo de produção (AMBIENTE=producao) e segredos em arquivo: a API não sobe
com configuração de desenvolvimento num endereço público (DevOps, Sistemas
Web Seguros)."""

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.config import SEGREDO_DE_EXEMPLO, SENHA_DE_EXEMPLO, Configuracoes
from app.main import criar_app
from tests.conftest import SEGREDO_DE_TESTE

# Configuração de produção que passa em todas as travas; cada teste estraga
# uma coisa só.
PRODUCAO_VALIDA = {
    "_env_file": None,
    "_secrets_dir": None,
    "ambiente": "producao",
    "jwt_secret": SEGREDO_DE_TESTE,
    "cors_origens": "https://app.exemplo.com",
    "mongodb_uri": "mongodb://api:senha-do-banco@mongo:27017/pessoal-finance",
    "app_url": "https://app.exemplo.com",
}


def configuracao(**alteracoes):
    return Configuracoes(**{**PRODUCAO_VALIDA, **alteracoes})


def test_producao_valida_sobe():
    assert configuracao().ambiente == "producao"


def test_desenvolvimento_aceita_os_valores_de_exemplo():
    config = Configuracoes(
        _env_file=None,
        _secrets_dir=None,
        jwt_secret=SEGREDO_DE_EXEMPLO,
        admin_senha=SENHA_DE_EXEMPLO,
        cors_origens="http://localhost:5173",
    )
    assert config.ambiente == "desenvolvimento"


@pytest.mark.parametrize(
    ("alteracao", "trecho"),
    [
        ({"jwt_secret": SEGREDO_DE_EXEMPLO}, "JWT_SECRET"),
        ({"admin_senha": SENHA_DE_EXEMPLO}, "ADMIN_SENHA"),
        ({"cors_origens": "http://app.exemplo.com"}, "CORS_ORIGENS"),
        ({"cors_origens": "*"}, "CORS_ORIGENS"),
        ({"cors_origens_rede": "http://192.0.2.5:5173"}, "CORS_ORIGENS_REDE"),
        ({"mongodb_uri": "mongodb://mongo:27017/pessoal-finance"}, "MONGODB_URI"),
        ({"mongodb_uri": "postgres://api:senha@banco/pf"}, "MONGODB_URI"),
        ({"app_url": "http://app.exemplo.com"}, "APP_URL"),
        (
            {"email_provedor": "pasta", "email_remetente": "OliFine <a@exemplo.com>", "firebase_conta_de_servico": "x"},
            "EMAIL_PROVEDOR=pasta",
        ),
    ],
)
def test_producao_recusa_configuracao_de_desenvolvimento(alteracao, trecho):
    with pytest.raises(ValidationError, match=trecho):
        configuracao(**alteracao)


def test_producao_lista_todos_os_problemas_de_uma_vez():
    with pytest.raises(ValidationError) as erro:
        configuracao(jwt_secret=SEGREDO_DE_EXEMPLO, cors_origens="*", mongodb_uri="mongodb://mongo/pf")
    mensagem = str(erro.value)
    assert "JWT_SECRET" in mensagem and "CORS_ORIGENS" in mensagem and "MONGODB_URI" in mensagem


def test_mongodb_srv_com_senha_passa():
    assert configuracao(mongodb_uri="mongodb+srv://api:senha@cluster.exemplo.net/pf").ambiente == "producao"


def test_segredo_lido_de_arquivo(tmp_path):
    # Docker secrets: um arquivo por segredo, com o nome do campo.
    (tmp_path / "jwt_secret").write_text(SEGREDO_DE_TESTE, encoding="utf-8")
    config = Configuracoes(_env_file=None, _secrets_dir=tmp_path)
    assert config.jwt_secret == SEGREDO_DE_TESTE


def test_variavel_de_ambiente_vence_o_arquivo(tmp_path, monkeypatch):
    (tmp_path / "jwt_secret").write_text("x" * 40, encoding="utf-8")
    monkeypatch.setenv("JWT_SECRET", SEGREDO_DE_TESTE)
    assert Configuracoes(_env_file=None, _secrets_dir=tmp_path).jwt_secret == SEGREDO_DE_TESTE


@pytest.fixture
def api_de_producao(repositorio, livro_caixa, verificador):
    with TestClient(criar_app(configuracao(), repositorio, livro_caixa, verificador)) as cliente:
        yield cliente


def test_producao_tira_o_swagger_e_o_openapi_do_ar(api_de_producao):
    assert api_de_producao.get("/openapi.json").status_code == 404
    assert api_de_producao.get("/docs").status_code == 404
    assert api_de_producao.get("/docs/iniciar.js").status_code == 404


def test_desenvolvimento_mantem_o_swagger(api):
    assert api.get("/openapi.json").status_code == 200
    assert api.get("/docs").status_code == 200


def test_saude_responde_nos_dois_ambientes(api, api_de_producao):
    for cliente in (api, api_de_producao):
        resposta = cliente.get("/saude")
        assert resposta.status_code == 200
        assert resposta.json() == {"status": "ok"}


def test_producao_sem_ip_do_proxy_avisa_no_log(repositorio, livro_caixa, verificador, monkeypatch, caplog):
    monkeypatch.delenv("FORWARDED_ALLOW_IPS", raising=False)
    with TestClient(criar_app(configuracao(), repositorio, livro_caixa, verificador)):
        pass
    assert "FORWARDED_ALLOW_IPS" in caplog.text
