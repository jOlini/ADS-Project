"""Gestão de cada empresa do espaço empresarial: custos (classe de cada
despesa), sociedade e aportes, impostos (tributos e o pagamento de cada
competência) e pessoal (a folha lançada no fluxo de caixa, sem duplicar).

Tudo pelo HTTP, com os repositórios em memória (conftest.py).
"""

import pytest

from app.financeiro.modelos import ClasseDeCusto, FuncaoDaCategoria
from app.financeiro.regras import CATEGORIAS_DA_GESTAO
from tests.test_financeiro_api import Cliente


@pytest.fixture
def empresa(api, cabecalho_do_cliente):
    """A Ana com uma empresa (regime Simples) e uma conta corrente nela."""
    cabecalho = cabecalho_do_cliente("uid-ana")
    espaco = api.post("/espacos", headers=cabecalho, json={"tipo": "PJ", "nome": "Oficina", "regime": "SIMPLES"}).json()
    categorias = api.get(f"/espacos/{espaco['id']}/categorias", headers=cabecalho).json()
    cliente = Cliente(api, cabecalho, f"/espacos/{espaco['id']}", {c["nome"]: c["id"] for c in categorias})
    cliente.conta = cliente.criar_conta("Conta PJ", 1_000_000)
    return cliente


def categorias(cliente):
    return {c["nome"]: c for c in cliente.get("/categorias").json()}


def excluir(cliente, caminho):
    return cliente.api.delete(cliente.base + caminho, headers=cliente.cabecalho)


def lancamento(cliente, id):
    return cliente.get(f"/lancamentos/{id}").json()


# --- Categorias da gestão ---------------------------------------------------------


def test_categorias_da_empresa_nascem_com_classe_e_funcao(empresa):
    todas = categorias(empresa)

    assert todas["Fornecedores"]["classe_de_custo"] == "VARIAVEL"
    assert todas["Aluguel e estrutura"]["classe_de_custo"] == "FIXO"
    assert todas["Marketing"]["classe_de_custo"] == "OPERACIONAL"
    assert todas["Distribuição de lucros"]["classe_de_custo"] == "FORA"
    assert {nome: todas[nome]["funcao"] for nome in CATEGORIAS_DA_GESTAO.values()} == {
        nome: funcao.value for funcao, nome in CATEGORIAS_DA_GESTAO.items()
    }
    assert todas["Vendas"]["classe_de_custo"] is None and todas["Vendas"]["funcao"] is None


def test_o_pessoal_nao_tem_classe_nem_funcao(api, cabecalho_do_cliente):
    cabecalho = cabecalho_do_cliente("uid-bia")
    pessoal = api.get("/espacos", headers=cabecalho).json()[0]["id"]

    for categoria in api.get(f"/espacos/{pessoal}/categorias", headers=cabecalho).json():
        assert (categoria["classe_de_custo"], categoria["funcao"]) == (None, None)


# --- Custos ------------------------------------------------------------------------


def test_classifica_as_despesas_e_null_volta_para_a_sugestao(empresa):
    resposta = empresa.put(
        "/custos/classes",
        {"classes": {empresa.categorias["Marketing"]: "VARIAVEL", empresa.categorias["Fornecedores"]: None}},
    )

    assert resposta.status_code == 200
    todas = {c["nome"]: c for c in resposta.json()}
    assert todas["Marketing"]["classe_de_custo"] == "VARIAVEL"
    assert todas["Fornecedores"]["classe_de_custo"] is None
    assert categorias(empresa)["Marketing"]["classe_de_custo"] == "VARIAVEL"


def test_classificacao_com_erro_nao_muda_nenhuma(empresa):
    resposta = empresa.put(
        "/custos/classes",
        {
            "classes": {
                empresa.categorias["Marketing"]: "FIXO",
                empresa.categorias["Vendas"]: "FIXO",
                "0" * 24: "FIXO",
            }
        },
    )

    assert resposta.status_code == 400
    campos = resposta.json()["campos"]
    assert campos[f"classes.{empresa.categorias['Vendas']}"] == "Só despesa tem classe de custo."
    assert campos[f"classes.{'0' * 24}"] == "Categoria não encontrada."
    assert categorias(empresa)["Marketing"]["classe_de_custo"] == ClasseDeCusto.OPERACIONAL


