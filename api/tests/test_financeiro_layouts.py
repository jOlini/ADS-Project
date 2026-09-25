"""Extratos em formatos diferentes: colunas reconhecidas pelo nome, colunas
indicadas pela pessoa (mapeamento) e o começo do arquivo para a tela.

Cabeçalhos no molde do que os bancos exportam, com dados fictícios.
"""

from dataclasses import replace
from datetime import date

import pytest

from app.financeiro.importacao import (
    ExtratoIlegivel,
    LinhaDoArquivo,
    Mapeamento,
    conferir_mapeamento,
    detectar,
    estrutura,
    ler_extrato,
    sinal_do_tipo,
)


def valores(texto, mapeamento=None):
    lidas, recusadas = ler_extrato(texto, mapeamento)
    return [(linha.descricao, linha.valor_centavos) for linha in lidas], [r.erro for r in recusadas]


# --- Reconhecidos pelo nome ----------------------------------------------------


def test_entrada_e_saida_em_colunas_separadas():
    texto = (
        "Extrato de conta corrente\n"
        "Data;Histórico;Docto.;Crédito (R$);Débito (R$);Saldo (R$)\n"
        "01/09/2026;Pix recebido;123;1.500,00;;1.500,00\n"
        "02/09/2026;Conta de luz;124;;187,42;1.312,58\n"
        "03/09/2026;Tarifa;125;;-19,90\n"
    )

    assert valores(texto) == ([("Pix recebido", 150000), ("Conta de luz", -18742), ("Tarifa", -1990)], [])
    assert detectar(texto) == Mapeamento(";", 2, data=0, descricao=1, credito=3, debito=4)


def test_valor_sem_sinal_com_coluna_d_c():
    texto = "Data Mov.;Nr. Doc.;Histórico;Valor;Deb/Cred\n01/09/2026;1;Salário;6.800,00;C\n02/09/2026;2;Aluguel;1.850,00;D\n"

    assert valores(texto) == ([("Salário", 680000), ("Aluguel", -185000)], [])


def test_coluna_de_tipo_com_entrada_e_saida():
    texto = '"Data","Lançamento","Detalhes","Valor","Tipo Lançamento"\n"01/09/2026","Pix","Maria","50,00","Entrada"\n"02/09/2026","Compra","Mercado","80,00","Saída"\n'

    assert valores(texto) == ([("Pix", 5000), ("Compra", -8000)], [])


def test_coluna_tipo_que_nao_diz_debito_nem_credito_e_ignorada():
    # "Tipo" aqui é o meio de pagamento: o sinal continua vindo do valor.
    texto = "Data;Descrição;Tipo;Valor\n01/09/2026;Mercado;Pix;-45,90\n02/09/2026;Salário;TED;6.800,00\n"

    assert detectar(texto).tipo is None
    assert valores(texto) == ([("Mercado", -4590), ("Salário", 680000)], [])


def test_prefere_descricao_a_titulo_e_le_entrada_e_saida():
    texto = (
        "Data Lançamento,Data Contábil,Título,Descrição,Entrada(R$),Saída(R$),Saldo do Dia(R$)\n"
        "01/09/2026,01/09/2026,Pix enviado,Padaria Pão Bom,0,12.50,100.00\n"
    )

    mapeamento = detectar(texto)

    assert (mapeamento.data, mapeamento.descricao, mapeamento.credito, mapeamento.debito) == (0, 3, 4, 5)
    assert valores(texto) == ([("Padaria Pão Bom", -1250)], [])


def test_fatura_de_cartao_em_ingles_inverte_o_sinal():
    # Na fatura, a compra vem positiva e o pagamento da fatura, negativo.
    texto = "date,title,amount\n2026-09-01,Livraria,89.90\n2026-09-05,Pagamento recebido,-500.00\n"

    assert detectar(texto).inverter_sinal is True
    assert valores(texto) == ([("Livraria", -8990), ("Pagamento recebido", 50000)], [])


def test_le_a_coluna_de_categoria():
    texto = "Data;Descrição;Categoria;Valor\n01/09/2026;Feira;Mercado;-30,00\n02/09/2026;Cinema;;-40,00\n"

    lidas, _ = ler_extrato(texto)

    assert [linha.categoria for linha in lidas] == ["Mercado", None]


def test_linha_sem_entrada_nem_saida_volta_com_o_motivo():
    texto = "Data;Descrição;Entrada;Saída\n01/09/2026;Nada;;\n02/09/2026;Pão;;x\n"

    assert valores(texto) == ([], ["Linha sem valor de entrada nem de saída.", "Valor inválido. Use o formato 1.234,56, com - nas saídas."])


