"""Compras parceladas na fatura importada: número da parcela na descrição,
data da parcela conforme o banco, parcelas vincendas geradas e a parcela já
lançada reconhecida quando a fatura seguinte chega.

As funções puras (parcelamento.py) usam datas fixas; os testes pelo HTTP
partem de hoje no fuso do espaço, como a API.
"""

from dataclasses import replace
from datetime import date, timedelta

import pytest

from app.financeiro import cartoes, parcelamento
from app.financeiro.parcelamento import ParcelaNaDescricao, parcela_na_descricao
from tests.test_financeiro_api import entrar
from tests.test_financeiro_cartoes import INSTANTE, cartao, compra, criar_cartao, hoje, referencia_texto

# --- Número da parcela na descrição -----------------------------------------------


@pytest.mark.parametrize(
    ("descricao", "base", "numero", "total"),
    [
        ("LOJA X 03/12", "LOJA X", 3, 12),
        ("Loja X - Parcela 1/12", "Loja X", 1, 12),
        ("Loja (Parcela 2 de 5)", "Loja", 2, 5),
        ("MAGAZINE PARC 04/10", "MAGAZINE", 4, 10),
        ("Curso online 12/12", "Curso online", 12, 12),
    ],
)
def test_le_a_parcela_no_fim_da_descricao(descricao, base, numero, total):
    parcela = parcela_na_descricao(descricao)

    assert (parcela.base, parcela.numero, parcela.total) == (base, numero, total)


@pytest.mark.parametrize("descricao", ["Uber 15/09", "Loja 101/12", "1/12", "Loja 3/60", "Padaria", "Parcela 0/3"])
def test_texto_que_nao_e_parcela(descricao):
    assert parcela_na_descricao(descricao) is None


def test_descricao_da_parcela_seguinte_no_mesmo_formato():
    assert parcelamento.descricao_da_parcela("LOJA X 03/12", parcela_na_descricao("LOJA X 03/12"), 4) == "LOJA X 04/12"
    nove = parcela_na_descricao("Loja - Parcela 9/12")
    assert parcelamento.descricao_da_parcela("Loja - Parcela 9/12", nove, 10) == "Loja - Parcela 10/12"


# --- Data da parcela conforme o banco -----------------------------------------------


def test_arquivo_com_a_data_do_lancamento_nao_muda_a_parcela_de_lugar():
    visa = cartao(fechamento=3, vencimento=10)
    linhas = [
        (date(2026, 9, 10), None),
        (date(2026, 9, 20), None),
        (date(2026, 9, 15), parcela_na_descricao("LOJA 03/10")),
    ]

    assert parcelamento.posicionar(visa, linhas) == [date(2026, 9, 10), date(2026, 9, 20), date(2026, 9, 15)]


def test_arquivo_com_a_data_da_compra_leva_a_parcela_para_a_fatura_do_arquivo():
    visa = cartao(fechamento=3, vencimento=10)
    linhas = [
        (date(2026, 9, 10), None),
        (date(2026, 9, 20), None),
        # Compra de 15/07 (fatura de agosto): a 3ª parcela é da fatura de outubro.
        (date(2026, 7, 15), parcela_na_descricao("LOJA 03/10")),
    ]

    datas = parcelamento.posicionar(visa, linhas)

    assert datas == [date(2026, 9, 10), date(2026, 9, 20), date(2026, 9, 15)]
    assert {cartoes.referencia_da_data(visa, data) for data in datas} == {(2026, 10)}


# --- Compras parceladas do cartão ---------------------------------------------------


def parcela_gerada(numero, data, compra_id="compra-1", valor=3_000, total=3, chave_importacao=None):
    return replace(
        compra(valor, data),
        id=f"parcela-{numero}",
        descricao=f"LOJA X {numero:02d}/{total:02d}",
        compra_id=compra_id,
        parcela=numero,
        parcelas=total,
        chave_parcelamento="loja x",
        chave_importacao=chave_importacao,
    )


def test_linha_nova_gera_as_parcelas_vincendas():
    visa = cartao(fechamento=3, vencimento=10)
    compras = parcelamento.Parcelamentos(visa, [])

    plano = compras.planejar(parcela_na_descricao("LOJA X 01/03"), date(2026, 9, 10), 3_000)

    assert plano.prevista is None
    assert plano.futuras == [(2, date(2026, 10, 10)), (3, date(2026, 11, 10))]
    assert plano.chave == "loja x"


