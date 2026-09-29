"""Espaços de família e de empresa: criar, renomear e excluir, cada um um
livro-caixa separado do pessoal, com as categorias do tipo.

Sobe a API de verdade com os repositórios em memória (conftest.py).
"""

import pytest

from app.financeiro.modelos import MAXIMO_DE_ESPACOS_CRIADOS
from app.financeiro.regras import CATEGORIAS_DA_EMPRESA, CATEGORIAS_DA_FAMILIA


@pytest.fixture
def cabecalho(cabecalho_do_cliente):
    return cabecalho_do_cliente("uid-ana")


def criar(api, cabecalho, tipo="FAMILIA", nome="Casa da Ana"):
    return api.post("/espacos", headers=cabecalho, json={"tipo": tipo, "nome": nome})


def pessoal(api, cabecalho):
    return next(espaco for espaco in api.get("/espacos", headers=cabecalho).json() if espaco["tipo"] == "PF")


@pytest.mark.parametrize(
    ("tipo", "categorias"), [("FAMILIA", CATEGORIAS_DA_FAMILIA), ("PJ", CATEGORIAS_DA_EMPRESA)]
)
def test_cria_o_espaco_com_as_categorias_do_tipo(api, cabecalho, tipo, categorias):
    resposta = criar(api, cabecalho, tipo, "Novo espaço")

    assert resposta.status_code == 201
    espaco = resposta.json()
    assert espaco | {"id": None} == {
        "id": None,
        "tipo": tipo,
        "nome": "Novo espaço",
        "moeda": "BRL",
        "fuso": "America/Sao_Paulo",
        "papel": "DONO",
    }
    assert resposta.headers["Location"].endswith(f"/espacos/{espaco['id']}")
    nomes = {c["nome"] for c in api.get(f"/espacos/{espaco['id']}/categorias", headers=cabecalho).json()}
    assert nomes == {nome for nome, _, _ in categorias}


def test_o_pessoal_continua_primeiro_na_lista(api, cabecalho):
    # Sem nenhum GET antes: o POST garante o pessoal e ele sai primeiro.
    criar(api, cabecalho, "PJ", "Oficina")
    criar(api, cabecalho, "FAMILIA", "Casa")

    espacos = api.get("/espacos", headers=cabecalho).json()

    assert [e["tipo"] for e in espacos] == ["PF", "PJ", "FAMILIA"]
    assert [e["nome"] for e in espacos] == ["Pessoal", "Oficina", "Casa"]


def test_cada_espaco_e_um_livro_caixa_separado(api, cabecalho):
    casa = criar(api, cabecalho).json()["id"]
    meu = pessoal(api, cabecalho)["id"]

    conta = api.post(
        f"/espacos/{casa}/contas", headers=cabecalho, json={"nome": "Conta da casa", "tipo": "CORRENTE"}
    ).json()
    categoria = next(
        c["id"] for c in api.get(f"/espacos/{casa}/categorias", headers=cabecalho).json() if c["nome"] == "Mercado"
    )
    api.post(
        f"/espacos/{casa}/lancamentos",
        headers=cabecalho,
        json={
            "tipo": "DESPESA",
            "descricao": "Feira",
            "data": "2026-09-20",
            "valor_centavos": 8000,
            "conta_id": conta["id"],
            "categoria_id": categoria,
        },
    )

    assert api.get(f"/espacos/{meu}/contas", headers=cabecalho).json() == []
    assert api.get(f"/espacos/{meu}/lancamentos", headers=cabecalho).json() == []
    # A conta de um espaço não aparece pelo id no outro.
    assert api.get(f"/espacos/{meu}/contas/{conta['id']}", headers=cabecalho).status_code == 404
    assert len(api.get(f"/espacos/{casa}/lancamentos", headers=cabecalho).json()) == 1


def test_o_pessoal_nao_e_criado_pelo_post(api, cabecalho):
    resposta = criar(api, cabecalho, "PF", "Outro pessoal")

    assert resposta.status_code == 400
    assert "tipo" in resposta.json()["campos"]
    assert len(api.get("/espacos", headers=cabecalho).json()) == 1


