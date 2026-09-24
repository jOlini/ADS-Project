"""Persistência dos usuários no MongoDB.

O resto da API conversa com o Protocol RepositorioUsuarios, não com o
pymongo. Os testes trocam o Mongo por um repositório em memória
(tests/conftest.py) e rodam sem banco.
"""

from typing import Protocol

from bson import ObjectId
from pymongo import ASCENDING, MongoClient
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.erros import ErroConflito
from app.modelos import Perfil, Usuario


def conectar_mongo(uri: str) -> Database:
    """Um cliente (e um pool de conexões) para a API inteira: usuários e
    livro-caixa usam o mesmo banco."""
    # tz_aware: as datas voltam do banco com fuso (UTC), iguais às gravadas.
    cliente = MongoClient(uri, serverSelectionTimeoutMS=5000, tz_aware=True)
    return cliente.get_default_database("pessoal-finance")


class RepositorioUsuarios(Protocol):
    def listar(self) -> list[Usuario]: ...

    def buscar_por_id(self, id: str) -> Usuario | None: ...

    def buscar_por_email(self, email: str) -> Usuario | None: ...

    def existe_email(self, email: str) -> bool: ...

    def inserir(self, usuario: Usuario) -> Usuario: ...

    def atualizar(self, usuario: Usuario) -> Usuario: ...

    def excluir(self, id: str) -> None: ...

    def contar(self) -> int: ...


class RepositorioMongo:
    def __init__(self, banco: Database):
        self._colecao = banco["usuarios"]

        # Índice único: mesmo que duas requisições cheguem juntas com o mesmo
        # e-mail, só uma é gravada. A checagem no serviço dá a mensagem
        # amigável; o índice é a garantia.
        self._colecao.create_index([("email", ASCENDING)], unique=True)

    # As consultas são dicionários montados aqui, com valores tipados. Nenhum
    # texto vindo do cliente vira operador do Mongo ($where, $ne...), o que
    # fecha a porta para injeção NoSQL.
    def listar(self) -> list[Usuario]:
        return [_para_usuario(documento) for documento in self._colecao.find().sort("nome", ASCENDING)]

    def buscar_por_id(self, id: str) -> Usuario | None:
        # Id fora do formato do Mongo não existe: vira 404, não erro 500.
        if not ObjectId.is_valid(id):
            return None
        documento = self._colecao.find_one({"_id": ObjectId(id)})
        return _para_usuario(documento) if documento else None

    def buscar_por_email(self, email: str) -> Usuario | None:
        documento = self._colecao.find_one({"email": email})
        return _para_usuario(documento) if documento else None

    def existe_email(self, email: str) -> bool:
        return self._colecao.count_documents({"email": email}, limit=1) > 0

    def inserir(self, usuario: Usuario) -> Usuario:
        try:
            resultado = self._colecao.insert_one(_para_documento(usuario))
        except DuplicateKeyError as erro:
            raise ErroConflito("E-mail já cadastrado.") from erro
        usuario.id = str(resultado.inserted_id)
        return usuario

    def atualizar(self, usuario: Usuario) -> Usuario:
        try:
            self._colecao.replace_one({"_id": ObjectId(usuario.id)}, _para_documento(usuario))
        except DuplicateKeyError as erro:
            raise ErroConflito("E-mail já cadastrado.") from erro
        return usuario

    def excluir(self, id: str) -> None:
        self._colecao.delete_one({"_id": ObjectId(id)})

    def contar(self) -> int:
        return self._colecao.count_documents({})


def _para_documento(usuario: Usuario) -> dict:
    return {
        "nome": usuario.nome,
        "email": usuario.email,
        "senha_hash": usuario.senha_hash,
        "perfil": usuario.perfil.value,
        "criado_em": usuario.criado_em,
        "atualizado_em": usuario.atualizado_em,
    }


def _para_usuario(documento: dict) -> Usuario:
    return Usuario(
        id=str(documento["_id"]),
        nome=documento["nome"],
        email=documento["email"],
        senha_hash=documento["senha_hash"],
        perfil=Perfil(documento["perfil"]),
        criado_em=documento["criado_em"],
        atualizado_em=documento["atualizado_em"],
    )
