"""Montagem da aplicação FastAPI.

Execução: uvicorn app.main:criar_app --factory --port 8081
(é uma fábrica: os testes criam a app com configuração, repositórios e
verificador do Firebase próprios).
"""

import logging
import mimetypes
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.config import Configuracoes
from app.documentacao import rotas_documentacao
from app.emails.correio import CorreioDaConta, criar_correio
from app.emails.rotas import rotas_da_conta
from app.erros import registrar_tratadores
from app.financeiro.repositorio import LivroCaixaMongo, RepositorioLivroCaixa
from app.financeiro.rotas import rotas_livro_caixa
from app.financeiro.rotas_empresa import rotas_empresa
from app.financeiro.rotas_familia import rotas_familia
from app.financeiro.rotas_planos import rotas_planos
from app.financeiro.rotas_relatorios import rotas_relatorios
from app.firebase import VerificadorFirebase
from app.limites import LimiteDePedidos, LimiteDeTentativas, LimiteDoCorpo
from app.monitoramento import Monitor, ObservadorDeRespostas
from app.repositorio import RepositorioMongo, RepositorioUsuarios, conectar_mongo
from app.revogacao import ListaDeRevogacao, RevogacaoEmMemoria, RevogacaoMongo
from app.rotas import rotas_autenticacao, rotas_usuarios
from app.seguranca import CabecalhosDeSeguranca
from app.senhas import hash_ficticio
from app.servicos import criar_administrador_inicial

# Front-end de demonstração (HTML, CSS e JS puros), servido pela própria API.
PASTA_DO_PAINEL = Path(__file__).resolve().parent.parent / "painel"

# A imagem python:slim não traz a tabela de tipos do sistema: sem isto, a
# fonte do painel sairia como application/octet-stream.
mimetypes.add_type("font/woff2", ".woff2")

log = logging.getLogger("uvicorn.error")


