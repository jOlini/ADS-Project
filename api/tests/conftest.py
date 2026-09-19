"""Peças compartilhadas pelos testes: configuração fixa, repositório em memória
(no lugar do MongoDB) e um cliente HTTP da API já com três usuários, um de
cada perfil."""

from dataclasses import replace
from datetime import UTC, datetime

import pytest
from bson import ObjectId
from fastapi.testclient import TestClient

from app.config import Configuracoes
from app.erros import ErroConflito
from app.main import criar_app
from app.modelos import Perfil, Usuario
from app.senhas import gerar_hash
from app.tokens import gerar_token

SEGREDO_DE_TESTE = "segredo-de-teste-com-mais-de-32-bytes-0123"
SENHA_DE_TESTE = "Senha@Teste1"


class RepositorioMemoria:
    """Mesmo contrato do RepositorioMongo, guardando tudo num dicionário."""

    def __init__(self):
        self.usuarios: dict[str, Usuario] = {}

    def listar(self):
        return sorted((replace(u) for u in self.usuarios.values()), key=lambda u: u.nome)

    def buscar_por_id(self, id):
        usuario = self.usuarios.get(id)
        return replace(usuario) if usuario else None

    def buscar_por_email(self, email):
        return next((replace(u) for u in self.usuarios.values() if u.email == email), None)

    def existe_email(self, email):
        return any(u.email == email for u in self.usuarios.values())

    def inserir(self, usuario):
        if self.existe_email(usuario.email):
            raise ErroConflito("E-mail já cadastrado.")
        usuario.id = usuario.id or str(ObjectId())
        self.usuarios[usuario.id] = replace(usuario)
        return usuario

    def atualizar(self, usuario):
        self.usuarios[usuario.id] = replace(usuario)
        return usuario

    def excluir(self, id):
        self.usuarios.pop(id, None)

    def contar(self):
        return len(self.usuarios)


@pytest.fixture(scope="session")
def hash_de_teste():
    # BCrypt é lento de propósito; gera o hash uma vez para a sessão inteira.
    return gerar_hash(SENHA_DE_TESTE)


@pytest.fixture
def config():
    # _env_file=None: os testes ignoram o api/.env de quem roda a suíte.
    return Configuracoes(
        _env_file=None,
        jwt_secret=SEGREDO_DE_TESTE,
        jwt_expiration=30,
        cors_origens="http://localhost:5173",
    )


@pytest.fixture
def repositorio(hash_de_teste):
    repositorio = RepositorioMemoria()
    agora = datetime.now(UTC)
    for id, nome, perfil in [
        ("id-admin", "Ana Administradora", Perfil.ADMINISTRADOR),
        ("id-operador", "Otávio Operador", Perfil.OPERADOR),
        ("id-cliente", "Clara Cliente", Perfil.CLIENTE),
    ]:
        email = f"{perfil.value.lower()}@exemplo.com"
        repositorio.inserir(Usuario(nome, email, hash_de_teste, perfil, agora, agora, id=id))
    return repositorio


@pytest.fixture
def api(config, repositorio):
    # O "with" roda o ciclo de vida da app (startup/shutdown), como o uvicorn.
    with TestClient(criar_app(config, repositorio)) as cliente:
        yield cliente


@pytest.fixture
def cabecalho_de(config, repositorio):
    """cabecalho_de("id-admin") -> {"Authorization": "Bearer <jwt válido>"}"""

    def montar(id):
        token, _ = gerar_token(repositorio.buscar_por_id(id), config.jwt_secret, config.jwt_expiration)
        return {"Authorization": f"Bearer {token}"}

    return montar
