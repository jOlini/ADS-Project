"""Regras do livro-caixa sem banco e sem HTTP: partidas dobradas, estorno e
coerência entre os campos de um lançamento."""

from datetime import UTC, date, datetime

import pytest

from app.financeiro import regras
from app.financeiro.modelos import (
    Categoria,
    Conta,
    CorCategoria,
    NovoLancamento,
    Partida,
    TipoCategoria,
    TipoConta,
    TipoLancamento,
)

AGORA = datetime(2026, 9, 24, 12, tzinfo=UTC)


def conta(id, ativa=True, saldo_inicial=0):
    return Conta("espaco", f"Conta {id}", TipoConta.CORRENTE, saldo_inicial, ativa, AGORA, id=id)


def categoria(id, tipo, ativa=True):
    return Categoria("espaco", f"Categoria {id}", tipo, CorCategoria.NEUTRO, ativa, AGORA, id=id)


def lancamento(tipo, valor=5000, conta_id="corrente", categoria_id=None, conta_destino_id=None):
    return NovoLancamento(
        tipo=tipo,
        descricao="Teste",
        data=date(2026, 9, 24),
        valor_centavos=valor,
        conta_id=conta_id,
        categoria_id=categoria_id,
        conta_destino_id=conta_destino_id,
    )


DESPESA = categoria("mercado", TipoCategoria.DESPESA)
RECEITA = categoria("salario", TipoCategoria.RECEITA)


# --- Partidas dobradas -----------------------------------------------------------


def test_despesa_tira_da_conta_e_poe_na_categoria():
    partidas = regras.montar_partidas(lancamento(TipoLancamento.DESPESA, 5000, categoria_id="mercado"))

    assert partidas == [Partida(-5000, conta_id="corrente"), Partida(5000, categoria_id="mercado")]


def test_receita_poe_na_conta_e_tira_da_categoria():
    partidas = regras.montar_partidas(lancamento(TipoLancamento.RECEITA, 680000, categoria_id="salario"))

    assert partidas == [Partida(680000, conta_id="corrente"), Partida(-680000, categoria_id="salario")]


def test_transferencia_move_entre_contas_sem_categoria():
    partidas = regras.montar_partidas(lancamento(TipoLancamento.TRANSFERENCIA, 50000, conta_destino_id="poupanca"))

    assert partidas == [Partida(-50000, conta_id="corrente"), Partida(50000, conta_id="poupanca")]


@pytest.mark.parametrize(
    "dados",
    [
        lancamento(TipoLancamento.RECEITA, 1, categoria_id="salario"),
        lancamento(TipoLancamento.DESPESA, 99_999_999, categoria_id="mercado"),
        lancamento(TipoLancamento.TRANSFERENCIA, 12345, conta_destino_id="poupanca"),
    ],
)
def test_todo_lancamento_soma_zero(dados):
    assert regras.soma_zero(regras.montar_partidas(dados))


def test_soma_zero_recusa_partidas_desbalanceadas_ou_de_um_lado_so():
    assert not regras.soma_zero([Partida(-100, conta_id="a"), Partida(99, categoria_id="b")])
    assert not regras.soma_zero([Partida(0, conta_id="a")])


def test_estorno_inverte_cada_partida_e_anula_o_lancamento():
    originais = regras.montar_partidas(lancamento(TipoLancamento.DESPESA, 5000, categoria_id="mercado"))

    estorno = regras.inverter(originais)

    assert estorno == [Partida(5000, conta_id="corrente"), Partida(-5000, categoria_id="mercado")]
    assert regras.soma_zero(estorno)
    assert sum(p.valor_centavos for p in originais + estorno if p.conta_id == "corrente") == 0


def test_saldo_e_o_inicial_mais_as_partidas_da_conta():
    corrente = conta("corrente", saldo_inicial=100000)

    assert regras.saldo_da_conta(corrente, {"corrente": -21437, "poupanca": 50000}) == 78563
    assert regras.saldo_da_conta(corrente, {}) == 100000


# --- Coerência dos campos ---------------------------------------------------------


