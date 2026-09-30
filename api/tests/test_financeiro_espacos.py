"""Espaços: o pessoal (um por pessoa) e as empresas do espaço empresarial,
cada empresa um livro-caixa separado, com as categorias de empresa, o CNPJ e o
regime. Não existe um terceiro tipo: a família é o Modo Família do pessoal.

Sobe a API de verdade com os repositórios em memória (conftest.py).
"""

import pytest

from app.financeiro.modelos import MAXIMO_DE_EMPRESAS
from app.financeiro.regras import CATEGORIAS_DA_EMPRESA

# CNPJs de exemplo com os dígitos verificadores certos (um numérico e um no
# formato alfanumérico da Receita Federal).
CNPJ_NUMERICO = "11.222.333/0001-81"
CNPJ_ALFANUMERICO = "12.ABC.345/01DE-35"


@pytest.fixture
def cabecalho(cabecalho_do_cliente):
    return cabecalho_do_cliente("uid-ana")


def criar(api, cabecalho, nome="Ateliê da Ana", **dados):
    return api.post("/espacos", headers=cabecalho, json={"tipo": "PJ", "nome": nome, **dados})


def pessoal(api, cabecalho):
    return next(espaco for espaco in api.get("/espacos", headers=cabecalho).json() if espaco["tipo"] == "PF")


def test_cadastra_a_empresa_com_as_categorias_de_empresa(api, cabecalho):
    resposta = criar(api, cabecalho, "Oficina", cnpj=CNPJ_NUMERICO, regime="SIMPLES")

    assert resposta.status_code == 201
    empresa = resposta.json()
    assert empresa | {"id": None} == {
        "id": None,
        "tipo": "PJ",
        "nome": "Oficina",
        "moeda": "BRL",
        "fuso": "America/Sao_Paulo",
        "papel": "DONO",
        "cnpj": "11222333000181",
        "regime": "SIMPLES",
        "familia": None,
        "plano": None,
    }
    assert resposta.headers["Location"].endswith(f"/espacos/{empresa['id']}")
    nomes = {c["nome"] for c in api.get(f"/espacos/{empresa['id']}/categorias", headers=cabecalho).json()}
    assert nomes == {nome for nome, _, _ in CATEGORIAS_DA_EMPRESA}


def test_cnpj_e_regime_sao_opcionais_e_o_cnpj_aceita_letras(api, cabecalho):
    sem_nada = criar(api, cabecalho, "Sem CNPJ").json()
    assert (sem_nada["cnpj"], sem_nada["regime"]) == (None, None)

    vazio = criar(api, cabecalho, "CNPJ vazio", cnpj="  ").json()
    assert vazio["cnpj"] is None

    alfanumerico = criar(api, cabecalho, "Nova", cnpj=CNPJ_ALFANUMERICO.lower(), regime="MEI").json()
    assert (alfanumerico["cnpj"], alfanumerico["regime"]) == ("12ABC34501DE35", "MEI")


@pytest.mark.parametrize("cnpj", ["11.222.333/0001-82", "1122233300018", "11111111111111", "12.ABC.345/01DE-3X"])
def test_cnpj_com_digito_errado_e_recusado(api, cabecalho, cnpj):
    resposta = criar(api, cabecalho, cnpj=cnpj)

    assert resposta.status_code == 400
    assert resposta.json()["campos"]["cnpj"] == "CNPJ inválido. Confira os 14 caracteres."


def test_o_pessoal_continua_primeiro_na_lista(api, cabecalho):
    # Sem nenhum GET antes: o POST garante o pessoal e ele sai primeiro.
    criar(api, cabecalho, "Oficina")
    criar(api, cabecalho, "Loja")

    espacos = api.get("/espacos", headers=cabecalho).json()

    assert [e["tipo"] for e in espacos] == ["PF", "PJ", "PJ"]
    assert [e["nome"] for e in espacos] == ["Pessoal", "Oficina", "Loja"]
    assert espacos[0]["cnpj"] is None and espacos[0]["regime"] is None


def test_cada_empresa_e_um_livro_caixa_separado(api, cabecalho):
    oficina = criar(api, cabecalho, "Oficina").json()["id"]
    loja = criar(api, cabecalho, "Loja").json()["id"]
    meu = pessoal(api, cabecalho)["id"]

    conta = api.post(
        f"/espacos/{oficina}/contas", headers=cabecalho, json={"nome": "Caixa da oficina", "tipo": "CORRENTE"}
    ).json()
    categoria = next(
        c["id"] for c in api.get(f"/espacos/{oficina}/categorias", headers=cabecalho).json() if c["nome"] == "Vendas"
    )
    api.post(
        f"/espacos/{oficina}/lancamentos",
        headers=cabecalho,
        json={
            "tipo": "RECEITA",
            "descricao": "Venda",
            "data": "2026-09-20",
            "valor_centavos": 8000,
            "conta_id": conta["id"],
            "categoria_id": categoria,
        },
    )

    for outro in (meu, loja):
        assert api.get(f"/espacos/{outro}/contas", headers=cabecalho).json() == []
        assert api.get(f"/espacos/{outro}/lancamentos", headers=cabecalho).json() == []
        # A conta de uma empresa não aparece pelo id em outro livro.
        assert api.get(f"/espacos/{outro}/contas/{conta['id']}", headers=cabecalho).status_code == 404
    assert len(api.get(f"/espacos/{oficina}/lancamentos", headers=cabecalho).json()) == 1


