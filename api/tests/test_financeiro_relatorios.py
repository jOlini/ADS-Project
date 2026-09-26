"""Relatórios do livro-caixa (release 0.3): período em meses, receita ×
despesa por mês com a compra no cartão por competência, saldo no fim de cada
mês, gasto por categoria e o compromisso nas próximas faturas dos cartões.

As regras puras (relatorios.py) usam datas fixas. Os testes pelo HTTP usam
meses fixos do passado, menos os que dependem de hoje (período padrão,
estorno e faturas), que partem de hoje no fuso do espaço, como a API faz.
"""

from datetime import date

import pytest

from app.financeiro import relatorios
from app.financeiro.cartoes import somar_meses
from app.financeiro.modelos import TipoLancamento
from tests.test_financeiro_api import entrar
from tests.test_financeiro_cartoes import cartao, compra, criar_cartao, hoje, pagamento, referencia_texto

RECEITA = TipoLancamento.RECEITA
DESPESA = TipoLancamento.DESPESA


# --- Período ---------------------------------------------------------------------


def test_periodo_padrao_sao_os_12_meses_ate_o_mes_de_hoje_atravessando_o_ano():
    inicio, fim, erros = relatorios.periodo_pedido(None, None, date(2026, 2, 10))

    assert (inicio, fim, erros) == ((2025, 3), (2026, 2), {})


def test_periodo_so_com_o_mes_final_volta_12_meses_a_partir_dele():
    inicio, fim, _ = relatorios.periodo_pedido(None, "2025-06", date(2026, 9, 1))

    assert (inicio, fim) == ((2024, 7), (2025, 6))


@pytest.mark.parametrize(
    ("de", "ate", "erros"),
    [
        ("2026-13", None, {"de": relatorios.MES_INVALIDO}),
        ("2026-1", "26-01", {"de": relatorios.MES_INVALIDO, "ate": relatorios.MES_INVALIDO}),
        ("2026-05", "2026-04", {"ate": "O mês final vem antes do inicial."}),
        ("2016-04", "2026-04", {"de": "Peça no máximo 120 meses de uma vez."}),
    ],
)
def test_periodo_invalido_aponta_o_campo(de, ate, erros):
    assert relatorios.periodo_pedido(de, ate, date(2026, 9, 1))[2] == erros


def test_periodo_de_120_meses_passa():
    assert relatorios.periodo_pedido("2016-05", "2026-04", date(2026, 9, 1))[2] == {}


def test_meses_do_periodo_atravessam_o_ano_e_o_ultimo_dia_respeita_o_mes():
    assert relatorios.meses_do_periodo((2025, 11), (2026, 2)) == [(2025, 11), (2025, 12), (2026, 1), (2026, 2)]
    assert relatorios.ultimo_dia((2028, 2)) == date(2028, 2, 29)
    assert relatorios.primeiro_dia((2026, 9)) == date(2026, 9, 1)


# --- Receita × despesa e saldo -----------------------------------------------------


def test_estorno_reduz_o_lado_original_em_vez_de_virar_o_outro():
    # Partidas de categoria: receita −valor, despesa +valor; no estorno, o inverso.
    somas = {
        ("2026-01", RECEITA, "salario"): -500_000,
        ("2026-01", DESPESA, "mercado"): 20_000,
        ("2026-02", DESPESA, "mercado"): 15_000 - 5_000,  # compra e estorno de 5.000
        ("2026-02", RECEITA, "extra"): -10_000 + 10_000,  # receita estornada no mesmo mês
        ("2026-03", RECEITA, "salario"): 4_000,  # estorno, em março, de uma receita de antes
    }

    assert relatorios.receitas_e_despesas(somas) == {
        "2026-01": (500_000, 20_000),
        "2026-02": (0, 10_000),
        "2026-03": (-4_000, 0),
    }


def test_saldo_no_fim_do_mes_soma_o_historico_de_antes_do_periodo():
    meses = relatorios.meses_do_periodo((2026, 2), (2026, 4))
    somas = {"2025-12": 1_000, "2026-01": 2_000, "2026-02": -500, "2026-04": 300}

    assert relatorios.saldos_no_fim_de_cada_mes(meses, 10_000, somas) == [12_500, 12_500, 12_800]


