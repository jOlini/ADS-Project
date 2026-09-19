"""Autenticação (JWT) e autorização (RBAC) das rotas.

Toda requisição a uma rota protegida passa por duas etapas antes de chegar
ao código da rota. No FastAPI, esses "middlewares de rota" são dependências
(Depends), declaradas em cada endpoint de rotas.py:

1. usuario_autenticado: lê "Authorization: Bearer <jwt>", confere assinatura,
   validade e emissor e carrega o usuário do banco. Falhou: 401.
2. exigir_perfis(...) / equipe_ou_proprio_cadastro: compara o perfil com a
   tabela de RBAC. Sem permissão: 403.

O perfil usado na autorização é o que está no banco agora, não o gravado no
token. Assim, um usuário excluído perde o acesso na hora e um perfil
rebaixado vale na requisição seguinte, sem esperar o token expirar.
"""

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Configuracoes
from app.erros import ErroNaoAutenticado, ErroPermissao
from app.modelos import Perfil, Usuario
from app.repositorio import RepositorioUsuarios
from app.tokens import TokenInvalido, validar_token

# auto_error=False: sem cabeçalho, a dependência recebe None e devolve o 401
# no formato padrão da API (o próprio HTTPBearer responderia outro JSON).
esquema_bearer = HTTPBearer(auto_error=False, description="Token JWT obtido em POST /auth/login.")

MENSAGEM_SEM_PERMISSAO = "Seu perfil de acesso não permite esta operação."

# RFC 6750: um 401 de recurso protegido por Bearer anuncia o esquema.
DESAFIO_SEM_TOKEN = {"WWW-Authenticate": "Bearer"}
DESAFIO_TOKEN_INVALIDO = {"WWW-Authenticate": 'Bearer error="invalid_token"'}


def obter_config(requisicao: Request) -> Configuracoes:
    return requisicao.app.state.config


def obter_repositorio(requisicao: Request) -> RepositorioUsuarios:
    return requisicao.app.state.repositorio


def usuario_autenticado(
    credenciais: HTTPAuthorizationCredentials | None = Depends(esquema_bearer),
    config: Configuracoes = Depends(obter_config),
    repositorio: RepositorioUsuarios = Depends(obter_repositorio),
) -> Usuario:
    if credenciais is None:
        raise ErroNaoAutenticado(
            "Autenticação necessária: envie o cabeçalho Authorization: Bearer <token>.", DESAFIO_SEM_TOKEN
        )

    try:
        payload = validar_token(credenciais.credentials, config.jwt_secret)
    except TokenInvalido:
        raise ErroNaoAutenticado("Token inválido ou expirado. Faça login novamente.", DESAFIO_TOKEN_INVALIDO)

    usuario = repositorio.buscar_por_id(payload["sub"])
    if usuario is None:
        raise ErroNaoAutenticado("O usuário deste token não existe mais.", DESAFIO_TOKEN_INVALIDO)
    return usuario


def exigir_perfis(*perfis: Perfil):
    """Cria a dependência que só deixa passar os perfis informados."""

    def verificar_perfil(usuario: Usuario = Depends(usuario_autenticado)) -> Usuario:
        if usuario.perfil not in perfis:
            raise ErroPermissao(MENSAGEM_SEM_PERMISSAO)
        return usuario

    return verificar_perfil


# Tabela de RBAC (Parte 3 do DOCS_API.md). Cada rota declara uma destas.
somente_administrador = exigir_perfis(Perfil.ADMINISTRADOR)
administrador_ou_operador = exigir_perfis(Perfil.ADMINISTRADOR, Perfil.OPERADOR)


def equipe_ou_proprio_cadastro(id: str, usuario: Usuario = Depends(usuario_autenticado)) -> Usuario:
    """GET /usuarios/{id}: ADMINISTRADOR e OPERADOR consultam qualquer cadastro;
    CLIENTE só passa quando o {id} da URL é o dele mesmo."""
    if usuario.perfil in (Perfil.ADMINISTRADOR, Perfil.OPERADOR) or usuario.id == id:
        return usuario
    raise ErroPermissao(MENSAGEM_SEM_PERMISSAO)


class CabecalhosDeSeguranca:
    """Middleware ASGI que acrescenta cabeçalhos de segurança a toda resposta.

    - nosniff: o navegador não "adivinha" o tipo do arquivo (evita tratar JSON como script).
    - X-Frame-Options e frame-ancestors: a página não pode ser embutida em
      <iframe> de outro site (clickjacking).
    - Content-Security-Policy: o painel só carrega script e estilo da própria
      origem. Um <script> injetado por XSS não executa.
    - no-store nas respostas da API: dados de usuário e token não ficam em cache.

    A documentação interativa (/docs) carrega arquivos de CDN, por isso fica
    sem a CSP restritiva.
    """

    ROTAS_DA_DOCUMENTACAO = ("/docs", "/redoc", "/openapi.json")
    ROTAS_DE_DADOS = ("/auth", "/usuarios")

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        caminho = scope["path"]

        async def enviar_com_cabecalhos(mensagem):
            if mensagem["type"] == "http.response.start":
                cabecalhos = list(mensagem.get("headers", []))
                cabecalhos += [
                    (b"x-content-type-options", b"nosniff"),
                    (b"x-frame-options", b"DENY"),
                    (b"referrer-policy", b"no-referrer"),
                ]
                if not caminho.startswith(self.ROTAS_DA_DOCUMENTACAO):
                    cabecalhos.append(
                        (b"content-security-policy", b"default-src 'self'; frame-ancestors 'none'; form-action 'self'")
                    )
                if caminho.startswith(self.ROTAS_DE_DADOS):
                    cabecalhos.append((b"cache-control", b"no-store"))
                mensagem["headers"] = cabecalhos
            await send(mensagem)

        await self.app(scope, receive, enviar_com_cabecalhos)
