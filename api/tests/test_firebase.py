"""Validação do ID token do Firebase (identidade do cliente final).

As chaves do Google são trocadas por uma chave RSA de teste (conftest.py); o
resto da validação (algoritmo, assinatura, aud, iss, datas, sub) é o de
produção.
"""

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from app.firebase import EmailNaoVerificado, FirebaseIndisponivel, TokenFirebaseInvalido, VerificadorFirebase
from tests.conftest import PROJETO_DE_TESTE, SEGREDO_DE_TESTE


def test_token_valido_devolve_o_uid_e_o_email(verificador, token_firebase):
    cliente = verificador.verificar(token_firebase("uid-ana"))

    assert cliente.uid == "uid-ana"
    assert cliente.email == "uid-ana@exemplo.com"


@pytest.mark.parametrize(
    "alteracoes",
    [
        pytest.param({"aud": "outro-projeto"}, id="token de outro projeto (aud)"),
        pytest.param({"iss": "https://securetoken.google.com/outro-projeto"}, id="outro emissor (iss)"),
        pytest.param({"exp": int(time.time()) - 3600}, id="vencido (exp)"),
        pytest.param({"iat": int(time.time()) + 3600}, id="emitido no futuro (iat)"),
        pytest.param({"auth_time": int(time.time()) + 3600}, id="login no futuro (auth_time)"),
        pytest.param({"sub": ""}, id="sub vazio"),
        pytest.param({"sub": "x" * 129}, id="sub longo demais"),
        pytest.param({"sub": None}, id="sem sub"),
        pytest.param({"auth_time": None}, id="sem auth_time"),
    ],
)
def test_token_com_claim_invalido_e_recusado(verificador, token_firebase, alteracoes):
    with pytest.raises(TokenFirebaseInvalido):
        verificador.verificar(token_firebase("uid-ana", **alteracoes))


@pytest.mark.parametrize(
    "confirmado",
    [
        pytest.param(False, id="e-mail não confirmado"),
        pytest.param(None, id="sem email_verified"),
        pytest.param("true", id="email_verified como texto"),
    ],
)
def test_conta_sem_email_confirmado_e_recusada(verificador, token_firebase, confirmado):
    with pytest.raises(EmailNaoVerificado):
        verificador.verificar(token_firebase("uid-ana", email_verified=confirmado))


def test_livro_caixa_responde_403_a_conta_sem_email_confirmado(api, token_firebase):
    # A tela segura quem não confirmou o e-mail; a API também, para quem a
    # chama direto com o token.
    token = token_firebase("uid-ana", email_verified=False)
    resposta = api.get("/espacos", headers={"Authorization": f"Bearer {token}"})

    assert resposta.status_code == 403
    assert resposta.json()["detail"] == "Confirme o seu e-mail pelo link que enviamos para usar o app."


def test_assinatura_de_outra_chave_e_recusada(verificador, token_firebase):
    chave_do_atacante = rsa.generate_private_key(public_exponent=65537, key_size=2048)

    with pytest.raises(TokenFirebaseInvalido):
        verificador.verificar(token_firebase("uid-ana", chave=chave_do_atacante))


def test_token_do_back_office_nao_vale_como_token_do_cliente(verificador):
    # HS256 com o segredo da API: o algoritmo aceito é só RS256.
    agora = int(time.time())
    token = jwt.encode(
        {
            "iss": f"https://securetoken.google.com/{PROJETO_DE_TESTE}",
            "aud": PROJETO_DE_TESTE,
            "sub": "uid-ana",
            "iat": agora,
            "auth_time": agora,
            "exp": agora + 3600,
        },
        SEGREDO_DE_TESTE,
        algorithm="HS256",
    )

    with pytest.raises(TokenFirebaseInvalido):
        verificador.verificar(token)


def test_token_malformado_e_recusado():
    # Sem obter_chave de teste, o caminho real lê o "kid" do cabeçalho antes
    # de qualquer rede: texto que não é JWT nem chega a baixar chaves.
    verificador = VerificadorFirebase(PROJETO_DE_TESTE)

    with pytest.raises(TokenFirebaseInvalido):
        verificador.verificar("isto-nao-e-um-jwt")


def test_sem_projeto_configurado_o_login_do_cliente_fica_indisponivel(token_firebase):
    with pytest.raises(FirebaseIndisponivel):
        VerificadorFirebase("").verificar(token_firebase("uid-ana"))


def test_falha_ao_baixar_as_chaves_do_google_e_indisponibilidade(token_firebase):
    def sem_rede(token):
        raise jwt.PyJWKClientConnectionError("sem rede")

    with pytest.raises(FirebaseIndisponivel):
        VerificadorFirebase(PROJETO_DE_TESTE, obter_chave=sem_rede).verificar(token_firebase("uid-ana"))
