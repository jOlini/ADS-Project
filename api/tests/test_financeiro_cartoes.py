"""Cartão de crédito: ciclo da fatura, parcelas, painel do cartão, compra,
pagamento da fatura e as regras que separam cartão de conta.

As regras puras (cartoes.py e regras.py) usam datas fixas. Os testes pelo
HTTP partem de hoje no fuso do espaço, como a API faz.
"""

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

import pytest

from app.financeiro import cartoes, regras
from app.financeiro.modelos import (
    AtualizacaoConta,
    Conta,
    Lancamento,
    NovaCompra,
    NovaConta,
    NovaParte,
    NovoLancamento,
    Partida,
    SituacaoDaFatura,
    TipoConta,
    TipoLancamento,
)
from tests.test_financeiro_api import entrar

INSTANTE = datetime(2026, 9, 1, tzinfo=UTC)


def cartao(fechamento=3, vencimento=10, limite=500_000, id="cartao-1"):
    return Conta(
        espaco_id="espaco-1",
        nome="Cartão",
        tipo=TipoConta.CARTAO_CREDITO,
        saldo_inicial_centavos=0,
        ativa=True,
        criada_em=INSTANTE,
        limite_centavos=limite,
        dia_fechamento=fechamento,
        dia_vencimento=vencimento,
        id=id,
    )


def compra(valor, data, cartao_id="cartao-1"):
    return Lancamento(
        espaco_id="espaco-1",
        tipo=TipoLancamento.DESPESA,
        descricao="Compra",
        data=data,
        valor_centavos=valor,
        conta_id=cartao_id,
        partidas=[Partida(-valor, conta_id=cartao_id), Partida(valor, categoria_id="mercado")],
        criado_em=INSTANTE,
        criado_por="uid",
        categoria_id="mercado",
    )


def pagamento(valor, data, cartao_id="cartao-1"):
    return Lancamento(
        espaco_id="espaco-1",
        tipo=TipoLancamento.TRANSFERENCIA,
        descricao="Pagamento",
        data=data,
        valor_centavos=valor,
        conta_id="corrente",
        conta_destino_id=cartao_id,
        partidas=[Partida(-valor, conta_id="corrente"), Partida(valor, conta_id=cartao_id)],
        criado_em=INSTANTE,
        criado_por="uid",
    )


# --- Ciclo da fatura ---------------------------------------------------------------


def test_fechamento_antes_do_vencimento_fecha_no_mesmo_mes():
    periodo = cartoes.periodo_da_fatura(cartao(fechamento=3, vencimento=10), (2026, 10))

    assert periodo.inicio == date(2026, 9, 3)
    assert periodo.fechamento == date(2026, 10, 3)
    assert periodo.vencimento == date(2026, 10, 10)
    assert periodo.ultimo_dia == date(2026, 10, 2)


def test_fechamento_depois_do_vencimento_fecha_no_mes_anterior():
    periodo = cartoes.periodo_da_fatura(cartao(fechamento=28, vencimento=5), (2026, 10))

    assert periodo.inicio == date(2026, 8, 28)
    assert periodo.fechamento == date(2026, 9, 28)
    assert periodo.vencimento == date(2026, 10, 5)


def test_compra_no_dia_do_fechamento_vai_para_a_fatura_seguinte():
    visa = cartao(fechamento=3, vencimento=10)

    assert cartoes.referencia_da_data(visa, date(2026, 10, 2)) == (2026, 10)
    assert cartoes.referencia_da_data(visa, date(2026, 10, 3)) == (2026, 11)


def test_referencia_atravessa_o_ano():
    visa = cartao(fechamento=28, vencimento=5)

    assert cartoes.referencia_da_data(visa, date(2026, 12, 27)) == (2027, 1)
    assert cartoes.referencia_da_data(visa, date(2026, 12, 28)) == (2027, 2)


def test_dia_31_vira_o_ultimo_dia_do_mes_curto_sem_buraco_entre_faturas():
    visa = cartao(fechamento=31, vencimento=10)
    fevereiro = cartoes.periodo_da_fatura(visa, (2027, 3))
    marco = cartoes.periodo_da_fatura(visa, (2027, 4))

    assert fevereiro.fechamento == date(2027, 2, 28)
    assert marco.inicio == fevereiro.fechamento
    for dia in range(1, 29):
        data = date(2027, 2, dia)
        assert cartoes.periodo_da_fatura(visa, cartoes.referencia_da_data(visa, data)).contem(data)


