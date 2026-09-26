"""Relatórios do livro-caixa em funções puras: período em meses, receita ×
despesa por mês, gasto por categoria, saldo no fim de cada mês e o que já
está comprometido nas próximas faturas dos cartões.

Os números seguem as mesmas regras do resumo do mês da área do cliente
(web/src/regras/resumo.js):

- a compra no cartão conta no mês da parcela (competência), como qualquer
  despesa; o pagamento da fatura é transferência e não conta de novo;
- transferência entre contas não é receita nem despesa;
- o estorno reduz o lado do lançamento original (o estorno de uma despesa
  diminui as despesas, não vira receita), no mês do estorno.

As somas chegam prontas do banco (agregação no MongoDB, sem o teto de
lançamentos da listagem). Aqui ficam só as contas sobre elas: nenhuma
função lê lançamento por lançamento, exceto as das faturas, que já leem
só os do cartão da fatura atual em diante.
"""

import re
from dataclasses import dataclass
from datetime import date

from app.financeiro import cartoes
from app.financeiro.cartoes import PeriodoDaFatura, Referencia
from app.financeiro.modelos import Conta, Lancamento, TipoLancamento

# (ano, mês). Mesmo formato da referência da fatura.
Mes = tuple[int, int]
# Soma das partidas de categoria de um mês, por tipo do lançamento e
# categoria: {("AAAA-MM", tipo, categoria_id): centavos}. Numa despesa a
# partida da categoria é positiva; numa receita, negativa; no estorno, o
# sinal se inverte.
SomasPorCategoria = dict[tuple[str, TipoLancamento, str], int]

# Teto do período de um relatório (10 anos): barra consulta absurda.
MAXIMO_DE_MESES = 120
# Meses do período padrão, terminando no mês atual.
MESES_DO_PADRAO = 12
_FORMATO_DO_MES = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")
MES_INVALIDO = "Mês inválido. Use o formato AAAA-MM."


@dataclass(frozen=True)
class ResultadoDoMes:
    mes: Mes
    receitas: int
    despesas: int
    # Saldo das contas no último dia do mês (sem os cartões, que são dívida).
    saldo_final: int

    @property
    def sobra(self) -> int:
        return self.receitas - self.despesas


@dataclass(frozen=True)
class GastoDaCategoria:
    categoria_id: str
    valor: int
    # Porcentagem do total, arredondada (a soma das fatias pode dar 99 ou 101).
    fatia: int


@dataclass(frozen=True)
class FaturaComprometida:
    periodo: PeriodoDaFatura
    # Compras menos créditos do período, como no total da fatura.
    total: int


# --- Período -------------------------------------------------------------------


def texto_do_mes(mes: Mes) -> str:
    return f"{mes[0]:04d}-{mes[1]:02d}"


def ler_mes(texto: str) -> Mes | None:
    """(ano, mês) de um texto AAAA-MM; None se o formato não bate."""
    encontrado = _FORMATO_DO_MES.match(texto)
    return (int(encontrado[1]), int(encontrado[2])) if encontrado else None


def mes_de(data: date) -> Mes:
    return data.year, data.month


def meses_entre(de: Mes, ate: Mes) -> int:
    """Quantos meses há de um mês a outro, contando os dois."""
    return (ate[0] - de[0]) * 12 + (ate[1] - de[1]) + 1


def meses_do_periodo(de: Mes, ate: Mes) -> list[Mes]:
    return [cartoes.somar_meses(de, numero) for numero in range(meses_entre(de, ate))]


def primeiro_dia(mes: Mes) -> date:
    return date(mes[0], mes[1], 1)


def ultimo_dia(mes: Mes) -> date:
    return cartoes.dia_no_mes(mes[0], mes[1], 31)


def periodo_pedido(de: str | None, ate: str | None, hoje: date) -> tuple[Mes | None, Mes | None, dict[str, str]]:
    """Os meses inicial e final de um relatório e os erros por campo (vazio =
    período válido). Sem o final, vale o mês de hoje; sem o inicial, os 12
    meses que terminam no final."""
    erros: dict[str, str] = {}
    fim = mes_de(hoje) if ate is None else ler_mes(ate)
    if fim is None:
        erros["ate"] = MES_INVALIDO
    inicio = ler_mes(de) if de is not None else None
    if de is not None and inicio is None:
        erros["de"] = MES_INVALIDO
    if erros:
        return None, None, erros

    if inicio is None:
        inicio = cartoes.somar_meses(fim, 1 - MESES_DO_PADRAO)
    if inicio > fim:
        erros["ate"] = "O mês final vem antes do inicial."
    elif meses_entre(inicio, fim) > MAXIMO_DE_MESES:
        erros["de"] = f"Peça no máximo {MAXIMO_DE_MESES} meses de uma vez."
    return inicio, fim, erros


