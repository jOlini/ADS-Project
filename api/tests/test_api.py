"""Testes da API pelo HTTP: rotas, códigos de resposta e RBAC.

Sobe a aplicação FastAPI de verdade (rotas, dependências de segurança,
middlewares e tratadores de erro) com o repositório em memória no lugar do
MongoDB, e dispara requisições com tokens de cada perfil.
"""

from datetime import UTC, datetime, timedelta

import pytest

from app.config import Configuracoes
from app.modelos import Perfil
from app.tokens import gerar_token
from tests.conftest import SENHA_DE_TESTE

NOVO_USUARIO = {"nome": "Bruno Lima", "email": "bruno@exemplo.com", "senha": "senha-forte-1", "perfil": "CLIENTE"}
ATUALIZACAO = {"nome": "Clara Souza", "email": "cliente@exemplo.com", "perfil": "CLIENTE"}

ID_DO_PERFIL = {"ADMINISTRADOR": "id-admin", "OPERADOR": "id-operador", "CLIENTE": "id-cliente"}


# Matriz de permissões da Parte 3 do DOCS_API.md.
@pytest.mark.parametrize(
    ("perfil", "metodo", "url", "status_esperado"),
    [
        ("ADMINISTRADOR", "GET", "/usuarios", 200),
        ("ADMINISTRADOR", "GET", "/usuarios/id-cliente", 200),
        ("ADMINISTRADOR", "POST", "/usuarios", 201),
        ("ADMINISTRADOR", "PUT", "/usuarios/id-cliente", 200),
        ("ADMINISTRADOR", "DELETE", "/usuarios/id-cliente", 204),
        ("OPERADOR", "GET", "/usuarios", 200),
        ("OPERADOR", "GET", "/usuarios/id-cliente", 200),
        ("OPERADOR", "POST", "/usuarios", 403),
        ("OPERADOR", "PUT", "/usuarios/id-cliente", 200),
        ("OPERADOR", "DELETE", "/usuarios/id-cliente", 403),
        ("CLIENTE", "GET", "/usuarios", 403),
        ("CLIENTE", "GET", "/usuarios/id-cliente", 200),
        ("CLIENTE", "GET", "/usuarios/id-operador", 403),
        ("CLIENTE", "POST", "/usuarios", 403),
        ("CLIENTE", "PUT", "/usuarios/id-cliente", 403),
        ("CLIENTE", "DELETE", "/usuarios/id-cliente", 403),
    ],
)
def test_rbac_aplica_as_permissoes_de_cada_perfil(api, cabecalho_de, perfil, metodo, url, status_esperado):
    corpo = {"POST": NOVO_USUARIO, "PUT": ATUALIZACAO}.get(metodo)

    resposta = api.request(metodo, url, json=corpo, headers=cabecalho_de(ID_DO_PERFIL[perfil]))

    assert resposta.status_code == status_esperado


# --- Autenticação -------------------------------------------------------------


def test_login_e_publico_e_o_token_abre_as_rotas_protegidas(api):
    login = api.post("/auth/login", json={"email": "administrador@exemplo.com", "senha": SENHA_DE_TESTE})

    assert login.status_code == 200
    assert login.json()["tipo"] == "Bearer"
    token = login.json()["token"]
    assert api.get("/usuarios", headers={"Authorization": f"Bearer {token}"}).status_code == 200


def test_login_recusado_responde_401_sem_dizer_o_que_falhou(api):
    senha_errada = api.post("/auth/login", json={"email": "administrador@exemplo.com", "senha": "errada"})
    email_inexistente = api.post("/auth/login", json={"email": "ninguem@exemplo.com", "senha": "errada"})

    assert senha_errada.status_code == email_inexistente.status_code == 401
    assert senha_errada.json()["detail"] == email_inexistente.json()["detail"]


def test_login_recusa_operador_do_mongo_no_lugar_do_email(api):
    # Injeção NoSQL: {"$ne": null} casaria com qualquer e-mail se chegasse à
    # consulta. O Pydantic exige texto e barra o objeto antes do banco.
    resposta = api.post("/auth/login", json={"email": {"$ne": None}, "senha": {"$ne": None}})

    assert resposta.status_code == 400


def test_sem_token_responde_401_com_desafio_bearer(api):
    resposta = api.get("/usuarios")

    assert resposta.status_code == 401
    assert resposta.headers["WWW-Authenticate"] == "Bearer"
    assert resposta.headers["Content-Type"] == "application/problem+json"


def test_token_adulterado_responde_401(api, cabecalho_de):
    token = cabecalho_de("id-admin")["Authorization"]

    resposta = api.get("/usuarios", headers={"Authorization": token[:-4] + "AAAA"})

    assert resposta.status_code == 401
    assert "invalid_token" in resposta.headers["WWW-Authenticate"]