# --- Sociedade e aportes ------------------------------------------------------------


def incluir_socio(cliente, nome, participacao):
    return cliente.post("/socios", {"nome": nome, "participacao_centesimos": participacao})


def test_quadro_societario_soma_ate_100_por_cento(empresa):
    ana = incluir_socio(empresa, "Ana", 6_000)
    assert ana.status_code == 201
    assert ana.json() | {"id": None} == {"id": None, "nome": "Ana", "participacao_centesimos": 6_000}
    assert incluir_socio(empresa, "Bruno", 3_333).status_code == 201

    demais = incluir_socio(empresa, "Carla", 1_000)
    assert demais.status_code == 400
    assert demais.json()["campos"]["participacao_centesimos"] == (
        "A soma das participações passaria de 100%. Cabem até 6,67%."
    )
    assert incluir_socio(empresa, "  ANA ", 100).json()["campos"]["nome"] == "Já existe alguém com este nome aqui."
    assert [s["nome"] for s in empresa.get("/socios").json()] == ["Ana", "Bruno"]


def test_participacao_fora_de_0_a_100_por_cento_e_recusada(empresa):
    assert incluir_socio(empresa, "Ana", 10_001).status_code == 400
    assert incluir_socio(empresa, "Ana", -1).status_code == 400
    assert incluir_socio(empresa, "Ana", 50.5).status_code == 400


def test_aporte_distribuicao_e_pro_labore_viram_lancamentos_do_socio(empresa):
    ana = incluir_socio(empresa, "Ana", 10_000).json()["id"]

    def movimento(tipo, valor):
        resposta = empresa.post(
            f"/socios/{ana}/movimentos",
            {"tipo": tipo, "conta_id": empresa.conta, "valor_centavos": valor, "data": "2026-09-05"},
        )
        assert resposta.status_code == 201, resposta.json()
        return resposta.json()

    aporte = movimento("APORTE", 50_000)
    distribuicao = movimento("DISTRIBUICAO", 20_000)
    pro_labore = movimento("PRO_LABORE", 15_000)

    todas = categorias(empresa)
    assert (aporte["tipo"], aporte["categoria_id"], aporte["responsavel"]) == (
        "RECEITA",
        todas["Aportes dos sócios"]["id"],
        "Ana",
    )
    assert aporte["descricao"] == "Aporte de capital · Ana"
    assert (distribuicao["tipo"], distribuicao["categoria_id"]) == ("DESPESA", todas["Distribuição de lucros"]["id"])
    assert (pro_labore["tipo"], pro_labore["categoria_id"]) == ("DESPESA", todas["Pró-labore"]["id"])
    assert empresa.saldos()["Conta PJ"] == 1_000_000 + 50_000 - 20_000 - 15_000


def test_movimento_confere_socio_e_conta(empresa):
    ana = incluir_socio(empresa, "Ana", 5_000).json()["id"]
    cartao = empresa.post(
        "/contas",
        {"nome": "Cartão", "tipo": "CARTAO_CREDITO", "limite_centavos": 100_000, "dia_fechamento": 1, "dia_vencimento": 10},
    ).json()["id"]
    corpo = {"tipo": "APORTE", "valor_centavos": 1_000, "data": "2026-09-05"}

    assert empresa.post("/socios/nao-existe/movimentos", corpo | {"conta_id": empresa.conta}).status_code == 404
    no_cartao = empresa.post(f"/socios/{ana}/movimentos", corpo | {"conta_id": cartao})
    assert no_cartao.status_code == 400
    assert "cartão" in no_cartao.json()["campos"]["conta_id"]


