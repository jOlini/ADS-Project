"""Endpoints dos relatórios do livro-caixa (release 0.3, Dashboard).

Só leitura, sob /espacos/{espaco_id}/relatorios, com a mesma barreira das
outras rotas do cliente (espaco_do_cliente). Os números são somados pelo
MongoDB e as regras ficam na API, fora do código publicado da área do
cliente. O período é em meses (AAAA-MM); sem ele, valem os 12 meses que
terminam no mês de hoje, no fuso do espaço.
"""

from fastapi import APIRouter, Depends, Query

from app.financeiro.acesso import espaco_do_cliente
from app.financeiro.modelos import (
    CompromissoDoCartaoResposta,
    CorCategoria,
    Espaco,
    FaturaComprometidaResposta,
    GastoDaCategoriaResposta,
    GastoPorCategoriaResposta,
    MesDoRelatorioResposta,
    PeriodoDaFaturaResposta,
    RelatorioMensalResposta,
    SituacaoDaFatura,
)
from app.financeiro.relatorios import texto_do_mes
from app.financeiro.rotas import ERRO_400, ERRO_404, obter_servico
from app.financeiro.servicos import ServicoLivroCaixa
from app.financeiro.servicos_familia import ServicoFamilia

ERRO_403_PLANO = {403: {"description": "Filtro por pessoa (`membro`) no Free: pede o Plano Família"}}

# Categoria que sumiu do cadastro continua na soma: o dinheiro foi gasto.
CATEGORIA_REMOVIDA = "Categoria removida"

rotas_relatorios = APIRouter(
    prefix="/espacos",
    tags=["Relatórios"],
    responses={
        401: {"description": "ID token do Firebase ausente, inválido ou expirado"},
        503: {"description": "Validação do login do cliente indisponível"},
    },
)

# max_length barra texto enorme antes da leitura; o formato é conferido em
# relatorios.periodo_pedido, que devolve a mensagem no campo.
PARAMETRO_DE = Query(None, max_length=7, description="Mês inicial (AAAA-MM), inclusive. Padrão: 11 meses antes do final")
PARAMETRO_ATE = Query(None, max_length=7, description="Mês final (AAAA-MM), inclusive. Padrão: o mês de hoje")
PARAMETRO_CONTA = Query(None, max_length=64, description="Só os lançamentos desta conta ou cartão")
PARAMETRO_MEMBRO = Query(
    None,
    max_length=64,
    description=(
        "Modo Família: só os lançamentos de uma pessoa da família (id) ou do titular (`titular`). "
        "Pede o Plano Família ou o Empresarial (no Free, 403)"
    ),
)


@rotas_relatorios.get(
    "/{espaco_id}/relatorios/mensal",
    response_model=RelatorioMensalResposta,
    summary="Receita × despesa e saldo no fim de cada mês",
    responses={**ERRO_400, **ERRO_403_PLANO, **ERRO_404},
)
def relatorio_mensal(
    de: str | None = PARAMETRO_DE,
    ate: str | None = PARAMETRO_ATE,
    conta_id: str | None = PARAMETRO_CONTA,
    membro: str | None = PARAMETRO_MEMBRO,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    """Um item por mês do período, inclusive os meses sem lançamento (zerados). A compra no
    cartão conta no mês da parcela; o pagamento da fatura e as transferências não contam; o
    estorno reduz o lado do lançamento original. `saldo_final_centavos` é o saldo das contas
    (sem os cartões) no último dia do mês ou, com `conta_id`, o daquela conta. Com `membro`
    (Modo Família), receitas e despesas são só as daquela pessoa (pelo responsável do
    lançamento); o saldo continua o das contas, que são da casa."""
    inicio, fim = servico.periodo_do_relatorio(espaco, de, ate, conta_id)
    pessoa = ServicoFamilia(servico.repositorio).filtro(espaco, membro)
    meses = servico.relatorio_mensal(espaco, inicio, fim, conta_id, pessoa)
    return RelatorioMensalResposta(
        de=texto_do_mes(inicio),
        ate=texto_do_mes(fim),
        conta_id=conta_id,
        membro=membro or None,
        meses=[
            MesDoRelatorioResposta(
                mes=texto_do_mes(item.mes),
                receitas_centavos=item.receitas,
                despesas_centavos=item.despesas,
                sobra_centavos=item.sobra,
                saldo_final_centavos=item.saldo_final,
            )
            for item in meses
        ],
    )


@rotas_relatorios.get(
    "/{espaco_id}/relatorios/categorias",
    response_model=GastoPorCategoriaResposta,
    summary="Gasto por categoria no período",
    responses={**ERRO_400, **ERRO_403_PLANO, **ERRO_404},
)
def gasto_por_categoria(
    de: str | None = PARAMETRO_DE,
    ate: str | None = PARAMETRO_ATE,
    conta_id: str | None = PARAMETRO_CONTA,
    membro: str | None = PARAMETRO_MEMBRO,
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    """Só as despesas, da categoria com mais gasto para a com menos, com a fatia de cada
    uma no total. O estorno devolve o valor à categoria; a que ficou sem gasto sai da lista.
    Com `membro` (Modo Família), só os gastos daquela pessoa."""
    inicio, fim = servico.periodo_do_relatorio(espaco, de, ate, conta_id)
    pessoa = ServicoFamilia(servico.repositorio).filtro(espaco, membro)
    gastos = servico.gasto_por_categoria(espaco, inicio, fim, conta_id, pessoa)
    return GastoPorCategoriaResposta(
        de=texto_do_mes(inicio),
        ate=texto_do_mes(fim),
        conta_id=conta_id,
        membro=membro or None,
        total_centavos=sum(gasto.valor for gasto, _ in gastos),
        categorias=[
            GastoDaCategoriaResposta(
                categoria_id=gasto.categoria_id,
                nome=categoria.nome if categoria else CATEGORIA_REMOVIDA,
                cor=categoria.cor if categoria else CorCategoria.NEUTRO,
                valor_centavos=gasto.valor,
                fatia=gasto.fatia,
            )
            for gasto, categoria in gastos
        ],
    )


@rotas_relatorios.get(
    "/{espaco_id}/relatorios/cartoes",
    response_model=list[CompromissoDoCartaoResposta],
    summary="Compromisso nos cartões: fatura atual e as próximas, com as parcelas já lançadas",
    responses=ERRO_404,
)
def compromisso_nos_cartoes(
    espaco: Espaco = Depends(espaco_do_cliente),
    servico: ServicoLivroCaixa = Depends(obter_servico),
):
    """Por cartão: a dívida de hoje, o que falta pagar das faturas fechadas e cada fatura da
    aberta em diante, até a última parcela lançada (as vazias no meio aparecem zeradas)."""
    return [
        CompromissoDoCartaoResposta(
            cartao_id=cartao.id,
            nome=cartao.nome,
            ativa=cartao.ativa,
            limite_centavos=cartao.limite_centavos,
            usado_centavos=resumo.usado,
            a_pagar_centavos=resumo.a_pagar,
            faturas=[
                FaturaComprometidaResposta(
                    **PeriodoDaFaturaResposta.de(fatura.periodo).model_dump(),
                    situacao=SituacaoDaFatura.ABERTA if numero == 0 else SituacaoDaFatura.FUTURA,
                    total_centavos=fatura.total,
                )
                for numero, fatura in enumerate(faturas)
            ],
        )
        for cartao, resumo, faturas in servico.compromisso_nos_cartoes(espaco)
    ]
