"""Pessoa responsável por um lançamento: quem gastou (ou de quem é a receita),
com o valor inteiro, sem precisar da divisão entre pessoas. Desde a rodada de
refinos, é sempre uma pessoa da família, e só no Plano Família (ou no
Empresarial): um nome qualquer separaria o gasto por pessoa sem o plano.

Tudo pelo HTTP, com os repositórios em memória (conftest.py).
"""

import pytest

from app.financeiro import regras, servicos
from tests.test_financeiro_api import entrar
from tests.test_financeiro_cartoes import criar_cartao, hoje


@pytest.fixture
def ana(api, cabecalho_do_cliente, assinar):
    # O responsável pede o Plano Família e as pessoas da casa cadastradas.
    cliente = entrar(api, cabecalho_do_cliente("uid-ana"))
    assinar("uid-ana")
    for nome, cor in (("Bruno", "azul"), ("Carla", "coral"), ("Léo", "roxo")):
        assert cliente.post("/familia/pessoas", {"nome": nome, "cor": cor}).status_code == 201
    return cliente


@pytest.fixture
def bruno(api, cabecalho_do_cliente):
    # Recém-chegado: Free, sem família.
    return entrar(api, cabecalho_do_cliente("uid-bruno"))


def despesa(cliente, conta_id, responsavel=None, valor=5_000, **extras):
    corpo = {
        "tipo": "DESPESA",
        "descricao": "Farmácia",
        "data": "2026-09-19",
        "valor_centavos": valor,
        "conta_id": conta_id,
        "categoria_id": cliente.categorias["Saúde"],
        **extras,
    }
    if responsavel is not None:
        corpo["responsavel"] = responsavel
    return cliente.post("/lancamentos", corpo)


def editar(cliente, id, corpo):
    return cliente.api.patch(f"{cliente.base}/lancamentos/{id}", headers=cliente.cabecalho, json=corpo)


def test_despesa_guarda_o_responsavel_da_familia_sem_divisao(ana):
    resposta = despesa(ana, ana.criar_conta("Corrente", 10_000), responsavel="  Bruno ")

    corpo = resposta.json()
    assert resposta.status_code == 201
    assert (corpo["responsavel"], corpo["divisao"]) == ("Bruno", [])
    assert ana.get(f"/lancamentos/{corpo['id']}").json()["responsavel"] == "Bruno"


def test_responsavel_sai_com_o_nome_cadastrado_na_familia(ana):
    resposta = despesa(ana, ana.criar_conta("Corrente", 10_000), responsavel="LEO")

    assert resposta.json()["responsavel"] == "Léo"


def test_sem_responsavel_o_lancamento_e_de_quem_lancou(ana):
    corpo = despesa(ana, ana.criar_conta("Corrente")).json()

    assert corpo["responsavel"] is None


def test_nome_de_fora_da_familia_e_recusado(ana):
    resposta = despesa(ana, ana.criar_conta("Corrente"), responsavel="Diego")

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"responsavel": servicos.RESPONSAVEL_FORA_DA_FAMILIA}


def test_no_free_o_responsavel_e_recusado_mesmo_burlando_a_tela(bruno):
    resposta = despesa(bruno, bruno.criar_conta("Corrente"), responsavel="Carla")

    assert resposta.status_code == 403
    assert resposta.json()["detail"] == servicos.RESPONSAVEL_SO_NO_FAMILIA


def test_na_empresa_nao_ha_responsavel(api, ana):
    empresa = api.post("/espacos", headers=ana.cabecalho, json={"tipo": "PJ", "nome": "Oficina"}).json()["id"]
    base = f"/espacos/{empresa}"
    conta = api.post(f"{base}/contas", headers=ana.cabecalho, json={"nome": "PJ", "tipo": "CORRENTE"}).json()["id"]
    categoria = next(c["id"] for c in api.get(f"{base}/categorias", headers=ana.cabecalho).json() if c["tipo"] == "DESPESA")

    resposta = api.post(
        f"{base}/lancamentos",
        headers=ana.cabecalho,
        json={
            "tipo": "DESPESA",
            "descricao": "Material",
            "data": "2026-09-19",
            "valor_centavos": 1_000,
            "conta_id": conta,
            "categoria_id": categoria,
            "responsavel": "Bruno",
        },
    )

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"responsavel": servicos.RESPONSAVEL_NA_EMPRESA}


