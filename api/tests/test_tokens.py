"""Testes unitários do JWT: sem banco, sem rede e sem subir a API."""

import base64
import json
from datetime import UTC, datetime, timedelta

import jwt
import pytest
from pydantic import ValidationError

from app.config import Configuracoes
from app.modelos import Perfil, Usuario
from app.tokens import EMISSOR, TokenInvalido, gerar_token, validar_token

SEGREDO = "segredo-de-teste-com-mais-de-32-bytes-0123"


@pytest.fixture
def usuario():
    agora = datetime.now(UTC)
    return Usuario("Ana Souza", "ana@exemplo.com", "hash", Perfil.OPERADOR, agora, agora, id="id-ana")


def test_payload_leva_id_nome_perfil_e_datas(usuario):
    token, expira_em = gerar_token(usuario, SEGREDO, 30)

    payload = validar_token(token, SEGREDO)

    assert payload["sub"] == "id-ana"
    assert payload["nome"] == "Ana Souza"
    assert payload["perfil"] == "OPERADOR"
    assert payload["iss"] == EMISSOR
    assert payload["exp"] == int(expira_em.timestamp())


def test_token_expira_trinta_minutos_depois_da_emissao(usuario):
    token, _ = gerar_token(usuario, SEGREDO, 30)

    payload = validar_token(token, SEGREDO)

    assert payload["exp"] - payload["iat"] == 30 * 60


def test_payload_nao_leva_email_nem_senha(usuario):
    token, _ = gerar_token(usuario, SEGREDO, 30)

    payload = validar_token(token, SEGREDO)

    assert not {"email", "senha", "senha_hash"} & payload.keys()


def test_recusa_token_expirado(usuario):
    duas_horas_atras = datetime.now(UTC) - timedelta(hours=2)
    token, _ = gerar_token(usuario, SEGREDO, 30, agora=duas_horas_atras)

    with pytest.raises(TokenInvalido):
        validar_token(token, SEGREDO)


def test_recusa_token_assinado_com_outra_chave(usuario):
    forjado, _ = gerar_token(usuario, "chave-do-atacante-com-mais-de-32-bytes!!", 30)

    with pytest.raises(TokenInvalido):
        validar_token(forjado, SEGREDO)


def test_recusa_payload_alterado(usuario):
    cabecalho, _, assinatura = gerar_token(usuario, SEGREDO, 30)[0].split(".")

    # Troca o perfil para ADMINISTRADOR e mantém a assinatura original.
    payload = validar_token(gerar_token(usuario, SEGREDO, 30)[0], SEGREDO) | {"perfil": "ADMINISTRADOR"}
    adulterado = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()

    with pytest.raises(TokenInvalido):
        validar_token(f"{cabecalho}.{adulterado}.{assinatura}", SEGREDO)


def test_recusa_token_sem_assinatura_alg_none(usuario):
    agora = datetime.now(UTC)
    sem_assinatura = jwt.encode(
        {"iss": EMISSOR, "sub": "id-ana", "perfil": "ADMINISTRADOR", "iat": agora, "exp": agora + timedelta(minutes=5)},
        key=None,
        algorithm="none",
    )

    with pytest.raises(TokenInvalido):
        validar_token(sem_assinatura, SEGREDO)


def test_recusa_token_de_outro_emissor(usuario):
    agora = datetime.now(UTC)
    de_outro_sistema = jwt.encode(
        {"iss": "outro-sistema", "sub": "id-ana", "iat": agora, "exp": agora + timedelta(minutes=5)},
        SEGREDO,
        algorithm="HS256",
    )

    with pytest.raises(TokenInvalido):
        validar_token(de_outro_sistema, SEGREDO)


def test_api_nao_sobe_com_segredo_menor_que_32_bytes():
    with pytest.raises(ValidationError, match="32 bytes"):
        Configuracoes(_env_file=None, jwt_secret="curto")
