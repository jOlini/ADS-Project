"""Autenticação e autorização das rotas do livro-caixa (dependências do FastAPI).

1. cliente_autenticado: lê "Authorization: Bearer <ID token do Firebase>" e
   confere o token (firebase.py). Falhou: 401. Conta com o e-mail ainda não
   confirmado: 403. Firebase não configurado ou chaves do Google
   inacessíveis: 503.
2. espaco_do_cliente: carrega o espaço da URL e confere que o uid é membro
   dele. Não é: 404, o mesmo de um espaço inexistente. Responder 403 contaria
   a quem tenta ids alheios que aquele espaço existe (IDOR). Para um super
   admin com o cabeçalho X-Simular-Plano, o espaço sai marcado com o plano
   simulado (simulacao.py), só neste pedido.
"""

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.erros import ErroIndisponivel, ErroNaoAutenticado, ErroNaoEncontrado, ErroPermissao
from app.financeiro import simulacao
from app.financeiro.modelos import Espaco
from app.financeiro.repositorio import RepositorioLivroCaixa
from app.firebase import (
    ClienteFirebase,
    EmailNaoVerificado,
    FirebaseIndisponivel,
    TokenFirebaseInvalido,
    VerificadorFirebase,
)
from app.seguranca import DESAFIO_SEM_TOKEN, DESAFIO_TOKEN_INVALIDO

# Esquema próprio (nome diferente do Bearer do back-office) para o Swagger
# mostrar as duas credenciais separadas.
esquema_firebase = HTTPBearer(
    auto_error=False,
    scheme_name="IdTokenFirebase",
    description="ID token do Firebase Authentication do cliente final (getIdToken() no front-end).",
)


def obter_livro_caixa(requisicao: Request) -> RepositorioLivroCaixa:
    return requisicao.app.state.livro_caixa


def obter_verificador(requisicao: Request) -> VerificadorFirebase:
    return requisicao.app.state.verificador


def cliente_autenticado(
    credenciais: HTTPAuthorizationCredentials | None = Depends(esquema_firebase),
    verificador: VerificadorFirebase = Depends(obter_verificador),
) -> ClienteFirebase:
    return _verificar(credenciais, verificador, exigir_email_verificado=True)


def cliente_mesmo_sem_confirmacao(
    credenciais: HTTPAuthorizationCredentials | None = Depends(esquema_firebase),
    verificador: VerificadorFirebase = Depends(obter_verificador),
) -> ClienteFirebase:
    """Igual ao cliente_autenticado, mas aceita a conta que ainda não
    confirmou o e-mail. Só para POST /conta/confirmacao (emails/rotas.py)."""
    return _verificar(credenciais, verificador, exigir_email_verificado=False)


def _verificar(credenciais, verificador: VerificadorFirebase, exigir_email_verificado: bool) -> ClienteFirebase:
    if credenciais is None:
        raise ErroNaoAutenticado(
            "Autenticação necessária: envie o cabeçalho Authorization: Bearer <ID token do Firebase>.",
            DESAFIO_SEM_TOKEN,
        )
    try:
        return verificador.verificar(credenciais.credentials, exigir_email_verificado)
    except TokenFirebaseInvalido:
        raise ErroNaoAutenticado("Sessão inválida ou expirada. Entre de novo.", DESAFIO_TOKEN_INVALIDO)
    except EmailNaoVerificado:
        raise ErroPermissao("Confirme o seu e-mail pelo link que enviamos para usar o app.")
    except FirebaseIndisponivel:
        raise ErroIndisponivel("Login do cliente indisponível no momento. Tente de novo em instantes.")


def espaco_do_cliente(
    espaco_id: str,
    requisicao: Request,
    cliente: ClienteFirebase = Depends(cliente_autenticado),
    livro_caixa: RepositorioLivroCaixa = Depends(obter_livro_caixa),
) -> Espaco:
    espaco = livro_caixa.buscar_espaco(espaco_id)
    if espaco is None or espaco.papel_de(cliente.uid) is None:
        raise ErroNaoEncontrado("Espaço não encontrado.")
    simulacao.aplicar([espaco], simulacao.plano_simulado(requisicao, cliente))
    return espaco
