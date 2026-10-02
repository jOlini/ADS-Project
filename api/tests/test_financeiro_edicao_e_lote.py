"""Edição de lançamento (PATCH), exclusão em lote, exclusão de conta, cartão,
categoria e fatura, e os campos novos: meio de pagamento e cor do cartão.

Tudo pelo HTTP, com os repositórios em memória (conftest.py).
"""

import pytest

from app.financeiro import regras
from tests.test_financeiro_api import entrar
from tests.test_financeiro_cartoes import criar_cartao, hoje


@pytest.fixture
def ana(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-ana"))


def editar(cliente, id, corpo):
    return cliente.api.patch(f"{cliente.base}/lancamentos/{id}", headers=cliente.cabecalho, json=corpo)


def excluir(cliente, caminho):
    return cliente.api.delete(f"{cliente.base}{caminho}", headers=cliente.cabecalho)


def comprar(cliente, cartao_id, valor, parcelas=1, descricao="TV", data=None):
    resposta = cliente.post(
        f"/cartoes/{cartao_id}/compras",
        {
            "descricao": descricao,
            "data": (data or hoje()).isoformat(),
            "valor_centavos": valor,
            "categoria_id": cliente.categorias["Lazer"],
            "parcelas": parcelas,
        },
    )
    assert resposta.status_code == 201, resposta.json()
    return resposta.json()


# --- Edição ------------------------------------------------------------------------


def test_renomeia_sem_mexer_no_saldo(ana):
    corrente = ana.criar_conta("Conta corrente", 10_000)
    id = ana.lancar("DESPESA", 1_000, corrente, categoria="Mercado", descricao="Mercdo").json()["id"]

    resposta = editar(ana, id, {"descricao": "  Mercado do bairro "})

    assert resposta.status_code == 200
    assert resposta.json()["descricao"] == "Mercado do bairro"
    assert ana.saldos() == {"Conta corrente": 9_000}


def test_novo_valor_e_nova_categoria_remontam_as_partidas(ana):
    corrente = ana.criar_conta("Conta corrente", 10_000)
    id = ana.lancar("DESPESA", 1_000, corrente, categoria="Mercado").json()["id"]

    resposta = editar(ana, id, {"valor_centavos": 2_500, "categoria_id": ana.categorias["Lazer"], "data": "2026-09-01"})

    corpo = resposta.json()
    assert resposta.status_code == 200
    assert (corpo["valor_centavos"], corpo["data"], corpo["categoria_id"]) == (2_500, "2026-09-01", ana.categorias["Lazer"])
    assert {(p["conta_id"], p["categoria_id"], p["valor_centavos"]) for p in corpo["partidas"]} == {
        (corrente, None, -2_500),
        (None, ana.categorias["Lazer"], 2_500),
    }
    assert ana.saldos() == {"Conta corrente": 7_500}


def test_transferencia_editada_muda_as_duas_contas(ana):
    corrente = ana.criar_conta("Conta corrente", 10_000)
    poupanca = ana.criar_conta("Poupança")
    id = ana.lancar("TRANSFERENCIA", 1_000, corrente, destino=poupanca).json()["id"]

    editar(ana, id, {"valor_centavos": 4_000})

    assert ana.saldos() == {"Conta corrente": 6_000, "Poupança": 4_000}


def test_edicao_vazia_e_categoria_do_tipo_errado_respondem_400(ana):
    corrente = ana.criar_conta("Conta corrente")
    id = ana.lancar("DESPESA", 1_000, corrente, categoria="Mercado").json()["id"]

    vazia = editar(ana, id, {})
    errada = editar(ana, id, {"categoria_id": ana.categorias["Salário"]})

    assert vazia.status_code == 400
    assert vazia.json()["campos"] == {"lancamento": regras.EDICAO_VAZIA}
    assert errada.status_code == 400
    assert errada.json()["campos"] == {"categoria_id": "Use uma categoria de despesa."}


def test_estornado_so_muda_descricao_e_meio(ana):
    corrente = ana.criar_conta("Conta corrente", 10_000)
    id = ana.lancar("DESPESA", 1_000, corrente, categoria="Mercado").json()["id"]
    ana.post(f"/lancamentos/{id}/estorno")

    valor = editar(ana, id, {"valor_centavos": 5})
    nome = editar(ana, id, {"descricao": "Compra devolvida", "meio": "PIX"})

    assert valor.status_code == 400
    assert valor.json()["campos"] == {"valor_centavos": regras.ESTORNADO_SO_RENOMEIA}
    assert nome.status_code == 200
    assert (nome.json()["descricao"], nome.json()["meio"]) == ("Compra devolvida", "PIX")
    assert ana.saldos() == {"Conta corrente": 10_000}


def test_parcela_renomeia_a_compra_inteira_mas_nao_muda_valor(ana):
    visa = criar_cartao(ana)
    parcelas = comprar(ana, visa["id"], 90_000, parcelas=3)

    valor = editar(ana, parcelas[1]["id"], {"valor_centavos": 1})
    nome = editar(ana, parcelas[1]["id"], {"descricao": "Televisão da sala", "categoria_id": ana.categorias["Contas da casa"]})

    assert valor.status_code == 400
    assert valor.json()["campos"] == {"valor_centavos": regras.PARCELA_SO_RENOMEIA}
    assert nome.status_code == 200
    no_cartao = ana.get("/lancamentos", params={"conta_id": visa["id"]}).json()
    assert {(l["descricao"], l["categoria_id"]) for l in no_cartao} == {("Televisão da sala", ana.categorias["Contas da casa"])}
    assert sum(l["valor_centavos"] for l in no_cartao) == 90_000


def test_meio_na_conta_sim_na_compra_do_cartao_nao(ana):
    corrente = ana.criar_conta("Conta corrente")
    visa = criar_cartao(ana)
    corpo = {"tipo": "DESPESA", "descricao": "Feira", "data": "2026-09-19", "valor_centavos": 3_000}
    lancado = ana.post("/lancamentos", {**corpo, "conta_id": corrente, "categoria_id": ana.categorias["Mercado"], "meio": "DINHEIRO"})
    compra = comprar(ana, visa["id"], 5_000)[0]

    limpo = editar(ana, lancado.json()["id"], {"meio": None})
    no_cartao = editar(ana, compra["id"], {"meio": "PIX"})

    assert lancado.json()["meio"] == "DINHEIRO"
    assert limpo.json()["meio"] is None
    assert no_cartao.status_code == 400
    assert set(no_cartao.json()["campos"]) == {"meio"}


def test_novo_valor_nao_fica_abaixo_do_racha(ana, assinar):
    assinar("uid-ana")
    corrente = ana.criar_conta("Conta corrente")
    corpo = {
        "tipo": "DESPESA",
        "descricao": "Churrasco",
        "data": "2026-09-19",
        "valor_centavos": 30_000,
        "conta_id": corrente,
        "categoria_id": ana.categorias["Lazer"],
        "divisao": [{"pessoa": "Bruno", "valor_centavos": 10_000}],
    }
    id = ana.post("/lancamentos", corpo).json()["id"]

    resposta = editar(ana, id, {"valor_centavos": 9_000})

    assert resposta.status_code == 400
    assert set(resposta.json()["campos"]) == {"valor_centavos"}


def test_despesa_no_cartao_pelos_lancamentos_responde_400(ana):
    visa = criar_cartao(ana)

    resposta = ana.lancar("DESPESA", 1_000, visa["id"], categoria="Mercado")

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"conta_id": regras.COMPRA_PELO_CARTAO}


