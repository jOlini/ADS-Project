"""Rotas que mandam os e-mails da conta do cliente final.

As duas respondem 202 antes de mandar: o envio roda depois da resposta
(BackgroundTasks). Assim o tempo de resposta é o mesmo com e sem conta para
aquele e-mail; se a API esperasse o Google e o provedor, a resposta mais
lenta denunciaria quem tem cadastro (enumeração de usuários pelo tempo).
"""

import hashlib
import logging

from fastapi import APIRouter, BackgroundTasks, Depends, Request, status
from pydantic import BaseModel, ConfigDict, EmailStr

from app.emails.correio import CorreioDaConta
from app.emails.envio import FalhaNoEnvio
from app.emails.links import FalhaNoFirebase
from app.erros import ErroIndisponivel, ErroValidacao
from app.financeiro.acesso import cliente_mesmo_sem_confirmacao
from app.firebase import ClienteFirebase
from app.limites import LimiteDePedidos, endereco_de, obter_limite_de_emails
from app.monitoramento import Monitor
from app.servicos import normalizar_email

log = logging.getLogger("uvicorn.error")

MINUTO = 60
QUINZE_MINUTOS = 15 * 60
HORA = 60 * 60

ACEITO = {"mensagem": "Pedido recebido. Se o endereço puder receber, o link chega em instantes."}

rotas_da_conta = APIRouter(
    prefix="/conta",
    tags=["Conta do cliente"],
    responses={
        429: {"description": "Pedidos demais em pouco tempo; o Retry-After diz quando tentar de novo"},
        503: {"description": "Envio de e-mail não configurado nesta API (a área do cliente usa o do Firebase)"},
    },
)


class PedidoDeNovaSenha(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # O email-validator já recusa endereço acima de 254 caracteres.
    email: EmailStr


def obter_correio(requisicao: Request) -> CorreioDaConta:
    correio = requisicao.app.state.correio
    if correio is None:
        raise ErroIndisponivel("Envio de e-mail não configurado nesta API.")
    return correio


def _identificador(email: str) -> str:
    """Chave do limite sem o e-mail legível (a memória do limite não guarda
    lista de e-mails)."""
    return hashlib.sha256(email.encode("utf-8")).hexdigest()[:32]


def _mandar(acao, email: str, assunto: str, monitor: Monitor) -> None:
    """Roda depois da resposta. Falha vai só para o log, sem o endereço, e
    para o canal de sistema do Discord, só com o tipo da falha."""
    try:
        enviado = acao(email)
    except (FalhaNoFirebase, FalhaNoEnvio) as falha:
        log.warning("E-mail de %s não saiu: %s", assunto, falha)
        monitor.registrar_email(assunto, enviado=False, falha=falha)
        return
    monitor.registrar_email(assunto, enviado=bool(enviado))


@rotas_da_conta.post(
    "/confirmacao",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Mandar o link de confirmação do e-mail",
    responses={401: {"description": "ID token ausente, inválido ou expirado"}},
)
def pedir_confirmacao(
    tarefas: BackgroundTasks,
    requisicao: Request,
    cliente: ClienteFirebase = Depends(cliente_mesmo_sem_confirmacao),
    correio: CorreioDaConta = Depends(obter_correio),
    limite: LimiteDePedidos = Depends(obter_limite_de_emails),
):
    """Manda, com a marca OliFine, o link que confirma o e-mail da conta do ID
    token. É a única rota que aceita a conta ainda sem confirmação. Conta já
    confirmada: 202 sem mandar nada. Até 1 link por minuto e 5 por hora por
    conta."""
    if cliente.email_verificado:
        return ACEITO
    if not cliente.email:
        raise ErroValidacao({"email": "Esta conta não tem e-mail."})
    limite.consumir(
        [
            (f"confirmacao|{cliente.uid}", 1, MINUTO),
            (f"confirmacao|{cliente.uid}", 5, HORA),
            (f"confirmacao-endereco|{endereco_de(requisicao)}", 20, HORA),
        ]
    )
    tarefas.add_task(_mandar, correio.confirmar_email, cliente.email, "confirmação", requisicao.app.state.monitor)
    return ACEITO


@rotas_da_conta.post(
    "/nova-senha",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Mandar o link para criar uma senha nova",
)
def pedir_nova_senha(
    pedido: PedidoDeNovaSenha,
    tarefas: BackgroundTasks,
    requisicao: Request,
    correio: CorreioDaConta = Depends(obter_correio),
    limite: LimiteDePedidos = Depends(obter_limite_de_emails),
):
    """Pública ("Esqueci minha senha"). A resposta é a mesma com e sem conta
    para o e-mail, e os limites também: 1 pedido por minuto para o mesmo
    e-mail do mesmo endereço, 5 por hora para o e-mail e 10 a cada 15 minutos
    por endereço."""
    email = normalizar_email(pedido.email)
    endereco = endereco_de(requisicao)
    identificador = _identificador(email)
    limite.consumir(
        [
            (f"nova-senha|{endereco}|{identificador}", 1, MINUTO),
            (f"nova-senha-email|{identificador}", 5, HORA),
            (f"nova-senha-endereco|{endereco}", 10, QUINZE_MINUTOS),
        ]
    )
    tarefas.add_task(_mandar, correio.nova_senha, email, "nova senha", requisicao.app.state.monitor)
    return ACEITO
