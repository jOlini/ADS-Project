"""Categoria automática das linhas importadas (coluna do arquivo, histórico do
estabelecimento, regras pela descrição, padrão), a edição de descrição e
categoria na conferência e o teto de importações ao mesmo tempo.
"""

from datetime import UTC, datetime

import pytest

from app.financeiro import rotas
from app.financeiro.categorizacao import (
    ARQUIVO,
    HISTORICO,
    PADRAO,
    REGRA,
    Categorizador,
    assunto_da_descricao,
    chave_do_estabelecimento,
)
from app.financeiro.modelos import Categoria, CorCategoria, TipoCategoria
from tests.test_financeiro_api import entrar

DESPESA, RECEITA = TipoCategoria.DESPESA, TipoCategoria.RECEITA


def categoria(id, nome, tipo=DESPESA, ativa=True):
    return Categoria(
        espaco_id="e1", nome=nome, tipo=tipo, cor=CorCategoria.NEUTRO, ativa=ativa, criada_em=datetime.now(UTC), id=id
    )


CATEGORIAS = [
    categoria("mercado", "Mercado"),
    categoria("transporte", "Transporte"),
    categoria("contas", "Contas da casa"),
    categoria("saude", "Saúde"),
    categoria("lazer", "Lazer"),
    categoria("moradia", "Moradia"),
    categoria("outras", "Outras despesas"),
    categoria("salario", "Salário", RECEITA),
    categoria("extra", "Receita extra", RECEITA),
    categoria("outras-receitas", "Outras receitas", RECEITA),
]
POR_ID = {item.id: item for item in CATEGORIAS}


def categorizar(descricao, tipo=DESPESA, coluna=None, categorias=CATEGORIAS, historico=()):
    padrao = POR_ID["outras" if tipo == DESPESA else "outras-receitas"]
    escolhida, origem = Categorizador(categorias, historico).categorizar(descricao, tipo, coluna, padrao)
    return escolhida.id, origem


# --- Regras pela descrição --------------------------------------------------------


@pytest.mark.parametrize(
    ("descricao", "esperada"),
    [
        ("UBER *TRIP HELP.UBER.COM", "transporte"),
        ("AUTO POSTO PETROBRAS 12/09", "transporte"),
        ("99 APP *99 TECNOLOGIA", "transporte"),
        ("SUPERMERCADO BOM PRECO", "mercado"),
        ("PAO DE ACUCAR 1234", "mercado"),
        ("DROGASIL 0123", "saude"),
        ("Compra no débito - Droga Raia", "saude"),
        ("ENEL DISTRIBUICAO SP", "contas"),
        ("SABESP CONTA DE AGUA", "contas"),
        ("NETFLIX.COM", "lazer"),
        ("SPOTIFY BRASIL", "lazer"),
        ("ALUGUEL SETEMBRO", "moradia"),
        # Sem categoria de alimentação, o delivery vai para o Mercado.
        ("IFOOD *RESTAURANTE", "mercado"),
    ],
)
def test_regras_apontam_a_categoria_pelo_nome(descricao, esperada):
    assert categorizar(descricao) == (esperada, REGRA)


def test_categoria_de_alimentacao_da_pessoa_vence_a_do_app():
    categorias = [*CATEGORIAS, categoria("alimentacao", "Alimentação")]

    assert categorizar("IFOOD *PIZZARIA DO ZE", categorias=categorias) == ("alimentacao", REGRA)


@pytest.mark.parametrize(
    ("descricao", "esperada"),
    [
        ("SALARIO ACME LTDA", "salario"),
        ("PAGTO SALARIO", "salario"),
        ("REEMBOLSO DESPESAS", "extra"),
        ("CASHBACK", "extra"),
    ],
)
def test_regras_das_entradas(descricao, esperada):
    assert categorizar(descricao, RECEITA) == (esperada, REGRA)


