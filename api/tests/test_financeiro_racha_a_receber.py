"""Racha a receber: a parte de cada pessoa numa despesa dividida é dinheiro de
quem lançou nas mãos de outra pessoa. Recebida, vira um reembolso na conta (um
estorno parcial da despesa, sem virar receita); não paga, volta a ser despesa
de quem lançou.

Tudo pelo HTTP, com os repositórios em memória (conftest.py).
"""

import pytest

from app.financeiro import regras, servicos
from tests.test_financeiro_api import entrar
from tests.test_financeiro_cartoes import criar_cartao


@pytest.fixture
def ana(api, cabecalho_do_cliente, assinar):
    # A divisão com o nome e a parte de cada pessoa é do Plano Família.
    cliente = entrar(api, cabecalho_do_cliente("uid-ana"))
    assinar("uid-ana")
    cliente.corrente = cliente.criar_conta("Corrente", 100_000)
    return cliente


def jantar(cliente, divisao, valor=30_000, data="2026-09-10", **extras):
    corpo = {
        "tipo": "DESPESA",
        "descricao": "Jantar",
        "data": data,
        "valor_centavos": valor,
        "conta_id": cliente.corrente,
        "categoria_id": cliente.categorias["Lazer"],
        "divisao": divisao,
        **extras,
    }
    resposta = cliente.post("/lancamentos", corpo)
    assert resposta.status_code == 201, resposta.json()
    return resposta.json()


def parte(pessoa, valor, vencimento=None):
    corpo = {"pessoa": pessoa, "valor_centavos": valor}
    if vencimento:
        corpo["vencimento"] = vencimento
    return corpo


def mudar(cliente, lancamento_id, indice, **corpo):
    return cliente.api.patch(
        f"{cliente.base}/lancamentos/{lancamento_id}/divisao/{indice}", headers=cliente.cabecalho, json=corpo
    )


def lazer_do_mes(cliente, mes="2026-09"):
    """O que a categoria Lazer somou no mês, pelo relatório da API."""
    categorias = cliente.get(f"/relatorios/categorias?de={mes}&ate={mes}").json()
    return next((c["valor_centavos"] for c in categorias["categorias"] if c["categoria_id"] == cliente.categorias["Lazer"]), 0)


# --- A parte nasce a receber -------------------------------------------------------


def test_cada_parte_nasce_pendente_com_o_prazo_pedido(ana):
    despesa = jantar(ana, [parte("Bruno", 10_000, "2026-10-10"), parte("Carla", 10_000)])

    bruno, carla = despesa["divisao"]
    assert (bruno["situacao"], bruno["vencimento"], bruno["recebido_em"]) == ("PENDENTE", "2026-10-10", None)
    assert (carla["situacao"], carla["vencimento"]) == ("PENDENTE", None)


def test_prazo_antes_da_data_da_despesa_e_recusado(ana):
    resposta = ana.post(
        "/lancamentos",
        {
            "tipo": "DESPESA",
            "descricao": "Jantar",
            "data": "2026-09-10",
            "valor_centavos": 30_000,
            "conta_id": ana.corrente,
            "categoria_id": ana.categorias["Lazer"],
            "divisao": [parte("Bruno", 10_000, "2026-09-09")],
        },
    )

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"divisao.0.vencimento": regras.PRAZO_ANTES_DA_DATA}


def test_o_racha_lista_as_despesas_divididas_sem_os_estornos(ana):
    dividida = jantar(ana, [parte("Bruno", 10_000)])
    ana.lancar("DESPESA", 5_000, ana.corrente, categoria="Mercado")
    estornada = jantar(ana, [parte("Carla", 1_000)], data="2026-09-12")
    ana.post(f"/lancamentos/{estornada['id']}/estorno")

    rachas = ana.get("/rachas").json()

    assert [r["id"] for r in rachas] == [estornada["id"], dividida["id"]]
    assert rachas[0]["estornado_por"] is not None


# --- Recebido: o reembolso entra na conta ------------------------------------------


def test_recebido_lanca_o_reembolso_na_conta_sem_virar_receita(ana):
    poupanca = ana.criar_conta("Poupança", 0, tipo="POUPANCA")
    despesa = jantar(ana, [parte("Bruno", 12_000)])

    resposta = mudar(ana, despesa["id"], 0, situacao="RECEBIDO", conta_id=poupanca, data="2026-09-15")

    assert resposta.status_code == 200
    recebida = resposta.json()["divisao"][0]
    assert (recebida["situacao"], recebida["recebido_em"]) == ("RECEBIDO", "2026-09-15")
    reembolso = ana.get(f"/lancamentos/{recebida['reembolso_id']}").json()
    assert reembolso["reembolso_de"] == despesa["id"]
    assert (reembolso["tipo"], reembolso["valor_centavos"], reembolso["data"]) == ("DESPESA", 12_000, "2026-09-15")
    assert reembolso["descricao"] == "Reembolso de Bruno: Jantar"
    # O dinheiro voltou para a poupança, e a categoria ficou só com a parte da Ana.
    assert ana.saldos() == {"Corrente": 70_000, "Poupança": 12_000}
    assert lazer_do_mes(ana) == 18_000