def test_linha_da_fatura_seguinte_acha_a_parcela_gerada():
    visa = cartao(fechamento=3, vencimento=10)
    existentes = [
        parcela_gerada(1, date(2026, 9, 10), chave_importacao="chave-1"),
        parcela_gerada(2, date(2026, 10, 10)),
        parcela_gerada(3, date(2026, 11, 10)),
    ]
    compras = parcelamento.Parcelamentos(visa, existentes)

    plano = compras.planejar(parcela_na_descricao("LOJA X 02/03"), date(2026, 10, 12), 3_000)

    assert plano.compra_id == "compra-1"
    assert plano.prevista.lancamento_id == "parcela-2"
    assert plano.futuras == []


def test_parcela_ja_confirmada_e_outra_compra_igual():
    visa = cartao(fechamento=3, vencimento=10)
    existentes = [parcela_gerada(1, date(2026, 9, 10), chave_importacao="chave-1")]
    compras = parcelamento.Parcelamentos(visa, existentes)

    plano = compras.planejar(parcela_na_descricao("LOJA X 01/03"), date(2026, 9, 11), 3_000)

    assert plano.compra_id != "compra-1"
    assert plano.prevista is None
    assert [numero for numero, _ in plano.futuras] == [2, 3]


def test_fatura_antiga_importada_depois_completa_a_compra_sem_duplicar():
    visa = cartao(fechamento=3, vencimento=10)
    # A fatura de outubro chegou primeiro: parcela 2 importada, a 3 gerada.
    existentes = [
        parcela_gerada(2, date(2026, 10, 10), chave_importacao="chave-2"),
        parcela_gerada(3, date(2026, 11, 10)),
    ]
    compras = parcelamento.Parcelamentos(visa, existentes)

    plano = compras.planejar(parcela_na_descricao("LOJA X 01/03"), date(2026, 9, 10), 3_000)

    assert plano.compra_id == "compra-1"
    assert plano.prevista is None
    assert plano.futuras == []


def test_mesmo_valor_em_fatura_incoerente_e_outra_compra():
    visa = cartao(fechamento=3, vencimento=10)
    existentes = [parcela_gerada(2, date(2026, 12, 10))]
    compras = parcelamento.Parcelamentos(visa, existentes)

    plano = compras.planejar(parcela_na_descricao("LOJA X 02/03"), date(2026, 10, 12), 3_000)

    assert plano.compra_id != "compra-1"


# --- Pelo HTTP ------------------------------------------------------------------------


