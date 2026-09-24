"""Importação do extrato do banco em CSV: leitura do arquivo (funções puras) e
o caminho pelo HTTP, com a chave de idempotência por linha.

Extratos fictícios: nenhum dado bancário real entra no repositório público.
"""

import re
from datetime import date

import pytest

from app.financeiro.importacao import (
    MAXIMO_DE_LINHAS,
    ExtratoIlegivel,
    LinhaDoExtrato,
    chaves_de_importacao,
    ler_data,
    ler_extrato,
    ler_valor,
)
from tests.test_financeiro_api import entrar

EXTRATO = """Data;Descrição;Valor
05/09/2026;Salário;6.800,00
05/09/2026;Aluguel;-1.850,00
12/09/2026;Padaria;-12,50
12/09/2026;Padaria;-12,50
"""


# --- Leitura do arquivo --------------------------------------------------------


def test_le_o_extrato_no_formato_brasileiro():
    lidas, recusadas = ler_extrato(EXTRATO)

    assert recusadas == []
    assert lidas[0] == LinhaDoExtrato(2, date(2026, 9, 5), "Salário", 680000)
    assert [linha.valor_centavos for linha in lidas] == [680000, -185000, -1250, -1250]
    assert [linha.linha for linha in lidas] == [2, 3, 4, 5]


def test_aceita_virgula_ponto_decimal_data_iso_e_bom():
    # Formato comum de banco digital: vírgula entre colunas e ponto decimal.
    texto = "﻿Data,Valor,Identificador,Descrição\n2026-09-10,-45.9,abc-1,Mercado\n2026-09-11,1200,abc-2,Pix recebido\n"

    lidas, recusadas = ler_extrato(texto)

    assert recusadas == []
    assert [(linha.data, linha.valor_centavos, linha.descricao) for linha in lidas] == [
        (date(2026, 9, 10), -4590, "Mercado"),
        (date(2026, 9, 11), 120000, "Pix recebido"),
    ]


def test_acha_o_cabecalho_depois_das_linhas_da_conta_e_aceita_outros_nomes():
    texto = "Agência: 0001;Conta: 12345-6\n\nData Lançamento;Histórico;Valor (R$)\n01/09/2026;Tarifa;-19,90\n"

    lidas, _ = ler_extrato(texto)

    assert [(linha.linha, linha.descricao, linha.valor_centavos) for linha in lidas] == [(4, "Tarifa", -1990)]


def test_recusa_a_linha_ruim_com_o_motivo_e_aproveita_as_outras():
    texto = (
        "Data;Descrição;Valor\n"
        "31/02/2026;Data impossível;-10,00\n"
        "01/09/2026;Valor estranho;dez reais\n"
        "01/09/2026;;-10,00\n"
        "01/09/2026;SALDO ANTERIOR;2.000,00\n"
        "01/09/2026;Zerado;0,00\n"
        "01/09/2026;Só duas colunas\n"
        "\n"
        "02/09/2026;Farmácia;-35,00\n"
    )

    lidas, recusadas = ler_extrato(texto)

    assert [linha.descricao for linha in lidas] == ["Farmácia"]
    assert [(recusada.linha, recusada.erro) for recusada in recusadas] == [
        (2, "Data inválida. Use DD/MM/AAAA ou AAAA-MM-DD."),
        (3, "Valor inválido. Use o formato 1.234,56, com - nas saídas."),
        (4, "Linha sem descrição."),
        (5, "Linha de saldo, não é lançamento."),
        (6, "Valor zero não vira lançamento."),
        (7, "Linha com colunas faltando."),
    ]


def test_limpa_a_descricao_e_corta_no_tamanho_de_um_lancamento():
    texto = "Data;Descrição;Valor\n01/09/2026;  Compra\tcom   espaços  ;-1,00\n01/09/2026;" + "x" * 300 + ";-1,00\n"

    lidas, _ = ler_extrato(texto)

    assert lidas[0].descricao == "Compra com espaços"
    assert len(lidas[1].descricao) == 120


@pytest.mark.parametrize(
    ("texto", "mensagem"),
    [
        ("", "Não achei o cabeçalho com as colunas Data, Descrição e Valor."),
        ("Data;Valor\n01/09/2026;-1,00\n", "Não achei o cabeçalho com as colunas Data, Descrição e Valor."),
        ("Data;Descrição;Valor\n\n", "O arquivo não tem lançamentos depois do cabeçalho."),
        (
            "Data;Descrição;Valor\n" + "01/09/2026;Café;-5,00\n" * (MAXIMO_DE_LINHAS + 1),
            f"O arquivo passa de {MAXIMO_DE_LINHAS} lançamentos. Exporte um período menor.",
        ),
    ],
)
def test_recusa_o_arquivo_que_nao_serve(texto, mensagem):
    with pytest.raises(ExtratoIlegivel, match=re.escape(mensagem)):
        ler_extrato(texto)


