"""Texto livre limpo na entrada (XSS, injeção de fórmula, caracteres
invisíveis) e operador do MongoDB barrado pelo tipo do campo.

Os caracteres invisíveis são montados com chr(): escritos no arquivo, eles
seriam justamente o problema que o teste confere.
"""

import pytest

from app.sanitizacao import limpar_texto
from tests.test_financeiro_api import entrar

INVERTE = chr(0x202E)
LARGURA_ZERO = chr(0x200B)
IGUAL_LARGO = chr(0xFF1D)


@pytest.mark.parametrize(
    ("entrada", "saida"),
    [
        ("<script>alert(1)</script>Mercado", "scriptalert(1)/scriptMercado"),
        ('=HYPERLINK("http://mal.example")', 'HYPERLINK("http://mal.example")'),
        ("+cmd|/c calc!A1", "cmd|/c calc!A1"),
        ("@SUM(A1)", "SUM(A1)"),
        (" - =2+3", "2+3"),
        (f"{IGUAL_LARGO}SUM(1)", "SUM(1)"),
        (f"Pix{INVERTE}abc", "Pixabc"),
        (f"Mer{LARGURA_ZERO}cado", "Mercado"),
        ("Linha\x00um\tdois\nfim", "Linha um dois fim"),
        ("  Padaria   São  João  ", "Padaria São João"),
        ("Uber *Viagem 12/03 - Centro", "Uber *Viagem 12/03 - Centro"),
    ],
)
def test_limpar_texto(entrada, saida):
    assert limpar_texto(entrada) == saida


@pytest.fixture
def ana(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-ana"))


def test_nome_da_conta_e_descricao_sao_gravados_limpos(ana):
    resposta = ana.post("/contas", {"nome": "=<img src=x onerror=alert(1)>Banco", "tipo": "CORRENTE"})
    assert resposta.status_code == 201
    assert resposta.json()["nome"] == "img src=x onerror=alert(1)Banco"

    conta_id = resposta.json()["id"]
    lancado = ana.lancar("DESPESA", 1500, conta_id, categoria="Mercado", descricao="@SUM(A1) <b>almoço</b>")
    assert lancado.status_code == 201
    assert lancado.json()["descricao"] == "SUM(A1) balmoço/b"


def test_texto_que_so_tem_o_que_sai_e_recusado(ana):
    resposta = ana.post("/contas", {"nome": " <> ", "tipo": "CORRENTE"})

    assert resposta.status_code == 400
    assert "nome" in resposta.json()["campos"]


def test_pessoa_do_racha_e_gravada_limpa(ana):
    conta_id = ana.criar_conta("Carteira", 10000, tipo="CARTEIRA")
    corpo = {
        "tipo": "DESPESA",
        "descricao": "Pizza",
        "data": "2026-09-19",
        "valor_centavos": 6000,
        "conta_id": conta_id,
        "categoria_id": ana.categorias["Lazer"],
        "divisao": [{"pessoa": "=Bruno<script>", "valor_centavos": 3000}],
    }
    resposta = ana.post("/lancamentos", corpo)

    assert resposta.status_code == 201
    assert resposta.json()["divisao"][0]["pessoa"] == "Brunoscript"


@pytest.mark.parametrize(
    "valor",
    [{"$ne": None}, {"$where": "sleep(1000)"}, ["$gt", ""], 123],
)
def test_operador_do_mongo_no_lugar_do_texto_e_recusado(ana, valor):
    """Injeção de operador (NoSQL injection): um objeto onde a API espera texto
    nunca vira filtro de consulta, porque o corpo é recusado antes (400)."""
    resposta = ana.post("/contas", {"nome": valor, "tipo": "CORRENTE"})

    assert resposta.status_code == 400
    assert "nome" in resposta.json()["campos"]


def test_operador_do_mongo_no_id_do_filtro_nao_acha_nada(ana):
    """Parâmetro de consulta chega como texto: "{"$ne": null}" é só um id que
    não existe, e não um operador."""
    resposta = ana.get('/lancamentos?conta_id={"$ne":null}')

    assert resposta.status_code in (200, 404)
    if resposta.status_code == 200:
        assert resposta.json() == []
