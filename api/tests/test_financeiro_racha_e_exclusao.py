"""Divisão de um lançamento entre pessoas (racha), exclusão de lançamento e a
importação de extrato com colunas indicadas pela pessoa, pelo HTTP."""

import pytest

from tests.test_financeiro_api import entrar


@pytest.fixture
def ana(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-ana"))


@pytest.fixture
def bruno(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-bruno"))


def churrasco(cliente, conta, divisao, valor=30000, tipo="DESPESA", **extras):
    corpo = {
        "tipo": tipo,
        "descricao": "Churrasco",
        "data": "2026-09-19",
        "valor_centavos": valor,
        "conta_id": conta,
        "categoria_id": cliente.categorias["Lazer"],
        "divisao": divisao,
        **extras,
    }
    return cliente.post("/lancamentos", corpo)


def partes(*pares):
    return [{"pessoa": pessoa, "valor_centavos": valor} for pessoa, valor in pares]


# --- Racha ---------------------------------------------------------------------


def test_divide_o_churrasco_entre_tres_pessoas_com_valores_diferentes(ana):
    conta = ana.criar_conta("Corrente")

    resposta = churrasco(ana, conta, partes(("Ana", 10000), ("Bruno", 15000), ("Carla", 5000)))

    assert resposta.status_code == 201
    assert resposta.json()["divisao"] == partes(("Ana", 10000), ("Bruno", 15000), ("Carla", 5000))
    lido = ana.get(f"/lancamentos/{resposta.json()['id']}").json()
    assert lido["divisao"] == resposta.json()["divisao"]
    # A divisão é informação do lançamento: o saldo muda pelo valor inteiro.
    assert ana.saldos() == {"Corrente": -30000}


def test_as_partes_podem_somar_menos_que_o_total(ana):
    # O que sobra é a parte de quem lançou.
    resposta = churrasco(ana, ana.criar_conta("Corrente"), partes(("Bruno", 10000)))

    assert resposta.status_code == 201


def test_lancamento_sem_divisao_devolve_lista_vazia(ana):
    conta = ana.criar_conta("Corrente")

    resposta = ana.lancar("DESPESA", 1000, conta, categoria="Mercado")

    assert resposta.json()["divisao"] == []


@pytest.mark.parametrize(
    ("divisao", "campos"),
    [
        (partes(("Ana", 20000), ("Bruno", 15000)), {"divisao": "As partes somam mais que o valor do lançamento."}),
        (partes(("Ana", 100), ("  ana ", 100)), {"divisao.1.pessoa": "Esta pessoa já está na divisão."}),
        (partes(("Ana", 0)), {"divisao.0.valor_centavos": "Use um valor maior que 0."}),
        (partes(("", 100)), {"divisao.0.pessoa": "Campo obrigatório."}),
        (partes(*((f"Pessoa {i}", 1) for i in range(21))), {"divisao": "Use no máximo 20 itens."}),
    ],
)
def test_divisao_incoerente_aponta_o_campo(ana, divisao, campos):
    resposta = churrasco(ana, ana.criar_conta("Corrente"), divisao)

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == campos


def test_transferencia_nao_se_divide(ana):
    origem, destino = ana.criar_conta("Corrente"), ana.criar_conta("Poupança")

    resposta = ana.post(
        "/lancamentos",
        {
            "tipo": "TRANSFERENCIA",
            "descricao": "Guardar",
            "data": "2026-09-19",
            "valor_centavos": 1000,
            "conta_id": origem,
            "conta_destino_id": destino,
            "divisao": partes(("Ana", 500)),
        },
    )

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"divisao": "Transferência entre contas não se divide entre pessoas."}


def test_estorno_leva_a_divisao_junto(ana):
    original = churrasco(ana, ana.criar_conta("Corrente"), partes(("Bruno", 15000))).json()

    estorno = ana.post(f"/lancamentos/{original['id']}/estorno").json()

    assert estorno["divisao"] == partes(("Bruno", 15000))


def test_pessoas_ja_usadas_voltam_sem_repeticao_e_em_ordem(ana, bruno):
    conta = ana.criar_conta("Corrente")
    churrasco(ana, conta, partes(("carla", 100), ("Bruno", 100)))
    churrasco(ana, conta, partes(("Carla", 100), ("Ana", 100)))
    churrasco(bruno, bruno.criar_conta("Corrente"), partes(("Zé", 100)))

    pessoas = ana.get("/pessoas").json()

    assert len(pessoas) == 3
    assert [pessoa.casefold() for pessoa in pessoas] == ["ana", "bruno", "carla"]


# --- Exclusão ------------------------------------------------------------------


def excluir(cliente, id):
    return cliente.api.delete(f"{cliente.base}/lancamentos/{id}", headers=cliente.cabecalho)


def test_excluir_apaga_o_lancamento_e_devolve_o_saldo(ana):
    conta = ana.criar_conta("Corrente", 10000)
    id = ana.lancar("DESPESA", 2500, conta, categoria="Mercado").json()["id"]

    resposta = excluir(ana, id)

    assert resposta.status_code == 204
    assert resposta.content == b""
    assert ana.get(f"/lancamentos/{id}").status_code == 404
    assert ana.get("/lancamentos").json() == []
    assert ana.saldos() == {"Corrente": 10000}


def test_excluir_o_original_leva_o_estorno_junto(ana):
    conta = ana.criar_conta("Corrente", 10000)
    id = ana.lancar("DESPESA", 2500, conta, categoria="Mercado").json()["id"]
    ana.post(f"/lancamentos/{id}/estorno")

    assert excluir(ana, id).status_code == 204

    assert ana.get("/lancamentos").json() == []
    assert ana.saldos() == {"Corrente": 10000}


def test_excluir_o_estorno_devolve_o_original_ao_normal(ana):
    conta = ana.criar_conta("Corrente", 10000)
    id = ana.lancar("DESPESA", 2500, conta, categoria="Mercado").json()["id"]
    estorno = ana.post(f"/lancamentos/{id}/estorno").json()["id"]

    assert excluir(ana, estorno).status_code == 204

    original = ana.get(f"/lancamentos/{id}").json()
    assert original["estornado_por"] is None
    assert ana.saldos() == {"Corrente": 7500}
    # Sem o estorno, o original pode ser estornado de novo.
    assert ana.post(f"/lancamentos/{id}/estorno").status_code == 201


def test_nao_exclui_lancamento_inexistente_nem_de_outra_pessoa(ana, bruno):
    id = ana.lancar("DESPESA", 2500, ana.criar_conta("Corrente"), categoria="Mercado").json()["id"]

    assert excluir(ana, "nao-existe").status_code == 404
    assert excluir(bruno, id).status_code == 404
    assert ana.get(f"/lancamentos/{id}").status_code == 200


# --- Importação com colunas indicadas ------------------------------------------

SEM_CABECALHO = "2026-09-01|Feira de sábado|30,00|D|Mercado\n2026-09-02|Reembolso do Bruno|30,00|C|Sem nome\n"
MAPEAMENTO = {"delimitador": "|", "cabecalho": 0, "data": 0, "descricao": 1, "valor": 2, "tipo": 3, "categoria": 4}


def importacao(cliente, conta_id, csv, **extras):
    corpo = {
        "conta_id": conta_id,
        "categoria_despesa_id": cliente.categorias["Outras despesas"],
        "categoria_receita_id": cliente.categorias["Outras receitas"],
        "csv": csv,
        **extras,
    }
    return cliente.post("/importacoes", corpo)


def test_estrutura_mostra_o_comeco_do_arquivo_sem_gravar(ana):
    resposta = ana.post("/importacoes/estrutura", {"csv": SEM_CABECALHO})

    assert resposta.status_code == 200
    assert resposta.json() == {
        "delimitador": "|",
        "linhas": [
            {"numero": 1, "celulas": ["2026-09-01", "Feira de sábado", "30,00", "D", "Mercado"]},
            {"numero": 2, "celulas": ["2026-09-02", "Reembolso do Bruno", "30,00", "C", "Sem nome"]},
        ],
        "mapeamento": None,
    }
    assert ana.get("/lancamentos").json() == []


def test_estrutura_de_arquivo_reconhecido_traz_o_mapeamento(ana):
    corpo = ana.post("/importacoes/estrutura", {"csv": "Data;Descrição;Valor\n01/09/2026;Café;-5,00\n"}).json()

    assert corpo["mapeamento"] == {
        "delimitador": ";",
        "cabecalho": 1,
        "data": 0,
        "descricao": 1,
        "valor": 2,
        "credito": None,
        "debito": None,
        "tipo": None,
        "categoria": None,
        "inverter_sinal": False,
    }


def test_estrutura_recusa_arquivo_vazio_e_separador_desconhecido(ana):
    assert ana.post("/importacoes/estrutura", {"csv": "\n"}).json()["campos"] == {"csv": "O arquivo está vazio."}
    assert ana.post("/importacoes/estrutura", {"csv": "a;b", "delimitador": "#"}).status_code == 400


def test_importa_com_as_colunas_indicadas_e_a_categoria_do_arquivo(ana):
    conta = ana.criar_conta("Corrente")

    corpo = importacao(ana, conta, SEM_CABECALHO, mapeamento=MAPEAMENTO).json()

    assert corpo["importadas"] == 2
    feira, reembolso = corpo["linhas"]
    assert (feira["valor_centavos"], feira["categoria_id"]) == (-3000, ana.categorias["Mercado"])
    # "Sem nome" não é categoria do espaço: vai para a padrão das entradas.
    assert (reembolso["valor_centavos"], reembolso["categoria_id"]) == (3000, ana.categorias["Outras receitas"])
    assert ana.get(f"/lancamentos/{feira['lancamento_id']}").json()["categoria_id"] == ana.categorias["Mercado"]


def test_categoria_do_arquivo_de_outro_tipo_nao_e_usada(ana):
    # "Salário" é categoria de receita: numa saída, fica a padrão das despesas.
    csv = "Data;Descrição;Categoria;Valor\n01/09/2026;Engano;salario;-10,00\n"

    corpo = importacao(ana, ana.criar_conta("Corrente"), csv, simular=True).json()

    assert corpo["linhas"][0]["categoria_id"] == ana.categorias["Outras despesas"]


def test_mapeamento_incoerente_aponta_a_informacao(ana):
    conta = ana.criar_conta("Corrente")

    resposta = importacao(ana, conta, SEM_CABECALHO, mapeamento={**MAPEAMENTO, "valor": None})

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {
        "mapeamento.valor": "Indique a coluna do valor, ou as de entrada e saída.",
        "mapeamento.tipo": "A coluna D/C acompanha a coluna do valor.",
    }


def test_mapeamento_com_campo_estranho_e_recusado(ana):
    conta = ana.criar_conta("Corrente")

    resposta = importacao(ana, conta, SEM_CABECALHO, mapeamento={**MAPEAMENTO, "data": -1, "extra": 1})

    assert resposta.status_code == 400
    assert set(resposta.json()["campos"]) == {"mapeamento.data", "mapeamento.extra"}


def test_linha_importada_e_excluida_volta_na_proxima_importacao(ana):
    conta = ana.criar_conta("Corrente")
    primeira = importacao(ana, conta, SEM_CABECALHO, mapeamento=MAPEAMENTO).json()
    excluir(ana, primeira["linhas"][0]["lancamento_id"])

    corpo = importacao(ana, conta, SEM_CABECALHO, mapeamento=MAPEAMENTO).json()

    assert (corpo["importadas"], corpo["ja_importadas"]) == (1, 1)
