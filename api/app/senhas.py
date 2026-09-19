"""Hash de senha com BCrypt.

BCrypt é lento de propósito e usa um salt aleatório por senha: duas senhas
iguais geram hashes diferentes, e testar bilhões de palpites fica caro para
quem roubar o banco. O custo padrão (12) é o da biblioteca bcrypt.
"""

import secrets
from functools import lru_cache

import bcrypt

LIMITE_DE_BYTES = 72


def gerar_hash(senha: str) -> str:
    return bcrypt.hashpw(senha.encode("utf-8"), bcrypt.gensalt()).decode("ascii")


def conferir_senha(senha: str, senha_hash: str) -> bool:
    dados = senha.encode("utf-8")
    # O BCrypt recusa mais de 72 bytes. Nenhuma senha cadastrada passa disso
    # (ver modelos.Senha), então uma tentativa maior é simplesmente errada.
    if len(dados) > LIMITE_DE_BYTES:
        return False
    return bcrypt.checkpw(dados, senha_hash.encode("ascii"))


@lru_cache(maxsize=1)
def hash_ficticio() -> str:
    """Hash de uma senha aleatória, para o login de e-mail inexistente
    gastar o mesmo tempo que o de senha errada (ver servicos.autenticar)."""
    return gerar_hash(secrets.token_urlsafe(16))