def test_expressao_mais_longa_vence():
    # "Mercado Livre" é loja, não mercado; "Mercado Pago" é carteira, sem pista.
    assert assunto_da_descricao("MERCADO LIVRE *LOJA", DESPESA).categorias[0] == "compras"
    assert categorizar("MERCADOPAGO*MERCADO LIVRE") != ("mercado", REGRA)
    assert categorizar("MERCADO PAGO *PAGAMENTO") == ("outras", PADRAO)


def test_regra_so_vale_para_o_tipo_da_linha():
    # "Salário" numa saída (devolução ao empregador?) não é receita.
    assert categorizar("ESTORNO SALARIO", DESPESA) == ("outras", PADRAO)


def test_sem_pista_fica_a_padrao():
    assert categorizar("TRANSFERENCIA ENVIADA JOAO") == ("outras", PADRAO)


def test_categoria_desativada_nao_recebe():
    categorias = [c if c.id != "transporte" else categoria("transporte", "Transporte", ativa=False) for c in CATEGORIAS]

    assert categorizar("UBER *TRIP", categorias=categorias) == ("outras", PADRAO)


# --- Coluna do arquivo e histórico ------------------------------------------------


def test_coluna_do_arquivo_vence_tudo():
    assert categorizar("UBER *TRIP", coluna="lazer") == ("lazer", ARQUIVO)


def test_estabelecimento_conhecido_volta_para_a_categoria_de_sempre():
    historico = [
        ("PADARIA DOCE PAO 01/09", DESPESA, "lazer"),
        ("Padaria Doce Pão", DESPESA, "lazer"),
        ("COMPRA CARTAO DEB PADARIA DOCE PAO", DESPESA, "lazer"),
    ]

    assert categorizar("PADARIA DOCE PAO 12/09", historico=historico) == ("lazer", HISTORICO)


def test_historico_dividido_nao_decide():
    historico = [("OFICINA DO ZE", DESPESA, "lazer"), ("OFICINA DO ZE", DESPESA, "transporte")]

    # 50% em cada: fica a regra ("oficina" é transporte).
    assert categorizar("OFICINA DO ZE", historico=historico) == ("transporte", REGRA)


def test_categoria_padrao_no_historico_nao_ensina():
    # Linhas que caíram na padrão por falta de pista não travam a regra.
    historico = [("UBER TRIP", DESPESA, "outras")] * 3

    assert categorizar("UBER TRIP", historico=historico) == ("transporte", REGRA)


@pytest.mark.parametrize(
    ("descricao", "chave"),
    [
        ("COMPRA CARTAO DEB MC PADARIA DOCE PAO 12/09", "padaria doce pao"),
        ("Padaria Doce Pão", "padaria doce pao"),
        ("PIX ENVIADO - ANA SOUZA", "ana souza"),
        ("LOJA EXEMPLO 03/12", "loja exemplo"),
    ],
)
def test_chave_do_estabelecimento(descricao, chave):
    assert chave_do_estabelecimento(descricao) == chave


# --- Pela API: categoria automática, ajustes e teto --------------------------------