def test_recebido_pede_uma_conta_e_nunca_um_cartao(ana):
    despesa = jantar(ana, [parte("Bruno", 12_000)])
    cartao = criar_cartao(ana)["id"]

    sem_conta = mudar(ana, despesa["id"], 0, situacao="RECEBIDO")
    no_cartao = mudar(ana, despesa["id"], 0, situacao="RECEBIDO", conta_id=cartao)
    antes = mudar(ana, despesa["id"], 0, situacao="RECEBIDO", conta_id=ana.corrente, data="2026-09-01")

    assert sem_conta.json()["campos"] == {"conta_id": regras.CONTA_DO_RECEBIMENTO}
    assert no_cartao.json()["campos"] == {"conta_id": regras.RECEBE_EM_CONTA}
    assert antes.json()["campos"] == {"data": regras.RECEBIDO_ANTES}


def test_a_mesma_parte_nao_e_recebida_duas_vezes(ana):
    despesa = jantar(ana, [parte("Bruno", 12_000)])
    mudar(ana, despesa["id"], 0, situacao="RECEBIDO", conta_id=ana.corrente)

    de_novo = mudar(ana, despesa["id"], 0, situacao="RECEBIDO", conta_id=ana.corrente)

    assert de_novo.status_code == 400
    assert de_novo.json()["campos"] == {"situacao": regras.JA_RECEBIDA}
    assert ana.saldos() == {"Corrente": 82_000}


def test_voltar_a_cobrar_apaga_o_reembolso(ana):
    despesa = jantar(ana, [parte("Bruno", 12_000)])
    reembolso = mudar(ana, despesa["id"], 0, situacao="RECEBIDO", conta_id=ana.corrente).json()["divisao"][0][
        "reembolso_id"
    ]

    resposta = mudar(ana, despesa["id"], 0, situacao="PENDENTE", vencimento="2026-10-30")

    pendente = resposta.json()["divisao"][0]
    assert (pendente["situacao"], pendente["vencimento"], pendente["reembolso_id"]) == ("PENDENTE", "2026-10-30", None)
    assert ana.get(f"/lancamentos/{reembolso}").status_code == 404
    assert ana.saldos() == {"Corrente": 70_000}


def test_excluir_o_reembolso_volta_a_cobrar_a_parte(ana):
    despesa = jantar(ana, [parte("Bruno", 12_000)])
    reembolso = mudar(ana, despesa["id"], 0, situacao="RECEBIDO", conta_id=ana.corrente).json()["divisao"][0][
        "reembolso_id"
    ]

    assert ana.api.delete(f"{ana.base}/lancamentos/{reembolso}", headers=ana.cabecalho).status_code == 204

    assert ana.get(f"/lancamentos/{despesa['id']}").json()["divisao"][0]["situacao"] == "PENDENTE"
    assert ana.saldos() == {"Corrente": 70_000}


def test_excluir_a_despesa_leva_os_reembolsos(ana):
    despesa = jantar(ana, [parte("Bruno", 12_000)])
    mudar(ana, despesa["id"], 0, situacao="RECEBIDO", conta_id=ana.corrente)

    resposta = ana.post("/lancamentos/exclusao-em-lote", {"ids": [despesa["id"]]})

    assert resposta.json()["excluidos"] == 2
    assert ana.saldos() == {"Corrente": 100_000}


def test_reembolso_so_muda_a_descricao_e_nao_se_estorna(ana):
    despesa = jantar(ana, [parte("Bruno", 12_000)])
    reembolso = mudar(ana, despesa["id"], 0, situacao="RECEBIDO", conta_id=ana.corrente).json()["divisao"][0][
        "reembolso_id"
    ]
    caminho = f"{ana.base}/lancamentos/{reembolso}"

    valor = ana.api.patch(caminho, headers=ana.cabecalho, json={"valor_centavos": 1})
    descricao = ana.api.patch(caminho, headers=ana.cabecalho, json={"descricao": "Pix do Bruno"})
    estorno = ana.post(f"/lancamentos/{reembolso}/estorno")

    assert valor.json()["campos"] == {"valor_centavos": regras.REEMBOLSO_SO_RENOMEIA}
    assert descricao.json()["descricao"] == "Pix do Bruno"
    assert (estorno.status_code, estorno.json()["detail"]) == (409, servicos.REEMBOLSO_NAO_ESTORNA)