@pytest.mark.parametrize("corpo", [{"tipo": "FAMILIA"}, {"tipo": "FAMILIA", "nome": "   "}, {"tipo": "OUTRO", "nome": "X"}])
def test_tipo_e_nome_sao_obrigatorios(api, cabecalho, corpo):
    assert api.post("/espacos", headers=cabecalho, json=corpo).status_code == 400


def test_nome_sai_limpo_e_campo_a_mais_e_recusado(api, cabecalho):
    limpo = criar(api, cabecalho, nome="<b>Casa</b>").json()
    assert "<" not in limpo["nome"] and ">" not in limpo["nome"]

    resposta = api.post(
        "/espacos", headers=cabecalho, json={"tipo": "FAMILIA", "nome": "Casa", "membros": [{"uid": "x"}]}
    )
    assert resposta.status_code == 400


def test_cada_pessoa_cria_um_numero_limitado_de_espacos(api, cabecalho):
    ids = [criar(api, cabecalho, nome=f"Espaço {n}").json()["id"] for n in range(MAXIMO_DE_ESPACOS_CRIADOS)]

    resposta = criar(api, cabecalho, nome="Um a mais")
    assert resposta.status_code == 409
    assert str(MAXIMO_DE_ESPACOS_CRIADOS) in resposta.json()["detail"]

    # Excluir um vazio libera a vaga.
    assert api.delete(f"/espacos/{ids[0]}", headers=cabecalho).status_code == 204
    assert criar(api, cabecalho, nome="Agora cabe").status_code == 201


def test_renomeia_o_espaco_criado_mas_nao_o_pessoal(api, cabecalho):
    casa = criar(api, cabecalho).json()["id"]

    renomeado = api.patch(f"/espacos/{casa}", headers=cabecalho, json={"nome": "Casa dos Souza"})
    assert renomeado.status_code == 200
    assert renomeado.json()["nome"] == "Casa dos Souza"
    assert api.get(f"/espacos/{casa}", headers=cabecalho).json()["nome"] == "Casa dos Souza"

    meu = pessoal(api, cabecalho)["id"]
    assert api.patch(f"/espacos/{meu}", headers=cabecalho, json={"nome": "Meu"}).status_code == 409
    assert api.delete(f"/espacos/{meu}", headers=cabecalho).status_code == 409


def test_so_exclui_o_espaco_vazio_e_as_categorias_vao_junto(api, cabecalho, livro_caixa):
    casa = criar(api, cabecalho).json()["id"]
    conta = api.post(f"/espacos/{casa}/contas", headers=cabecalho, json={"nome": "Conta", "tipo": "CORRENTE"}).json()

    com_conta = api.delete(f"/espacos/{casa}", headers=cabecalho)
    assert com_conta.status_code == 409
    assert "vazio" in com_conta.json()["detail"]

    api.delete(f"/espacos/{casa}/contas/{conta['id']}", headers=cabecalho)
    assert api.delete(f"/espacos/{casa}", headers=cabecalho).status_code == 204
    assert api.get(f"/espacos/{casa}", headers=cabecalho).status_code == 404
    assert not any(c.espaco_id == casa for c in livro_caixa.categorias.values())


def test_espaco_de_outra_pessoa_nao_se_ve_nem_se_mexe(api, cabecalho, cabecalho_do_cliente):
    casa = criar(api, cabecalho).json()["id"]
    bruno = cabecalho_do_cliente("uid-bruno")

    assert api.get(f"/espacos/{casa}", headers=bruno).status_code == 404
    assert api.patch(f"/espacos/{casa}", headers=bruno, json={"nome": "Minha"}).status_code == 404
    assert api.delete(f"/espacos/{casa}", headers=bruno).status_code == 404
    assert [e["tipo"] for e in api.get("/espacos", headers=bruno).json()] == ["PF"]
    assert api.get(f"/espacos/{casa}", headers=cabecalho).json()["nome"] == "Casa da Ana"


def test_criar_espaco_exige_login(api):
    assert api.post("/espacos", json={"tipo": "FAMILIA", "nome": "Casa"}).status_code == 401
