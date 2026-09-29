"""Reconhecimento das colunas sem a pessoa indicar nada: pelo cabeçalho, no
molde do que cada banco exporta, e pelo conteúdo, quando não há cabeçalho.
Também o arquivo que não é CSV, recusado antes de qualquer leitura.

Os cabeçalhos seguem os formatos públicos de exportação; os dados são
fictícios.
"""

import pytest

from app.financeiro.importacao import (
    MENSAGEM_BINARIO,
    ExtratoIlegivel,
    Mapeamento,
    conferir_arquivo,
    detectar,
    estrutura,
    ler_extrato,
    reconhecer,
)
from app.financeiro.reconhecimento import pontos_do_nome


def colunas(texto):
    achado = reconhecer(texto)
    assert achado is not None
    return achado.mapeamento.colunas(), achado.origem, achado.duvidas


# --- Pelo cabeçalho, no molde de cada banco ------------------------------------


@pytest.mark.parametrize(
    ("banco", "texto", "esperado"),
    [
        (
            "Nubank (conta)",
            "Data,Valor,Identificador,Descrição\n01/09/2026,-45.90,a1b2,Compra no débito - Padaria Doce\n",
            {"data": 0, "valor": 1, "descricao": 3},
        ),
        (
            "Itaú",
            "data;lançamento;ag./origem;valor (R$);saldos (R$)\n01/09/2026;PIX TRANSF ANA;0001;-50,00;950,00\n",
            {"data": 0, "descricao": 1, "valor": 3},
        ),
        (
            "Bradesco (fatura)",
            "Data;Histórico;Valor(US$);Valor(R$)\n01/09/2026;LOJA EXEMPLO;0,00;120,00\n",
            {"data": 0, "descricao": 1, "valor": 3},
        ),
        (
            "Banco do Brasil",
            '"Data","Dependencia Origem","Histórico","Data do Balancete","Número do documento","Valor",\n'
            '"01/09/2026","","Pix - Enviado","","123","-80,00",\n',
            {"data": 0, "descricao": 2, "valor": 5},
        ),
        (
            "C6",
            "Data Lançamento,Data Contábil,Título,Descrição,Entrada(R$),Saída(R$),Saldo do Dia(R$)\n"
            "01/09/2026,01/09/2026,Pix,Mercado Bom Preço,,187.42,812.58\n",
            {"data": 0, "descricao": 3, "credito": 4, "debito": 5},
        ),
        (
            "Mercado Pago",
            "RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE\n"
            "01-09-2026;Pagamento com QR Pix;123;-25,00;975,00\n",
            {"data": 0, "descricao": 1, "valor": 3},
        ),
        (
            "Caixa",
            "Data Mov.;Nr. Doc.;Histórico;Valor;Deb/Cred;Saldo\n01/09/2026;000123;COMPRA ELO;50,00;D;950,00\n",
            {"data": 0, "descricao": 2, "valor": 3, "tipo": 4},
        ),
        (
            "Inter",
            "Data Lançamento;Histórico;Descrição;Valor;Saldo\n01/09/2026;Pix enviado;Ana Souza;-30,00;970,00\n",
            {"data": 0, "descricao": 2, "valor": 3},
        ),
    ],
)
def test_cabecalho_de_cada_banco(banco, texto, esperado):
    mapa, origem, duvidas = colunas(texto)

    assert (mapa, origem, duvidas) == (esperado, "CABECALHO", ()), banco


def test_nome_que_contem_a_palavra_tambem_serve():
    texto = "Data da operação;Descrição completa;Valor pago (R$)\n01/09/2026;Livraria;-89,90\n"

    assert colunas(texto) == ({"data": 0, "descricao": 1, "valor": 2}, "CABECALHO", ())


@pytest.mark.parametrize(
    ("nome", "papel", "serve"),
    [
        ("saldo r", "valor", False),
        ("valor us", "valor", False),
        ("valor do iof", "valor", False),
        ("valor r", "valor", True),
        ("descricao do valor", "descricao", False),
        ("data do balancete", "data", True),
    ],
)
def test_palavras_que_desqualificam(nome, papel, serve):
    assert (pontos_do_nome(nome, papel) > 0) is serve


def test_data_principal_vence_a_secundaria():
    assert pontos_do_nome("data", "data") > pontos_do_nome("data do balancete", "data")
    assert pontos_do_nome("data lancamento", "data") > pontos_do_nome("data contabil", "data")


def test_duas_colunas_com_o_mesmo_nome_ficam_em_duvida():
    texto = "Data;Descrição;Valor;Valor\n01/09/2026;Café;-5,00;-5,00\n"

    _, origem, duvidas = colunas(texto)

    assert (origem, duvidas) == ("CABECALHO", ("valor",))


def test_coluna_que_nao_confere_com_o_nome_fica_em_duvida():
    texto = "Data;Descrição;Valor\nontem;Café;-5,00\nhoje;Pão;-3,00\n"

    assert colunas(texto)[2] == ("data",)