def test_despesa_com_parte_recebida_so_se_estorna_depois_de_voltar_a_cobrar(ana):
    despesa = jantar(ana, [parte("Bruno", 12_000)])
    mudar(ana, despesa["id"], 0, situacao="RECEBIDO", conta_id=ana.corrente)

    barrado = ana.post(f"/lancamentos/{despesa['id']}/estorno")
    mudar(ana, despesa["id"], 0, situacao="PENDENTE")
    liberado = ana.post(f"/lancamentos/{despesa['id']}/estorno")

    assert (barrado.status_code, barrado.json()["detail"]) == (409, servicos.DESFAZER_O_RACHA_ANTES)
    assert liberado.status_code == 201


# --- Não pago: a parte volta para quem lançou ----------------------------------------


def test_nao_pago_da_baixa_sem_mexer_no_saldo(ana):
    despesa = jantar(ana, [parte("Bruno", 12_000, "2026-09-20")])

    resposta = mudar(ana, despesa["id"], 0, situacao="NAO_PAGO")

    baixada = resposta.json()["divisao"][0]
    assert (baixada["situacao"], baixada["vencimento"], baixada["recebido_em"]) == ("NAO_PAGO", "2026-09-20", None)
    assert ana.saldos() == {"Corrente": 70_000}
    assert lazer_do_mes(ana) == 30_000


def test_nao_pago_depois_de_recebido_apaga_o_reembolso(ana):
    despesa = jantar(ana, [parte("Bruno", 12_000)])
    mudar(ana, despesa["id"], 0, situacao="RECEBIDO", conta_id=ana.corrente)

    mudar(ana, despesa["id"], 0, situacao="NAO_PAGO")

    assert ana.saldos() == {"Corrente": 70_000}


def test_conta_e_data_so_valem_no_recebimento(ana):
    despesa = jantar(ana, [parte("Bruno", 12_000)])

    resposta = mudar(ana, despesa["id"], 0, situacao="NAO_PAGO", conta_id=ana.corrente)

    assert resposta.json()["campos"] == {"conta_id": regras.SO_NO_RECEBIMENTO}


# --- O que não é racha a receber -----------------------------------------------------


def test_parte_que_nao_existe_e_404(ana):
    despesa = jantar(ana, [parte("Bruno", 12_000)])

    assert mudar(ana, despesa["id"], 1, situacao="NAO_PAGO").status_code == 404


def test_receita_dividida_e_estornada_nao_tem_parte_a_receber(ana):
    receita = ana.post(
        "/lancamentos",
        {
            "tipo": "RECEITA",
            "descricao": "Venda do sofá",
            "data": "2026-09-10",
            "valor_centavos": 30_000,
            "conta_id": ana.corrente,
            "categoria_id": ana.categorias["Receita extra"],
            "divisao": [parte("Bruno", 10_000)],
        },
    ).json()
    despesa = jantar(ana, [parte("Bruno", 12_000)])
    ana.post(f"/lancamentos/{despesa['id']}/estorno")

    da_receita = mudar(ana, receita["id"], 0, situacao="NAO_PAGO")
    da_estornada = mudar(ana, despesa["id"], 0, situacao="NAO_PAGO")

    assert (da_receita.status_code, da_receita.json()["detail"]) == (409, regras.SO_DESPESA_A_RECEBER)
    assert (da_estornada.status_code, da_estornada.json()["detail"]) == (409, regras.RACHA_DESFEITO)


def test_mudar_a_parte_e_do_plano_familia(ana, cabecalho_de, api):
    despesa = jantar(ana, [parte("Bruno", 12_000)])
    api.put("/clientes/uid-ana/plano", json={"plano": "FREE"}, headers=cabecalho_de("id-admin"))

    resposta = mudar(ana, despesa["id"], 0, situacao="NAO_PAGO")

    assert (resposta.status_code, resposta.json()["detail"]) == (403, servicos.DIVISAO_SO_NO_FAMILIA)


def test_compra_a_vista_no_cartao_tambem_tem_racha_a_receber(ana):
    cartao = criar_cartao(ana)["id"]
    compra = ana.post(
        f"/cartoes/{cartao}/compras",
        {
            "descricao": "Show",
            "data": "2026-09-10",
            "valor_centavos": 40_000,
            "categoria_id": ana.categorias["Lazer"],
            "divisao": [parte("Bruno", 20_000, "2026-10-05")],
        },
    ).json()[0]

    resposta = mudar(ana, compra["id"], 0, situacao="RECEBIDO", conta_id=ana.corrente, data="2026-09-12")

    assert resposta.status_code == 200
    # O dinheiro do Bruno entra na conta, não no cartão.
    assert ana.saldos()["Corrente"] == 120_000