def test_responsavel_passa_pela_limpeza_do_texto_livre(ana):
    conta = ana.criar_conta("Corrente")

    limpo = despesa(ana, conta, responsavel="<Carla>")
    vazio = despesa(ana, conta, responsavel="<>")
    longo = despesa(ana, conta, responsavel="x" * 61)

    assert limpo.json()["responsavel"] == "Carla"
    assert (vazio.status_code, longo.status_code) == (400, 400)
    assert set(vazio.json()["campos"]) == {"responsavel"}


def test_transferencia_nao_tem_responsavel(ana):
    origem = ana.criar_conta("Corrente", 10_000)
    destino = ana.criar_conta("Poupança")

    resposta = ana.post(
        "/lancamentos",
        {
            "tipo": "TRANSFERENCIA",
            "descricao": "Guardar",
            "data": "2026-09-19",
            "valor_centavos": 1_000,
            "conta_id": origem,
            "conta_destino_id": destino,
            "responsavel": "Bruno",
        },
    )

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"responsavel": regras.TRANSFERENCIA_SEM_RESPONSAVEL}


def test_edicao_troca_e_tira_o_responsavel(ana):
    id = despesa(ana, ana.criar_conta("Corrente", 10_000), responsavel="Bruno").json()["id"]

    trocado = editar(ana, id, {"responsavel": "carla"})
    de_fora = editar(ana, id, {"responsavel": "Diego"})
    tirado = editar(ana, id, {"responsavel": None})

    assert trocado.json()["responsavel"] == "Carla"
    assert de_fora.status_code == 400
    assert tirado.status_code == 200
    assert tirado.json()["responsavel"] is None
    assert ana.saldos() == {"Corrente": 5_000}


def test_edicao_da_transferencia_recusa_responsavel(ana):
    origem = ana.criar_conta("Corrente", 10_000)
    id = ana.lancar("TRANSFERENCIA", 1_000, origem, destino=ana.criar_conta("Poupança")).json()["id"]

    resposta = editar(ana, id, {"responsavel": "Bruno"})

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"responsavel": regras.TRANSFERENCIA_SEM_RESPONSAVEL}


def test_estorno_leva_o_responsavel_e_ainda_aceita_trocar(ana):
    original = despesa(ana, ana.criar_conta("Corrente", 10_000), responsavel="Bruno").json()

    estorno = ana.post(f"/lancamentos/{original['id']}/estorno").json()
    trocado = editar(ana, original["id"], {"responsavel": "Carla"})

    assert estorno["responsavel"] == "Bruno"
    assert trocado.status_code == 200


def test_compra_parcelada_leva_o_responsavel_em_todas_as_parcelas(ana):
    cartao = criar_cartao(ana)

    criadas = ana.post(
        f"/cartoes/{cartao['id']}/compras",
        {
            "descricao": "Notebook",
            "data": hoje().isoformat(),
            "valor_centavos": 300_000,
            "categoria_id": ana.categorias["Lazer"],
            "parcelas": 3,
            "responsavel": "Bruno",
        },
    ).json()
    editar(ana, criadas[1]["id"], {"responsavel": "Carla"})

    parcelas = [ana.get(f"/lancamentos/{parcela['id']}").json() for parcela in criadas]
    assert [parcela["responsavel"] for parcela in criadas] == ["Bruno"] * 3
    assert [parcela["responsavel"] for parcela in parcelas] == ["Carla"] * 3


def test_compra_no_free_recusa_o_responsavel(bruno):
    cartao = criar_cartao(bruno)

    resposta = bruno.post(
        f"/cartoes/{cartao['id']}/compras",
        {
            "descricao": "Livro",
            "data": hoje().isoformat(),
            "valor_centavos": 5_000,
            "categoria_id": bruno.categorias["Lazer"],
            "responsavel": "Carla",
        },
    )

    assert resposta.status_code == 403


def test_responsaveis_entram_nas_pessoas_sugeridas_sem_repetir(ana):
    conta = ana.criar_conta("Corrente", 10_000)
    despesa(ana, conta, responsavel="Bruno")
    despesa(ana, conta, responsavel="Léo")
    despesa(ana, conta, divisao=[{"pessoa": "bruno", "valor_centavos": 100}])

    pessoas = ana.get("/pessoas").json()

    assert [pessoa.casefold() for pessoa in pessoas] == ["bruno", "léo"]
