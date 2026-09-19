"""Entidade Usuario e contratos (JSON) de entrada e saída da API."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, EmailStr, StringConstraints


class Perfil(StrEnum):
    """Perfis de acesso do RBAC (Sistemas Web Seguros, Parte 3)."""

    ADMINISTRADOR = "ADMINISTRADOR"
    OPERADOR = "OPERADOR"
    CLIENTE = "CLIENTE"


@dataclass
class Usuario:
    """Como o usuário é guardado. Só o hash BCrypt da senha é persistido."""

    nome: str
    email: str
    senha_hash: str
    perfil: Perfil
    criado_em: datetime
    atualizado_em: datetime
    id: str | None = None


def _caber_no_bcrypt(senha: str) -> str:
    # O BCrypt só aceita até 72 bytes. Letra acentuada ocupa 2 bytes em UTF-8,
    # então o limite de caracteres sozinho não garante isso.
    if len(senha.encode("utf-8")) > 72:
        raise ValueError("A senha passa de 72 bytes.")
    return senha


Nome = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Senha = Annotated[str, StringConstraints(min_length=8, max_length=64), AfterValidator(_caber_no_bcrypt)]


class Entrada(BaseModel):
    # Campo desconhecido no JSON é recusado com 400. Fecha a porta para
    # "mass assignment": mandar "id" ou "senha_hash" no corpo não tem efeito.
    model_config = ConfigDict(extra="forbid")


class NovoUsuario(Entrada):
    """Corpo do POST /usuarios."""

    nome: Nome
    email: EmailStr
    senha: Senha
    perfil: Perfil


class AtualizacaoUsuario(Entrada):
    """Corpo do PUT /usuarios/{id}. PUT substitui a representação editável
    inteira, então os três campos são obrigatórios. A senha não entra aqui."""

    nome: Nome
    email: EmailStr
    perfil: Perfil


class LoginRequisicao(Entrada):
    """Corpo do POST /auth/login. Credenciais vão no corpo, nunca na URL,
    que fica gravada em log de servidor e no histórico do navegador."""

    email: Annotated[str, StringConstraints(min_length=1, max_length=254)]
    senha: Annotated[str, StringConstraints(min_length=1, max_length=128)]


class UsuarioResposta(BaseModel):
    """O que a API devolve sobre um usuário. O hash da senha fica de fora:
    a entidade nunca é serializada direto na resposta."""

    id: str
    nome: str
    email: str
    perfil: Perfil
    criado_em: datetime
    atualizado_em: datetime

    @classmethod
    def de(cls, usuario: Usuario) -> "UsuarioResposta":
        return cls(
            id=usuario.id,
            nome=usuario.nome,
            email=usuario.email,
            perfil=usuario.perfil,
            criado_em=usuario.criado_em,
            atualizado_em=usuario.atualizado_em,
        )


class LoginResposta(BaseModel):
    """Login aceito. "tipo" diz como mandar o token nas próximas requisições:
    Authorization: Bearer <token>."""

    token: str
    tipo: str = "Bearer"
    expira_em: datetime
    usuario: UsuarioResposta
