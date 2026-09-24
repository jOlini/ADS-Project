"""Livro-caixa pelo HTTP: identidade do cliente, isolamento entre espaços,
partidas dobradas, saldos e estorno.

Sobe a API de verdade com os repositórios em memória e ID tokens do Firebase
assinados pela chave de teste (conftest.py).
"""

from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient

from app.financeiro.regras import CATEGORIAS_INICIAIS
from app.main import criar_app


@dataclass
class Cliente:
    """Atalho para chamar as rotas de um espaço com o token de uma pessoa."""

    api: TestClient
    cabecalho: dict
    base: str
    categorias: dict[str, str]

    def get(self, caminho="", **kwargs):
        return self.api.get(self.base + caminho, headers=self.cabecalho, **kwargs)

    def post(self, caminho, json=None):
        return self.api.post(self.base + caminho, headers=self.cabecalho, json=json)

    def put(self, caminho, json):
        return self.api.put(self.base + caminho, headers=self.cabecalho, json=json)

    def criar_conta(self, nome, saldo_inicial=0, tipo="CORRENTE"):
        resposta = self.post("/contas", {"nome": nome, "tipo": tipo, "saldo_inicial_centavos": saldo_inicial})
        assert resposta.status_code == 201
        return resposta.json()["id"]

    def lancar(self, tipo, valor, conta_id, categoria=None, destino=None, data="2026-09-19", descricao="Teste"):
        corpo = {"tipo": tipo, "descricao": descricao, "data": data, "valor_centavos": valor, "conta_id": conta_id}
        if categoria:
            corpo["categoria_id"] = self.categorias[categoria]
        if destino:
            corpo["conta_destino_id"] = destino
        return self.post("/lancamentos", corpo)

    def saldos(self):
        return {conta["nome"]: conta["saldo_centavos"] for conta in self.get("/contas").json()}


def entrar(api, cabecalho):
    espaco_id = api.get("/espacos", headers=cabecalho).json()[0]["id"]
    categorias = api.get(f"/espacos/{espaco_id}/categorias", headers=cabecalho).json()
    return Cliente(api, cabecalho, f"/espacos/{espaco_id}", {c["nome"]: c["id"] for c in categorias})


