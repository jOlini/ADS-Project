"""Modo de teste dos planos, só para os super admins (SUPER_ADMINS no api/.env).

Quem desenvolve precisa ver o app como cada plano o vê (Free, Família e
Empresarial), com as travas de verdade, sem trocar o plano gravado nem criar
uma conta para cada plano. A tela de um super admin manda o cabeçalho
X-Simular-Plano e, só naquele pedido, a API trata os espaços dele como se o
plano fosse o simulado (Espaco.plano_simulado). O plano gravado no MongoDB não
muda, e as travas continuam as mesmas: simular o Free mostra os 403 do Free.

Super admin é a conta do Firebase com o e-mail confirmado e listado em
SUPER_ADMINS. Para qualquer outra conta, o cabeçalho é ignorado em silêncio: o
cliente não se promove sozinho, e a resposta não conta que o modo existe.
"""

from fastapi import Request

from app.config import Configuracoes
from app.erros import ErroValidacao
from app.financeiro.modelos import Espaco, Plano
from app.firebase import ClienteFirebase

CABECALHO = "X-Simular-Plano"
MENSAGEM_DO_PLANO = "Plano simulado inválido: use FREE, FAMILIA ou EMPRESARIAL."


def eh_super_admin(cliente: ClienteFirebase, config: Configuracoes) -> bool:
    email = (cliente.email or "").strip().lower()
    return bool(email) and cliente.email_verificado and email in config.lista_super_admins


def plano_simulado(requisicao: Request, cliente: ClienteFirebase) -> Plano | None:
    """O plano pedido no cabeçalho, ou None (sem cabeçalho ou sem permissão)."""
    valor = (requisicao.headers.get(CABECALHO) or "").strip().upper()
    if not valor or not eh_super_admin(cliente, requisicao.app.state.config):
        return None
    try:
        return Plano(valor)
    except ValueError:
        # Só o super admin chega aqui: para ele, o erro ajuda a achar o engano.
        raise ErroValidacao({"plano": MENSAGEM_DO_PLANO})


def aplicar(espacos: list[Espaco], plano: Plano | None) -> list[Espaco]:
    """Marca o plano simulado nos espaços carregados para este pedido (cópias
    lidas do banco: nada disso é gravado)."""
    if plano is not None:
        for espaco in espacos:
            espaco.plano_simulado = plano
    return espacos