def test_nome_novo_do_socio_leva_os_lancamentos(empresa):
    ana = incluir_socio(empresa, "Ana", 5_000).json()["id"]
    aporte = empresa.post(
        f"/socios/{ana}/movimentos",
        {"tipo": "APORTE", "conta_id": empresa.conta, "valor_centavos": 1_000, "data": "2026-09-05"},
    ).json()["id"]

    editado = empresa.put(f"/socios/{ana}", {"nome": "Ana Souza", "participacao_centesimos": 7_000})

    assert editado.status_code == 200
    assert editado.json()["lancamentos_renomeados"] == 1
    assert lancamento(empresa, aporte)["responsavel"] == "Ana Souza"
    assert excluir(empresa, f"/socios/{ana}").status_code == 204
    assert lancamento(empresa, aporte)["responsavel"] == "Ana Souza"


def test_categoria_renomeada_continua_com_a_funcao_e_a_excluida_volta(empresa, livro_caixa):
    ana = incluir_socio(empresa, "Ana", 5_000).json()["id"]
    aportes = empresa.categorias["Aportes dos sócios"]
    empresa.put(f"/categorias/{aportes}", {"nome": "Capital", "cor": "neutro", "ativa": True})
    corpo = {"tipo": "APORTE", "conta_id": empresa.conta, "valor_centavos": 1_000, "data": "2026-09-05"}

    assert empresa.post(f"/socios/{ana}/movimentos", corpo).json()["categoria_id"] == aportes

    distribuicao = empresa.categorias["Distribuição de lucros"]
    assert excluir(empresa, f"/categorias/{distribuicao}").status_code == 204
    nova = empresa.post(f"/socios/{ana}/movimentos", corpo | {"tipo": "DISTRIBUICAO"}).json()["categoria_id"]
    assert nova != distribuicao
    assert categorias(empresa)["Distribuição de lucros"]["funcao"] == "DISTRIBUICAO"


def test_empresa_antiga_ganha_a_funcao_na_categoria_de_mesmo_nome(empresa, livro_caixa):
    # Empresa criada antes das funções: as categorias não têm a marca.
    for categoria in livro_caixa.categorias.values():
        categoria.funcao = None
    ana = incluir_socio(empresa, "Ana", 5_000).json()["id"]

    resposta = empresa.post(
        f"/socios/{ana}/movimentos",
        {"tipo": "PRO_LABORE", "conta_id": empresa.conta, "valor_centavos": 1_000, "data": "2026-09-05"},
    )

    assert resposta.json()["categoria_id"] == empresa.categorias["Pró-labore"]
    assert sum(1 for nome in categorias(empresa) if nome == "Pró-labore") == 1
    assert categorias(empresa)["Pró-labore"]["funcao"] == FuncaoDaCategoria.PRO_LABORE


# --- Impostos ------------------------------------------------------------------------


def das(**extras):
    return {
        "nome": "DAS",
        "tipo": "DAS",
        "base": "FATURAMENTO",
        "aliquota_centesimos": 600,
        "dia_vencimento": 20,
        **extras,
    }


def test_cadastra_tributos_por_aliquota_ou_valor_fixo(empresa):
    simples = empresa.post("/tributos", das())
    mei = empresa.post(
        "/tributos",
        {"nome": "DAS-MEI", "tipo": "DAS", "base": "FIXO", "valor_fixo_centavos": 8_105, "dia_vencimento": 20},
    )

    assert (simples.status_code, mei.status_code) == (201, 201)
    assert simples.json() | {"id": None} == {
        "id": None,
        "nome": "DAS",
        "tipo": "DAS",
        "base": "FATURAMENTO",
        "aliquota_centesimos": 600,
        "valor_fixo_centavos": None,
        "dia_vencimento": 20,
        "periodicidade": "MENSAL",
        "ativo": True,
        "pagamentos": [],
    }
    assert [t["nome"] for t in empresa.get("/tributos").json()] == ["DAS", "DAS-MEI"]