@pytest.fixture
def ana(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-ana"))


@pytest.fixture
def bruno(api, cabecalho_do_cliente):
    return entrar(api, cabecalho_do_cliente("uid-bruno"))


# --- Identidade -------------------------------------------------------------------


def test_sem_token_responde_401_com_desafio_bearer(api):
    resposta = api.get("/espacos")

    assert resposta.status_code == 401
    assert resposta.headers["WWW-Authenticate"] == "Bearer"
    assert resposta.headers["Content-Type"] == "application/problem+json"


def test_token_do_back_office_nao_abre_o_livro_caixa(api, cabecalho_de):
    resposta = api.get("/espacos", headers=cabecalho_de("id-admin"))

    assert resposta.status_code == 401
    assert "invalid_token" in resposta.headers["WWW-Authenticate"]


def test_token_do_cliente_nao_abre_a_area_administrativa(api, cabecalho_do_cliente):
    resposta = api.get("/usuarios", headers=cabecalho_do_cliente("uid-ana"))

    assert resposta.status_code == 401


def test_sem_firebase_configurado_o_livro_caixa_responde_503(config, repositorio, livro_caixa, cabecalho_do_cliente):
    config.firebase_project_id = ""

    with TestClient(criar_app(config, repositorio, livro_caixa)) as api:
        resposta = api.get("/espacos", headers=cabecalho_do_cliente("uid-ana"))

    assert resposta.status_code == 503


# --- Espaço pessoal ---------------------------------------------------------------


def test_primeiro_acesso_cria_o_espaco_pessoal_com_as_categorias_iniciais(api, cabecalho_do_cliente, livro_caixa):
    cabecalho = cabecalho_do_cliente("uid-ana")

    primeiro = api.get("/espacos", headers=cabecalho).json()
    segundo = api.get("/espacos", headers=cabecalho).json()

    assert primeiro == segundo
    assert len(primeiro) == 1
    assert primeiro[0] | {"id": None} == {
        "id": None,
        "tipo": "PF",
        "nome": "Pessoal",
        "moeda": "BRL",
        "fuso": "America/Sao_Paulo",
        "papel": "DONO",
    }
    categorias = api.get(f"/espacos/{primeiro[0]['id']}/categorias", headers=cabecalho).json()
    assert len(categorias) == len(CATEGORIAS_INICIAIS)
    assert len(livro_caixa.espacos) == 1


def test_espaco_de_outra_pessoa_responde_404_como_se_nao_existisse(ana, bruno):
    conta_da_ana = ana.criar_conta("Conta corrente", 100000)

    tentativas = [
        bruno.api.get(ana.base, headers=bruno.cabecalho),
        bruno.api.get(f"{ana.base}/contas", headers=bruno.cabecalho),
        bruno.api.get(f"{ana.base}/contas/{conta_da_ana}", headers=bruno.cabecalho),
        bruno.api.post(
            f"{ana.base}/lancamentos",
            headers=bruno.cabecalho,
            json={"tipo": "DESPESA", "descricao": "x", "data": "2026-09-19", "valor_centavos": 100,
                  "conta_id": conta_da_ana, "categoria_id": ana.categorias["Mercado"]},
        ),
        bruno.api.get("/espacos/000000000000000000000000", headers=bruno.cabecalho),
    ]

    assert [resposta.status_code for resposta in tentativas] == [404] * 5
    assert tentativas[0].json()["detail"] == tentativas[4].json()["detail"] == "Espaço não encontrado."
    assert ana.saldos() == {"Conta corrente": 100000}


def test_conta_de_outro_espaco_nao_aparece_pelo_id(ana, bruno):
    conta_da_ana = ana.criar_conta("Conta corrente")

    assert bruno.get(f"/contas/{conta_da_ana}").status_code == 404


# --- Contas e lançamentos -----------------------------------------------------------


def test_conta_criada_responde_201_com_location_e_saldo_inicial(ana):
    resposta = ana.post("/contas", {"nome": "  Carteira  ", "tipo": "CARTEIRA", "saldo_inicial_centavos": 23423})

    assert resposta.status_code == 201
    corpo = resposta.json()
    assert resposta.headers["Location"].endswith(f"{ana.base}/contas/{corpo['id']}")
    assert corpo["nome"] == "Carteira"
    assert corpo["saldo_centavos"] == corpo["saldo_inicial_centavos"] == 23423
    assert corpo["ativa"] is True


def test_receita_despesa_e_transferencia_atualizam_os_saldos(ana):
    corrente = ana.criar_conta("Conta corrente", 100000)
    poupanca = ana.criar_conta("Poupança", 0, tipo="POUPANCA")

    assert ana.lancar("RECEITA", 680000, corrente, categoria="Salário").status_code == 201
    assert ana.lancar("DESPESA", 21437, corrente, categoria="Mercado").status_code == 201
    assert ana.lancar("TRANSFERENCIA", 50000, corrente, destino=poupanca).status_code == 201

    assert ana.saldos() == {"Conta corrente": 708563, "Poupança": 50000}
    # A transferência muda onde o dinheiro está, não quanto existe.
    assert sum(ana.saldos().values()) == 100000 + 680000 - 21437


def test_lancamento_devolve_partidas_que_somam_zero_e_location(ana):
    corrente = ana.criar_conta("Conta corrente")

    resposta = ana.lancar("DESPESA", 5890, corrente, categoria="Saúde", descricao="Farmácia Central")

    corpo = resposta.json()
    assert resposta.headers["Location"].endswith(f"{ana.base}/lancamentos/{corpo['id']}")
    assert corpo["partidas"] == [
        {"conta_id": corrente, "categoria_id": None, "valor_centavos": -5890},
        {"conta_id": None, "categoria_id": ana.categorias["Saúde"], "valor_centavos": 5890},
    ]
    assert corpo["estorno_de"] is None and corpo["estornado_por"] is None
    assert ana.get(f"/lancamentos/{corpo['id']}").json() == corpo


def test_lancamento_com_categoria_de_outro_espaco_e_recusado(ana, bruno):
    corrente = ana.criar_conta("Conta corrente")
    ana.categorias["Mercado do Bruno"] = bruno.categorias["Mercado"]

    resposta = ana.lancar("DESPESA", 1000, corrente, categoria="Mercado do Bruno")

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"categoria_id": "Categoria não encontrada."}