def test_resultado_por_mes_tem_todos_os_meses_mesmo_os_vazios():
    meses = relatorios.meses_do_periodo((2026, 1), (2026, 3))
    somas = {("2026-02", DESPESA, "mercado"): 7_000}

    resultado = relatorios.resultado_por_mes(meses, somas, 1_000, {})

    assert [(r.mes, r.receitas, r.despesas, r.sobra, r.saldo_final) for r in resultado] == [
        ((2026, 1), 0, 0, 0, 1_000),
        ((2026, 2), 0, 7_000, -7_000, 1_000),
        ((2026, 3), 0, 0, 0, 1_000),
    ]


# --- Gasto por categoria -------------------------------------------------------------


@pytest.mark.parametrize(("valor", "total", "esperado"), [(1, 8, 13), (1, 3, 33), (2, 3, 67), (5, 5, 100), (0, 0, 0)])
def test_fatia_arredonda_meio_ponto_para_cima_como_a_tela(valor, total, esperado):
    assert relatorios.fatia(valor, total) == esperado


def test_gasto_por_categoria_soma_os_meses_ordena_e_tira_receita_e_categoria_zerada():
    somas = {
        ("2026-01", DESPESA, "mercado"): 20_000,
        ("2026-02", DESPESA, "mercado"): 10_000,
        ("2026-01", DESPESA, "lazer"): 45_000,
        ("2026-02", DESPESA, "saude"): 5_000,
        ("2026-01", DESPESA, "transporte"): 3_000,
        ("2026-02", DESPESA, "transporte"): -3_000,  # estornada no mês seguinte
        ("2026-01", RECEITA, "salario"): -500_000,
        ("2026-02", RECEITA, "extra"): 2_000,  # estorno de receita não é gasto
    }

    gastos = relatorios.gasto_por_categoria(somas)

    assert [(g.categoria_id, g.valor, g.fatia) for g in gastos] == [
        ("lazer", 45_000, 56),
        ("mercado", 30_000, 38),
        ("saude", 5_000, 6),
    ]


# --- Compromisso nos cartões ---------------------------------------------------------


def test_faturas_comprometidas_vao_da_atual_ate_a_ultima_parcela_sem_pular_mes():
    visa = cartao(fechamento=3, vencimento=10)
    lancamentos = [
        compra(10_000, date(2026, 9, 20)),  # fatura de outubro (a atual)
        compra(4_000, date(2026, 11, 20)),  # fatura de dezembro
        pagamento(10_000, date(2026, 9, 25)),  # quita, não muda o valor
        compra(99_000, date(2026, 9, 1)),  # fatura de setembro: já fechada, fora
    ]

    faturas = relatorios.faturas_comprometidas(visa, lancamentos, (2026, 10))

    assert [(f.periodo.referencia, f.total) for f in faturas] == [((2026, 10), 10_000), ((2026, 11), 0), ((2026, 12), 4_000)]
    assert faturas[0].periodo.vencimento == date(2026, 10, 10)


@pytest.mark.parametrize("lancamentos", [[], [compra(5_000, date(2026, 9, 1))]], ids=["sem compras", "so fatura fechada"])
def test_cartao_sem_parcela_pela_frente_tem_so_a_fatura_atual_zerada(lancamentos):
    faturas = relatorios.faturas_comprometidas(cartao(), lancamentos, (2026, 10))

    assert [(f.periodo.referencia, f.total) for f in faturas] == [((2026, 10), 0)]


# --- Pelo HTTP -------------------------------------------------------------------------


