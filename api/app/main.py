"""Montagem da aplicação FastAPI.

Execução: uvicorn app.main:criar_app --factory --port 8081
(é uma fábrica: os testes criam a app com configuração e repositório próprios).
"""

import logging
import mimetypes
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from app.config import Configuracoes
from app.erros import registrar_tratadores
from app.repositorio import RepositorioMongo, RepositorioUsuarios
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


def criar_app(config: Configuracoes | None = None, repositorio: RepositorioUsuarios | None = None) -> FastAPI:
    config = config or Configuracoes()

    @asynccontextmanager
    async def ciclo_de_vida(app: FastAPI):
        app.state.config = config
        app.state.repositorio = repositorio or RepositorioMongo(config.mongodb_uri)

        # Gera já o hash usado no login de e-mail inexistente. Sem isso, a
        # primeira tentativa com e-mail inexistente demoraria o dobro e o
        # tempo de resposta denunciaria que aquele e-mail não tem conta.
        hash_ficticio()

        administrador = criar_administrador_inicial(app.state.repositorio, config)
        if administrador:
            log.info("Administrador inicial criado para %s.", administrador.email)
        elif app.state.repositorio.contar() == 0:
            log.warning("Banco vazio e ADMIN_EMAIL/ADMIN_SENHA ausentes: nenhum administrador foi criado.")
        yield

    app = FastAPI(
        title="Pessoal Finance API",
        version="0.1.0",
        description="API REST de gestão de usuários com JWT e controle de acesso por perfil (RBAC).",
        lifespan=ciclo_de_vida,
    )

    registrar_tratadores(app)

    # CORS: só as origens de CORS_ORIGENS chamam a API pelo navegador. O
    # cabeçalho Authorization é o único de credencial aceito; cookie, nenhum.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.lista_cors,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Location"],
    )
    app.add_middleware(CabecalhosDeSeguranca)

    app.include_router(rotas_autenticacao)
    app.include_router(rotas_usuarios)

    app.mount("/painel", StaticFiles(directory=PASTA_DO_PAINEL, html=True), name="painel")

    @app.get("/", include_in_schema=False)
    def inicio():
        return RedirectResponse("/painel/")

    return app