def test_situacao_da_fatura():
    assert cartoes.situacao_da_fatura((2026, 10), (2026, 10)) == SituacaoDaFatura.ABERTA
    assert cartoes.situacao_da_fatura((2026, 9), (2026, 10)) == SituacaoDaFatura.FECHADA
    assert cartoes.situacao_da_fatura((2027, 1), (2026, 10)) == SituacaoDaFatura.FUTURA


# --- Parcelas ------------------------------------------------------------------------


def test_centavo_que_sobra_vai_para_a_primeira_parcela():
    assert cartoes.valores_das_parcelas(1000, 3) == [334, 333, 333]
    assert sum(cartoes.valores_das_parcelas(99_999, 7)) == 99_999
    assert cartoes.valores_das_parcelas(500, 1) == [500]


def test_cada_parcela_cai_na_fatura_seguinte():
    visa = cartao(fechamento=3, vencimento=10)
    datas = cartoes.datas_das_parcelas(visa, date(2026, 9, 20), 3)

    assert datas == [date(2026, 9, 20), date(2026, 10, 20), date(2026, 11, 20)]
    assert [cartoes.referencia_da_data(visa, data) for data in datas] == [(2026, 10), (2026, 11), (2026, 12)]


def test_parcela_puxada_para_dentro_da_fatura_quando_o_mes_e_curto():
    # Fecha no dia 30: em fevereiro fecha no 28. A compra de 29/01 é da fatura
    # de fevereiro; a parcela 2 no "29/02" seria 28/02, dia do fechamento, e
    # pularia a fatura de março.
    visa = cartao(fechamento=30, vencimento=10)
    datas = cartoes.datas_das_parcelas(visa, date(2027, 1, 29), 3)
    referencias = [cartoes.referencia_da_data(visa, data) for data in datas]

    assert referencias == [(2027, 2), (2027, 3), (2027, 4)]
    assert datas[1] == date(2027, 2, 27)


# --- Painel -------------------------------------------------------------------------


def test_painel_do_cartao_com_fatura_atual_parcelas_futuras_e_fatura_fechada():
    visa = cartao(fechamento=3, vencimento=10, limite=500_000)
    hoje = date(2026, 9, 20)  # fatura aberta: outubro (03/09 a 02/10)
    lancamentos = [
        compra(10_000, date(2026, 9, 5)),
        compra(5_000, date(2026, 10, 20)),  # parcela da fatura de novembro
        compra(5_000, date(2026, 11, 20)),  # parcela da fatura de dezembro
    ]
    # Fatura de setembro (fechada): 30.000 comprados antes e ainda não pagos.
    saldo = -(30_000 + 10_000 + 10_000)

    resumo = cartoes.resumir(visa, saldo, lancamentos, hoje)

    assert resumo.fatura_atual.referencia == (2026, 10)
    assert resumo.total_da_fatura_atual == 10_000
    assert resumo.parcelamentos_futuros == 10_000
    assert resumo.usado == 50_000
    assert resumo.disponivel == 450_000
    assert resumo.a_pagar == 30_000
    assert resumo.ultima_fechada.vencimento == date(2026, 9, 10)


def test_pagamento_libera_o_limite_e_zera_o_que_ha_a_pagar():
    visa = cartao()
    hoje = date(2026, 9, 20)
    lancamentos = [compra(10_000, date(2026, 9, 5)), pagamento(30_000, date(2026, 9, 8))]
    saldo = -(30_000 + 10_000) + 30_000

    resumo = cartoes.resumir(visa, saldo, lancamentos, hoje)

    assert resumo.a_pagar == 0
    assert resumo.usado == 10_000
    assert resumo.disponivel == 490_000
    # O pagamento quita, mas não entra no valor da fatura.
    assert resumo.total_da_fatura_atual == 10_000


