"""Endpoints da gestão de cada empresa (espaço empresarial): custos, sociedade e
aportes, impostos e pessoal (RH), sob /espacos/{espaco_id}.

Só nas empresas (no espaço pessoal, 404) e com a mesma barreira das outras
rotas do cliente (espaco_do_cliente). Tudo o que mexe em dinheiro vira um
lançamento comum do livro-caixa da empresa. As regras ficam em
servicos_empresa.py e regras_empresa.py.
"""

from fastapi import APIRouter, Depends, Request, Response, status

from app.financeiro.acesso import cliente_autenticado, espaco_do_cliente
from app.financeiro.modelos import CategoriaResposta, Espaco, LancamentoResposta
from app.financeiro.modelos_empresa import (
    ClassesDeCusto,
    ColaboradorResposta,
    FolhaResposta,
    NovaFolha,
    NovoColaborador,
    NovoMovimentoDoSocio,
    NovoPagamentoDeTributo,
    NovoSocio,
    NovoTributo,
    SocioResposta,
    TributoResposta,
)
from app.financeiro.rotas import ERRO_400, ERRO_404, obter_servico
from app.financeiro.servicos import ServicoLivroCaixa
from app.financeiro.servicos_empresa import ServicoEmpresa
from app.firebase import ClienteFirebase

ERRO_409_LIMITE = {409: {"description": "Limite de cadastros da empresa atingido"}}

rotas_empresa = APIRouter(
    prefix="/espacos",
    tags=["Gestão da empresa"],
    responses={
        401: {"description": "ID token do Firebase ausente, inválido ou expirado"},
        503: {"description": "Validação do login do cliente indisponível"},
    },
)


def obter_servico_empresa(servico: ServicoLivroCaixa = Depends(obter_servico)) -> ServicoEmpresa:
    return ServicoEmpresa(servico.repositorio)


class SocioEditadoResposta(SocioResposta):
    # Lançamentos que passaram para o nome novo (aportes, pró-labore...).
    lancamentos_renomeados: int


class ColaboradorEditadoResposta(ColaboradorResposta):
    lancamentos_renomeados: int


# --- Custos --------------------------------------------------------------------


@rotas_empresa.put(
    "/{espaco_id}/custos/classes",
    response_model=list[CategoriaResposta],
    summary="Classificar as despesas da empresa em variáveis, fixas, operacionais ou fora dos custos",
    responses={**ERRO_400, **ERRO_404},
)
def classificar_custos(
    dados: ClassesDeCusto,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoEmpresa = Depends(obter_servico_empresa),
):
    """`classes` leva `{id da categoria: classe}`; `null` volta a categoria para a sugestão da
    tela. Só despesas; com um id errado, nenhuma muda. Devolve todas as categorias."""
    return [CategoriaResposta.de(categoria) for categoria in servico.classificar_custos(espaco, dados)]


# --- Sociedade e aportes ------------------------------------------------------


@rotas_empresa.get(
    "/{espaco_id}/socios", response_model=list[SocioResposta], summary="Quadro societário", responses=ERRO_404
)
def listar_socios(espaco: Espaco = Depends(espaco_do_cliente), servico: ServicoEmpresa = Depends(obter_servico_empresa)):
    """Participação em centésimos de ponto (`5000` = 50%)."""
    return [SocioResposta.de(socio) for socio in servico.socios(espaco)]


@rotas_empresa.post(
    "/{espaco_id}/socios",
    response_model=SocioResposta,
    status_code=status.HTTP_201_CREATED,
    summary="Incluir sócio",
    responses={**ERRO_400, **ERRO_404, **ERRO_409_LIMITE},
)
def incluir_socio(
    dados: NovoSocio,
    requisicao: Request,
    resposta: Response,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoEmpresa = Depends(obter_servico_empresa),
):
    """Nome único e participação (a soma do quadro vai até 100%)."""
    socio = servico.incluir_socio(espaco, dados)
    resposta.headers["Location"] = str(requisicao.url_for("listar_socios", espaco_id=espaco.id))
    return SocioResposta.de(socio)


@rotas_empresa.put(
    "/{espaco_id}/socios/{socio_id}",
    response_model=SocioEditadoResposta,
    summary="Editar sócio",
    responses={**ERRO_400, **ERRO_404},
)
def editar_socio(
    socio_id: str,
    dados: NovoSocio,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoEmpresa = Depends(obter_servico_empresa),
):
    """Com o nome novo, os lançamentos do sócio (aportes, pró-labore, distribuições) passam
    para ele (`lancamentos_renomeados`)."""
    socio, renomeados = servico.editar_socio(espaco, socio_id, dados)
    return SocioEditadoResposta(**SocioResposta.de(socio).model_dump(), lancamentos_renomeados=renomeados)


