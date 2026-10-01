"""Endpoints do Modo Família, sob /espacos/{espaco_id}/familia.

Só no espaço pessoal (numa empresa, 404) e com a mesma barreira das outras
rotas do cliente (espaco_do_cliente). As regras ficam em servicos_familia.py.
"""

from fastapi import APIRouter, Depends, Request, Response, status

from app.financeiro.acesso import espaco_do_cliente
from app.financeiro.modelos import (
    AtualizacaoFamilia,
    Espaco,
    FamiliaResposta,
    NovaPessoaDaFamilia,
    PessoaDaFamiliaResposta,
)
from app.financeiro.rotas import ERRO_400, ERRO_404, obter_servico
from app.financeiro.servicos import ServicoLivroCaixa
from app.financeiro.servicos_familia import ServicoFamilia

ERRO_409_FAMILIA = {409: {"description": "A família já tem o máximo de pessoas que a assinatura cobre"}}
ERRO_403_PLANO = {403: {"description": "O plano da pessoa (Free) não inclui o Modo Família"}}

rotas_familia = APIRouter(
    prefix="/espacos",
    tags=["Modo Família"],
    responses={
        401: {"description": "ID token do Firebase ausente, inválido ou expirado"},
        503: {"description": "Validação do login do cliente indisponível"},
    },
)


def obter_servico_familia(servico: ServicoLivroCaixa = Depends(obter_servico)) -> ServicoFamilia:
    return ServicoFamilia(servico.repositorio)


class PessoaEditadaResposta(PessoaDaFamiliaResposta):
    # Lançamentos que passaram para o nome novo (responsável ou parte de racha).
    lancamentos_renomeados: int


def _resposta(pessoa) -> PessoaDaFamiliaResposta:
    return PessoaDaFamiliaResposta(id=pessoa.id, nome=pessoa.nome, cor=pessoa.cor)


@rotas_familia.get(
    "/{espaco_id}/familia", response_model=FamiliaResposta, summary="Consultar o Modo Família", responses=ERRO_404
)
def consultar_familia(
    espaco: Espaco = Depends(espaco_do_cliente), servico: ServicoFamilia = Depends(obter_servico_familia)
):
    """Se o modo está ligado e as pessoas da família (o mesmo que vem em `familia` no espaço
    pessoal). `maximo_de_pessoas` é quantas cabem além do titular."""
    return FamiliaResposta.de(servico.familia(espaco), espaco.plano)


@rotas_familia.put(
    "/{espaco_id}/familia",
    response_model=FamiliaResposta,
    summary="Ligar ou desligar o Modo Família",
    responses={**ERRO_400, **ERRO_403_PLANO, **ERRO_404},
)
def ligar_familia(
    dados: AtualizacaoFamilia,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoFamilia = Depends(obter_servico_familia),
):
    """Desligado, a família some da tela; as pessoas continuam guardadas para quando o modo
    voltar. Ligar pede o Plano Família ou o Empresarial (no Free, 403); desligar, nunca."""
    return FamiliaResposta.de(servico.ligar(espaco, dados), espaco.plano)


@rotas_familia.post(
    "/{espaco_id}/familia/pessoas",
    response_model=PessoaDaFamiliaResposta,
    status_code=status.HTTP_201_CREATED,
    summary="Incluir uma pessoa na família",
    responses={**ERRO_400, **ERRO_403_PLANO, **ERRO_404, **ERRO_409_FAMILIA},
)
def incluir_pessoa(
    dados: NovaPessoaDaFamilia,
    requisicao: Request,
    resposta: Response,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoFamilia = Depends(obter_servico_familia),
):
    """Nome (único na família, sem diferença de caixa e acento) e cor. A pessoa é um perfil
    dentro do espaço pessoal, sem login: um lançamento é dela quando o `responsavel` tem o
    nome dela. Cabem até 4 convidados além do titular, 5 pessoas no total (uma assinatura cobre a
    casa). Pede o Plano
    Família ou o Empresarial (no Free, 403)."""
    pessoa = servico.incluir(espaco, dados)
    resposta.headers["Location"] = str(requisicao.url_for("consultar_familia", espaco_id=espaco.id))
    return _resposta(pessoa)


@rotas_familia.put(
    "/{espaco_id}/familia/pessoas/{pessoa_id}",
    response_model=PessoaEditadaResposta,
    summary="Editar o nome ou a cor de uma pessoa da família",
    responses={**ERRO_400, **ERRO_403_PLANO, **ERRO_404},
)
def editar_pessoa(
    pessoa_id: str,
    dados: NovaPessoaDaFamilia,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoFamilia = Depends(obter_servico_familia),
):
    """Com o nome novo, os lançamentos em que a pessoa é responsável (ou parte de um racha)
    passam para ele (`lancamentos_renomeados`). Pede o Plano Família ou o Empresarial."""
    pessoa, renomeados = servico.editar(espaco, pessoa_id, dados)
    return PessoaEditadaResposta(**_resposta(pessoa).model_dump(), lancamentos_renomeados=renomeados)


@rotas_familia.delete(
    "/{espaco_id}/familia/pessoas/{pessoa_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Tirar uma pessoa da família",
    responses=ERRO_404,
)
def remover_pessoa(
    pessoa_id: str,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoFamilia = Depends(obter_servico_familia),
):
    """Os lançamentos dela ficam no extrato, com o nome escrito como responsável. Liberado em
    qualquer plano: tirar alguém é apagar dado."""
    servico.remover(espaco, pessoa_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