def test_pagamento_adiantado_nao_deixa_a_pagar_negativo():
    resumo = cartoes.resumir(cartao(), -2_000, [compra(10_000, date(2026, 9, 5))], date(2026, 9, 20))

    assert resumo.a_pagar == 0


# --- Regras de cadastro, compra e pagamento -------------------------------------------


def test_cartao_pede_limite_fechamento_e_vencimento():
    erros = regras.conferir_conta(NovaConta(nome="Visa", tipo=TipoConta.CARTAO_CREDITO))

    assert set(erros) == {"limite_centavos", "dia_fechamento", "dia_vencimento"}


def test_conta_comum_nao_aceita_campos_de_cartao():
    erros = regras.conferir_conta(NovaConta(nome="Banco", tipo=TipoConta.CORRENTE, limite_centavos=100))

    assert erros == {"limite_centavos": "Só cartão de crédito tem limite, fechamento e vencimento."}


def test_cartao_nao_comeca_com_divida_nem_fecha_no_dia_do_vencimento():
    dados = NovaConta(
        nome="Visa",
        tipo=TipoConta.CARTAO_CREDITO,
        saldo_inicial_centavos=-100,
        limite_centavos=1000,
        dia_fechamento=10,
        dia_vencimento=10,
    )

    assert set(regras.conferir_conta(dados)) == {"saldo_inicial_centavos", "dia_vencimento"}


@pytest.mark.parametrize(("de", "para"), [(TipoConta.CORRENTE, TipoConta.CARTAO_CREDITO), (TipoConta.CARTAO_CREDITO, TipoConta.POUPANCA)])
def test_conta_nao_vira_cartao_nem_cartao_vira_conta(de, para):
    atual = cartao() if de == TipoConta.CARTAO_CREDITO else Conta("e", "Banco", de, 0, True, INSTANTE, id="c")
    campos_do_cartao = {"limite_centavos": 1000, "dia_fechamento": 3, "dia_vencimento": 10}
    dados = AtualizacaoConta(nome="X", tipo=para, ativa=True, **(campos_do_cartao if para == TipoConta.CARTAO_CREDITO else {}))

    assert set(regras.conferir_conta(dados, atual)) == {"tipo"}


def test_transferencia_nao_sai_do_cartao():
    dados = NovoLancamento(
        tipo=TipoLancamento.TRANSFERENCIA,
        descricao="Saque",
        data=date(2026, 9, 1),
        valor_centavos=100,
        conta_id="cartao-1",
        conta_destino_id="corrente",
    )
    corrente = Conta("espaco-1", "Banco", TipoConta.CORRENTE, 0, True, INSTANTE, id="corrente")

    erros = regras.conferir_lancamento(dados, cartao(), None, corrente)

    assert erros == {"conta_id": regras.CARTAO_NAO_TRANSFERE}


def test_racha_so_na_compra_a_vista():
    dados = NovaCompra(
        descricao="Jantar",
        data=date(2026, 9, 1),
        valor_centavos=30_000,
        categoria_id="lazer",
        parcelas=3,
        divisao=[NovaParte(pessoa="Ana", valor_centavos=10_000)],
    )

    assert "divisao" in regras.conferir_compra(dados, cartao(), None)


def test_pagamento_nao_sai_de_outro_cartao():
    assert set(regras.conferir_pagamento(cartao(id="outro"))) == {"conta_id"}


# --- Pelo HTTP ------------------------------------------------------------------------


def hoje():
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date()


def referencia_texto(referencia):
    return f"{referencia[0]:04d}-{referencia[1]:02d}"


