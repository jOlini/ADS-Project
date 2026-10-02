"""Modo Família do espaço pessoal: ligar e desligar, as pessoas da casa (nome
e cor, até o limite da assinatura), o nome novo levando os lançamentos junto e
os relatórios filtrados por pessoa.

Tudo pelo HTTP, com os repositórios em memória (conftest.py).
"""

import pytest

from app.financeiro.modelos import MAXIMO_DE_MEMBROS_DA_FAMILIA
from tests.test_financeiro_api import entrar


@pytest.fixture
def ana(api, cabecalho_do_cliente, assinar):
    # A divisão por pessoa e o Modo Família pedem o Plano Família.
    cliente = entrar(api, cabecalho_do_cliente("uid-ana"))
    assinar("uid-ana")
    return cliente


def incluir(cliente, nome, cor="azul"):
    return cliente.post("/familia/pessoas", {"nome": nome, "cor": cor})


def despesa(cliente, conta, valor, responsavel=None, data="2026-09-10", categoria="Mercado", divisao=None):
    corpo = {
        "tipo": "DESPESA",
        "descricao": "Compra",
        "data": data,
        "valor_centavos": valor,
        "conta_id": conta,
        "categoria_id": cliente.categorias[categoria],
    }
    if responsavel:
        corpo["responsavel"] = responsavel
    if divisao:
        corpo["divisao"] = divisao
    resposta = cliente.post("/lancamentos", corpo)
    assert resposta.status_code == 201, resposta.json()
    return resposta.json()["id"]


def familia(cliente):
    return cliente.get("/familia").json()


def test_o_pessoal_nasce_com_a_familia_desligada_e_vazia(ana):
    pessoal = ana.api.get("/espacos", headers=ana.cabecalho).json()[0]

    assert pessoal["familia"] == {"ativa": False, "pessoas": [], "maximo_de_pessoas": MAXIMO_DE_MEMBROS_DA_FAMILIA}
    assert familia(ana) == pessoal["familia"]


def test_liga_e_desliga_sem_perder_as_pessoas(ana):
    incluir(ana, "Bruno")

    ligada = ana.put("/familia", {"ativa": True})
    assert ligada.status_code == 200
    assert ligada.json()["ativa"] is True

    desligada = ana.put("/familia", {"ativa": False}).json()
    assert desligada["ativa"] is False
    assert [p["nome"] for p in desligada["pessoas"]] == ["Bruno"]
    assert ana.api.get("/espacos", headers=ana.cabecalho).json()[0]["familia"]["ativa"] is False


def test_inclui_pessoas_com_nome_e_cor(ana):
    resposta = incluir(ana, " <Léo> ", "coral")

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert (corpo["nome"], corpo["cor"]) == ("Léo", "coral")
    assert len(corpo["id"]) == 32
    assert familia(ana)["pessoas"] == [corpo]


@pytest.mark.parametrize(
    ("corpo", "campo"),
    [
        ({"nome": "Bruno"}, "cor"),
        ({"nome": "Bruno", "cor": "verde-limao"}, "cor"),
        ({"nome": "  ", "cor": "azul"}, "nome"),
        ({"nome": "x" * 61, "cor": "azul"}, "nome"),
        ({"nome": "Você", "cor": "azul"}, "nome"),
    ],
)
def test_nome_e_cor_sao_conferidos(ana, corpo, campo):
    resposta = ana.post("/familia/pessoas", corpo)

    assert resposta.status_code == 400
    assert campo in resposta.json()["campos"]


def test_nome_repetido_sem_acento_e_caixa_e_recusado(ana):
    incluir(ana, "Léo")

    resposta = incluir(ana, "  LEO ")

    assert resposta.status_code == 400
    assert resposta.json()["campos"]["nome"] == "Já existe uma pessoa com este nome na família."


def test_uma_assinatura_cobre_ate_o_limite_de_pessoas(ana):
    for numero in range(MAXIMO_DE_MEMBROS_DA_FAMILIA):
        assert incluir(ana, f"Pessoa {numero}").status_code == 201

    resposta = incluir(ana, "Mais uma")

    assert resposta.status_code == 409
    assert "assinatura" in resposta.json()["detail"]
    # Remover alguém libera a vaga.
    primeira = familia(ana)["pessoas"][0]["id"]
    assert ana.api.delete(f"{ana.base}/familia/pessoas/{primeira}", headers=ana.cabecalho).status_code == 204
    assert incluir(ana, "Agora cabe").status_code == 201


def test_nome_novo_leva_os_lancamentos_da_pessoa(ana):
    conta = ana.criar_conta("Corrente", 100_000)
    leo = incluir(ana, "Léo").json()["id"]
    # O responsável é sempre alguém da família: o Leonardo também é da casa.
    incluir(ana, "Leonardo")
    como_responsavel = despesa(ana, conta, 3_000, responsavel="leo")
    no_racha = despesa(ana, conta, 4_000, divisao=[{"pessoa": "LÉO", "valor_centavos": 1_000}])
    de_outro = despesa(ana, conta, 5_000, responsavel="Leonardo")

    resposta = ana.put(f"/familia/pessoas/{leo}", {"nome": "Leo Souza", "cor": "roxo"})

    assert resposta.status_code == 200
    assert resposta.json() | {"id": None} == {
        "id": None,
        "nome": "Leo Souza",
        "cor": "roxo",
        "lancamentos_renomeados": 2,
    }
    assert ana.get(f"/lancamentos/{como_responsavel}").json()["responsavel"] == "Leo Souza"
    assert ana.get(f"/lancamentos/{no_racha}").json()["divisao"][0]["pessoa"] == "Leo Souza"
    assert ana.get(f"/lancamentos/{de_outro}").json()["responsavel"] == "Leonardo"


