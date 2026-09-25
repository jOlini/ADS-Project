"""Cartão de crédito em funções puras: ciclo da fatura, parcelas e o painel
do cartão (limite, fatura atual, parcelamentos futuros).

No livro-caixa, o cartão é uma conta de dívida (partidas dobradas):

    compra de R$ 120 no crédito:    cartão −12000 · categoria Mercado +12000
    pagamento de R$ 120 da fatura:  conta corrente −12000 · cartão +12000

O saldo negativo do cartão é o que se deve. O limite disponível é o limite
menos essa dívida: a compra ocupa o limite e o pagamento o libera. Uma compra
parcelada ocupa o limite inteiro desde o primeiro dia, como no banco, porque
todas as parcelas entram no livro-caixa na hora, cada uma com a data da sua
fatura.

Ciclo: a fatura leva o mês do vencimento (a "fatura de outubro" vence em
outubro). Ela fecha no dia de fechamento do mesmo mês, se ele vem antes do
vencimento, ou do mês anterior. A compra feita no próprio dia do fechamento
já vai para a fatura seguinte (o "melhor dia de compra"). Os dias 29 a 31
viram o último dia nos meses mais curtos.
"""

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, timedelta

from app.financeiro.modelos import Conta, Lancamento, SituacaoDaFatura, TipoLancamento

# (ano, mês) do vencimento de uma fatura.
Referencia = tuple[int, int]


@dataclass(frozen=True)
class PeriodoDaFatura:
    referencia: Referencia
    # Primeiro dia cujas compras entram nesta fatura.
    inicio: date
    # Dia em que a fatura fecha. A compra deste dia já é da próxima.
    fechamento: date
    vencimento: date

    def contem(self, data: date) -> bool:
        return self.inicio <= data < self.fechamento

    @property
    def ultimo_dia(self) -> date:
        return self.fechamento - timedelta(days=1)


@dataclass(frozen=True)
class ResumoDoCartao:
    limite: int
    # O que se deve hoje, somando todas as faturas, inclusive as parcelas
    # futuras (negativo = crédito a favor).
    usado: int
    disponivel: int
    fatura_atual: PeriodoDaFatura
    total_da_fatura_atual: int
    # Faturas já fechadas que ainda não foram pagas, e a última delas.
    a_pagar: int
    ultima_fechada: PeriodoDaFatura
    # Compras que caem depois da fatura atual (parcelas das próximas faturas).
    parcelamentos_futuros: int


def somar_meses(referencia: Referencia, meses: int) -> Referencia:
    ano, mes = referencia
    total = ano * 12 + (mes - 1) + meses
    return total // 12, total % 12 + 1


def dia_no_mes(ano: int, mes: int, dia: int) -> date:
    """A data do dia no mês, com 29 a 31 virando o último dia do mês curto."""
    return date(ano, mes, min(dia, monthrange(ano, mes)[1]))


def _fechamento(cartao: Conta, referencia: Referencia) -> date:
    ano, mes = referencia if cartao.dia_fechamento < cartao.dia_vencimento else somar_meses(referencia, -1)
    return dia_no_mes(ano, mes, cartao.dia_fechamento)


def periodo_da_fatura(cartao: Conta, referencia: Referencia) -> PeriodoDaFatura:
    ano, mes = referencia
    return PeriodoDaFatura(
        referencia=referencia,
        inicio=_fechamento(cartao, somar_meses(referencia, -1)),
        fechamento=_fechamento(cartao, referencia),
        vencimento=dia_no_mes(ano, mes, cartao.dia_vencimento),
    )


def referencia_da_data(cartao: Conta, data: date) -> Referencia:
    """A fatura em que cai uma compra feita nesta data."""
    # A fatura que fecha no mês da data; se ela já fechou, a seguinte.
    mes_da_data = (data.year, data.month)
    referencia = mes_da_data if cartao.dia_fechamento < cartao.dia_vencimento else somar_meses(mes_da_data, 1)
    return referencia if data < _fechamento(cartao, referencia) else somar_meses(referencia, 1)