@pytest.fixture
def ana(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-ana"))


EXTRATO = "Data;Descrição;Valor\n01/09/2026;UBER *TRIP;-23,90\n02/09/2026;Loja do Bairro;-50,00\n03/09/2026;SALARIO ACME;5.000,00\n"


def importar(cliente, conta_id, csv=EXTRATO, **extras):
    corpo = {
        "conta_id": conta_id,
        "categoria_despesa_id": cliente.categorias["Outras despesas"],
        "categoria_receita_id": cliente.categorias["Outras receitas"],
        "csv": csv,
        **extras,
    }
    return cliente.post("/importacoes", corpo)


def test_simulacao_traz_a_categoria_e_a_origem(ana):
    corpo = importar(ana, ana.criar_conta("Corrente"), simular=True).json()

    linhas = [(linha["descricao"], linha["categoria_id"], linha["origem_da_categoria"]) for linha in corpo["linhas"]]
    assert linhas == [
        ("UBER *TRIP", ana.categorias["Transporte"], "REGRA"),
        ("Loja do Bairro", ana.categorias["Outras despesas"], "PADRAO"),
        ("SALARIO ACME", ana.categorias["Salário"], "REGRA"),
    ]


def test_categoria_escolhida_antes_ensina_a_proxima_importacao(ana):
    conta = ana.criar_conta("Corrente")
    ana.lancar("DESPESA", 5000, conta, categoria="Lazer", descricao="Loja do Bairro", data="2026-08-01")
    ana.lancar("DESPESA", 3000, conta, categoria="Lazer", descricao="LOJA DO BAIRRO 15/08", data="2026-08-15")

    corpo = importar(ana, conta, simular=True).json()

    assert (corpo["linhas"][1]["categoria_id"], corpo["linhas"][1]["origem_da_categoria"]) == (
        ana.categorias["Lazer"],
        "HISTORICO",
    )


def test_ajustes_trocam_descricao_e_categoria_sem_mudar_a_chave(ana):
    conta = ana.criar_conta("Corrente")
    ajustes = {"3": {"descricao": " =Mercadinho <b>do Zé</b> ", "categoria_id": ana.categorias["Mercado"]}}

    simulado = importar(ana, conta, simular=True, ajustes=ajustes).json()
    assert (simulado["linhas"][1]["descricao"], simulado["linhas"][1]["origem_da_categoria"]) == (
        "Mercadinho bdo Zé/b",
        "AJUSTE",
    )

    corpo = importar(ana, conta, ajustes=ajustes).json()
    loja = ana.get(f"/lancamentos/{corpo['linhas'][1]['lancamento_id']}").json()
    assert (loja["descricao"], loja["categoria_id"]) == ("Mercadinho bdo Zé/b", ana.categorias["Mercado"])

    # O mesmo arquivo, sem os ajustes: a linha editada já está lá.
    de_novo = importar(ana, conta).json()
    assert (de_novo["importadas"], de_novo["ja_importadas"]) == (0, 3)


@pytest.mark.parametrize(
    ("categoria_id", "mensagem"),
    [
        ("nao-existe", "Categoria não encontrada ou desativada."),
        (None, "Saída vai numa categoria de despesa, e entrada, numa de receita."),
    ],
)
def test_ajuste_com_categoria_errada_aponta_a_linha(ana, categoria_id, mensagem):
    conta = ana.criar_conta("Corrente")
    escolhida = categoria_id or ana.categorias["Salário"]

    resposta = importar(ana, conta, simular=True, ajustes={"2": {"categoria_id": escolhida}})

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"ajustes.2.categoria_id": mensagem}


def test_estrutura_diz_de_onde_vieram_as_colunas(ana):
    corpo = ana.post("/importacoes/estrutura", {"csv": EXTRATO}).json()

    assert (corpo["origem"], corpo["duvidas"]) == ("CABECALHO", [])


def test_arquivo_que_nao_e_csv_volta_400_no_campo_do_arquivo(ana):
    resposta = ana.post("/importacoes/estrutura", {"csv": "%PDF-1.7 extrato"})

    assert resposta.status_code == 400
    assert "PDF" in resposta.json()["campos"]["csv"]


def test_sem_vaga_para_importar_responde_503(ana, monkeypatch):
    monkeypatch.setattr(rotas, "ESPERA_POR_VAGA", 0.01)
    tomadas = 0
    while rotas._vagas_de_importacao.acquire(blocking=False):
        tomadas += 1
    try:
        resposta = ana.post("/importacoes/estrutura", {"csv": EXTRATO})
    finally:
        for _ in range(tomadas):
            rotas._vagas_de_importacao.release()

    assert tomadas == rotas.IMPORTACOES_AO_MESMO_TEMPO
    assert resposta.status_code == 503
    assert resposta.headers["Retry-After"]
    assert ana.post("/importacoes/estrutura", {"csv": EXTRATO}).status_code == 200