@pytest.mark.parametrize(
    ("corpo", "campo"),
    [
        (das(aliquota_centesimos=None), "aliquota_centesimos"),
        (das(valor_fixo_centavos=100), "valor_fixo_centavos"),
        (das(base="FIXO"), "valor_fixo_centavos"),
        (das(dia_vencimento=32), "dia_vencimento"),
        (das(aliquota_centesimos=0), "aliquota_centesimos"),
        (das(tipo="IPVA"), "tipo"),
    ],
)
def test_tributo_incoerente_e_recusado(empresa, corpo, campo):
    resposta = empresa.post("/tributos", corpo)

    assert resposta.status_code == 400
    assert campo in resposta.json()["campos"]


def pagar(cliente, tributo, competencia="2026-08", valor=6_000, data="2026-09-20"):
    return cliente.post(
        f"/tributos/{tributo}/pagamentos",
        {"competencia": competencia, "conta_id": cliente.conta, "valor_centavos": valor, "data": data},
    )


def test_paga_a_guia_da_competencia_uma_vez_so(empresa):
    tributo = empresa.post("/tributos", das()).json()["id"]

    pago = pagar(empresa, tributo)
    de_novo = pagar(empresa, tributo, valor=7_000)

    assert pago.status_code == 201
    corpo = pago.json()
    assert (corpo["descricao"], corpo["categoria_id"], corpo["tipo"]) == (
        "DAS · 08/2026",
        empresa.categorias["Impostos"],
        "DESPESA",
    )
    assert corpo["origem"] == {"tipo": "TRIBUTO", "id": tributo, "competencia": "2026-08"}
    assert de_novo.status_code == 409
    assert "já está pago" in de_novo.json()["detail"]
    pagamentos = empresa.get("/tributos").json()[0]["pagamentos"]
    assert pagamentos == [
        {"competencia": "2026-08", "lancamento_id": corpo["id"], "valor_centavos": 6_000, "data": "2026-09-20"}
    ]

    # Excluir o pagamento no extrato libera a competência.
    assert excluir(empresa, f"/lancamentos/{corpo['id']}").status_code == 204
    assert empresa.get("/tributos").json()[0]["pagamentos"] == []
    assert pagar(empresa, tributo, valor=7_000).status_code == 201


def test_tributo_da_folha_vai_para_os_encargos_e_trimestral_pede_o_fim_do_trimestre(empresa):
    fgts = empresa.post("/tributos", das(nome="FGTS", tipo="FGTS", base="FOLHA", aliquota_centesimos=800, dia_vencimento=7))
    irpj = empresa.post("/tributos", das(nome="IRPJ", tipo="DARF", aliquota_centesimos=480, periodicidade="TRIMESTRAL"))

    assert pagar(empresa, fgts.json()["id"]).json()["categoria_id"] == empresa.categorias["Encargos da folha"]
    fora_do_trimestre = pagar(empresa, irpj.json()["id"], competencia="2026-08")
    assert fora_do_trimestre.status_code == 400
    assert "trimestre" in fora_do_trimestre.json()["campos"]["competencia"]
    assert pagar(empresa, irpj.json()["id"], competencia="2026-09").status_code == 201


def test_edita_e_exclui_o_tributo_sem_mexer_nos_pagamentos(empresa):
    tributo = empresa.post("/tributos", das()).json()["id"]
    pago = pagar(empresa, tributo).json()["id"]

    editado = empresa.put(f"/tributos/{tributo}", das(aliquota_centesimos=1_120, ativo=False))
    assert editado.status_code == 200
    assert (editado.json()["aliquota_centesimos"], editado.json()["ativo"], len(editado.json()["pagamentos"])) == (
        1_120,
        False,
        1,
    )
    assert excluir(empresa, f"/tributos/{tributo}").status_code == 204
    assert empresa.get("/tributos").json() == []
    assert lancamento(empresa, pago)["descricao"] == "DAS · 08/2026"


# --- Pessoal (RH) ---------------------------------------------------------------------


