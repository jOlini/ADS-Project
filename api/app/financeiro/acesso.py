"""Autenticação e autorização das rotas do livro-caixa (dependências do FastAPI).

1. cliente_autenticado: lê "Authorization: Bearer <ID token do Firebase>" e
   confere o token (firebase.py). Falhou: 401. Firebase não configurado ou
   chaves do Google inacessíveis: 503.
2. espaco_do_cliente: carrega o espaço da URL e confere que o uid é membro
   dele. Não é: 404, o mesmo de um espaço inexistente. Responder 403 contaria
   a quem tenta ids alheios que aquele espaço existe (IDOR).
"""

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.erros import ErroIndisponivel, ErroNaoAutenticado, ErroNaoEncontrado
from app.financeiro.modelos import Espaco
from app.financeiro.repositorio import RepositorioLivroCaixa
from app.firebase import ClienteFirebase, FirebaseIndisponivel, TokenFirebaseInvalido, VerificadorFirebase
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
    if credenciais is None:
        raise ErroNaoAutenticado(
            "Autenticação necessária: envie o cabeçalho Authorization: Bearer <ID token do Firebase>.",
            DESAFIO_SEM_TOKEN,
        )
    try:
        return verificador.verificar(credenciais.credentials)
    except TokenFirebaseInvalido:
        raise ErroNaoAutenticado("Sessão inválida ou expirada. Entre de novo.", DESAFIO_TOKEN_INVALIDO)
    except FirebaseIndisponivel:
        raise ErroIndisponivel("Login do cliente indisponível no momento. Tente de novo em instantes.")


def espaco_do_cliente(
    espaco_id: str,
    cliente: ClienteFirebase = Depends(cliente_autenticado),
    livro_caixa: RepositorioLivroCaixa = Depends(obter_livro_caixa),
) -> Espaco:
    espaco = livro_caixa.buscar_espaco(espaco_id)
    if espaco is None or espaco.papel_de(cliente.uid) is None:
        raise ErroNaoEncontrado("Espaço não encontrado.")
    return espaco