@pytest.fixture
def ana(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-ana"))


def importar(cliente, cartao_id, linhas, simular=False):
    """Fatura no formato date,title,amount (a compra vem positiva)."""
    csv = "date,title,amount\n" + "".join(f"{data.isoformat()},{titulo},{valor}\n" for data, titulo, valor in linhas)
    resposta = cliente.post(
        "/importacoes",
        {
            "conta_id": cartao_id,
            "categoria_despesa_id": cliente.categorias["Outras despesas"],
            "categoria_receita_id": cliente.categorias["Outras receitas"],
            "csv": csv,
            "simular": simular,
        },
    )
    assert resposta.status_code == 200, resposta.json()
    return resposta.json()


def conta_modelo(dados):
    return replace(cartao(dados["dia_fechamento"], dados["dia_vencimento"]), id=dados["id"], criada_em=INSTANTE)


def dia_da_fatura(modelo, referencia, dias=1):
    return cartoes.periodo_da_fatura(modelo, referencia).inicio + timedelta(days=dias)


def test_importa_compra_parcelada_e_gera_as_parcelas_das_proximas_faturas(ana):
    visa = criar_cartao(ana)
    modelo = conta_modelo(visa)
    atual = cartoes.referencia_da_data(modelo, hoje())
    data = dia_da_fatura(modelo, atual)

    linhas = [(data, "LOJA X 01/03", "30.00"), (data, "Padaria", "10.00")]
    previa = importar(ana, visa["id"], linhas, simular=True)
    assert (previa["novas"], previa["parcelas_futuras"]) == (2, 2)
    assert ana.get("/lancamentos", params={"conta_id": visa["id"]}).json() == []

    resposta = importar(ana, visa["id"], linhas)

    assert (resposta["importadas"], resposta["parcelas_futuras"]) == (2, 2)
    linha = resposta["linhas"][0]
    assert linha["fatura"] == referencia_texto(atual)
    assert linha["observacao"] == "Parcela 1 de 3. As parcelas 2 e 3 entram nas próximas faturas."
    no_cartao = ana.get("/lancamentos", params={"conta_id": visa["id"]}).json()
    parcelas = sorted((l for l in no_cartao if l["compra_id"]), key=lambda l: l["parcela"])
    assert [(l["descricao"], l["parcela"], l["parcelas"]) for l in parcelas] == [
        ("LOJA X 01/03", 1, 3),
        ("LOJA X 02/03", 2, 3),
        ("LOJA X 03/03", 3, 3),
    ]
    painel = ana.get(f"/cartoes/{visa['id']}").json()
    assert (painel["fatura_atual_centavos"], painel["parcelamentos_futuros_centavos"]) == (4_000, 6_000)


def test_fatura_seguinte_confirma_a_parcela_sem_duplicar(ana):
    visa = criar_cartao(ana)
    modelo = conta_modelo(visa)
    atual = cartoes.referencia_da_data(modelo, hoje())
    importar(ana, visa["id"], [(dia_da_fatura(modelo, atual), "LOJA X 01/03", "30.00")])
    seguinte = [(dia_da_fatura(modelo, cartoes.somar_meses(atual, 1), 2), "LOJA X 02/03", "30.00")]

    primeira = importar(ana, visa["id"], seguinte)
    de_novo = importar(ana, visa["id"], seguinte)

    assert (primeira["importadas"], primeira["ja_importadas"], primeira["parcelas_futuras"]) == (0, 1, 0)
    assert primeira["linhas"][0]["observacao"] == "Parcela 2 de 3 já estava na fatura, lançada pelo parcelamento."
    assert (de_novo["ja_importadas"], de_novo["linhas"][0]["observacao"]) == (1, None)
    no_cartao = ana.get("/lancamentos", params={"conta_id": visa["id"]}).json()
    assert len(no_cartao) == 3
    assert ana.get(f"/cartoes/{visa['id']}").json()["usado_centavos"] == 9_000


def test_parcela_com_a_data_da_compra_entra_na_fatura_do_arquivo(ana):
    visa = criar_cartao(ana)
    modelo = conta_modelo(visa)
    atual = cartoes.referencia_da_data(modelo, hoje())
    na_atual = dia_da_fatura(modelo, atual, 3)
    # O banco repete o dia da compra (duas faturas antes) na 3ª parcela.
    da_compra = dia_da_fatura(modelo, cartoes.somar_meses(atual, -2), 3)

    resposta = importar(
        ana,
        visa["id"],
        [(na_atual, "Padaria", "10.00"), (na_atual, "Farmácia", "20.00"), (da_compra, "LOJA Y 03/04", "50.00")],
    )

    assert {linha["fatura"] for linha in resposta["linhas"]} == {referencia_texto(atual)}
    assert resposta["parcelas_futuras"] == 1
    assert ana.get(f"/cartoes/{visa['id']}").json()["fatura_atual_centavos"] == 8_000


def test_credito_com_numero_no_fim_nao_vira_parcela(ana):
    visa = criar_cartao(ana)
    modelo = conta_modelo(visa)
    data = dia_da_fatura(modelo, cartoes.referencia_da_data(modelo, hoje()))

    resposta = importar(ana, visa["id"], [(data, "Estorno LOJA 01/03", "-30.00")])

    assert (resposta["importadas"], resposta["parcelas_futuras"]) == (1, 0)
    assert resposta["linhas"][0]["observacao"] is None


def test_conta_comum_nao_gera_parcelas(ana):
    conta_id = ana.criar_conta("Banco", 100_000)
    csv = "Data;Descrição;Valor\n10/09/2026;LOJA X 01/03;-30,00\n"

    resposta = ana.post(
        "/importacoes",
        {
            "conta_id": conta_id,
            "categoria_despesa_id": ana.categorias["Outras despesas"],
            "categoria_receita_id": ana.categorias["Outras receitas"],
            "csv": csv,
        },
    ).json()

    assert (resposta["importadas"], resposta["parcelas_futuras"]) == (1, 0)
    assert resposta["linhas"][0]["fatura"] is None
    assert ana.get("/lancamentos").json()[0]["compra_id"] is None


def test_parcela_na_descricao_dataclass():
    assert parcela_na_descricao("LOJA 03/12") == ParcelaNaDescricao("LOJA", 3, 12, 5, 7)