def test_lancamento_coerente_nao_tem_erros():
    assert regras.conferir_lancamento(
        lancamento(TipoLancamento.DESPESA, categoria_id="mercado"), conta("corrente"), DESPESA, None
    ) == {}
    assert regras.conferir_lancamento(
        lancamento(TipoLancamento.TRANSFERENCIA, conta_destino_id="poupanca"), conta("corrente"), None, conta("poupanca")
    ) == {}


@pytest.mark.parametrize(
    ("dados", "conta_encontrada", "categoria_encontrada", "destino", "erros_esperados"),
    [
        pytest.param(
            lancamento(TipoLancamento.DESPESA, categoria_id="mercado"),
            None,
            DESPESA,
            None,
            {"conta_id": "Conta não encontrada."},
            id="conta inexistente ou de outro espaço",
        ),
        pytest.param(
            lancamento(TipoLancamento.DESPESA, categoria_id="mercado"),
            conta("corrente", ativa=False),
            DESPESA,
            None,
            {"conta_id": "Conta desativada: reative-a para lançar nela."},
            id="conta desativada",
        ),
        pytest.param(
            lancamento(TipoLancamento.DESPESA),
            conta("corrente"),
            None,
            None,
            {"categoria_id": "Campo obrigatório."},
            id="despesa sem categoria",
        ),
        pytest.param(
            lancamento(TipoLancamento.DESPESA, categoria_id="salario"),
            conta("corrente"),
            RECEITA,
            None,
            {"categoria_id": "Use uma categoria de despesa."},
            id="despesa com categoria de receita",
        ),
        pytest.param(
            lancamento(TipoLancamento.RECEITA, categoria_id="mercado"),
            conta("corrente"),
            DESPESA,
            None,
            {"categoria_id": "Use uma categoria de receita."},
            id="receita com categoria de despesa",
        ),
        pytest.param(
            lancamento(TipoLancamento.RECEITA, categoria_id="salario"),
            conta("corrente"),
            categoria("salario", TipoCategoria.RECEITA, ativa=False),
            None,
            {"categoria_id": "Categoria desativada: reative-a para lançar nela."},
            id="categoria desativada",
        ),
        pytest.param(
            lancamento(TipoLancamento.RECEITA, categoria_id="salario", conta_destino_id="poupanca"),
            conta("corrente"),
            RECEITA,
            conta("poupanca"),
            {"conta_destino_id": "Só transferência tem conta de destino."},
            id="receita com conta de destino",
        ),
        pytest.param(
            lancamento(TipoLancamento.TRANSFERENCIA),
            conta("corrente"),
            None,
            None,
            {"conta_destino_id": "Campo obrigatório."},
            id="transferência sem destino",
        ),
        pytest.param(
            lancamento(TipoLancamento.TRANSFERENCIA, conta_destino_id="corrente"),
            conta("corrente"),
            None,
            conta("corrente"),
            {"conta_destino_id": "Escolha uma conta de destino diferente da de origem."},
            id="transferência para a mesma conta",
        ),
        pytest.param(
            lancamento(TipoLancamento.TRANSFERENCIA, categoria_id="mercado", conta_destino_id="poupanca"),
            conta("corrente"),
            DESPESA,
            conta("poupanca"),
            {"categoria_id": "Transferência entre contas não tem categoria."},
            id="transferência com categoria",
        ),
        pytest.param(
            lancamento(TipoLancamento.TRANSFERENCIA, conta_destino_id="poupanca"),
            conta("corrente"),
            None,
            conta("poupanca", ativa=False),
            {"conta_destino_id": "Conta desativada: reative-a para lançar nela."},
            id="transferência para conta desativada",
        ),
    ],
)
def test_lancamento_incoerente_aponta_o_campo(dados, conta_encontrada, categoria_encontrada, destino, erros_esperados):
    assert regras.conferir_lancamento(dados, conta_encontrada, categoria_encontrada, destino) == erros_esperados


def test_categorias_iniciais_tem_nomes_unicos_e_os_dois_tipos():
    nomes = [nome for nome, _, _ in regras.CATEGORIAS_INICIAIS]
    tipos = {tipo for _, tipo, _ in regras.CATEGORIAS_INICIAIS}

    assert len(nomes) == len(set(nomes))
    assert tipos == {TipoCategoria.RECEITA, TipoCategoria.DESPESA}