@pytest.mark.parametrize(
    ("valor", "mensagem"),
    [
        (10.5, "Use um número inteiro (valores em centavos)."),
        ("1000", "Use um número inteiro (valores em centavos)."),
        (True, "Use um número inteiro (valores em centavos)."),
        (0, "Use um valor maior que 0."),
        (-500, "Use um valor maior que 0."),
        (100_000_000_001, "Valor fora do limite permitido."),
    ],
)
def test_valor_precisa_ser_inteiro_positivo_em_centavos(ana, valor, mensagem):
    corrente = ana.criar_conta("Conta corrente")

    resposta = ana.lancar("DESPESA", valor, corrente, categoria="Mercado")

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"valor_centavos": mensagem}


def test_partidas_e_espaco_enviados_no_corpo_sao_recusados(ana):
    corrente = ana.criar_conta("Conta corrente")

    resposta = ana.post(
        "/lancamentos",
        {
            "tipo": "RECEITA",
            "descricao": "Salário inventado",
            "data": "2026-09-19",
            "valor_centavos": 100,
            "conta_id": corrente,
            "categoria_id": ana.categorias["Salário"],
            "partidas": [{"conta_id": corrente, "valor_centavos": 99999999}],
            "espaco_id": "outro",
        },
    )

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"partidas": "Campo não permitido.", "espaco_id": "Campo não permitido."}


def test_data_e_tipo_invalidos_apontam_o_campo(ana):
    corrente = ana.criar_conta("Conta corrente")

    resposta = ana.post(
        "/lancamentos",
        {"tipo": "PIX", "descricao": "x", "data": "19/09/2026", "valor_centavos": 100, "conta_id": corrente},
    )

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {
        "tipo": "Valor inválido. Use RECEITA, DESPESA ou TRANSFERENCIA.",
        "data": "Data inválida. Use o formato AAAA-MM-DD.",
    }


def test_data_em_numero_nao_vira_timestamp(ana):
    corrente = ana.criar_conta("Conta corrente")

    resposta = ana.lancar("DESPESA", 100, corrente, categoria="Mercado", data=0)

    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"data": "Data inválida. Use o formato AAAA-MM-DD."}


def test_lancamento_nao_se_edita_nem_se_apaga(ana):
    corrente = ana.criar_conta("Conta corrente")
    id = ana.lancar("DESPESA", 1000, corrente, categoria="Lazer").json()["id"]

    edicao = ana.api.put(f"{ana.base}/lancamentos/{id}", headers=ana.cabecalho, json={"valor_centavos": 1})
    exclusao = ana.api.delete(f"{ana.base}/lancamentos/{id}", headers=ana.cabecalho)

    assert edicao.status_code == exclusao.status_code == 405
    assert ana.saldos() == {"Conta corrente": -1000}


def test_conta_desativada_nao_recebe_lancamento_mas_mantem_o_saldo(ana):
    corrente = ana.criar_conta("Conta corrente", 5000)

    desativada = ana.put(f"/contas/{corrente}", {"nome": "Conta antiga", "tipo": "CORRENTE", "ativa": False})
    resposta = ana.lancar("DESPESA", 1000, corrente, categoria="Mercado")

    assert desativada.status_code == 200
    assert desativada.json()["ativa"] is False
    assert resposta.status_code == 400
    assert resposta.json()["campos"] == {"conta_id": "Conta desativada: reative-a para lançar nela."}
    assert ana.saldos() == {"Conta antiga": 5000}


