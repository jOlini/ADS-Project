"""Planos (Free, Família e Empresarial): quem troca o plano (só o
ADMINISTRADOR do back-office) e a trava anti-bypass do Free, conferida na API
mesmo que a tela seja burlada: Modo Família, filtro por pessoa e divisão do
gasto com nome e valor ficam para o Família (e o Empresarial, que o inclui).
No Free, a divisão é só a anotação de em quantas pessoas foi dividido.

Tudo pelo HTTP, com os repositórios em memória (conftest.py).
"""

import pytest

from app.financeiro.modelos import Plano
from app.financeiro.repositorio import _para_plano
from tests.test_financeiro_api import Cliente, entrar
from tests.test_financeiro_cartoes import criar_cartao, hoje


@pytest.fixture
def ana(api, cabecalho_do_cliente):
    # Recém-chegada: o pessoal nasce no Free.
    return entrar(api, cabecalho_do_cliente("uid-ana"))


def trocar_plano(api, cabecalho, uid="uid-ana", plano="FAMILIA"):
    return api.put(f"/clientes/{uid}/plano", json={"plano": plano}, headers=cabecalho)


def pessoal(cliente):
    return next(espaco for espaco in cliente.api.get("/espacos", headers=cliente.cabecalho).json() if espaco["tipo"] == "PF")


def despesa(cliente, conta, **extras):
    return cliente.post(
        "/lancamentos",
        {
            "tipo": "DESPESA",
            "descricao": "Pizza",
            "data": "2026-09-19",
            "valor_centavos": 9_000,
            "conta_id": conta,
            "categoria_id": cliente.categorias["Lazer"],
            **extras,
        },
    )


def racha():
    return [{"pessoa": "Bruno", "valor_centavos": 3_000}]


# --- Quem troca o plano ----------------------------------------------------------


def test_o_pessoal_nasce_no_free(ana):
    assert pessoal(ana)["plano"] == "FREE"


def test_administrador_troca_o_plano_do_cliente(api, ana, cabecalho_de):
    resposta = trocar_plano(api, cabecalho_de("id-admin"))

    assert resposta.status_code == 200
    assert resposta.json() == {"uid": "uid-ana", "plano": "FAMILIA"}
    assert pessoal(ana)["plano"] == "FAMILIA"


@pytest.mark.parametrize(("id", "status"), [("id-operador", 403), ("id-cliente", 403)])
def test_so_o_administrador_troca_o_plano(api, ana, cabecalho_de, id, status):
    assert trocar_plano(api, cabecalho_de(id)).status_code == status
    assert pessoal(ana)["plano"] == "FREE"


def test_o_cliente_nao_se_promove_sozinho(api, ana):
    # Nem com o próprio ID token do Firebase, nem sem token.
    assert trocar_plano(api, ana.cabecalho).status_code == 401
    assert trocar_plano(api, {}).status_code == 401
    # E o plano não entra por nenhuma rota do cliente.
    assert ana.api.put(f"{ana.base}", headers=ana.cabecalho, json={"plano": "FAMILIA"}).status_code in (400, 405)
    assert pessoal(ana)["plano"] == "FREE"


def test_cliente_que_nunca_entrou_da_404_sem_criar_espaco(api, cabecalho_de, livro_caixa):
    resposta = trocar_plano(api, cabecalho_de("id-admin"), uid="uid-desconhecido")

    assert resposta.status_code == 404
    assert livro_caixa.buscar_espaco_pessoal("uid-desconhecido") is None


@pytest.mark.parametrize(("uid", "corpo"), [("uid-ana", {"plano": "PREMIUM"}), ("uid ana", {"plano": "FAMILIA"})])
def test_plano_ou_uid_fora_do_formato_da_400(api, ana, cabecalho_de, uid, corpo):
    resposta = api.put(f"/clientes/{uid}/plano", json=corpo, headers=cabecalho_de("id-admin"))

    assert resposta.status_code == 400


def test_plano_gravado_desconhecido_vira_free():
    assert _para_plano(None) is Plano.FREE
    assert _para_plano("PREMIUM") is Plano.FREE
    assert _para_plano("FAMILIA") is Plano.FAMILIA