def test_edita_lancamento_de_outra_pessoa_responde_404(ana, api, cabecalho_do_cliente):
    corrente = ana.criar_conta("Conta corrente")
    id = ana.lancar("DESPESA", 1_000, corrente, categoria="Mercado").json()["id"]
    bruno = entrar(api, cabecalho_do_cliente("uid-bruno"))

    assert editar(bruno, id, {"descricao": "Meu"}).status_code == 404


# --- Exclusão em lote --------------------------------------------------------------


def test_exclusao_em_lote_leva_estorno_e_compra_inteira(ana):
    corrente = ana.criar_conta("Conta corrente", 10_000)
    visa = criar_cartao(ana)
    estornado = ana.lancar("DESPESA", 1_000, corrente, categoria="Mercado").json()["id"]
    ana.post(f"/lancamentos/{estornado}/estorno")
    fica = ana.lancar("DESPESA", 500, corrente, categoria="Mercado").json()["id"]
    parcelas = comprar(ana, visa["id"], 30_000, parcelas=3)

    resposta = ana.post(
        "/lancamentos/exclusao-em-lote",
        {"ids": [estornado, parcelas[0]["id"], parcelas[2]["id"], "000000000000000000000000"]},
    )

    assert resposta.status_code == 200
    # Original + estorno + as 3 parcelas (a 3ª já tinha saído com a compra).
    assert resposta.json() == {"excluidos": 5}
    assert [l["id"] for l in ana.get("/lancamentos").json()] == [fica]
    assert ana.saldos() == {"Conta corrente": 9_500, "Cartão Roxo": 0}


def test_exclusao_em_lote_sem_ids_responde_400(ana):
    assert ana.post("/lancamentos/exclusao-em-lote", {"ids": []}).status_code == 400


# --- Exclusão de conta, cartão e categoria -----------------------------------------


def test_excluir_conta_leva_os_lancamentos_e_as_transferencias(ana):
    corrente = ana.criar_conta("Conta corrente", 10_000)
    poupanca = ana.criar_conta("Poupança", 1_000)
    ana.lancar("DESPESA", 1_000, corrente, categoria="Mercado")
    ana.lancar("TRANSFERENCIA", 2_000, corrente, destino=poupanca)
    ana.lancar("RECEITA", 300, poupanca, categoria="Receita extra")

    resposta = excluir(ana, f"/contas/{corrente}")

    assert resposta.status_code == 200
    assert resposta.json() == {"excluidos": 2}
    # A transferência saiu junto: a poupança perde os 2.000 que tinham vindo dela.
    assert ana.saldos() == {"Poupança": 1_300}
    assert ana.get(f"/contas/{corrente}").status_code == 404