def criar_app(
    config: Configuracoes | None = None,
    repositorio: RepositorioUsuarios | None = None,
    livro_caixa: RepositorioLivroCaixa | None = None,
    verificador: VerificadorFirebase | None = None,
    revogacao: ListaDeRevogacao | None = None,
    correio: CorreioDaConta | None = None,
    monitor: Monitor | None = None,
) -> FastAPI:
    config = config or Configuracoes()
    producao = config.ambiente == "producao"
    # Alertas e telemetria no Discord (desligados sem DISCORD_WEBHOOK_*).
    # Criado já aqui, e não no lifespan: o middleware e o tratador de erro
    # o encontram mesmo num pedido que chegue antes do startup terminar.
    monitor = monitor or Monitor.da_config(config)

    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI):
        app.state.config = config
        banco = conectar_mongo(config.mongodb_uri) if repositorio is None or livro_caixa is None else None
        app.state.repositorio = repositorio or RepositorioMongo(banco)
        app.state.livro_caixa = livro_caixa or LivroCaixaMongo(banco)
        app.state.verificador = verificador or VerificadorFirebase(config.firebase_project_id)
        # Tokens encerrados no logout: no MongoDB em execução (vale para todas
        # as instâncias e sobrevive ao reinício); em memória nos testes.
        app.state.revogacao = revogacao or (RevogacaoMongo(banco) if banco is not None else RevogacaoEmMemoria())
        if not app.state.verificador.projeto:
            log.warning("FIREBASE_PROJECT_ID ausente: as rotas /espacos (livro-caixa do cliente) respondem 503.")
        # E-mails da conta (app/emails). None: /conta responde 503 e a área
        # do cliente usa o envio do próprio Firebase.
        app.state.correio = correio or criar_correio(config)
        # Atrás de um proxy reverso (Caddy, nginx), o socket da API é o do
        # proxy. Sem confiar nele, o IP de quem chama seria sempre o do proxy,
        # e o limite de tentativas por endereço (limites.py) somaria o mundo
        # inteiro numa chave só: 20 senhas erradas de qualquer pessoa
        # travariam o login de todas. O uvicorn lê esta variável sozinho.
        if producao and not os.environ.get("FORWARDED_ALLOW_IPS"):
            log.warning("AMBIENTE=producao sem FORWARDED_ALLOW_IPS: o IP de quem chama será o do proxy reverso.")

        # Gera já o hash usado no login de e-mail inexistente. Sem isso, a
        # primeira tentativa com e-mail inexistente demoraria o dobro e o
        # tempo de resposta denunciaria que aquele e-mail não tem conta.
        hash_ficticio()

        administrador = criar_administrador_inicial(app.state.repositorio, config)
        if administrador:
            log.info("Administrador inicial criado para %s.", administrador.email)
        elif app.state.repositorio.contar() == 0:
            log.warning("Banco vazio e ADMIN_EMAIL/ADMIN_SENHA ausentes: nenhum administrador foi criado.")
        monitor.iniciar(app.version)
        yield
        monitor.encerrar()

    app = FastAPI(
        title="Pessoal Finance API",
        version="0.2.0",
        description=(
            "API REST do Pessoal Finance. Back-office: gestão de usuários com JWT e controle de acesso por perfil "
            "(RBAC). Cliente final: livro-caixa em partidas dobradas (contas, categorias e lançamentos), "
            "acessado com o ID token do Firebase, e os e-mails da conta (confirmação e nova senha)."
        ),
        lifespan=ciclo_de_vida,
        # O /docs padrão usa script inline e a CDN sem versão fixa; o nosso
        # (documentacao.py) tem CSP própria. O ReDoc não é usado.
        docs_url=None,
        redoc_url=None,
        # Em produção, o mapa de todas as rotas não fica aberto a quem passa:
        # sem /openapi.json e sem Swagger. A documentação continua no
        # DOCS_API.md e no ambiente de desenvolvimento.
        openapi_url=None if producao else "/openapi.json",
    )

    app.state.monitor = monitor
    registrar_tratadores(app)

    # Contador de senhas erradas do POST /auth/login (um por app: os testes
    # começam do zero).
    app.state.limite_de_login = LimiteDeTentativas()
    # Pedidos de e-mail da conta (/conta), contados todos, não só as falhas.
    app.state.limite_de_emails = LimiteDePedidos()

    # Adicionado primeiro, fica por dentro dos outros middlewares: o 413 também
    # sai com CORS e com os cabeçalhos de segurança.
    app.add_middleware(LimiteDoCorpo)

    # CORS: só as origens de CORS_ORIGENS chamam a API pelo navegador. O
    # cabeçalho Authorization é o único de credencial aceito; cookie, nenhum.
    # PATCH entra já: a edição de lançamento usa esse método, e o navegador
    # barra na pré-verificação o método que não estiver na lista.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.lista_cors,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Location"],
    )
    app.add_middleware(CabecalhosDeSeguranca)
    # Por último, fica por fora de todos: vê o status final de cada resposta
    # (inclusive o 413 do limite do corpo e o 500 de exceção não tratada).
    app.add_middleware(ObservadorDeRespostas)

    app.include_router(rotas_autenticacao)
    app.include_router(rotas_usuarios)
    app.include_router(rotas_livro_caixa)
    app.include_router(rotas_relatorios)
    app.include_router(rotas_familia)
    app.include_router(rotas_planos)
    app.include_router(rotas_empresa)
    app.include_router(rotas_da_conta)
    if not producao:
        app.include_router(rotas_documentacao)

    app.mount("/painel", StaticFiles(directory=PASTA_DO_PAINEL, html=True), name="painel")

    @app.get("/", include_in_schema=False)
    def inicio():
        return RedirectResponse("/painel/")

    # Para o healthcheck do container e o monitor de disponibilidade. Não
    # consulta o banco nem conta nada da configuração: só diz que o processo
    # responde.
    @app.get("/saude", include_in_schema=False)
    def saude():
        return {"status": "ok"}

    return app
