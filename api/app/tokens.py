"""Emissão e validação do JWT (HS256, com a biblioteca PyJWT)."""

from datetime import UTC, datetime, timedelta

import jwt

from app.modelos import Usuario

ALGORITMO = "HS256"
EMISSOR = "pessoal-finance-api"


class TokenInvalido(Exception):
    pass


def gerar_token(usuario: Usuario, segredo: str, validade_minutos: int, agora: datetime | None = None):
    """Devolve (token, expira_em).

    O payload de um JWT é só Base64: qualquer um lê. Por isso ele leva o mínimo
    para identificar e autorizar (id, nome, perfil e datas) e nunca senha, hash
    ou e-mail. A assinatura impede alteração, não leitura.
    """
    # O JWT guarda datas em segundos inteiros (RFC 7519). Zerar os
    # microssegundos faz o "expira_em" da resposta bater com o exp do token.
    emitido_em = (agora or datetime.now(UTC)).replace(microsecond=0)
    expira_em = emitido_em + timedelta(minutes=validade_minutos)

    payload = {
        "iss": EMISSOR,
        "sub": usuario.id,
        "nome": usuario.nome,
        "perfil": usuario.perfil.value,
        "iat": emitido_em,
        "exp": expira_em,
    }
    return jwt.encode(payload, segredo, algorithm=ALGORITMO), expira_em


def validar_token(token: str, segredo: str) -> dict:
    """Devolve o payload ou lança TokenInvalido.

    Recusa assinatura que não confere, token vencido (exp), emissor diferente
    (iss) e claim obrigatório ausente. A lista de algoritmos é fixa em HS256:
    um token com "alg": "none" ou outro algoritmo é recusado, sem exceção.
    """
    try:
        return jwt.decode(
            token,
            segredo,
            algorithms=[ALGORITMO],
            issuer=EMISSOR,
            options={"require": ["iss", "sub", "iat", "exp"]},
        )
    except jwt.InvalidTokenError as erro:
        raise TokenInvalido(str(erro)) from erro
