"""Excluir uma categoria levando os lançamentos dela para outra (mover_para),
sem perder o histórico nem a soma dos relatórios por categoria.

Tudo pelo HTTP, com os repositórios em memória (conftest.py).
"""

import pytest

from tests.test_financeiro_api import entrar


@pytest.fixture
def ana(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-ana"))


def excluir(cliente, categoria_id, mover_para=None):
    parametros = {"mover_para": mover_para} if mover_para else None
    return cliente.api.delete(f"{cliente.base}/categorias/{categoria_id}", headers=cliente.cabecalho, params=parametros)


def nova_categoria(cliente, nome, tipo="DESPESA"):
    resposta = cliente.post("/categorias", {"nome": nome, "tipo": tipo})
    assert resposta.status_code == 201
    return resposta.json()["id"]


def test_sem_lancamentos_sai_direto(ana):
    pets = nova_categoria(ana, "Pets")

    assert excluir(ana, pets).status_code == 204
    assert ana.get(f"/categorias/{pets}").status_code == 404


def test_com_lancamentos_e_sem_destino_responde_409_com_a_quantidade(ana):
    conta = ana.criar_conta("Corrente", 50_000)
    ana.lancar("DESPESA", 1_000, conta, "Lazer")
    ana.lancar("DESPESA", 2_000, conta, "Lazer")

    resposta = excluir(ana, ana.categorias["Lazer"])

    assert resposta.status_code == 409
    assert resposta.json()["lancamentos"] == 2


def test_destino_recebe_os_lancamentos_e_a_categoria_sai(ana):
    conta = ana.criar_conta("Corrente", 50_000)
    ids = [ana.lancar("DESPESA", valor, conta, "Lazer").json()["id"] for valor in (1_000, 2_500)]

    resposta = excluir(ana, ana.categorias["Lazer"], ana.categorias["Mercado"])

    assert resposta.status_code == 200
    assert resposta.json() == {"lancamentos_movidos": 2}
    assert ana.get(f"/categorias/{ana.categorias['Lazer']}").status_code == 404
    for id in ids:
        lancamento = ana.get(f"/lancamentos/{id}").json()
        assert lancamento["categoria_id"] == ana.categorias["Mercado"]
        assert ana.categorias["Lazer"] not in [partida["categoria_id"] for partida in lancamento["partidas"]]
    # O relatório por categoria soma tudo no destino.
    relatorio = ana.get("/relatorios/categorias", params={"de": "2026-09", "ate": "2026-09"}).json()
    assert [(item["nome"], item["valor_centavos"]) for item in relatorio["categorias"]] == [("Mercado", 3_500)]


@pytest.mark.parametrize(
    ("destino", "mensagem"),
    [
        ("Salário", "Escolha uma categoria de despesa, como a que sai."),
        ("Lazer", "Escolha outra categoria: esta é a que sai."),
        ("inexistente", "Categoria de destino não encontrada."),
    ],
)
def test_destino_invalido_responde_400_sem_mexer_em_nada(ana, destino, mensagem):
    conta = ana.criar_conta("Corrente", 50_000)
    id = ana.lancar("DESPESA", 1_000, conta, "Lazer").json()["id"]
    alvo = ana.categorias.get(destino, "000000000000000000000000")

    resposta = excluir(ana, ana.categorias["Lazer"], alvo)

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"mover_para": mensagem}
    assert ana.get(f"/lancamentos/{id}").json()["categoria_id"] == ana.categorias["Lazer"]


def test_destino_desativado_e_recusado(ana):
    conta = ana.criar_conta("Corrente", 50_000)
    ana.lancar("DESPESA", 1_000, conta, "Lazer")
    ana.put(f"/categorias/{ana.categorias['Mercado']}", {"nome": "Mercado", "cor": "mercado", "ativa": False})

    resposta = excluir(ana, ana.categorias["Lazer"], ana.categorias["Mercado"])

    assert resposta.status_code == 400
    assert "desativada" in resposta.json()["campos"]["mover_para"]


def test_categoria_de_outro_espaco_nao_serve_de_destino(api, ana, cabecalho_do_cliente):
    bruno = entrar(api, cabecalho_do_cliente("uid-bruno"))
    conta = ana.criar_conta("Corrente", 50_000)
    ana.lancar("DESPESA", 1_000, conta, "Lazer")

    resposta = excluir(ana, ana.categorias["Lazer"], bruno.categorias["Mercado"])

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"mover_para": "Categoria de destino não encontrada."}