@pytest.fixture
def ana(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-ana"))


@pytest.fixture
def bruno(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-bruno"))


def comprar(cliente, cartao_id, valor, data, categoria, parcelas=1):
    resposta = cliente.post(
        f"/cartoes/{cartao_id}/compras",
        {"descricao": "Compra", "data": data, "valor_centavos": valor, "categoria_id": cliente.categorias[categoria], "parcelas": parcelas},
    )
    assert resposta.status_code == 201, resposta.json()
    return resposta.json()


@pytest.fixture
def trimestre(ana):
    """Salário e mercado em janeiro, cartão parcelado de janeiro a março,
    transferência para a poupança e pagamento da fatura em fevereiro."""
    banco = ana.criar_conta("Banco", 100_000)
    poupanca = ana.criar_conta("Poupança", 0, tipo="POUPANCA")
    visa = criar_cartao(ana, fechamento=3, vencimento=10)
    assert ana.lancar("RECEITA", 500_000, banco, categoria="Salário", data="2026-01-05").status_code == 201
    assert ana.lancar("DESPESA", 20_000, banco, categoria="Mercado", data="2026-01-20").status_code == 201
    assert ana.lancar("TRANSFERENCIA", 50_000, banco, destino=poupanca, data="2026-02-01").status_code == 201
    # 3 x 30.000: parcelas em 15/01, 15/02 e 15/03.
    comprar(ana, visa["id"], 90_000, "2026-01-15", "Lazer", parcelas=3)
    pago = ana.post(f"/cartoes/{visa['id']}/pagamentos", {"conta_id": banco, "valor_centavos": 30_000, "data": "2026-02-10"})
    assert pago.status_code == 201
    return {"banco": banco, "poupanca": poupanca, "visa": visa["id"]}


def numeros(corpo):
    return [
        (m["mes"], m["receitas_centavos"], m["despesas_centavos"], m["sobra_centavos"], m["saldo_final_centavos"])
        for m in corpo["meses"]
    ]


def test_mensal_conta_o_cartao_por_competencia_e_nao_conta_pagamento_nem_transferencia(ana, trimestre):
    resposta = ana.get("/relatorios/mensal", params={"de": "2025-12", "ate": "2026-03"})

    assert resposta.status_code == 200
    assert resposta.json()["de"] == "2025-12" and resposta.json()["ate"] == "2026-03"
    assert resposta.json()["conta_id"] is None
    # Saldo em contas: sem o cartão; o pagamento da fatura sai do banco, a
    # transferência para a poupança não muda o total.
    assert numeros(resposta.json()) == [
        ("2025-12", 0, 0, 0, 100_000),
        ("2026-01", 500_000, 50_000, 450_000, 580_000),
        ("2026-02", 0, 30_000, -30_000, 550_000),
        ("2026-03", 0, 30_000, -30_000, 550_000),
    ]


def test_mensal_filtrado_por_conta_mostra_o_saldo_dela(ana, trimestre):
    banco = ana.get("/relatorios/mensal", params={"de": "2026-01", "ate": "2026-03", "conta_id": trimestre["banco"]})
    visa = ana.get("/relatorios/mensal", params={"de": "2026-01", "ate": "2026-03", "conta_id": trimestre["visa"]})

    assert banco.json()["conta_id"] == trimestre["banco"]
    assert numeros(banco.json()) == [
        ("2026-01", 500_000, 20_000, 480_000, 580_000),
        ("2026-02", 0, 0, 0, 500_000),
        ("2026-03", 0, 0, 0, 500_000),
    ]
    # No cartão, o saldo é a dívida: parcela de janeiro, a de fevereiro paga, a de março.
    assert numeros(visa.json()) == [
        ("2026-01", 0, 30_000, -30_000, -30_000),
        ("2026-02", 0, 30_000, -30_000, -30_000),
        ("2026-03", 0, 30_000, -30_000, -60_000),
    ]


def test_mensal_sem_periodo_traz_os_12_meses_ate_o_mes_de_hoje(ana):
    ana.criar_conta("Banco", 7_000)

    corpo = ana.get("/relatorios/mensal").json()

    fim = (hoje().year, hoje().month)
    assert corpo["ate"] == referencia_texto(fim)
    assert corpo["de"] == referencia_texto(somar_meses(fim, -11))
    assert len(corpo["meses"]) == 12
    assert {m["saldo_final_centavos"] for m in corpo["meses"]} == {7_000}


def test_estorno_reduz_o_lado_original_no_mes_do_estorno(ana):
    banco = ana.criar_conta("Banco")
    despesa = ana.lancar("DESPESA", 10_000, banco, categoria="Mercado", data=hoje().isoformat()).json()
    receita = ana.lancar("RECEITA", 4_000, banco, categoria="Receita extra", data=hoje().isoformat()).json()
    assert ana.post(f"/lancamentos/{despesa['id']}/estorno").status_code == 201
    assert ana.post(f"/lancamentos/{receita['id']}/estorno").status_code == 201
    mes = referencia_texto((hoje().year, hoje().month))

    mensal = ana.get("/relatorios/mensal", params={"de": mes, "ate": mes}).json()
    categorias = ana.get("/relatorios/categorias", params={"de": mes, "ate": mes}).json()

    assert numeros(mensal) == [(mes, 0, 0, 0, 0)]
    assert categorias["categorias"] == [] and categorias["total_centavos"] == 0


def test_gasto_por_categoria_do_periodo_com_nome_cor_e_fatia(ana, trimestre):
    ana.lancar("DESPESA", 5_000, trimestre["banco"], categoria="Saúde", data="2026-03-02")

    corpo = ana.get("/relatorios/categorias", params={"de": "2026-01", "ate": "2026-03"}).json()

    assert corpo["total_centavos"] == 20_000 + 90_000 + 5_000
    assert [(c["nome"], c["cor"], c["valor_centavos"], c["fatia"]) for c in corpo["categorias"]] == [
        ("Lazer", "lazer", 90_000, 78),
        ("Mercado", "mercado", 20_000, 17),
        ("Saúde", "saude", 5_000, 4),
    ]
    assert corpo["categorias"][0]["categoria_id"] == ana.categorias["Lazer"]


def test_gasto_por_categoria_filtrado_pelo_cartao_e_por_um_mes(ana, trimestre):
    corpo = ana.get(
        "/relatorios/categorias", params={"de": "2026-02", "ate": "2026-02", "conta_id": trimestre["visa"]}
    ).json()

    assert [(c["nome"], c["valor_centavos"], c["fatia"]) for c in corpo["categorias"]] == [("Lazer", 30_000, 100)]


def test_compromisso_nos_cartoes_mostra_a_fatura_atual_e_as_parcelas_seguintes(ana):
    visa = criar_cartao(ana, fechamento=3, vencimento=10)
    vazio = criar_cartao(ana)
    banco = ana.criar_conta("Banco", 100_000)
    comprar(ana, visa["id"], 90_000, hoje().isoformat(), "Contas da casa", parcelas=3)
    ana.post(f"/cartoes/{visa['id']}/pagamentos", {"conta_id": banco, "valor_centavos": 1_000, "data": hoje().isoformat()})

    corpo = ana.get("/relatorios/cartoes").json()

    por_id = {cartao["cartao_id"]: cartao for cartao in corpo}
    atual = ana.get(f"/cartoes/{visa['id']}").json()["fatura_atual"]["referencia"]
    faturas = por_id[visa["id"]]["faturas"]
    assert [(f["situacao"], f["total_centavos"]) for f in faturas] == [
        ("ABERTA", 30_000),
        ("FUTURA", 30_000),
        ("FUTURA", 30_000),
    ]
    assert faturas[0]["referencia"] == atual
    assert por_id[visa["id"]]["usado_centavos"] == 89_000
    assert por_id[visa["id"]]["a_pagar_centavos"] == 0
    assert [(f["situacao"], f["total_centavos"]) for f in por_id[vazio["id"]]["faturas"]] == [("ABERTA", 0)]


def test_espaco_sem_cartao_tem_compromisso_vazio(ana):
    ana.criar_conta("Banco")

    assert ana.get("/relatorios/cartoes").json() == []


@pytest.mark.parametrize(
    ("params", "campos"),
    [
        ({"de": "2026-13"}, {"de": relatorios.MES_INVALIDO}),
        ({"de": "2026-05", "ate": "2026-04"}, {"ate": "O mês final vem antes do inicial."}),
        ({"de": "2000-01", "ate": "2026-01"}, {"de": "Peça no máximo 120 meses de uma vez."}),
        ({"ate": "2026-001"}, {"ate": "Use no máximo 7 caracteres."}),
    ],
)
def test_periodo_invalido_responde_400_no_campo(ana, params, campos):
    for caminho in ("/relatorios/mensal", "/relatorios/categorias"):
        resposta = ana.get(caminho, params=params)

        assert resposta.status_code == 400
        assert resposta.json()["campos"] == campos


def test_relatorio_de_outro_espaco_ou_com_conta_alheia_responde_404(ana, bruno):
    conta_do_bruno = bruno.criar_conta("Banco do Bruno", 50_000)

    tentativas = [bruno.api.get(f"{ana.base}/relatorios/{nome}", headers=bruno.cabecalho) for nome in ("mensal", "categorias", "cartoes")]
    com_conta_alheia = ana.get("/relatorios/mensal", params={"conta_id": conta_do_bruno})

    assert [resposta.status_code for resposta in tentativas] == [404] * 3
    assert {resposta.json()["detail"] for resposta in tentativas} == {"Espaço não encontrado."}
    assert com_conta_alheia.status_code == 404
    assert com_conta_alheia.json()["detail"] == "Conta não encontrada."


def test_relatorios_exigem_token_e_nao_ficam_em_cache(api, ana):
    sem_token = api.get(f"{ana.base}/relatorios/mensal")
    com_token = ana.get("/relatorios/mensal")

    assert sem_token.status_code == 401
    assert com_token.headers["Cache-Control"] == "no-store"