def test_o_pessoal_nao_e_criado_pelo_post(api, cabecalho):
    resposta = api.post("/espacos", headers=cabecalho, json={"tipo": "PF", "nome": "Outro pessoal"})

    assert resposta.status_code == 400
    assert "empresas" in resposta.json()["campos"]["tipo"]
    assert len(api.get("/espacos", headers=cabecalho).json()) == 1


@pytest.mark.parametrize(
    "corpo",
    [
        {"tipo": "PJ"},
        {"tipo": "PJ", "nome": "   "},
        # A família não é um tipo de espaço: é o Modo Família do pessoal.
        {"tipo": "FAMILIA", "nome": "Casa"},
        {"tipo": "OUTRO", "nome": "X"},
        {"tipo": "PJ", "nome": "X", "regime": "ISENTO"},
    ],
)
def test_tipo_nome_e_regime_sao_conferidos(api, cabecalho, corpo):
    assert api.post("/espacos", headers=cabecalho, json=corpo).status_code == 400


def test_nome_sai_limpo_e_campo_a_mais_e_recusado(api, cabecalho):
    limpo = criar(api, cabecalho, nome="<b>Oficina</b>").json()
    assert "<" not in limpo["nome"] and ">" not in limpo["nome"]

    resposta = api.post("/espacos", headers=cabecalho, json={"tipo": "PJ", "nome": "Oficina", "membros": [{"uid": "x"}]})
    assert resposta.status_code == 400


def test_cada_pessoa_cadastra_um_numero_limitado_de_empresas(api, cabecalho):
    ids = [criar(api, cabecalho, nome=f"Empresa {n}").json()["id"] for n in range(MAXIMO_DE_EMPRESAS)]

    resposta = criar(api, cabecalho, nome="Uma a mais")
    assert resposta.status_code == 409
    assert str(MAXIMO_DE_EMPRESAS) in resposta.json()["detail"]

    # Excluir uma sem movimento libera a vaga.
    assert api.delete(f"/espacos/{ids[0]}", headers=cabecalho).status_code == 204
    assert criar(api, cabecalho, nome="Agora cabe").status_code == 201


def test_edita_a_empresa_so_nos_campos_enviados_mas_nao_o_pessoal(api, cabecalho):
    oficina = criar(api, cabecalho, "Oficina", cnpj=CNPJ_NUMERICO, regime="MEI").json()["id"]

    renomeada = api.patch(f"/espacos/{oficina}", headers=cabecalho, json={"nome": "Oficina da Ana"})
    assert renomeada.status_code == 200
    assert (renomeada.json()["nome"], renomeada.json()["cnpj"], renomeada.json()["regime"]) == (
        "Oficina da Ana",
        "11222333000181",
        "MEI",
    )

    mudou = api.patch(f"/espacos/{oficina}", headers=cabecalho, json={"regime": "SIMPLES", "cnpj": None}).json()
    assert (mudou["nome"], mudou["cnpj"], mudou["regime"]) == ("Oficina da Ana", None, "SIMPLES")
    assert api.get(f"/espacos/{oficina}", headers=cabecalho).json()["regime"] == "SIMPLES"
    assert api.patch(f"/espacos/{oficina}", headers=cabecalho, json={"nome": None}).status_code == 400

    meu = pessoal(api, cabecalho)["id"]
    assert api.patch(f"/espacos/{meu}", headers=cabecalho, json={"nome": "Meu"}).status_code == 409
    assert api.delete(f"/espacos/{meu}", headers=cabecalho).status_code == 409


def test_so_exclui_a_empresa_sem_movimento_e_as_categorias_vao_junto(api, cabecalho, livro_caixa):
    oficina = criar(api, cabecalho).json()["id"]
    conta = api.post(f"/espacos/{oficina}/contas", headers=cabecalho, json={"nome": "Conta", "tipo": "CORRENTE"}).json()

    com_conta = api.delete(f"/espacos/{oficina}", headers=cabecalho)
    assert com_conta.status_code == 409
    assert "sem movimento" in com_conta.json()["detail"]

    api.delete(f"/espacos/{oficina}/contas/{conta['id']}", headers=cabecalho)
    assert api.delete(f"/espacos/{oficina}", headers=cabecalho).status_code == 204
    assert api.get(f"/espacos/{oficina}", headers=cabecalho).status_code == 404
    assert not any(c.espaco_id == oficina for c in livro_caixa.categorias.values())


def test_empresa_de_outra_pessoa_nao_se_ve_nem_se_mexe(api, cabecalho, cabecalho_do_cliente):
    oficina = criar(api, cabecalho).json()["id"]
    bruno = cabecalho_do_cliente("uid-bruno")

    assert api.get(f"/espacos/{oficina}", headers=bruno).status_code == 404
    assert api.patch(f"/espacos/{oficina}", headers=bruno, json={"nome": "Minha"}).status_code == 404
    assert api.delete(f"/espacos/{oficina}", headers=bruno).status_code == 404
    assert [e["tipo"] for e in api.get("/espacos", headers=bruno).json()] == ["PF"]
    assert api.get(f"/espacos/{oficina}", headers=cabecalho).json()["nome"] == "Ateliê da Ana"


def test_cadastrar_empresa_exige_login(api):
    assert api.post("/espacos", json={"tipo": "PJ", "nome": "Oficina"}).status_code == 401