@pytest.mark.parametrize(
    ("texto", "sinal"),
    [("D", -1), ("débito", -1), ("Saída", -1), ("-", -1), ("C", 1), ("Crédito", 1), ("entrada", 1), ("+", 1), ("Pix", None), ("", None)],
)
def test_sinal_do_tipo(texto, sinal):
    assert sinal_do_tipo(texto) == sinal


# --- Colunas indicadas pela pessoa ---------------------------------------------

SEM_CABECALHO = "2026-09-01|Compra na feira|30,00|D\n2026-09-02|Reembolso|30,00|C\n"


def test_arquivo_sem_cabecalho_nao_e_reconhecido_mas_le_com_mapeamento():
    mapeamento = Mapeamento("|", 0, data=0, descricao=1, valor=2, tipo=3)

    assert detectar(SEM_CABECALHO) is None
    assert valores(SEM_CABECALHO, mapeamento) == ([("Compra na feira", -3000), ("Reembolso", 3000)], [])


def test_mapeamento_pode_inverter_o_sinal():
    texto = "Quando;O quê;Quanto\n01/09/2026;Livraria;89,90\n"
    mapeamento = Mapeamento(";", 1, data=0, descricao=1, valor=2, inverter_sinal=True)

    assert valores(texto, mapeamento) == ([("Livraria", -8990)], [])


def test_cabecalho_errado_aparece_como_linha_recusada():
    texto = "Data;Descrição;Valor\n01/09/2026;Café;-5,00\n"
    mapeamento = Mapeamento(";", 0, data=0, descricao=1, valor=2)

    assert valores(texto, mapeamento) == ([("Café", -500)], ["Data inválida. Use DD/MM/AAAA ou AAAA-MM-DD."])


@pytest.mark.parametrize(
    ("trocas", "erros"),
    [
        ({"valor": None}, {"valor": "Indique a coluna do valor, ou as de entrada e saída."}),
        ({"credito": 3}, {"valor": "Use a coluna do valor ou as de entrada e saída, não as duas."}),
        (
            {"valor": None, "credito": 2, "tipo": 3},
            {"tipo": "A coluna D/C acompanha a coluna do valor."},
        ),
        ({"descricao": 0}, {"descricao": "Esta coluna já foi usada para outra informação."}),
    ],
)
def test_confere_o_mapeamento(trocas, erros):
    mapeamento = replace(Mapeamento(";", 1, data=0, descricao=1, valor=2), **trocas)

    assert conferir_mapeamento(mapeamento) == erros


def test_mapeamento_coerente_nao_tem_erros():
    assert conferir_mapeamento(Mapeamento(";", 1, data=0, descricao=1, credito=2, debito=3, categoria=4)) == {}


# --- Começo do arquivo para a tela ---------------------------------------------


def test_estrutura_traz_as_primeiras_linhas_e_o_mapeamento_reconhecido():
    texto = "Agência 0001\n\nData;Descrição;Valor\n01/09/2026;Café;-5,00\n"

    resultado = estrutura(texto)

    assert resultado.delimitador == ";"
    assert resultado.linhas == [
        LinhaDoArquivo(1, ["Agência 0001"]),
        LinhaDoArquivo(3, ["Data", "Descrição", "Valor"]),
        LinhaDoArquivo(4, ["01/09/2026", "Café", "-5,00"]),
    ]
    assert resultado.mapeamento == Mapeamento(";", 3, data=0, descricao=1, valor=2)


def test_estrutura_sem_colunas_reconhecidas_adivinha_o_separador():
    resultado = estrutura(SEM_CABECALHO)

    assert (resultado.delimitador, resultado.mapeamento) == ("|", None)
    assert resultado.linhas[0].celulas == ["2026-09-01", "Compra na feira", "30,00", "D"]


def test_estrutura_aceita_o_separador_escolhido_e_corta_a_amostra():
    texto = "".join(f"{dia:02d}/09/2026,Linha {dia};{'x' * 100}\n" for dia in range(1, 25))

    resultado = estrutura(texto, delimitador=";")

    assert resultado.delimitador == ";"
    assert len(resultado.linhas) == 15
    assert resultado.linhas[0].celulas == ["01/09/2026,Linha 1", "x" * 80]


def test_estrutura_de_arquivo_vazio_e_recusada():
    with pytest.raises(ExtratoIlegivel, match="O arquivo está vazio."):
        estrutura("\n\n")


def test_data_de_dois_digitos_no_ano_entra_no_seculo_atual():
    lidas, _ = ler_extrato("Data;Descrição;Valor\n09/05/26;Café;-5,00\n")

    assert lidas[0].data == date(2026, 5, 9)