@pytest.fixture
def ana(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-ana"))


def criar_cartao(cliente, limite=500_000, fechamento=3, vencimento=10):
    resposta = cliente.post(
        "/contas",
        {
            "nome": "Cartão Roxo",
            "tipo": "CARTAO_CREDITO",
            "limite_centavos": limite,
            "dia_fechamento": fechamento,
            "dia_vencimento": vencimento,
        },
    )
    assert resposta.status_code == 201, resposta.json()
    return resposta.json()


def test_cria_cartao_e_mostra_o_painel_zerado(ana):
    criado = criar_cartao(ana)

    assert criado["tipo"] == "CARTAO_CREDITO"
    assert criado["limite_centavos"] == 500_000
    painel = ana.get(f"/cartoes/{criado['id']}").json()
    assert painel["disponivel_centavos"] == 500_000
    assert painel["fatura_atual_centavos"] == 0
    assert painel["parcelamentos_futuros_centavos"] == 0
    assert [cartao["id"] for cartao in ana.get("/cartoes").json()] == [criado["id"]]


def test_cartao_sem_limite_responde_400_no_campo(ana):
    resposta = ana.post("/contas", {"nome": "Visa", "tipo": "CARTAO_CREDITO", "dia_fechamento": 3, "dia_vencimento": 10})

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"limite_centavos": "Campo obrigatório."}


def test_conta_comum_nao_abre_como_cartao(ana):
    conta_id = ana.criar_conta("Banco", 100_000)

    assert ana.get(f"/cartoes/{conta_id}").status_code == 404


def test_compra_parcelada_ocupa_o_limite_e_distribui_as_parcelas(ana):
    visa = criar_cartao(ana)
    corpo = {
        "descricao": "Geladeira",
        "data": hoje().isoformat(),
        "valor_centavos": 300_000,
        "categoria_id": ana.categorias["Contas da casa"],
        "parcelas": 3,
    }

    resposta = ana.post(f"/cartoes/{visa['id']}/compras", corpo)

    assert resposta.status_code == 201
    parcelas = resposta.json()
    assert [p["parcela"] for p in parcelas] == [1, 2, 3]
    assert {p["parcelas"] for p in parcelas} == {3}
    assert len({p["compra_id"] for p in parcelas}) == 1
    assert sum(p["valor_centavos"] for p in parcelas) == 300_000
    painel = ana.get(f"/cartoes/{visa['id']}").json()
    assert painel["usado_centavos"] == 300_000
    assert painel["disponivel_centavos"] == 200_000
    assert painel["fatura_atual_centavos"] == 100_000
    assert painel["parcelamentos_futuros_centavos"] == 200_000


def test_fatura_mostra_compras_pagamento_e_situacao(ana):
    visa = criar_cartao(ana)
    conta_id = ana.criar_conta("Banco", 1_000_000)
    ana.post(
        f"/cartoes/{visa['id']}/compras",
        {"descricao": "Mercado", "data": hoje().isoformat(), "valor_centavos": 12_000, "categoria_id": ana.categorias["Mercado"]},
    )
    pago = ana.post(
        f"/cartoes/{visa['id']}/pagamentos", {"conta_id": conta_id, "valor_centavos": 12_000, "data": hoje().isoformat()}
    )
    referencia = ana.get(f"/cartoes/{visa['id']}").json()["fatura_atual"]["referencia"]

    fatura = ana.get(f"/cartoes/{visa['id']}/faturas/{referencia}").json()

    assert pago.status_code == 201
    assert pago.json()["descricao"] == "Pagamento da fatura · Cartão Roxo"
    assert fatura["situacao"] == "ABERTA"
    assert fatura["total_centavos"] == 12_000
    assert fatura["pagamentos_centavos"] == 12_000
    assert len(fatura["lancamentos"]) == 2
    assert ana.saldos() == {"Cartão Roxo": 0, "Banco": 988_000}
    assert ana.get(f"/cartoes/{visa['id']}").json()["disponivel_centavos"] == 500_000


def test_pagamento_aparece_no_extrato_da_conta(ana):
    visa = criar_cartao(ana)
    conta_id = ana.criar_conta("Banco", 50_000)
    ana.post(f"/cartoes/{visa['id']}/pagamentos", {"conta_id": conta_id, "valor_centavos": 1_000, "data": hoje().isoformat()})

    extrato = ana.get("/lancamentos", params={"conta_id": conta_id}).json()

    assert [(l["tipo"], l["conta_destino_id"]) for l in extrato] == [("TRANSFERENCIA", visa["id"])]


def test_pagamento_saindo_de_cartao_responde_400(ana):
    visa = criar_cartao(ana)
    outro = criar_cartao(ana)

    resposta = ana.post(
        f"/cartoes/{visa['id']}/pagamentos", {"conta_id": outro["id"], "valor_centavos": 100, "data": hoje().isoformat()}
    )

    assert resposta.status_code == 400
    assert set(resposta.json()["campos"]) == {"conta_id"}


