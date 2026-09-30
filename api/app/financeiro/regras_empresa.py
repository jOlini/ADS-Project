"""Regras da gestão da empresa em funções puras, testáveis sem banco e sem HTTP:
coerência dos cadastros, competências e vencimentos, e como cada tributo e
cada pessoa da folha viram lançamento."""

import calendar
from datetime import date

from app.financeiro.modelos import Conta, FuncaoDaCategoria
from app.financeiro.modelos_empresa import (
    CEM_POR_CENTO,
    BaseDoTributo,
    Colaborador,
    NovoTributo,
    Periodicidade,
    Socio,
    TipoDeMovimento,
    Vinculo,
)
from app.financeiro.regras import OBRIGATORIO

# Categoria de cada movimento do sócio e de cada vínculo da folha.
FUNCAO_DO_MOVIMENTO = {
    TipoDeMovimento.APORTE: FuncaoDaCategoria.APORTE,
    TipoDeMovimento.DISTRIBUICAO: FuncaoDaCategoria.DISTRIBUICAO,
    TipoDeMovimento.PRO_LABORE: FuncaoDaCategoria.PRO_LABORE,
}
FUNCAO_DO_VINCULO = {
    Vinculo.CLT: FuncaoDaCategoria.SALARIOS,
    Vinculo.PJ: FuncaoDaCategoria.PRESTADORES,
    Vinculo.PRO_LABORE: FuncaoDaCategoria.PRO_LABORE,
}
DESCRICAO_DO_MOVIMENTO = {
    TipoDeMovimento.APORTE: "Aporte de capital",
    TipoDeMovimento.DISTRIBUICAO: "Distribuição de lucros",
    TipoDeMovimento.PRO_LABORE: "Pró-labore",
}
DESCRICAO_DO_VINCULO = {
    Vinculo.CLT: "Salário",
    Vinculo.PJ: "Serviço PJ",
    Vinculo.PRO_LABORE: "Pró-labore",
}


def texto_do_percentual(centesimos: int) -> str:
    """3333 -> "33,33%"; 5000 -> "50%"."""
    inteiro, fracao = divmod(centesimos, 100)
    return f"{inteiro}%" if fracao == 0 else f"{inteiro},{fracao:02d}%"


def conferir_participacao(socios: list[Socio], nova: int, ignorar: str | None = None) -> str | None:
    """As participações do quadro societário somam no máximo 100%. Menos de
    100% é aceito (o quadro pode estar sendo montado); a tela avisa."""
    outras = sum(socio.participacao_centesimos for socio in socios if socio.id != ignorar)
    if outras + nova > CEM_POR_CENTO:
        return f"A soma das participações passaria de 100%. Cabem até {texto_do_percentual(CEM_POR_CENTO - outras)}."
    return None


def conferir_tributo(dados: NovoTributo) -> dict[str, str]:
    """Alíquota para FATURAMENTO e FOLHA, valor para FIXO; nunca os dois."""
    erros: dict[str, str] = {}
    if dados.base == BaseDoTributo.FIXO:
        if dados.valor_fixo_centavos is None:
            erros["valor_fixo_centavos"] = OBRIGATORIO
        if dados.aliquota_centesimos is not None:
            erros["aliquota_centesimos"] = "Tributo de valor fixo não tem alíquota."
    else:
        if dados.aliquota_centesimos is None:
            erros["aliquota_centesimos"] = OBRIGATORIO
        if dados.valor_fixo_centavos is not None:
            erros["valor_fixo_centavos"] = "Tributo calculado por alíquota não tem valor fixo."
    return erros


def conferir_competencia(periodicidade: Periodicidade, competencia: str) -> str | None:
    """O tributo trimestral tem uma competência por trimestre: o último mês."""
    if periodicidade == Periodicidade.TRIMESTRAL and int(competencia[5:7]) % 3 != 0:
        return "Tributo trimestral: use o último mês do trimestre (março, junho, setembro ou dezembro)."
    return None


def conferir_conta_da_empresa(conta: Conta | None) -> str | None:
    """A conta de onde sai (ou onde entra) o dinheiro: da empresa, ativa e que
    não seja um cartão de crédito."""
    if conta is None:
        return "Conta não encontrada."
    if not conta.ativa:
        return "Conta desativada: reative-a para lançar nela."
    if conta.cartao:
        return "Use uma conta da empresa, não um cartão de crédito."
    return None


def dia_no_mes(ano: int, mes: int, dia: int) -> date:
    """O dia no mês pedido; 29, 30 e 31 viram o último dia do mês mais curto."""
    return date(ano, mes, min(dia, calendar.monthrange(ano, mes)[1]))


def mes_seguinte(competencia: str) -> tuple[int, int]:
    ano, mes = int(competencia[:4]), int(competencia[5:7])
    return (ano + 1, 1) if mes == 12 else (ano, mes + 1)


def data_de_pagamento(competencia: str, dia: int) -> date:
    """Salário e guia de uma competência saem no mês seguinte, no dia dado."""
    return dia_no_mes(*mes_seguinte(competencia), dia)


def texto_da_competencia(competencia: str) -> str:
    """'2026-09' -> '09/2026'."""
    return f"{competencia[5:7]}/{competencia[:4]}"


def ativo_na_competencia(colaborador: Colaborador, competencia: str) -> bool:
    """Entra na folha quem está ativo e já tinha sido admitido até o último dia
    da competência."""
    if not colaborador.ativo:
        return False
    if colaborador.admissao is None:
        return True
    ano, mes = int(competencia[:4]), int(competencia[5:7])
    return colaborador.admissao <= dia_no_mes(ano, mes, 31)


def funcao_do_tributo(base: BaseDoTributo) -> FuncaoDaCategoria:
    """Tributo sobre a folha (INSS, FGTS) vai para os encargos; os outros, para
    os impostos."""
    return FuncaoDaCategoria.ENCARGOS if base == BaseDoTributo.FOLHA else FuncaoDaCategoria.IMPOSTOS
