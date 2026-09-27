"""Códigos de ação do Firebase (confirmar e-mail, trocar senha) sem o e-mail
do Firebase.

É o que o Admin SDK faz em generateEmailVerificationLink e
generatePasswordResetLink: a API chama o accounts:sendOobCode do Identity
Toolkit com returnOobLink=true, autenticada como a conta de serviço do
projeto. O Firebase devolve o código e não manda e-mail nenhum; quem manda é a
API, com o modelo da OliFine.

Sem dependências novas: o token de acesso da conta de serviço é o fluxo OAuth
2.0 de "JWT bearer" (RFC 7523), assinado em RS256 com o PyJWT e o
cryptography que a API já usa para conferir o ID token.

A chave da conta de serviço vale como senha de administrador do projeto
Firebase: fica fora do repositório, num arquivo de segredo
(FIREBASE_CONTA_DE_SERVICO). O ideal é uma conta de serviço só para isto, com
o papel "Administrador do Firebase Authentication", e não a firebase-adminsdk
padrão, que pode tudo no projeto.
"""

import json
import threading
import time
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlencode, urlsplit

import jwt

from app.emails.envio import TEMPO_LIMITE_EM_SEGUNDOS

URL_DO_TOKEN = "https://oauth2.googleapis.com/token"
ESCOPO = "https://www.googleapis.com/auth/cloud-platform"
URL_DO_CODIGO = "https://identitytoolkit.googleapis.com/v1/projects/{projeto}/accounts:sendOobCode"
# Configuração do Authentication (domínios autorizados, URL de ação). Só
# leitura: app/emails/console.py confere o que falta no Console.
URL_DA_CONFIGURACAO = "https://identitytoolkit.googleapis.com/admin/v2/projects/{projeto}/config"

# O token de acesso do Google vale 1 hora; é trocado um minuto antes.
FOLGA_DO_TOKEN = 60

TipoDeAcao = Literal["VERIFY_EMAIL", "PASSWORD_RESET"]


class FalhaNoFirebase(Exception):
    """O Google recusou ou não respondeu. A mensagem é o código de erro do
    Identity Toolkit (ex.: EMAIL_NOT_FOUND), nunca o e-mail."""

    def __init__(self, codigo: str, status: int = 0):
        super().__init__(f"{codigo} (HTTP {status})" if status else codigo)
        self.codigo = codigo
        self.status = status


@dataclass(frozen=True)
class CredencialDeServico:
    email: str
    chave_privada: str
    projeto: str
    url_do_token: str = URL_DO_TOKEN

    def __repr__(self) -> str:
        # A chave privada nunca aparece num log ou numa mensagem de erro.
        return f"CredencialDeServico(email={self.email!r}, projeto={self.projeto!r})"


def ler_credencial(valor: str) -> CredencialDeServico:
    """valor: caminho do JSON da conta de serviço ou o próprio JSON (quando o
    segredo é montado em /run/secrets/firebase_conta_de_servico, o pydantic
    entrega o conteúdo do arquivo)."""
    texto = valor.strip()
    if not texto.startswith("{"):
        try:
            texto = Path(texto).read_text(encoding="utf-8")
        except OSError as erro:
            raise ValueError(f"FIREBASE_CONTA_DE_SERVICO: não foi possível ler o arquivo ({erro.strerror}).") from None
    try:
        dados = json.loads(texto)
        credencial = CredencialDeServico(
            email=dados["client_email"],
            chave_privada=dados["private_key"],
            projeto=dados["project_id"],
            url_do_token=dados.get("token_uri", URL_DO_TOKEN),
        )
    except (ValueError, KeyError, TypeError):
        raise ValueError("FIREBASE_CONTA_DE_SERVICO não é a chave JSON de uma conta de serviço.") from None
    if dados.get("type") != "service_account":
        raise ValueError("FIREBASE_CONTA_DE_SERVICO não é a chave JSON de uma conta de serviço.")
    return credencial