# --- Receita × despesa e saldo --------------------------------------------------


def receitas_e_despesas(somas: SomasPorCategoria) -> dict[str, tuple[int, int]]:
    """{"AAAA-MM": (receitas, despesas)} a partir das partidas de categoria.

    Na receita a partida da categoria é negativa (−valor), e no estorno dela,
    positiva: somadas com o sinal trocado, dão as receitas já descontados os
    estornos. Na despesa é o contrário. Transferência não tem partida de
    categoria e fica de fora sozinha."""
    por_mes: dict[str, tuple[int, int]] = {}
    for (mes, tipo, _), soma in somas.items():
        receitas, despesas = por_mes.get(mes, (0, 0))
        if tipo == TipoLancamento.RECEITA:
            receitas -= soma
        elif tipo == TipoLancamento.DESPESA:
            despesas += soma
        por_mes[mes] = (receitas, despesas)
    return por_mes


def saldos_no_fim_de_cada_mes(meses: list[Mes], saldo_inicial: int, somas_por_mes: dict[str, int]) -> list[int]:
    """Saldo no último dia de cada mês pedido: o saldo inicial das contas mais
    tudo o que mexeu nelas até aquele dia, inclusive antes do período.

    somas_por_mes é {"AAAA-MM": soma das partidas das contas no mês}, de todo
    o histórico até o último mês pedido. O saldo inicial é o dinheiro que já
    estava na conta antes do primeiro lançamento: vale desde sempre."""
    if not meses:
        return []
    inicio = texto_do_mes(meses[0])
    saldo = saldo_inicial + sum(soma for mes, soma in somas_por_mes.items() if mes < inicio)
    saldos = []
    for mes in meses:
        saldo += somas_por_mes.get(texto_do_mes(mes), 0)
        saldos.append(saldo)
    return saldos


def resultado_por_mes(
    meses: list[Mes], somas: SomasPorCategoria, saldo_inicial: int, somas_das_contas: dict[str, int]
) -> list[ResultadoDoMes]:
    """Um item por mês do período, na ordem, inclusive os meses sem nada
    (zerados): o gráfico precisa de todos."""
    por_mes = receitas_e_despesas(somas)
    saldos = saldos_no_fim_de_cada_mes(meses, saldo_inicial, somas_das_contas)
    return [
        ResultadoDoMes(mes, *por_mes.get(texto_do_mes(mes), (0, 0)), saldo_final=saldo)
        for mes, saldo in zip(meses, saldos, strict=True)
    ]


# --- Gasto por categoria --------------------------------------------------------


def fatia(valor: int, total: int) -> int:
    """Porcentagem inteira de valor em total, com meio ponto arredondado para
    cima (como o Math.round da tela; o round do Python arredondaria 2,5 para 2)."""
    if total <= 0:
        return 0
    return (valor * 200 + total) // (total * 2)


def gasto_por_categoria(somas: SomasPorCategoria) -> list[GastoDaCategoria]:
    """Gasto de cada categoria no período, do maior para o menor, com a fatia
    de cada uma. Só as despesas: o estorno devolve o valor à categoria, e a
    categoria que ficou zerada ou negativa sai da lista."""
    totais: dict[str, int] = {}
    for (_, tipo, categoria_id), soma in somas.items():
        if tipo == TipoLancamento.DESPESA:
            totais[categoria_id] = totais.get(categoria_id, 0) + soma
    positivos = [(categoria_id, valor) for categoria_id, valor in totais.items() if valor > 0]
    total = sum(valor for _, valor in positivos)
    positivos.sort(key=lambda item: (-item[1], item[0]))
    return [GastoDaCategoria(categoria_id, valor, fatia(valor, total)) for categoria_id, valor in positivos]


# --- Compromisso nos cartões ----------------------------------------------------


def faturas_comprometidas(cartao: Conta, lancamentos: list[Lancamento], atual: Referencia) -> list[FaturaComprometida]:
    """A fatura atual e as seguintes, até a última com alguma cobrança (as
    parcelas já lançadas). Uma fatura vazia no meio aparece zerada, para as
    colunas do gráfico não pularem mês.

    lancamentos são os do cartão da fatura atual em diante. O pagamento não
    muda o valor da fatura (cartoes.cobranca), só o quita."""
    totais: dict[Referencia, int] = {}
    for lancamento in lancamentos:
        referencia = cartoes.referencia_da_data(cartao, lancamento.data)
        if referencia >= atual:
            totais[referencia] = totais.get(referencia, 0) + cartoes.cobranca(lancamento, cartao.id)
    ultima = max((referencia for referencia, total in totais.items() if total != 0), default=atual)
    return [
        FaturaComprometida(cartoes.periodo_da_fatura(cartao, referencia), totais.get(referencia, 0))
        for referencia in meses_do_periodo(atual, ultima)
    ]