# --- Pelo conteúdo, sem cabeçalho ----------------------------------------------


def test_sem_cabecalho_o_saldo_fica_de_fora():
    # A quarta coluna acompanha a terceira linha a linha: é o saldo.
    texto = (
        "01/09/2026;Pix recebido Ana;1.500,00;2.500,00\n"
        "02/09/2026;Mercado Bom Preço;-187,42;2.312,58\n"
        "03/09/2026;Farmácia Vida;-19,90;2.292,68\n"
        "04/09/2026;Salário ACME;5.000,00;7.292,68\n"
    )

    assert colunas(texto) == ({"data": 0, "descricao": 1, "valor": 2}, "CONTEUDO", ())


def test_sem_cabecalho_entrada_e_saida_se_revezam():
    texto = (
        "01/09/2026;Pix recebido;1.500,00;\n"
        "02/09/2026;Conta de luz;;-187,42\n"
        "03/09/2026;Tarifa;;-19,90\n"
        "04/09/2026;Reembolso;42,00;\n"
    )

    assert colunas(texto) == ({"data": 0, "descricao": 1, "credito": 2, "debito": 3}, "CONTEUDO", ())


def test_sem_sinal_entrada_e_saida_ficam_em_duvida():
    texto = "01/09/2026;Pix recebido;1.500,00;\n02/09/2026;Conta de luz;;187,42\n03/09/2026;Tarifa;;19,90\n"

    _, origem, duvidas = colunas(texto)

    assert (origem, duvidas) == ("CONTEUDO", ("credito", "debito"))
    # Com dúvida, a importação sem mapeamento não adivinha: pede as colunas.
    assert detectar(texto) is None


def test_linhas_da_conta_antes_dos_lancamentos_ficam_de_fora():
    texto = (
        "Banco Fictício S.A.\n"
        "Agência 0001 Conta 12345-6\n"
        "\n"
        "05/09/2026;Salário;6.800,00\n"
        "06/09/2026;Aluguel;-1.850,00\n"
    )

    achado = reconhecer(texto)

    assert achado.mapeamento == Mapeamento(";", 3, data=0, descricao=1, valor=2)
    lidas, recusadas = ler_extrato(texto)
    assert [(linha.descricao, linha.valor_centavos) for linha in lidas] == [("Salário", 680000), ("Aluguel", -185000)]
    assert recusadas == []


def test_nomes_desconhecidos_caem_no_conteudo():
    texto = "Quando;O quê;Quanto\n01/09/2026;Livraria;-89,90\n02/09/2026;Padaria;-10,00\n"

    achado = reconhecer(texto)

    assert (achado.origem, achado.mapeamento) == ("CONTEUDO", Mapeamento(";", 1, data=0, descricao=1, valor=2))


def test_descricao_e_a_coluna_de_texto_mais_variada():
    # "Pix" se repete; o favorecido muda de linha para linha.
    texto = (
        "01/09/2026;Pix;Ana Souza;-30,00\n"
        "02/09/2026;Pix;Padaria Doce Pão;-12,00\n"
        "03/09/2026;Pix;Oficina do Zé;-250,00\n"
    )

    assert colunas(texto)[0]["descricao"] == 2


def test_estrutura_diz_a_origem_e_as_duvidas():
    resultado = estrutura("Data;Descrição;Valor;Valor\n01/09/2026;Café;-5,00;-5,00\n")

    assert (resultado.origem, resultado.duvidas) == ("CABECALHO", ("valor",))


# --- O que não é CSV --------------------------------------------------------------


@pytest.mark.parametrize(
    ("comeco", "trecho_da_mensagem"),
    [
        ("PK\x03\x04\x14\x00\x06\x00", "Excel (.xlsx)"),
        ("%PDF-1.7\n%âãÏÓ", "PDF"),
        ("{\\rtf1\\ansi", ".rtf"),
        ("<!DOCTYPE html><html><table>", "página da web"),
        ("  <html><body><table><tr><td>Data</td>", "página da web"),
    ],
)
def test_arquivo_de_outro_tipo_e_recusado_com_o_que_fazer(comeco, trecho_da_mensagem):
    with pytest.raises(ExtratoIlegivel, match=trecho_da_mensagem.replace("(", r"\(").replace(")", r"\)")):
        conferir_arquivo(comeco + "resto do arquivo")


def test_arquivo_binario_e_recusado():
    with pytest.raises(ExtratoIlegivel) as erro:
        estrutura("Data;Descrição;Valor\n01/09/2026;Café\x00\x01\x02;-5,00\n")

    assert str(erro.value) == MENSAGEM_BINARIO


def test_celula_gigante_nao_vai_inteira_para_a_memoria():
    # Aspas que nunca fecham: sem o limite, o leitor juntaria o arquivo todo
    # numa célula só.
    texto = 'Data;Descrição;Valor\n01/09/2026;"' + "x" * 20_000 + "\n02/09/2026;Pão;-3,00\n"

    with pytest.raises(ExtratoIlegivel, match="não é um CSV válido"):
        ler_extrato(texto)
