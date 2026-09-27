"""Junta as peças: código do Firebase, link da área do cliente, modelo e envio."""

import logging
from urllib.parse import quote

from app.emails.envio import Email, EnviadorDeEmail, criar_enviador
from app.emails.links import GeradorDeLinks, ler_credencial
from app.emails.mensagens import mensagem_de_confirmacao, mensagem_de_nova_senha

log = logging.getLogger("uvicorn.error")

# Páginas da área do cliente que recebem o código (web/src/routes.jsx). O
# código vai depois do "#": o fragmento não sai do navegador, então não fica
# no log do servidor que entrega a página nem no Referer.
PAGINA_DE_CONFIRMACAO = "/auth/verificar-email"
PAGINA_DE_NOVA_SENHA = "/auth/redefinir-senha"


class CorreioDaConta:
    def __init__(self, enviador: EnviadorDeEmail, links: GeradorDeLinks, endereco_do_app: str):
        self.enviador = enviador
        self.links = links
        self.endereco_do_app = endereco_do_app.rstrip("/")

    def _link(self, pagina: str, codigo: str) -> str:
        return f"{self.endereco_do_app}{pagina}#oobCode={quote(codigo, safe='')}"

    def confirmar_email(self, email: str) -> None:
        codigo = self.links.codigo("VERIFY_EMAIL", email)
        if codigo is None:
            return
        self.enviador.enviar(Email(email, mensagem_de_confirmacao(self._link(PAGINA_DE_CONFIRMACAO, codigo))))

    def nova_senha(self, email: str) -> None:
        # Sem conta com este e-mail, nada sai, e quem pediu não fica sabendo
        # (a rota responde igual antes de chegar aqui).
        codigo = self.links.codigo("PASSWORD_RESET", email)
        if codigo is None:
            return
        self.enviador.enviar(Email(email, mensagem_de_nova_senha(self._link(PAGINA_DE_NOVA_SENHA, codigo))))


def criar_correio(config) -> CorreioDaConta | None:
    """None com EMAIL_PROVEDOR vazio. Configuração errada (arquivo da conta
    de serviço ilegível, projeto diferente) impede a API de subir: melhor que
    descobrir no primeiro cadastro que nenhum e-mail sai."""
    enviador = criar_enviador(config)
    if enviador is None:
        return None
    credencial = ler_credencial(config.firebase_conta_de_servico)
    if config.firebase_project_id and credencial.projeto != config.firebase_project_id:
        raise ValueError(
            "FIREBASE_CONTA_DE_SERVICO é de outro projeto: os links não valeriam para as contas de FIREBASE_PROJECT_ID."
        )
    log.info("E-mails da conta pelo provedor %s, links para %s.", config.email_provedor, config.app_url)
    return CorreioDaConta(enviador, GeradorDeLinks(credencial), config.app_url)