def test_excluir_uma_parcela_exclui_a_compra_inteira(ana):
    visa = criar_cartao(ana)
    parcelas = ana.post(
        f"/cartoes/{visa['id']}/compras",
        {"descricao": "TV", "data": hoje().isoformat(), "valor_centavos": 90_000, "categoria_id": ana.categorias["Lazer"], "parcelas": 3},
    ).json()

    resposta = ana.api.delete(f"{ana.base}/lancamentos/{parcelas[1]['id']}", headers=ana.cabecalho)

    assert resposta.status_code == 204
    assert ana.get("/lancamentos", params={"conta_id": visa["id"]}).json() == []
    assert ana.get(f"/cartoes/{visa['id']}").json()["disponivel_centavos"] == 500_000


def test_parcela_nao_se_estorna(ana):
    visa = criar_cartao(ana)
    parcelas = ana.post(
        f"/cartoes/{visa['id']}/compras",
        {"descricao": "TV", "data": hoje().isoformat(), "valor_centavos": 90_000, "categoria_id": ana.categorias["Lazer"], "parcelas": 2},
    ).json()

    assert ana.post(f"/lancamentos/{parcelas[0]['id']}/estorno").status_code == 409


def test_transferencia_saindo_do_cartao_responde_400(ana):
    visa = criar_cartao(ana)
    conta_id = ana.criar_conta("Banco")

    resposta = ana.lancar("TRANSFERENCIA", 1_000, visa["id"], destino=conta_id)

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"conta_id": regras.CARTAO_NAO_TRANSFERE}


def test_conta_nao_vira_cartao_pelo_put(ana):
    conta_id = ana.criar_conta("Banco")

    resposta = ana.put(
        f"/contas/{conta_id}",
        {"nome": "Banco", "tipo": "CARTAO_CREDITO", "ativa": True, "limite_centavos": 100, "dia_fechamento": 3, "dia_vencimento": 10},
    )

    assert resposta.status_code == 400
    assert set(resposta.json()["campos"]) == {"tipo"}


def test_edita_limite_e_dias_do_cartao(ana):
    visa = criar_cartao(ana)

    resposta = ana.put(
        f"/contas/{visa['id']}",
        {"nome": "Visa", "tipo": "CARTAO_CREDITO", "ativa": True, "limite_centavos": 800_000, "dia_fechamento": 25, "dia_vencimento": 2},
    )

    assert resposta.status_code == 200
    assert (resposta.json()["limite_centavos"], resposta.json()["dia_fechamento"]) == (800_000, 25)


def test_importa_fatura_em_csv_direto_no_cartao(ana):
    visa = criar_cartao(ana)
    data = hoje().isoformat()
    csv = f"date,title,amount\n{data},Padaria,15.90\n{data},Farmácia,42.00\n"

    resposta = ana.post(
        "/importacoes",
        {
            "conta_id": visa["id"],
            "categoria_despesa_id": ana.categorias["Outras despesas"],
            "categoria_receita_id": ana.categorias["Outras receitas"],
            "csv": csv,
        },
    )

    assert resposta.status_code == 200
    assert resposta.json()["importadas"] == 2
    assert ana.get(f"/cartoes/{visa['id']}").json()["fatura_atual_centavos"] == 5_790


def test_fatura_com_referencia_invalida_responde_400(ana):
    visa = criar_cartao(ana)

    assert ana.get(f"/cartoes/{visa['id']}/faturas/2026-13").status_code == 400


def test_fatura_seguinte_e_futura(ana):
    visa = criar_cartao(ana)
    atual = cartoes.referencia_da_data(
        Conta("e", "v", TipoConta.CARTAO_CREDITO, 0, True, INSTANTE, 1, 3, 10), hoje()
    )

    fatura = ana.get(f"/cartoes/{visa['id']}/faturas/{referencia_texto(cartoes.somar_meses(atual, 1))}").json()

    assert fatura["situacao"] == "FUTURA"
    assert fatura["lancamentos"] == []