def test_so_a_cor_nova_nao_mexe_nos_lancamentos(ana):
    leo = incluir(ana, "Léo").json()["id"]

    resposta = ana.put(f"/familia/pessoas/{leo}", {"nome": "Léo", "cor": "ambar"}).json()

    assert (resposta["cor"], resposta["lancamentos_renomeados"]) == ("ambar", 0)


def test_editar_para_o_nome_de_outra_pessoa_e_recusado(ana):
    incluir(ana, "Bruno")
    leo = incluir(ana, "Léo").json()["id"]

    assert ana.put(f"/familia/pessoas/{leo}", {"nome": "bruno", "cor": "azul"}).status_code == 400


def test_remover_mantem_os_lancamentos_com_o_nome(ana):
    conta = ana.criar_conta("Corrente", 100_000)
    bruno = incluir(ana, "Bruno").json()["id"]
    lancamento = despesa(ana, conta, 2_000, responsavel="Bruno")

    assert ana.api.delete(f"{ana.base}/familia/pessoas/{bruno}", headers=ana.cabecalho).status_code == 204

    assert familia(ana)["pessoas"] == []
    assert ana.get(f"/lancamentos/{lancamento}").json()["responsavel"] == "Bruno"
    assert ana.api.delete(f"{ana.base}/familia/pessoas/{bruno}", headers=ana.cabecalho).status_code == 404


def test_relatorios_filtram_por_pessoa_da_familia(ana):
    conta = ana.criar_conta("Corrente", 100_000)
    leo = incluir(ana, "Léo").json()["id"]
    despesa(ana, conta, 3_000, responsavel="leo")
    despesa(ana, conta, 2_000, responsavel="LÉO", categoria="Lazer")
    despesa(ana, conta, 7_000)
    incluir(ana, "Carla")
    despesa(ana, conta, 1_000, responsavel="Carla")
    periodo = "de=2026-09&ate=2026-09"

    def mensal(membro=""):
        filtro = f"&membro={membro}" if membro else ""
        return ana.get(f"/relatorios/mensal?{periodo}{filtro}").json()

    todos, do_leo, do_titular = mensal(), mensal(leo), mensal("titular")
    assert todos["meses"][0]["despesas_centavos"] == 13_000
    assert (do_leo["membro"], do_leo["meses"][0]["despesas_centavos"]) == (leo, 5_000)
    assert do_titular["meses"][0]["despesas_centavos"] == 7_000
    # O saldo é das contas, da casa inteira, com ou sem o filtro.
    assert do_leo["meses"][0]["saldo_final_centavos"] == todos["meses"][0]["saldo_final_centavos"] == 87_000

    categorias = ana.get(f"/relatorios/categorias?{periodo}&membro={leo}").json()
    assert categorias["total_centavos"] == 5_000
    assert {c["nome"]: c["valor_centavos"] for c in categorias["categorias"]} == {"Mercado": 3_000, "Lazer": 2_000}


def test_filtro_de_pessoa_desconhecida_e_recusado(ana):
    resposta = ana.get("/relatorios/mensal?membro=ninguem")

    assert resposta.status_code == 400
    assert resposta.json()["campos"]["membro"] == "Pessoa da família não encontrada."


def test_familia_e_so_do_espaco_pessoal(ana, assinar):
    # A empresa pede o Empresarial, que inclui o Família.
    assinar("uid-ana", "EMPRESARIAL")
    empresa = ana.api.post("/espacos", headers=ana.cabecalho, json={"tipo": "PJ", "nome": "Oficina"}).json()["id"]
    base = f"/espacos/{empresa}"

    assert ana.api.get(f"{base}/familia", headers=ana.cabecalho).status_code == 404
    assert ana.api.put(f"{base}/familia", headers=ana.cabecalho, json={"ativa": True}).status_code == 404
    assert (
        ana.api.post(f"{base}/familia/pessoas", headers=ana.cabecalho, json={"nome": "Bruno", "cor": "azul"}).status_code
        == 404
    )
    assert ana.api.get(f"{base}/relatorios/mensal?membro=titular", headers=ana.cabecalho).status_code == 400
    assert ana.api.get(base, headers=ana.cabecalho).json()["familia"] is None


def test_familia_de_outra_pessoa_nao_se_ve(ana, cabecalho_do_cliente, api):
    incluir(ana, "Léo")
    bruno = cabecalho_do_cliente("uid-bruno")

    assert api.get(f"{ana.base}/familia", headers=bruno).status_code == 404
    assert api.post(f"{ana.base}/familia/pessoas", headers=bruno, json={"nome": "X", "cor": "azul"}).status_code == 404