@rotas_empresa.delete(
    "/{espaco_id}/socios/{socio_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Tirar sócio", responses=ERRO_404
)
def remover_socio(
    socio_id: str,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoEmpresa = Depends(obter_servico_empresa),
):
    servico.remover_socio(espaco, socio_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@rotas_empresa.post(
    "/{espaco_id}/socios/{socio_id}/movimentos",
    response_model=LancamentoResposta,
    status_code=status.HTTP_201_CREATED,
    summary="Lançar aporte, distribuição de lucros ou pró-labore do sócio",
    responses={**ERRO_400, **ERRO_404},
)
def lancar_movimento(
    socio_id: str,
    dados: NovoMovimentoDoSocio,
    espaco: Espaco = Depends(espaco_do_cliente),
    cliente: ClienteFirebase = Depends(cliente_autenticado),
    servico: ServicoEmpresa = Depends(obter_servico_empresa),
):
    """`APORTE` entra na conta (receita em "Aportes dos sócios"); `DISTRIBUICAO` e
    `PRO_LABORE` saem dela (despesa em "Distribuição de lucros" e "Pró-labore"). O sócio é o
    responsável do lançamento. A categoria nasce sozinha se faltar."""
    return LancamentoResposta.de(servico.lancar_movimento(espaco, socio_id, dados, cliente.uid))


# --- Impostos ------------------------------------------------------------------


@rotas_empresa.get(
    "/{espaco_id}/tributos",
    response_model=list[TributoResposta],
    summary="Tributos recorrentes com as competências pagas",
    responses=ERRO_404,
)
def listar_tributos(
    espaco: Espaco = Depends(espaco_do_cliente), servico: ServicoEmpresa = Depends(obter_servico_empresa)
):
    """Cada tributo com `pagamentos` (competência, lançamento, valor e data), do mais novo para
    o mais antigo. O vencimento é no mês seguinte à competência, no `dia_vencimento`; a
    provisão (alíquota sobre o faturamento ou a folha, ou o valor fixo) é conta da tela."""
    return [TributoResposta.de(tributo, pagamentos) for tributo, pagamentos in servico.tributos(espaco)]


@rotas_empresa.post(
    "/{espaco_id}/tributos",
    response_model=TributoResposta,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastrar tributo recorrente (DAS, DARF, ISS...)",
    responses={**ERRO_400, **ERRO_404, **ERRO_409_LIMITE},
)
def incluir_tributo(
    dados: NovoTributo,
    requisicao: Request,
    resposta: Response,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoEmpresa = Depends(obter_servico_empresa),
):
    """Base `FATURAMENTO` ou `FOLHA` pede `aliquota_centesimos` (`600` = 6%); `FIXO` pede
    `valor_fixo_centavos`."""
    tributo = servico.incluir_tributo(espaco, dados)
    resposta.headers["Location"] = str(requisicao.url_for("listar_tributos", espaco_id=espaco.id))
    return TributoResposta.de(tributo, [])


@rotas_empresa.put(
    "/{espaco_id}/tributos/{tributo_id}",
    response_model=TributoResposta,
    summary="Editar tributo",
    responses={**ERRO_400, **ERRO_404},
)
def editar_tributo(
    tributo_id: str,
    dados: NovoTributo,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoEmpresa = Depends(obter_servico_empresa),
):
    servico.editar_tributo(espaco, tributo_id, dados)
    return TributoResposta.de(*servico.tributo(espaco, tributo_id))


@rotas_empresa.delete(
    "/{espaco_id}/tributos/{tributo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Excluir tributo (os pagamentos ficam no extrato)",
    responses=ERRO_404,
)
def remover_tributo(
    tributo_id: str,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoEmpresa = Depends(obter_servico_empresa),
):
    servico.remover_tributo(espaco, tributo_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@rotas_empresa.post(
    "/{espaco_id}/tributos/{tributo_id}/pagamentos",
    response_model=LancamentoResposta,
    status_code=status.HTTP_201_CREATED,
    summary="Pagar a guia de uma competência",
    responses={
        **ERRO_400,
        **ERRO_404,
        409: {"description": "A competência já está paga (para refazer, exclua o pagamento)"},
    },
)
def pagar_tributo(
    tributo_id: str,
    dados: NovoPagamentoDeTributo,
    espaco: Espaco = Depends(espaco_do_cliente),
    cliente: ClienteFirebase = Depends(cliente_autenticado),
    servico: ServicoEmpresa = Depends(obter_servico_empresa),
):
    """Despesa em "Impostos" (ou em "Encargos da folha", no tributo sobre a folha) com a origem
    do tributo e da competência. Tributo trimestral: competência = último mês do trimestre."""
    return LancamentoResposta.de(servico.pagar_tributo(espaco, tributo_id, dados, cliente.uid))


# --- Pessoal (RH) --------------------------------------------------------------


@rotas_empresa.get(
    "/{espaco_id}/colaboradores",
    response_model=list[ColaboradorResposta],
    summary="Pessoas da folha (CLT, PJ e pró-labore)",
    responses=ERRO_404,
)
def listar_colaboradores(
    espaco: Espaco = Depends(espaco_do_cliente), servico: ServicoEmpresa = Depends(obter_servico_empresa)
):
    """Com `competencias_lancadas`: as competências em que o salário de cada pessoa já entrou no
    livro-caixa."""
    return [ColaboradorResposta.de(pessoa, competencias) for pessoa, competencias in servico.colaboradores(espaco)]


@rotas_empresa.post(
    "/{espaco_id}/colaboradores",
    response_model=ColaboradorResposta,
    status_code=status.HTTP_201_CREATED,
    summary="Cadastrar pessoa na folha",
    responses={**ERRO_400, **ERRO_404, **ERRO_409_LIMITE},
)
def incluir_colaborador(
    dados: NovoColaborador,
    requisicao: Request,
    resposta: Response,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoEmpresa = Depends(obter_servico_empresa),
):
    """Vínculo (`CLT`, `PJ`, `PRO_LABORE`), salário (ou valor do contrato, ou pró-labore),
    benefícios, dia de pagamento e admissão."""
    colaborador = servico.incluir_colaborador(espaco, dados)
    resposta.headers["Location"] = str(requisicao.url_for("listar_colaboradores", espaco_id=espaco.id))
    return ColaboradorResposta.de(colaborador, [])


@rotas_empresa.put(
    "/{espaco_id}/colaboradores/{colaborador_id}",
    response_model=ColaboradorEditadoResposta,
    summary="Editar pessoa da folha",
    responses={**ERRO_400, **ERRO_404},
)
def editar_colaborador(
    colaborador_id: str,
    dados: NovoColaborador,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoEmpresa = Depends(obter_servico_empresa),
):
    """A próxima folha usa os valores novos; as já lançadas continuam. Com o nome novo, os
    lançamentos da pessoa passam para ele."""
    _, renomeados = servico.editar_colaborador(espaco, colaborador_id, dados)
    pessoa, competencias = servico.colaborador(espaco, colaborador_id)
    return ColaboradorEditadoResposta(
        **ColaboradorResposta.de(pessoa, competencias).model_dump(), lancamentos_renomeados=renomeados
    )


@rotas_empresa.delete(
    "/{espaco_id}/colaboradores/{colaborador_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Tirar pessoa da folha (os lançamentos ficam)",
    responses=ERRO_404,
)
def remover_colaborador(
    colaborador_id: str,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoEmpresa = Depends(obter_servico_empresa),
):
    """Para quem saiu da empresa, prefira desativar (`ativo: false` no PUT)."""
    servico.remover_colaborador(espaco, colaborador_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@rotas_empresa.post(
    "/{espaco_id}/folha",
    response_model=FolhaResposta,
    summary="Lançar a folha de uma competência no fluxo de caixa",
    responses={**ERRO_400, **ERRO_404},
)
def lancar_folha(
    dados: NovaFolha,
    espaco: Espaco = Depends(espaco_do_cliente),
    cliente: ClienteFirebase = Depends(cliente_autenticado),
    servico: ServicoEmpresa = Depends(obter_servico_empresa),
):
    """Para cada pessoa ativa na competência: o salário (em "Folha de pagamento", "Prestadores
    de serviço" ou "Pró-labore", pelo vínculo) e os benefícios (em "Benefícios"), saindo da
    conta indicada, com a pessoa como responsável. Sem `data`, cada um no dia de pagamento dele,
    no mês seguinte à competência. Quem já está lançado na competência é pulado
    (`ja_lancados`): repetir não duplica."""
    lancados, ja_lancados = servico.lancar_folha(espaco, dados, cliente.uid)
    return FolhaResposta(
        competencia=dados.competencia,
        lancados=len(lancados),
        ja_lancados=ja_lancados,
        total_centavos=sum(lancamento.valor_centavos for lancamento in lancados),
        lancamento_ids=[lancamento.id for lancamento in lancados],
    )