def pessoa(nome="Carla", vinculo="CLT", salario=300_000, **extras):
    return {"nome": nome, "vinculo": vinculo, "salario_centavos": salario, **extras}


def test_cadastra_pessoas_da_folha(empresa):
    resposta = empresa.post(
        "/colaboradores",
        pessoa(
            cargo=" <Costureira> ",
            admissao="2026-01-10",
            beneficios=[{"nome": "Vale-refeição", "valor_centavos": 60_000}],
        ),
    )

    assert resposta.status_code == 201
    assert resposta.json() | {"id": None} == {
        "id": None,
        "nome": "Carla",
        "vinculo": "CLT",
        "cargo": "Costureira",
        "salario_centavos": 300_000,
        "beneficios": [{"nome": "Vale-refeição", "valor_centavos": 60_000}],
        "dia_pagamento": 5,
        "admissao": "2026-01-10",
        "ativo": True,
        "competencias_lancadas": [],
    }
    assert empresa.post("/colaboradores", pessoa(nome="CARLA")).status_code == 400
    assert empresa.post("/colaboradores", pessoa(nome="Davi", vinculo="ESTAGIO")).status_code == 400
    assert empresa.post("/colaboradores", pessoa(nome="Davi", salario=0)).status_code == 400


def lancar_folha(cliente, competencia="2026-09", **extras):
    return cliente.post("/folha", {"competencia": competencia, "conta_id": cliente.conta, **extras})


def test_lanca_a_folha_de_todos_no_fluxo_de_caixa_sem_duplicar(empresa):
    carla = empresa.post(
        "/colaboradores", pessoa(beneficios=[{"nome": "VR", "valor_centavos": 40_000}, {"nome": "VT", "valor_centavos": 20_000}])
    ).json()["id"]
    empresa.post("/colaboradores", pessoa(nome="Davi", vinculo="PJ", salario=500_000, dia_pagamento=10))
    empresa.post("/colaboradores", pessoa(nome="Ana", vinculo="PRO_LABORE", salario=200_000, dia_pagamento=31))
    empresa.post("/colaboradores", pessoa(nome="Eva", ativo=False))
    empresa.post("/colaboradores", pessoa(nome="Fábio", admissao="2026-10-01"))

    resposta = lancar_folha(empresa)

    assert resposta.status_code == 200
    folha = resposta.json()
    assert (folha["lancados"], folha["ja_lancados"], folha["total_centavos"]) == (4, 0, 1_060_000)
    lancados = {l["descricao"]: l for l in (lancamento(empresa, id) for id in folha["lancamento_ids"])}
    todas = categorias(empresa)
    assert {descricao: (l["categoria_id"], l["data"], l["responsavel"]) for descricao, l in lancados.items()} == {
        "Salário · Carla · 09/2026": (todas["Folha de pagamento"]["id"], "2026-10-05", "Carla"),
        "Benefícios · Carla · 09/2026": (todas["Benefícios"]["id"], "2026-10-05", "Carla"),
        "Serviço PJ · Davi · 09/2026": (todas["Prestadores de serviço"]["id"], "2026-10-10", "Davi"),
        # Dia 31 vira o último dia de outubro.
        "Pró-labore · Ana · 09/2026": (todas["Pró-labore"]["id"], "2026-10-31", "Ana"),
    }
    assert lancados["Benefícios · Carla · 09/2026"]["valor_centavos"] == 60_000
    assert lancados["Salário · Carla · 09/2026"]["origem"] == {"tipo": "SALARIO", "id": carla, "competencia": "2026-09"}

    de_novo = lancar_folha(empresa).json()
    assert (de_novo["lancados"], de_novo["ja_lancados"]) == (0, 3)
    listados = {p["nome"]: p["competencias_lancadas"] for p in empresa.get("/colaboradores").json()}
    assert listados == {"Carla": ["2026-09"], "Davi": ["2026-09"], "Ana": ["2026-09"], "Eva": [], "Fábio": []}


