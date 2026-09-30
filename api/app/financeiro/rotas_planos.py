"""Plano do cliente, trocado pelo back-office: PUT /clientes/{uid}/plano.

Sem checkout ainda, é o único caminho para liberar o Família ou o
Empresarial. Fica fora das rotas do cliente de propósito: quem troca o plano é
o ADMINISTRADOR, com o JWT do back-office. O ID token do Firebase não abre esta
rota (401), então o cliente não se promove sozinho; o que cada plano libera é
conferido na própria API (servicos_familia.py e servicos.py).
"""

import logging

from fastapi import APIRouter, Depends, Path

from app.financeiro.modelos import AtualizacaoPlano, PlanoResposta
from app.financeiro.rotas import obter_servico
from app.financeiro.servicos import ServicoLivroCaixa
from app.modelos import Usuario
from app.seguranca import somente_administrador

log = logging.getLogger("uvicorn.error")

rotas_planos = APIRouter(
    prefix="/clientes",
    tags=["Planos"],
    responses={
        401: {"description": "Token do back-office ausente, inválido ou expirado"},
        403: {"description": "Perfil sem permissão (só ADMINISTRADOR)"},
    },
)

# O uid do Firebase Authentication: letras, números, "-" e "_" (até 128).
UID_DO_CLIENTE = Path(
    min_length=1,
    max_length=128,
    pattern=r"^[A-Za-z0-9_-]+$",
    description="uid do cliente no Firebase Authentication",
)


@rotas_planos.put(
    "/{uid}/plano",
    response_model=PlanoResposta,
    summary="Trocar o plano de um cliente (ADMINISTRADOR)",
    responses={
        400: {"description": "Plano que não existe ou uid fora do formato"},
        404: {"description": "Cliente que ainda não entrou no app (sem espaço pessoal)"},
    },
)
def mudar_plano(
    dados: AtualizacaoPlano,
    uid: str = UID_DO_CLIENTE,
    administrador: Usuario = Depends(somente_administrador),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    """`FREE`, `FAMILIA` ou `EMPRESARIAL`. O Família libera o Modo Família (pessoas da casa,
    filtro "de quem") e a divisão do gasto por pessoa; o Empresarial inclui o Família. Voltar
    ao Free esconde a família sem apagar ninguém."""
    espaco = servico.mudar_plano(uid, dados.plano)
    # Quem mudou o quê fica no log do servidor, sem dado pessoal além dos ids.
    log.info("Plano do cliente %s trocado para %s por %s", uid, espaco.plano.value, administrador.id)
    return PlanoResposta(uid=uid, plano=espaco.plano)