@pytest.mark.parametrize(
    ("texto", "centavos"),
    [
        ("1.234,56", 123456),
        ("-1.234,56", -123456),
        ("R$ -80", -8000),
        ("+15,5", 1550),
        ("10.5", 1050),
        ("1.500", 150000),
        ("−3,00", -300),
        ("1,234.56", None),
        ("12,345", None),
        ("abc", None),
        ("1.000.000.001,00", None),
    ],
)
def test_le_valor_sem_float(texto, centavos):
    assert ler_valor(texto) == centavos


@pytest.mark.parametrize(
    ("texto", "data"),
    [
        ("05/09/2026", date(2026, 9, 5)),
        ("05-09-2026", date(2026, 9, 5)),
        ("2026-09-05", date(2026, 9, 5)),
        ("2026-09-05 10:22:33", date(2026, 9, 5)),
        ("09/05/26", None),
        ("32/01/2026", None),
    ],
)
def test_le_data(texto, data):
    assert ler_data(texto) == data


# --- Chave de idempotência -----------------------------------------------------


def test_duas_compras_iguais_no_mesmo_dia_tem_chaves_diferentes():
    lidas, _ = ler_extrato(EXTRATO)

    chaves = chaves_de_importacao("conta-1", lidas)

    assert len(set(chaves)) == 4
    assert all(len(chave) == 64 for chave in chaves)


def test_o_mesmo_extrato_exportado_de_novo_da_as_mesmas_chaves():
    reexportado = EXTRATO.replace("Salário", "  SALARIO ")

    assert chaves_de_importacao("conta-1", ler_extrato(EXTRATO)[0]) == chaves_de_importacao(
        "conta-1", ler_extrato(reexportado)[0]
    )


def test_extrato_de_periodo_maior_repete_as_chaves_do_anterior():
    primeira_quinzena = "Data;Descrição;Valor\n05/09/2026;Aluguel;-1.850,00\n12/09/2026;Padaria;-12,50\n"
    mes_inteiro = primeira_quinzena + "20/09/2026;Posto;-180,00\n"

    anteriores = set(chaves_de_importacao("conta-1", ler_extrato(primeira_quinzena)[0]))
    novas = chaves_de_importacao("conta-1", ler_extrato(mes_inteiro)[0])

    assert anteriores < set(novas)


def test_a_chave_depende_da_conta():
    lidas, _ = ler_extrato(EXTRATO)

    assert set(chaves_de_importacao("conta-1", lidas)).isdisjoint(chaves_de_importacao("conta-2", lidas))


# --- Pelo HTTP -----------------------------------------------------------------


