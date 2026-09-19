"""Erros da API no formato Problem Details (RFC 9457).

Toda resposta de erro tem o mesmo formato:
{"type": "about:blank", "title": "Not Found", "status": 404,
 "detail": "Usuário não encontrado.", "instance": "/usuarios/abc"}
Nenhuma resposta leva stack trace nem mensagem interna de biblioteca.
"""

from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException


class ErroDaApi(Exception):
    status = 500

    def __init__(self, detalhe: str, cabecalhos: dict[str, str] | None = None):
        super().__init__(detalhe)
        self.detalhe = detalhe
        self.cabecalhos = cabecalhos


class ErroNaoEncontrado(ErroDaApi):
    status = 404


class ErroConflito(ErroDaApi):
    """A requisição é válida, mas colide com o estado atual (e-mail já usado,
    administrador tentando excluir a própria conta)."""

    status = 409


class ErroPermissao(ErroDaApi):
    status = 403


class ErroNaoAutenticado(ErroDaApi):
    status = 401


def problema(status: int, detalhe: str, instancia: str, cabecalhos=None, **extras) -> JSONResponse:
    corpo = {
        "type": "about:blank",
        "title": HTTPStatus(status).phrase,
        "status": status,
        "detail": detalhe,
        "instance": instancia,
        **extras,
    }
    return JSONResponse(corpo, status_code=status, headers=cabecalhos, media_type="application/problem+json")


# Tradução dos erros de validação do Pydantic para mensagens por campo.
def _mensagem_do_campo(erro: dict) -> str:
    tipo = erro["type"]
    contexto = erro.get("ctx", {})
    campo = erro["loc"][-1] if erro["loc"] else ""

    if tipo == "missing" or (tipo == "string_too_short" and contexto.get("min_length") == 1):
        return "Campo obrigatório."
    if tipo == "string_too_short":
        return f"Use pelo menos {contexto['min_length']} caracteres."
    if tipo == "string_too_long":
        return f"Use no máximo {contexto['max_length']} caracteres."
    if tipo == "enum":
        return "Valor inválido. Use ADMINISTRADOR, OPERADOR ou CLIENTE."
    if tipo == "extra_forbidden":
        return "Campo não permitido."
    if tipo == "json_invalid":
        return "JSON malformado."
    if tipo == "value_error" and campo == "email":
        return "E-mail inválido."
    if tipo == "value_error":
        return str(contexto.get("error", erro["msg"]))
    return "Valor inválido."


def registrar_tratadores(app: FastAPI) -> None:
    @app.exception_handler(ErroDaApi)
    async def erro_da_api(requisicao: Request, erro: ErroDaApi):
        return problema(erro.status, erro.detalhe, requisicao.url.path, erro.cabecalhos)

    # Validação falhou: 400 com o erro de cada campo, para a interface mostrar
    # ao lado do input certo. (O padrão do FastAPI seria 422 em inglês.)
    @app.exception_handler(RequestValidationError)
    async def corpo_invalido(requisicao: Request, erro: RequestValidationError):
        campos = {}
        for item in erro.errors():
            nome = ".".join(str(parte) for parte in item["loc"][1:]) or "corpo"
            campos.setdefault(nome, _mensagem_do_campo(item))
        return problema(400, "Um ou mais campos são inválidos.", requisicao.url.path, campos=campos)

    # Rota inexistente (404) e método não suportado (405).
    @app.exception_handler(HTTPException)
    async def erro_http(requisicao: Request, erro: HTTPException):
        detalhes = {404: "Rota não encontrada.", 405: "Método não permitido nesta rota."}
        detalhe = detalhes.get(erro.status_code, str(erro.detail))
        return problema(erro.status_code, detalhe, requisicao.url.path, erro.headers)