class GeradorDeLinks:
    def __init__(self, credencial: CredencialDeServico, abrir=urllib.request.urlopen, relogio=time.time):
        self.credencial = credencial
        self._abrir = abrir
        self._relogio = relogio
        self._token = ""
        self._vence_em = 0.0
        # As rotas síncronas rodam em threads: um pedido de token por vez.
        self._trava = threading.Lock()

    def codigo(self, tipo: TipoDeAcao, email: str) -> str | None:
        """Código da ação para a conta deste e-mail. None quando não há conta
        com ele (só acontece na nova senha: quem chama não pode saber)."""
        corpo = {"requestType": tipo, "email": email, "returnOobLink": True}
        try:
            resposta = self._pedir(
                URL_DO_CODIGO.format(projeto=self.credencial.projeto),
                json.dumps(corpo).encode("utf-8"),
                {"Authorization": f"Bearer {self._token_de_acesso()}", "Content-Type": "application/json"},
            )
        except FalhaNoFirebase as falha:
            if falha.codigo == "EMAIL_NOT_FOUND":
                return None
            raise
        codigo = resposta.get("oobCode") or parse_qs(urlsplit(resposta.get("oobLink", "")).query).get("oobCode", [""])[0]
        if not codigo:
            raise FalhaNoFirebase("RESPOSTA_SEM_CODIGO")
        return codigo

    def configuracao_do_projeto(self) -> dict:
        """Configuração do Authentication do projeto, como o Console mostra.
        Só leitura; exige o papel "Administrador do Firebase Authentication"."""
        return self._pedir(
            URL_DA_CONFIGURACAO.format(projeto=self.credencial.projeto),
            None,
            {"Authorization": f"Bearer {self._token_de_acesso()}"},
            metodo="GET",
        )

    def _token_de_acesso(self) -> str:
        with self._trava:
            agora = self._relogio()
            if self._token and agora < self._vence_em - FOLGA_DO_TOKEN:
                return self._token
            instante = int(agora)
            declaracao = jwt.encode(
                {
                    "iss": self.credencial.email,
                    "scope": ESCOPO,
                    "aud": self.credencial.url_do_token,
                    "iat": instante,
                    "exp": instante + 3600,
                },
                self.credencial.chave_privada,
                algorithm="RS256",
            )
            corpo = urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer", "assertion": declaracao})
            resposta = self._pedir(
                self.credencial.url_do_token,
                corpo.encode("ascii"),
                {"Content-Type": "application/x-www-form-urlencoded"},
            )
            if not isinstance(resposta.get("access_token"), str):
                raise FalhaNoFirebase("RESPOSTA_SEM_TOKEN")
            self._token = resposta["access_token"]
            self._vence_em = instante + int(resposta.get("expires_in", 3600))
            return self._token

    def _pedir(self, url: str, corpo: bytes | None, cabecalhos: dict[str, str], metodo: str = "POST") -> dict:
        requisicao = urllib.request.Request(url, data=corpo, method=metodo, headers=cabecalhos)
        try:
            with self._abrir(requisicao, timeout=TEMPO_LIMITE_EM_SEGUNDOS) as resposta:
                return json.loads(resposta.read())
        except HTTPError as erro:
            raise FalhaNoFirebase(_codigo_do_erro(erro), erro.code) from None
        except (URLError, TimeoutError, OSError, ValueError):
            raise FalhaNoFirebase("SEM_RESPOSTA") from None


def _codigo_do_erro(erro: HTTPError) -> str:
    """Identity Toolkit: {"error": {"message": "EMAIL_NOT_FOUND"}}; OAuth:
    {"error": "invalid_grant"}. Só o código entra no log."""
    try:
        dados = json.loads(erro.read())
    except (ValueError, OSError):
        return "ERRO_HTTP"
    detalhe = dados.get("error") if isinstance(dados, dict) else None
    if isinstance(detalhe, dict):
        detalhe = detalhe.get("message")
    # "TOO_MANY_ATTEMPTS_TRY_LATER : ..." vira só o código, sem o complemento.
    return str(detalhe).split(" ")[0] if detalhe else "ERRO_HTTP"