@pytest.fixture
def ana(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-ana"))


@pytest.fixture
def bruno(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-bruno"))


def importacao(cliente, conta_id, csv=EXTRATO, simular=False, **trocas):
    corpo = {
        "conta_id": conta_id,
        "categoria_despesa_id": cliente.categorias["Outras despesas"],
        "categoria_receita_id": cliente.categorias["Outras receitas"],
        "csv": csv,
        "simular": simular,
        **trocas,
    }
    return cliente.post("/importacoes", corpo)


def test_simular_mostra_o_que_entraria_sem_gravar(ana):
    conta = ana.criar_conta("Corrente", saldo_inicial=10000)

    resposta = importacao(ana, conta, simular=True)

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert (corpo["simulacao"], corpo["novas"], corpo["importadas"]) == (True, 4, 0)
    assert corpo["linhas"][0] == {
        "linha": 2,
        "situacao": "NOVA",
        "data": "2026-09-05",
        "descricao": "Salário",
        "valor_centavos": 680000,
        "lancamento_id": None,
        "erro": None,
    }
    assert ana.get("/lancamentos").json() == []
    assert ana.saldos() == {"Corrente": 10000}


def test_importar_lanca_receitas_e_despesas_e_move_o_saldo(ana):
    conta = ana.criar_conta("Corrente", saldo_inicial=10000)

    corpo = importacao(ana, conta).json()

    assert (corpo["simulacao"], corpo["importadas"], corpo["ja_importadas"]) == (False, 4, 0)
    assert ana.saldos() == {"Corrente": 10000 + 680000 - 185000 - 1250 - 1250}
    salario = ana.get(f"/lancamentos/{corpo['linhas'][0]['lancamento_id']}").json()
    assert salario["tipo"] == "RECEITA"
    assert salario["categoria_id"] == ana.categorias["Outras receitas"]
    aluguel = ana.get(f"/lancamentos/{corpo['linhas'][1]['lancamento_id']}").json()
    assert (aluguel["tipo"], aluguel["valor_centavos"]) == ("DESPESA", 185000)
    assert aluguel["categoria_id"] == ana.categorias["Outras despesas"]


def test_importar_de_novo_nao_duplica_nada(ana):
    conta = ana.criar_conta("Corrente")
    importacao(ana, conta)

    corpo = importacao(ana, conta).json()

    assert (corpo["importadas"], corpo["ja_importadas"]) == (0, 4)
    assert {linha["situacao"] for linha in corpo["linhas"]} == {"JA_IMPORTADA"}
    assert len(ana.get("/lancamentos").json()) == 4


def test_extrato_do_mes_inteiro_depois_da_quinzena_so_traz_o_que_falta(ana):
    conta = ana.criar_conta("Corrente")
    importacao(ana, conta)

    corpo = importacao(ana, conta, csv=EXTRATO + "20/09/2026;Posto;-180,00\n").json()

    assert (corpo["importadas"], corpo["ja_importadas"]) == (1, 4)
    assert corpo["linhas"][-1]["descricao"] == "Posto"


def test_estorno_nao_libera_a_linha_para_entrar_de_novo(ana):
    conta = ana.criar_conta("Corrente")
    primeiro = importacao(ana, conta).json()["linhas"][1]["lancamento_id"]
    assert ana.post(f"/lancamentos/{primeiro}/estorno").status_code == 201

    corpo = importacao(ana, conta).json()

    assert corpo["importadas"] == 0


def test_linha_ruim_volta_com_o_motivo_e_nao_barra_as_outras(ana):
    conta = ana.criar_conta("Corrente")

    corpo = importacao(ana, conta, csv="Data;Descrição;Valor\n01/09/2026;Café;-5,00\n01/09/2026;Pão;abc\n").json()

    assert (corpo["importadas"], corpo["invalidas"]) == (1, 1)
    assert corpo["linhas"][1]["situacao"] == "INVALIDA"
    assert corpo["linhas"][1]["erro"].startswith("Valor inválido")


def test_arquivo_sem_cabecalho_e_destino_errado_dao_400_por_campo(ana):
    conta = ana.criar_conta("Corrente")

    resposta = importacao(
        ana,
        conta,
        csv="sem cabeçalho",
        categoria_despesa_id=ana.categorias["Salário"],
        categoria_receita_id=ana.categorias["Mercado"],
    )

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {
        "csv": "Não achei o cabeçalho com as colunas Data, Descrição e Valor.",
        "categoria_despesa_id": "Use uma categoria de despesa.",
        "categoria_receita_id": "Use uma categoria de receita.",
    }


def test_conta_desativada_nao_recebe_importacao(ana):
    conta = ana.criar_conta("Antiga")
    ana.put(f"/contas/{conta}", {"nome": "Antiga", "tipo": "CORRENTE", "ativa": False})

    resposta = importacao(ana, conta)

    assert resposta.status_code == 400
    assert resposta.json()["campos"]["conta_id"] == "Conta desativada: reative-a para lançar nela."


def test_nao_importa_para_a_conta_de_outra_pessoa(ana, bruno):
    conta_da_ana = ana.criar_conta("Corrente da Ana")

    resposta = importacao(bruno, conta_da_ana)

    assert resposta.status_code == 400
    assert resposta.json()["campos"]["conta_id"] == "Conta não encontrada."
    assert ana.get("/lancamentos").json() == []


def test_o_mesmo_extrato_em_espacos_diferentes_entra_nos_dois(ana, bruno):
    importacao(ana, ana.criar_conta("Corrente"))

    corpo = importacao(bruno, bruno.criar_conta("Corrente")).json()

    assert corpo["importadas"] == 4


def test_texto_grande_demais_ou_campo_extra_da_400(ana):
    conta = ana.criar_conta("Corrente")

    assert importacao(ana, conta, csv="x" * 500_001).status_code == 400
    assert importacao(ana, conta, chave_importacao="forjada").status_code == 400
