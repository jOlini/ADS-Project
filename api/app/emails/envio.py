"""Provedores de envio de e-mail, atrás de um contrato só (EnviadorDeEmail).

Trocar de provedor é trocar EMAIL_PROVEDOR no ambiente, sem mexer no código:

- resend: API HTTPS do Resend (porta 443, que nenhuma hospedagem bloqueia);
- smtp: qualquer servidor SMTP com senha (Amazon SES, SendGrid, Brevo, a
  caixa de e-mail da hospedagem). Só com criptografia: SSL direto na porta
  465 ou STARTTLS nas outras; texto puro nunca sai daqui;
- pasta: grava cada e-mail como arquivo .html e .txt numa pasta. Serve para
  ver os e-mails e clicar nos links no desenvolvimento, sem conta em provedor
  nenhum. Recusado em produção (config.py).
"""

import json
import re
import smtplib
import ssl
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from email.message import EmailMessage
from email.utils import make_msgid, parseaddr
from pathlib import Path
from typing import Protocol
from urllib.error import HTTPError, URLError

from app.emails.mensagens import Mensagem

# Nenhuma chamada a provedor segura a resposta além disto.
TEMPO_LIMITE_EM_SEGUNDOS = 10


class FalhaNoEnvio(Exception):
    """O provedor recusou ou não respondeu. A mensagem não leva o endereço de
    quem receberia nem a chave do provedor: vai para o log."""


@dataclass(frozen=True)
class Email:
    para: str
    mensagem: Mensagem


class EnviadorDeEmail(Protocol):
    def enviar(self, email: Email) -> None: ...


class EnviadorResend:
    URL = "https://api.resend.com/emails"

    def __init__(self, chave: str, remetente: str, responder_para: str = "", abrir=urllib.request.urlopen):
        self._chave = chave
        self.remetente = remetente
        self.responder_para = responder_para
        self._abrir = abrir

    def enviar(self, email: Email) -> None:
        corpo = {
            "from": self.remetente,
            "to": [email.para],
            "subject": email.mensagem.assunto,
            "html": email.mensagem.html,
            "text": email.mensagem.texto,
        }
        if self.responder_para:
            corpo["reply_to"] = self.responder_para
        requisicao = urllib.request.Request(
            self.URL,
            data=json.dumps(corpo).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {self._chave}",
                "Content-Type": "application/json",
                # O "Python-urllib" padrão é barrado por alguns firewalls de API.
                "User-Agent": "OliFine-API/1.0",
            },
        )
        try:
            with self._abrir(requisicao, timeout=TEMPO_LIMITE_EM_SEGUNDOS) as resposta:
                resposta.read()
        except HTTPError as erro:
            raise FalhaNoEnvio(f"O Resend recusou o e-mail (HTTP {erro.code}).") from None
        except (URLError, TimeoutError, OSError):
            raise FalhaNoEnvio("O Resend não respondeu.") from None


class EnviadorSmtp:
    def __init__(
        self,
        host: str,
        porta: int,
        usuario: str,
        senha: str,
        remetente: str,
        responder_para: str = "",
        smtp=smtplib.SMTP,
        smtp_ssl=smtplib.SMTP_SSL,
    ):
        self.host = host
        self.porta = porta
        self.usuario = usuario
        self._senha = senha
        self.remetente = remetente
        self.responder_para = responder_para
        self._smtp = smtp
        self._smtp_ssl = smtp_ssl

    def montar(self, email: Email) -> EmailMessage:
        mensagem = EmailMessage()
        mensagem["From"] = self.remetente
        mensagem["To"] = email.para
        mensagem["Subject"] = email.mensagem.assunto
        if self.responder_para:
            mensagem["Reply-To"] = self.responder_para
        # Message-ID no domínio do remetente: sem ele, alguns filtros de spam
        # pontuam contra (o servidor inventaria um com outro domínio).
        dominio = parseaddr(self.remetente)[1].rpartition("@")[2] or None
        mensagem["Message-ID"] = make_msgid(domain=dominio)
        mensagem.set_content(email.mensagem.texto)
        mensagem.add_alternative(email.mensagem.html, subtype="html")
        return mensagem

    def enviar(self, email: Email) -> None:
        contexto = ssl.create_default_context()
        try:
            if self.porta == 465:
                conexao = self._smtp_ssl(self.host, self.porta, timeout=TEMPO_LIMITE_EM_SEGUNDOS, context=contexto)
            else:
                conexao = self._smtp(self.host, self.porta, timeout=TEMPO_LIMITE_EM_SEGUNDOS)
            with conexao:
                if self.porta != 465:
                    # Sem STARTTLS, a senha do SMTP e o link iriam em texto
                    # puro. Servidor que não aceita: falha, não manda.
                    conexao.starttls(context=contexto)
                if self.usuario:
                    conexao.login(self.usuario, self._senha)
                conexao.send_message(self.montar(email))
        except (smtplib.SMTPException, OSError) as erro:
            raise FalhaNoEnvio(f"O servidor SMTP recusou ou não respondeu ({type(erro).__name__}).") from None


class EnviadorEmPasta:
    def __init__(self, pasta: Path):
        self.pasta = Path(pasta)

    def enviar(self, email: Email) -> None:
        assunto = re.sub(r"[^a-z0-9]+", "-", email.mensagem.assunto.lower()).strip("-")[:40]
        nome = f"{datetime.now():%Y%m%d-%H%M%S-%f}-{assunto}"
        cabecalho = f"Para: {email.para}\nAssunto: {email.mensagem.assunto}\n"
        try:
            self.pasta.mkdir(parents=True, exist_ok=True)
            (self.pasta / f"{nome}.html").write_text(f"<!--\n{cabecalho}-->\n{email.mensagem.html}", encoding="utf-8")
            (self.pasta / f"{nome}.txt").write_text(f"{cabecalho}\n{email.mensagem.texto}", encoding="utf-8")
        except OSError as erro:
            # Ex.: o container roda sem permissão de escrita na pasta da app.
            raise FalhaNoEnvio(f"Não foi possível gravar em EMAIL_PASTA ({erro.strerror}).") from None


def criar_enviador(config) -> EnviadorDeEmail | None:
    """None quando EMAIL_PROVEDOR está vazio (envio desligado)."""
    if config.email_provedor == "resend":
        return EnviadorResend(
            config.resend_api_key.get_secret_value(), config.email_remetente, config.email_responder_para
        )
    if config.email_provedor == "smtp":
        return EnviadorSmtp(
            config.smtp_host,
            config.smtp_porta,
            config.smtp_usuario,
            config.smtp_senha.get_secret_value(),
            config.email_remetente,
            config.email_responder_para,
        )
    if config.email_provedor == "pasta":
        return EnviadorEmPasta(Path(config.email_pasta))
    return None
