"""Descarte de linhas na conferência da importação: a linha marcada com
descartar não vira lançamento (nem gera parcelas), e a resposta conta quantas
saíram. Ex.: o pagamento da fatura anterior, que na fatura do cartão aparece
como entrada e dobraria a receita.

Extratos fictícios; tudo pelo HTTP, com os repositórios em memória.
"""

import pytest

from tests.test_financeiro_api import entrar
from tests.test_financeiro_cartoes import criar_cartao, hoje
from tests.test_financeiro_importacao import EXTRATO, importacao


@pytest.fixture
def ana(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-ana"))


def test_simulacao_marca_a_linha_descartada(ana):
    conta = ana.criar_conta("Corrente")

    corpo = importacao(ana, conta, simular=True, ajustes={"2": {"descartar": True}}).json()

    assert (corpo["novas"], corpo["descartadas"]) == (3, 1)
    assert corpo["linhas"][0]["situacao"] == "DESCARTADA"
    assert corpo["linhas"][0]["lancamento_id"] is None


def test_linha_descartada_nao_entra_e_volta_numa_nova_importacao(ana):
    conta = ana.criar_conta("Corrente", saldo_inicial=10_000)

    corpo = importacao(ana, conta, ajustes={"2": {"descartar": True}}).json()

    assert (corpo["importadas"], corpo["descartadas"]) == (3, 1)
    assert ana.saldos() == {"Corrente": 10_000 - 185_000 - 1_250 - 1_250}
    # Nada é guardado da descartada: o mesmo arquivo de novo a traz para conferir.
    de_novo = importacao(ana, conta, simular=True).json()
    assert [linha["situacao"] for linha in de_novo["linhas"]] == ["NOVA", "JA_IMPORTADA", "JA_IMPORTADA", "JA_IMPORTADA"]


def test_descartar_linha_ja_importada_nao_muda_nada(ana):
    conta = ana.criar_conta("Corrente")
    importacao(ana, conta)

    corpo = importacao(ana, conta, ajustes={"3": {"descartar": True}}).json()

    assert (corpo["ja_importadas"], corpo["descartadas"]) == (4, 0)
    assert len(ana.get("/lancamentos").json()) == 4


def test_pagamento_da_fatura_descartado_e_parcela_descartada_sem_parcelas_futuras(ana):
    cartao = criar_cartao(ana)
    dia = hoje().strftime("%d/%m/%Y")
    fatura = f"Data;Descrição;Valor\n{dia};PAGAMENTO RECEBIDO;500,00\n{dia};LOJA X 01/03;-90,00\n{dia};Padaria;-12,50\n"

    corpo = importacao(
        ana, cartao["id"], csv=fatura, ajustes={"2": {"descartar": True}, "3": {"descartar": True}}
    ).json()

    assert (corpo["importadas"], corpo["descartadas"], corpo["parcelas_futuras"]) == (1, 2, 0)
    assert [lancamento["descricao"] for lancamento in ana.get("/lancamentos").json()] == ["Padaria"]
