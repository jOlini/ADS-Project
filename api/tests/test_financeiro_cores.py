"""Cores livres em hexadecimal (#rrggbb) nas categorias, nas contas e nos
cartões, ao lado dos nomes da paleta, que continuam valendo. Só o formato
exato passa: a cor vai para o CSS da tela.

Tudo pelo HTTP, com os repositórios em memória (conftest.py).
"""

import pytest

from app.financeiro.modelos import CorCategoria, CorDoCartao, ler_cor, texto_da_cor
from tests.test_financeiro_api import entrar
from tests.test_financeiro_cartoes import criar_cartao


@pytest.fixture
def ana(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-ana"))


def categoria(cliente, cor, nome="Pets"):
    return cliente.post("/categorias", {"nome": nome, "tipo": "DESPESA", "cor": cor})


def test_categoria_aceita_hexadecimal_e_grava_em_minusculas(ana):
    resposta = categoria(ana, "#1A2B3C")

    assert resposta.status_code == 201
    assert resposta.json()["cor"] == "#1a2b3c"
    assert ana.get(f"/categorias/{resposta.json()['id']}").json()["cor"] == "#1a2b3c"


def test_categoria_continua_aceitando_a_paleta(ana):
    assert categoria(ana, "lazer").json()["cor"] == "lazer"


@pytest.mark.parametrize("cor", ["#12345", "#1234567", "#GGGGGG", "red", "1a2b3c", "url(x)", "#12345;color:red"])
def test_cor_fora_do_formato_e_recusada(ana, cor):
    resposta = categoria(ana, cor)

    assert resposta.status_code == 400
    assert "cor" in resposta.json()["campos"]


def test_recolorir_categoria_com_hexadecimal(ana):
    criada = categoria(ana, "neutro").json()

    resposta = ana.put(f"/categorias/{criada['id']}", {"nome": "Pets", "cor": "#00aa88", "ativa": True})

    assert resposta.status_code == 200
    assert resposta.json()["cor"] == "#00aa88"


def test_conta_e_cartao_aceitam_hexadecimal(ana):
    conta = ana.post("/contas", {"nome": "Banco", "tipo": "CORRENTE", "cor": "#820AD1"}).json()
    cartao_id = criar_cartao(ana)["id"]
    cartao = ana.get(f"/contas/{cartao_id}").json()

    editado = ana.put(
        f"/contas/{cartao_id}",
        {
            "nome": cartao["nome"],
            "tipo": "CARTAO_CREDITO",
            "ativa": True,
            "limite_centavos": cartao["limite_centavos"],
            "dia_fechamento": cartao["dia_fechamento"],
            "dia_vencimento": cartao["dia_vencimento"],
            "cor": "#FF7A00",
        },
    ).json()

    assert conta["cor"] == "#820ad1"
    assert editado["cor"] == "#ff7a00"
    assert next(c for c in ana.get("/cartoes").json() if c["id"] == cartao_id)["cor"] == "#ff7a00"


def test_cor_gravada_estragada_volta_a_padrao():
    assert ler_cor("#ABCDEF", CorCategoria, CorCategoria.NEUTRO) == "#abcdef"
    assert ler_cor("lazer", CorCategoria, CorCategoria.NEUTRO) is CorCategoria.LAZER
    assert ler_cor("<script>", CorCategoria, CorCategoria.NEUTRO) is CorCategoria.NEUTRO
    assert ler_cor(None, CorDoCartao, None) is None
    assert texto_da_cor(CorDoCartao.ROXO) == "roxo"
    assert texto_da_cor("#123456") == "#123456"