# --- Trava do Free: Modo Família -------------------------------------------------


def test_free_nao_liga_a_familia_nem_inclui_pessoas(ana):
    ligar = ana.put("/familia", {"ativa": True})
    incluir = ana.post("/familia/pessoas", {"nome": "Bruno", "cor": "azul"})

    assert (ligar.status_code, incluir.status_code) == (403, 403)
    assert "Plano Família" in ligar.json()["detail"]
    assert pessoal(ana)["familia"]["ativa"] is False
    assert pessoal(ana)["familia"]["pessoas"] == []


def test_free_nao_filtra_relatorio_por_pessoa(ana):
    for rota in ("/relatorios/mensal", "/relatorios/categorias"):
        assert ana.get(f"{rota}?membro=titular").status_code == 403
        assert ana.get(rota).status_code == 200


@pytest.mark.parametrize("plano", ["FAMILIA", "EMPRESARIAL"])
def test_familia_e_empresarial_liberam_o_modo(api, ana, cabecalho_de, plano):
    trocar_plano(api, cabecalho_de("id-admin"), plano=plano)

    assert ana.put("/familia", {"ativa": True}).status_code == 200
    assert ana.post("/familia/pessoas", {"nome": "Bruno", "cor": "azul"}).status_code == 201
    assert ana.get("/relatorios/mensal?membro=titular").status_code == 200


def test_voltar_ao_free_esconde_a_familia_sem_apagar_ninguem(api, ana, cabecalho_de):
    admin = cabecalho_de("id-admin")
    trocar_plano(api, admin)
    ana.put("/familia", {"ativa": True})
    bruno = ana.post("/familia/pessoas", {"nome": "Bruno", "cor": "azul"}).json()

    trocar_plano(api, admin, plano="FREE")
    familia = pessoal(ana)["familia"]

    assert familia["ativa"] is False
    assert [p["nome"] for p in familia["pessoas"]] == ["Bruno"]
    assert ana.get("/familia").json()["ativa"] is False
    assert ana.put(f"/familia/pessoas/{bruno['id']}", {"nome": "Bruna", "cor": "azul"}).status_code == 403
    # Desligar e tirar alguém continuam liberados: é apagar dado.
    assert ana.put("/familia", {"ativa": False}).status_code == 200
    resposta = ana.api.delete(f"{ana.base}/familia/pessoas/{bruno['id']}", headers=ana.cabecalho)
    assert resposta.status_code == 204

    trocar_plano(api, admin)
    assert pessoal(ana)["familia"] == {"ativa": False, "pessoas": [], "maximo_de_pessoas": 4}


def test_o_modo_gravado_volta_com_o_plano(api, ana, cabecalho_de):
    admin = cabecalho_de("id-admin")
    trocar_plano(api, admin)
    ana.put("/familia", {"ativa": True})

    trocar_plano(api, admin, plano="FREE")
    assert pessoal(ana)["familia"]["ativa"] is False
    trocar_plano(api, admin)
    assert pessoal(ana)["familia"]["ativa"] is True


# --- Trava do Free: divisão do gasto ---------------------------------------------


def test_free_nao_divide_com_nome_e_valor(ana):
    conta = ana.criar_conta("Carteira", 10_000, tipo="CARTEIRA")

    resposta = despesa(ana, conta, divisao=racha())

    assert resposta.status_code == 403
    assert "Plano Família" in resposta.json()["detail"]
    assert ana.get("/lancamentos").json() == []


def test_free_nao_divide_a_compra_no_cartao(ana):
    cartao = criar_cartao(ana)
    corpo = {
        "descricao": "Pizza",
        "data": hoje().isoformat(),
        "valor_centavos": 9_000,
        "categoria_id": ana.categorias["Lazer"],
        "divisao": racha(),
    }

    assert ana.post(f"/cartoes/{cartao['id']}/compras", corpo).status_code == 403


