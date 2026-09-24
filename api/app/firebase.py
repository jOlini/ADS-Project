"""Validação do ID token do Firebase: a identidade do cliente final na API.

O cliente faz login no Firebase Authentication (área do cliente em React) e
manda o ID token em "Authorization: Bearer <token>". A API age como resource
server: não emite esse token, só confere que o Google o emitiu para o nosso
projeto. Regras da documentação do Firebase ("Verify ID tokens using a
third-party JWT library"):

- algoritmo RS256, assinado por uma das chaves públicas do Google (JWKS);
- "aud" igual ao ID do projeto e "iss" igual a
  https://securetoken.google.com/<projeto>;
- "exp" no futuro, "iat" e "auth_time" no passado;
- "sub" (o uid) texto não vazio de até 128 caracteres.

O token do back-office (HS256, emitido em /auth/login) nunca passa aqui: o
algoritmo é fixo em RS256 e o emissor é outro. O inverso vale em tokens.py.
Assim uma credencial de cliente nunca alcança a área administrativa, e o
contrário também não.
"""

import time
from collections.abc import Callable
from dataclasses import dataclass

import jwt

URL_DAS_CHAVES = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
ALGORITMO = "RS256"

# Tolerância de relógio. O Docker Desktop costuma atrasar alguns segundos
# depois que o computador dorme; sem folga, um token recém-emitido pareceria
# "do futuro". Um minuto a mais num token de uma hora não muda o risco.
FOLGA_DO_RELOGIO = 60


class TokenFirebaseInvalido(Exception):
    pass


class FirebaseIndisponivel(Exception):
    """Projeto não configurado ou chaves públicas do Google inacessíveis."""


@dataclass(frozen=True)
class ClienteFirebase:
    uid: str
    email: str | None


class VerificadorFirebase:
    def __init__(self, projeto: str, obter_chave: Callable[[str], object] | None = None):
        """obter_chave(token) devolve a chave pública que assinou o token. Os
        testes passam uma chave RSA própria; em execução, as chaves vêm do
        Google e ficam em cache (o PyJWKClient só baixa de novo ao expirar)."""
        self.projeto = projeto
        self._obter_chave = obter_chave
        if obter_chave is None and projeto:
            cliente = jwt.PyJWKClient(URL_DAS_CHAVES, cache_keys=True)
            self._obter_chave = lambda token: cliente.get_signing_key_from_jwt(token).key

    def verificar(self, token: str) -> ClienteFirebase:
        if not self.projeto:
            raise FirebaseIndisponivel("FIREBASE_PROJECT_ID não configurado.")

        try:
            chave = self._obter_chave(token)
        except jwt.PyJWKClientConnectionError as erro:
            raise FirebaseIndisponivel("Não foi possível obter as chaves públicas do Firebase.") from erro
        except (jwt.PyJWKClientError, jwt.InvalidTokenError) as erro:
            # Token malformado ou sem "kid" de uma chave do Google.
            raise TokenFirebaseInvalido(str(erro)) from erro

        try:
            payload = jwt.decode(
                token,
                chave,
                algorithms=[ALGORITMO],
                audience=self.projeto,
                issuer=f"https://securetoken.google.com/{self.projeto}",
                leeway=FOLGA_DO_RELOGIO,
                options={"require": ["exp", "iat", "aud", "iss", "sub", "auth_time"]},
            )
        except jwt.InvalidTokenError as erro:
            raise TokenFirebaseInvalido(str(erro)) from erro

        uid = payload["sub"]
        if not isinstance(uid, str) or not 0 < len(uid) <= 128:
            raise TokenFirebaseInvalido("sub inválido.")
        if not isinstance(payload["auth_time"], int) or payload["auth_time"] > time.time() + FOLGA_DO_RELOGIO:
            raise TokenFirebaseInvalido("auth_time no futuro.")

        email = payload.get("email")
        return ClienteFirebase(uid=uid, email=email if isinstance(email, str) else None)
