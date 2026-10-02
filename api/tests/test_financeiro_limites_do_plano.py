"""Limites do Plano Free (limites_do_plano.py): contas e cartões cadastrados e
lançamentos feitos à mão no mês. No teto, a API recusa com 403 e o membro
"limite", mesmo que a tela seja burlada; os outros planos não têm teto.

Os tetos de verdade (5 contas, 100 lançamentos) ficam menores aqui, pelo
monkeypatch, para os testes não precisarem de cem pedidos.
"""

from datetime import UTC, date, datetime

import pytest

from app.financeiro import limites_do_plano
from app.financeiro.limites_do_plano import Limites, Recurso
from app.financeiro.modelos import Plano
from tests.test_financeiro_api import entrar
from tests.test_financeiro_cartoes import criar_cartao


@pytest.fixture
def tetos_pequenos(monkeypatch):
    monkeypatch.setattr(limites_do_plano, "LIMITES_DO_FREE", Limites(contas=2, lancamentos_por_mes=3))


@pytest.fixture
def ana(api, cabecalho_do_cliente):
    # Recém-chegada: Free.
    return entrar(api, cabecalho_do_cliente("uid-ana"))


def hoje_texto():
    return date.today().isoformat()


def despesa(cliente, conta, valor=1_000):
    return cliente.post(
        "/lancamentos",
        {
            "tipo": "DESPESA",
            "descricao": "Padaria",
            "data": hoje_texto(),
            "valor_centavos": valor,
            "conta_id": conta,
            "categoria_id": cliente.categorias["Mercado"],
        },
    )


def uso(cliente):
    return cliente.get("/uso-do-plano").json()


# --- Regras puras -------------------------------------------------------------------


def test_so_o_free_tem_teto():
    assert limites_do_plano.limites_do_plano(Plano.FREE) == limites_do_plano.LIMITES_DO_FREE
    assert limites_do_plano.limites_do_plano(Plano.FAMILIA) is None
    assert limites_do_plano.limites_do_plano(Plano.EMPRESARIAL) is None


def test_o_teto_e_atingido_no_maximo_e_nunca_sem_teto():
    uso_do_free = limites_do_plano.uso_do_plano(Plano.FREE, contas=5, lancamentos_do_mes=99)
    uso_do_familia = limites_do_plano.uso_do_plano(Plano.FAMILIA, contas=50, lancamentos_do_mes=5000)

    assert uso_do_free.contas.atingido and not uso_do_free.lancamentos_do_mes.atingido
    assert not uso_do_familia.contas.atingido and uso_do_familia.contas.maximo is None


def test_o_mes_comeca_a_meia_noite_do_dia_1_no_fuso_do_espaco():
    # 00:00 de 1º de outubro em São Paulo (UTC−3) são 03:00 em UTC.
    assert limites_do_plano.inicio_do_mes(date(2026, 10, 17), "America/Sao_Paulo") == datetime(
        2026, 10, 1, 3, tzinfo=UTC
    )


def test_a_mensagem_diz_o_teto_e_o_caminho():
    mensagem = limites_do_plano.mensagem_do_limite(Recurso.CONTAS, 5)

    assert "5 contas" in mensagem and "Família" in mensagem


# --- Pelo HTTP ------------------------------------------------------------------------


def test_o_uso_mostra_o_teto_do_free(ana):
    conta = ana.criar_conta("Corrente", 10_000)
    despesa(ana, conta)

    assert uso(ana) == {
        "plano": "FREE",
        "contas": {"usado": 1, "maximo": 5},
        "lancamentos_do_mes": {"usado": 1, "maximo": 100},
    }


def test_no_familia_nao_ha_teto(ana, assinar):
    assinar("uid-ana")

    corpo = uso(ana)

    assert corpo["plano"] == "FAMILIA"
    assert corpo["contas"]["maximo"] is None and corpo["lancamentos_do_mes"]["maximo"] is None


def test_no_teto_de_contas_a_conta_nova_e_recusada_com_o_limite(ana, tetos_pequenos):
    ana.criar_conta("Corrente")
    criar_cartao(ana)

    resposta = ana.post("/contas", {"nome": "Poupança", "tipo": "POUPANCA"})

    assert resposta.status_code == 403
    assert resposta.json()["limite"] == {"recurso": "contas", "usado": 2, "maximo": 2, "plano": "FREE"}
    assert "Plano Família" in resposta.json()["detail"]
    assert len(ana.get("/contas").json()) == 2


def test_no_teto_do_mes_lancar_e_comprar_sao_recusados(ana, tetos_pequenos):
    conta = ana.criar_conta("Corrente", 100_000)
    cartao = criar_cartao(ana)["id"]
    for _ in range(3):
        assert despesa(ana, conta).status_code == 201

    lancamento = despesa(ana, conta)
    compra = ana.post(
        f"/cartoes/{cartao}/compras",
        {"descricao": "Livro", "data": hoje_texto(), "valor_centavos": 5_000, "categoria_id": ana.categorias["Lazer"]},
    )

    assert lancamento.status_code == 403
    assert lancamento.json()["limite"]["recurso"] == "lancamentos_do_mes"
    assert compra.status_code == 403


def test_compra_parcelada_conta_uma_vez(ana):
    cartao = criar_cartao(ana)["id"]

    ana.post(
        f"/cartoes/{cartao}/compras",
        {
            "descricao": "Geladeira",
            "data": hoje_texto(),
            "valor_centavos": 120_000,
            "categoria_id": ana.categorias["Moradia"],
            "parcelas": 10,
        },
    )

    assert uso(ana)["lancamentos_do_mes"]["usado"] == 1


def test_estorno_importacao_e_pagamento_da_fatura_nao_contam_nem_sao_barrados(ana, tetos_pequenos):
    conta = ana.criar_conta("Corrente", 100_000)
    cartao = criar_cartao(ana)["id"]
    ids = [despesa(ana, conta).json()["id"] for _ in range(3)]

    estorno = ana.post(f"/lancamentos/{ids[0]}/estorno")
    pagamento = ana.post(f"/cartoes/{cartao}/pagamentos", {"conta_id": conta, "valor_centavos": 1_000, "data": hoje_texto()})
    importacao = ana.post(
        "/importacoes",
        {
            "conta_id": conta,
            "categoria_despesa_id": ana.categorias["Outras despesas"],
            "categoria_receita_id": ana.categorias["Outras receitas"],
            "csv": f"Data;Descrição;Valor\n{date.today():%d/%m/%Y};Feira;-30,00\n",
        },
    )

    assert (estorno.status_code, pagamento.status_code, importacao.status_code) == (201, 201, 200)
    assert uso(ana)["lancamentos_do_mes"]["usado"] == 3


def test_no_familia_o_teto_nao_vale(ana, assinar, tetos_pequenos):
    assinar("uid-ana")
    conta = ana.criar_conta("Corrente", 100_000)

    assert all(despesa(ana, conta).status_code == 201 for _ in range(5))
    assert ana.post("/contas", {"nome": "Poupança", "tipo": "POUPANCA"}).status_code == 201
    assert ana.post("/contas", {"nome": "Carteira", "tipo": "CARTEIRA"}).status_code == 201