def test_free_anota_em_quantas_pessoas_dividiu(ana):
    conta = ana.criar_conta("Carteira", 10_000, tipo="CARTEIRA")

    resposta = despesa(ana, conta, dividido_entre=3)

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert (corpo["dividido_entre"], corpo["divisao"]) == (3, [])
    # Só anotação: o valor inteiro sai da conta e ninguém vira "pessoa".
    assert ana.saldos()["Carteira"] == 1_000
    assert ana.get("/pessoas").json() == []
    estorno = ana.post(f"/lancamentos/{corpo['id']}/estorno").json()
    assert estorno["dividido_entre"] == 3


def test_free_anota_na_compra_a_vista(ana):
    cartao = criar_cartao(ana)
    corpo = {
        "descricao": "Pizza",
        "data": hoje().isoformat(),
        "valor_centavos": 9_000,
        "categoria_id": ana.categorias["Lazer"],
        "dividido_entre": 2,
    }

    resposta = ana.post(f"/cartoes/{cartao['id']}/compras", corpo)

    assert resposta.status_code == 201
    assert resposta.json()[0]["dividido_entre"] == 2
    parcelada = ana.post(f"/cartoes/{cartao['id']}/compras", corpo | {"parcelas": 3})
    assert parcelada.status_code == 400
    assert set(parcelada.json()["campos"]) == {"dividido_entre"}


@pytest.mark.parametrize("valor", [1, 0, 21, "3", 2.5, True])
def test_numero_de_pessoas_fora_da_faixa_da_400(ana, valor):
    conta = ana.criar_conta("Carteira", 10_000, tipo="CARTEIRA")

    assert despesa(ana, conta, dividido_entre=valor).status_code == 400


def test_transferencia_nao_anota_divisao(ana):
    origem = ana.criar_conta("Corrente", 10_000)
    destino = ana.criar_conta("Poupança", 0, tipo="POUPANCA")
    corpo = {
        "tipo": "TRANSFERENCIA",
        "descricao": "Guardar",
        "data": "2026-09-19",
        "valor_centavos": 1_000,
        "conta_id": origem,
        "conta_destino_id": destino,
        "dividido_entre": 2,
    }

    resposta = ana.post("/lancamentos", corpo)

    assert resposta.status_code == 400
    assert set(resposta.json()["campos"]) == {"dividido_entre"}


def test_familia_divide_com_nome_mas_nao_com_os_dois(api, ana, cabecalho_de):
    trocar_plano(api, cabecalho_de("id-admin"))
    conta = ana.criar_conta("Carteira", 10_000, tipo="CARTEIRA")

    assert despesa(ana, conta, divisao=racha()).status_code == 201
    os_dois = despesa(ana, conta, divisao=racha(), dividido_entre=2)
    assert os_dois.status_code == 400
    assert set(os_dois.json()["campos"]) == {"dividido_entre"}


def test_na_empresa_vale_o_plano_do_pessoal_de_quem_lanca(api, ana, cabecalho_de):
    admin = cabecalho_de("id-admin")
    trocar_plano(api, admin, plano="EMPRESARIAL")
    empresa = api.post("/espacos", headers=ana.cabecalho, json={"tipo": "PJ", "nome": "Ateliê", "regime": "MEI"}).json()
    base = f"/espacos/{empresa['id']}"
    categorias = api.get(f"{base}/categorias", headers=ana.cabecalho).json()
    na_empresa = Cliente(api, ana.cabecalho, base, {c["nome"]: c["id"] for c in categorias})
    conta = na_empresa.criar_conta("Caixa", 10_000)
    categoria = next(c["id"] for c in categorias if c["tipo"] == "DESPESA")
    corpo = {
        "tipo": "DESPESA",
        "descricao": "Almoço com cliente",
        "data": "2026-09-19",
        "valor_centavos": 9_000,
        "conta_id": conta,
        "categoria_id": categoria,
        "divisao": racha(),
    }

    # Plano rebaixado depois de criar a empresa: lá dentro, vale o do pessoal.
    trocar_plano(api, admin, plano="FREE")
    assert na_empresa.post("/lancamentos", corpo).status_code == 403
    trocar_plano(api, admin, plano="EMPRESARIAL")
    assert na_empresa.post("/lancamentos", corpo).status_code == 201