def situacao_da_fatura(referencia: Referencia, atual: Referencia) -> SituacaoDaFatura:
    if referencia == atual:
        return SituacaoDaFatura.ABERTA
    return SituacaoDaFatura.FECHADA if referencia < atual else SituacaoDaFatura.FUTURA


def valores_das_parcelas(total: int, parcelas: int) -> list[int]:
    """Parcelas iguais em centavos; o centavo que sobra da divisão vai para a
    primeira (R$ 10,00 em 3x = 3,34 + 3,33 + 3,33), e a soma dá o total."""
    base, resto = divmod(total, parcelas)
    return [base + resto] + [base] * (parcelas - 1)


def datas_das_parcelas(cartao: Conta, data: date, parcelas: int) -> list[date]:
    """Uma data por parcela, cada uma na fatura seguinte à da anterior.

    A parcela leva o dia da compra no mês dela. Quando esse dia cai fora da
    fatura certa (compra no fim do mês com fechamento num dia 29 a 31, que
    muda de data nos meses curtos), a data é puxada para dentro dela: sem
    isso, uma parcela pularia uma fatura."""
    primeira = referencia_da_data(cartao, data)
    datas = []
    for numero in range(parcelas):
        periodo = periodo_da_fatura(cartao, somar_meses(primeira, numero))
        ano, mes = somar_meses((data.year, data.month), numero)
        no_mes = dia_no_mes(ano, mes, data.day)
        datas.append(min(max(no_mes, periodo.inicio), periodo.ultimo_dia))
    return datas


def cobranca(lancamento: Lancamento, cartao_id: str) -> int:
    """Quanto o lançamento soma à fatura: a compra soma, o crédito (estorno,
    reembolso) desconta. O pagamento, que é transferência para o cartão, não
    é cobrança: ele quita a fatura, não muda o valor dela."""
    if lancamento.tipo == TipoLancamento.TRANSFERENCIA:
        return 0
    return -sum(partida.valor_centavos for partida in lancamento.partidas if partida.conta_id == cartao_id)


def pagamento(lancamento: Lancamento, cartao_id: str) -> int:
    """Quanto o lançamento pagou deste cartão (transferência para ele)."""
    if lancamento.tipo != TipoLancamento.TRANSFERENCIA or lancamento.conta_destino_id != cartao_id:
        return 0
    return lancamento.valor_centavos


def total_da_fatura(lancamentos: list[Lancamento], cartao_id: str, periodo: PeriodoDaFatura) -> int:
    return sum(cobranca(lancamento, cartao_id) for lancamento in lancamentos if periodo.contem(lancamento.data))


def resumir(cartao: Conta, saldo: int, lancamentos: list[Lancamento], hoje: date) -> ResumoDoCartao:
    """Painel do cartão. lancamentos são os do cartão da fatura atual em
    diante (os anteriores já estão no saldo)."""
    atual = periodo_da_fatura(cartao, referencia_da_data(cartao, hoje))
    usado = -saldo
    fatura = total_da_fatura(lancamentos, cartao.id, atual)
    futuros = sum(cobranca(l, cartao.id) for l in lancamentos if l.data >= atual.fechamento)
    return ResumoDoCartao(
        limite=cartao.limite_centavos,
        usado=usado,
        disponivel=cartao.limite_centavos - usado,
        fatura_atual=atual,
        total_da_fatura_atual=fatura,
        # O que se deve além da fatura atual e das parcelas futuras é das
        # faturas fechadas. Pagamento adiantado deixa o valor abaixo de zero.
        a_pagar=max(0, usado - fatura - futuros),
        ultima_fechada=periodo_da_fatura(cartao, somar_meses(atual.referencia, -1)),
        parcelamentos_futuros=futuros,
    )