def test_token_expirado_responde_401(api, config, repositorio):
    vencido, _ = gerar_token(
        repositorio.buscar_por_id("id-admin"), config.jwt_secret, 30, agora=datetime.now(UTC) - timedelta(hours=1)
    )

    resposta = api.get("/usuarios", headers={"Authorization": f"Bearer {vencido}"})

    assert resposta.status_code == 401


def test_vale_o_perfil_atual_do_banco_e_nao_o_do_token(api, cabecalho_de, repositorio):
    # Token emitido quando o usuário era OPERADOR; depois ele foi rebaixado.
    cabecalho = cabecalho_de("id-operador")
    repositorio.usuarios["id-operador"].perfil = Perfil.CLIENTE

    assert api.get("/usuarios", headers=cabecalho).status_code == 403


def test_token_de_usuario_excluido_responde_401(api, cabecalho_de, repositorio):
    cabecalho = cabecalho_de("id-cliente")
    repositorio.excluir("id-cliente")

    assert api.get("/usuarios/id-cliente", headers=cabecalho).status_code == 401


# --- CRUD e validação -----------------------------------------------------------


def test_cadastro_responde_201_com_location_e_sem_senha(api, cabecalho_de):
    resposta = api.post("/usuarios", json=NOVO_USUARIO, headers=cabecalho_de("id-admin"))

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert resposta.headers["Location"].endswith(f"/usuarios/{corpo['id']}")
    assert "senha" not in corpo and "senha_hash" not in corpo


def test_email_duplicado_responde_409(api, cabecalho_de):
    duplicado = NOVO_USUARIO | {"email": "operador@exemplo.com"}

    assert api.post("/usuarios", json=duplicado, headers=cabecalho_de("id-admin")).status_code == 409


def test_corpo_invalido_responde_400_com_o_erro_de_cada_campo(api, cabecalho_de):
    invalido = {"nome": "", "email": "sem-arroba", "senha": "123", "perfil": "ROOT"}

    resposta = api.post("/usuarios", json=invalido, headers=cabecalho_de("id-admin"))

    assert resposta.status_code == 400
    campos = resposta.json()["campos"]
    assert set(campos) == {"nome", "email", "senha", "perfil"}
    assert campos["perfil"] == "Valor inválido. Use ADMINISTRADOR, OPERADOR ou CLIENTE."


def test_campo_extra_no_corpo_e_recusado(api, cabecalho_de):
    # Mass assignment: não dá para enfiar "senha_hash" ou "id" pelo JSON.
    com_extra = NOVO_USUARIO | {"senha_hash": "$2b$12$hash-escolhido-pelo-atacante"}

    resposta = api.post("/usuarios", json=com_extra, headers=cabecalho_de("id-admin"))

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"senha_hash": "Campo não permitido."}


def test_usuario_inexistente_responde_404(api, cabecalho_de):
    assert api.get("/usuarios/nao-existe", headers=cabecalho_de("id-admin")).status_code == 404


def test_exclusao_responde_204_sem_corpo(api, cabecalho_de):
    resposta = api.delete("/usuarios/id-cliente", headers=cabecalho_de("id-admin"))

    assert resposta.status_code == 204
    assert resposta.content == b""


# --- Proteções de navegador -------------------------------------------------------


def test_cors_libera_so_as_origens_configuradas(api):
    liberada = api.options(
        "/usuarios", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"}
    )
    desconhecida = api.options(
        "/usuarios", headers={"Origin": "https://site-malicioso.example", "Access-Control-Request-Method": "GET"}
    )

    assert liberada.headers["Access-Control-Allow-Origin"] == "http://localhost:5173"
    assert desconhecida.status_code == 400
    assert "Access-Control-Allow-Origin" not in desconhecida.headers


def test_cors_soma_a_origem_da_rede_local_sem_repetir():
    config = Configuracoes(
        _env_file=None,
        jwt_secret="s" * 40,
        cors_origens="http://localhost:5173, http://localhost:8080",
        cors_origens_rede="http://10.0.0.5:5173,http://localhost:5173",
    )

    assert config.lista_cors == ["http://localhost:5173", "http://localhost:8080", "http://10.0.0.5:5173"]


def test_respostas_levam_cabecalhos_de_seguranca(api, cabecalho_de):
    resposta = api.get("/usuarios", headers=cabecalho_de("id-admin"))

    assert resposta.headers["X-Content-Type-Options"] == "nosniff"
    assert resposta.headers["X-Frame-Options"] == "DENY"
    assert resposta.headers["Cache-Control"] == "no-store"
    assert "default-src 'self'" in resposta.headers["Content-Security-Policy"]


def test_painel_de_demonstracao_e_servido_pela_api(api):
    resposta = api.get("/")

    assert resposta.status_code == 200
    assert "Pessoal Finance" in resposta.text