# --- Estorno -------------------------------------------------------------------------


def test_estorno_anula_o_lancamento_e_so_acontece_uma_vez(ana):
    corrente = ana.criar_conta("Conta corrente", 100000)
    original = ana.lancar("DESPESA", 18742, corrente, categoria="Contas da casa", descricao="Conta de luz").json()

    estorno = ana.post(f"/lancamentos/{original['id']}/estorno")

    assert estorno.status_code == 201
    corpo = estorno.json()
    assert estorno.headers["Location"].endswith(f"{ana.base}/lancamentos/{corpo['id']}")
    assert corpo["estorno_de"] == original["id"]
    assert corpo["descricao"] == "Estorno: Conta de luz"
    assert [p["valor_centavos"] for p in corpo["partidas"]] == [18742, -18742]
    assert ana.saldos() == {"Conta corrente": 100000}
    assert ana.get(f"/lancamentos/{original['id']}").json()["estornado_por"] == corpo["id"]

    de_novo = ana.post(f"/lancamentos/{original['id']}/estorno")
    do_estorno = ana.post(f"/lancamentos/{corpo['id']}/estorno")

    assert de_novo.status_code == do_estorno.status_code == 409
    assert de_novo.json()["detail"] == "Este lançamento já foi estornado."
    assert do_estorno.json()["detail"] == "Um estorno não pode ser estornado."
    assert ana.saldos() == {"Conta corrente": 100000}


def test_estorno_de_lancamento_inexistente_responde_404(ana):
    assert ana.post("/lancamentos/000000000000000000000000/estorno").status_code == 404


# --- Listagem e categorias ---------------------------------------------------------------


def test_listagem_filtra_por_periodo_do_mais_recente_ao_mais_antigo(ana):
    corrente = ana.criar_conta("Conta corrente")
    for data, descricao in [("2026-09-05", "Aluguel"), ("2026-08-31", "Agosto"), ("2026-09-19", "Mercado")]:
        ana.lancar("DESPESA", 1000, corrente, categoria="Moradia", data=data, descricao=descricao)

    setembro = ana.get("/lancamentos", params={"de": "2026-09-01", "ate": "2026-09-30"}).json()
    tudo = ana.get("/lancamentos").json()
    invertido = ana.get("/lancamentos", params={"de": "2026-09-30", "ate": "2026-09-01"})

    assert [l["descricao"] for l in setembro] == ["Mercado", "Aluguel"]
    assert [l["data"] for l in tudo] == ["2026-09-19", "2026-09-05", "2026-08-31"]
    assert invertido.status_code == 400
    assert invertido.json()["campos"] == {"ate": "A data final vem antes da inicial."}


def test_categoria_nova_pode_ser_renomeada_e_desativada_mas_nao_muda_de_tipo(ana):
    criada = ana.post("/categorias", {"nome": "Pets", "tipo": "DESPESA", "cor": "lazer"})
    id = criada.json()["id"]

    renomeada = ana.put(f"/categorias/{id}", {"nome": "Animais", "cor": "saude", "ativa": False})
    mudando_tipo = ana.put(f"/categorias/{id}", {"nome": "Animais", "cor": "saude", "ativa": True, "tipo": "RECEITA"})

    assert criada.status_code == 201
    assert criada.headers["Location"].endswith(f"{ana.base}/categorias/{id}")
    assert renomeada.json() == {"id": id, "nome": "Animais", "tipo": "DESPESA", "cor": "saude", "ativa": False}
    assert mudando_tipo.status_code == 400
    assert mudando_tipo.json()["campos"] == {"tipo": "Campo não permitido."}


def test_rotas_do_livro_caixa_nao_ficam_em_cache(ana):
    resposta = ana.get("/contas")

    assert resposta.headers["Cache-Control"] == "no-store"
    assert resposta.headers["X-Content-Type-Options"] == "nosniff"