def test_folha_com_data_unica_e_quem_entra_depois(empresa):
    empresa.post("/colaboradores", pessoa())
    lancar_folha(empresa, data="2026-09-30")
    empresa.post("/colaboradores", pessoa(nome="Davi"))

    segunda = lancar_folha(empresa, data="2026-09-30").json()

    assert (segunda["lancados"], segunda["ja_lancados"]) == (1, 1)
    assert lancamento(empresa, segunda["lancamento_ids"][0])["data"] == "2026-09-30"


def test_folha_sem_ninguem_ativo_ou_com_conta_errada_e_recusada(empresa):
    sem_ninguem = lancar_folha(empresa)
    assert sem_ninguem.status_code == 400
    assert "Ninguém ativo" in sem_ninguem.json()["campos"]["competencia"]

    empresa.post("/colaboradores", pessoa())
    assert lancar_folha(empresa, competencia="2026-13").status_code == 400
    conta_alheia = empresa.post("/folha", {"competencia": "2026-09", "conta_id": "0" * 24})
    assert conta_alheia.json()["campos"]["conta_id"] == "Conta não encontrada."


def test_edita_desativa_e_remove_pessoa_da_folha(empresa):
    carla = empresa.post("/colaboradores", pessoa()).json()["id"]
    salario = lancar_folha(empresa).json()["lancamento_ids"][0]

    editada = empresa.put(f"/colaboradores/{carla}", pessoa(nome="Carla Dias", salario=350_000, ativo=False))

    assert editada.status_code == 200
    corpo = editada.json()
    assert (corpo["nome"], corpo["salario_centavos"], corpo["ativo"], corpo["lancamentos_renomeados"]) == (
        "Carla Dias",
        350_000,
        False,
        1,
    )
    assert corpo["competencias_lancadas"] == ["2026-09"]
    assert lancamento(empresa, salario)["responsavel"] == "Carla Dias"
    assert excluir(empresa, f"/colaboradores/{carla}").status_code == 204
    assert excluir(empresa, f"/colaboradores/{carla}").status_code == 404


# --- Isolamento ------------------------------------------------------------------------


@pytest.mark.parametrize("caminho", ["/socios", "/tributos", "/colaboradores"])
def test_gestao_e_so_das_empresas(api, cabecalho_do_cliente, caminho):
    cabecalho = cabecalho_do_cliente("uid-bia")
    pessoal = api.get("/espacos", headers=cabecalho).json()[0]["id"]

    resposta = api.get(f"/espacos/{pessoal}{caminho}", headers=cabecalho)

    assert resposta.status_code == 404
    assert resposta.json()["detail"] == "Esta parte é das empresas do espaço empresarial."


@pytest.mark.parametrize("caminho", ["/socios", "/tributos", "/colaboradores"])
def test_empresa_de_outra_pessoa_nao_se_ve(empresa, cabecalho_do_cliente, caminho):
    bruno = cabecalho_do_cliente("uid-bruno")

    assert empresa.api.get(empresa.base + caminho, headers=bruno).status_code == 404
    assert empresa.api.post(empresa.base + caminho, headers=bruno, json={}).status_code in (400, 404)


def test_excluir_a_empresa_sem_movimento_leva_os_cadastros(api, cabecalho_do_cliente, livro_caixa):
    cabecalho = cabecalho_do_cliente("uid-ana")
    espaco = api.post("/espacos", headers=cabecalho, json={"tipo": "PJ", "nome": "Loja"}).json()["id"]
    base = f"/espacos/{espaco}"
    api.post(f"{base}/socios", headers=cabecalho, json={"nome": "Ana", "participacao_centesimos": 10_000})
    api.post(f"{base}/tributos", headers=cabecalho, json=das())
    api.post(f"{base}/colaboradores", headers=cabecalho, json=pessoa())

    assert api.delete(base, headers=cabecalho).status_code == 204
    assert all(not itens for itens in livro_caixa.cadastros.values())