def test_excluir_cartao_leva_compras_e_pagamentos(ana):
    corrente = ana.criar_conta("Conta corrente", 50_000)
    visa = criar_cartao(ana)
    comprar(ana, visa["id"], 30_000, parcelas=3)
    ana.post(f"/cartoes/{visa['id']}/pagamentos", {"conta_id": corrente, "valor_centavos": 10_000, "data": hoje().isoformat()})

    resposta = excluir(ana, f"/contas/{visa['id']}")

    assert resposta.json() == {"excluidos": 4}
    assert ana.get("/cartoes").json() == []
    assert ana.saldos() == {"Conta corrente": 50_000}


def test_excluir_conta_inexistente_responde_404(ana):
    assert excluir(ana, "/contas/000000000000000000000000").status_code == 404


def test_categoria_sem_uso_sai_e_em_uso_responde_409(ana):
    corrente = ana.criar_conta("Conta corrente")
    ana.lancar("DESPESA", 1_000, corrente, categoria="Mercado")

    livre = excluir(ana, f"/categorias/{ana.categorias['Saúde']}")
    usada = excluir(ana, f"/categorias/{ana.categorias['Mercado']}")

    assert livre.status_code == 204
    assert usada.status_code == 409
    assert usada.json()["detail"].startswith('"Mercado" está em 1 lançamento.')
    nomes = {categoria["nome"] for categoria in ana.get("/categorias").json()}
    assert "Saúde" not in nomes and "Mercado" in nomes


# --- Faturas -------------------------------------------------------------------------


def test_lista_faturas_e_exclui_uma_sem_levar_o_pagamento(ana):
    corrente = ana.criar_conta("Conta corrente", 100_000)
    visa = criar_cartao(ana)
    comprar(ana, visa["id"], 5_000, descricao="Padaria")
    comprar(ana, visa["id"], 30_000, parcelas=3, descricao="Fone")
    ana.post(f"/cartoes/{visa['id']}/pagamentos", {"conta_id": corrente, "valor_centavos": 1_000, "data": hoje().isoformat()})
    atual = ana.get(f"/cartoes/{visa['id']}").json()["fatura_atual"]["referencia"]

    faturas = ana.get(f"/cartoes/{visa['id']}/faturas").json()

    assert [f["referencia"] for f in faturas][-1] == atual
    assert len(faturas) == 3
    da_atual = next(f for f in faturas if f["referencia"] == atual)
    assert (da_atual["total_centavos"], da_atual["pagamentos_centavos"], da_atual["quantidade"]) == (15_000, 1_000, 2)
    assert da_atual["situacao"] == "ABERTA"

    resposta = excluir(ana, f"/cartoes/{visa['id']}/faturas/{atual}")

    # Padaria + as 3 parcelas do fone (a compra sai inteira); o pagamento fica.
    assert resposta.json() == {"excluidos": 4}
    restantes = ana.get("/lancamentos", params={"conta_id": visa["id"]}).json()
    assert [l["tipo"] for l in restantes] == ["TRANSFERENCIA"]
    assert [f["referencia"] for f in ana.get(f"/cartoes/{visa['id']}/faturas").json()] == [atual]


# --- Cor do cartão -------------------------------------------------------------------


def test_cor_do_cartao_padrao_escolhida_e_mantida_no_put(ana):
    padrao = criar_cartao(ana)
    roxo = ana.post(
        "/contas",
        {"nome": "Roxinho", "tipo": "CARTAO_CREDITO", "limite_centavos": 1_000, "dia_fechamento": 3, "dia_vencimento": 10, "cor": "roxo"},
    ).json()

    renomeado = ana.put(
        f"/contas/{roxo['id']}",
        {"nome": "Roxo", "tipo": "CARTAO_CREDITO", "ativa": True, "limite_centavos": 1_000, "dia_fechamento": 3, "dia_vencimento": 10},
    ).json()

    assert padrao["cor"] == "grafite"
    assert (renomeado["nome"], renomeado["cor"]) == ("Roxo", "roxo")
    assert {cartao["cor"] for cartao in ana.get("/cartoes").json()} == {"grafite", "roxo"}


def test_conta_comum_tem_cor_opcional_e_mantida_no_put(ana):
    # Desde o card das contas no estilo dos cartões, toda conta pode ter cor.
    sem_cor = ana.post("/contas", {"nome": "Carteira", "tipo": "CARTEIRA"}).json()
    azul = ana.post("/contas", {"nome": "Banco", "tipo": "CORRENTE", "cor": "azul"}).json()

    renomeada = ana.put(f"/contas/{azul['id']}", {"nome": "Banco azul", "tipo": "CORRENTE", "ativa": True}).json()

    assert sem_cor["cor"] is None
    assert (renomeada["nome"], renomeada["cor"]) == ("Banco azul", "azul")
