"""Testes unitários das regras de negócio (cadastro, atualização, exclusão e
login), com o repositório em memória no lugar do MongoDB."""

import bcrypt
import pytest

from app.erros import ErroConflito, ErroNaoAutenticado, ErroNaoEncontrado, ErroPermissao
from app.modelos import AtualizacaoUsuario, LoginRequisicao, NovoUsuario, Perfil
from app.servicos import MENSAGEM_LOGIN_RECUSADO, ServicoUsuarios, autenticar
from app.tokens import validar_token
from tests.conftest import SENHA_DE_TESTE


@pytest.fixture
def servico(repositorio):
    return ServicoUsuarios(repositorio)


@pytest.fixture
def admin(repositorio):
    return repositorio.buscar_por_id("id-admin")


@pytest.fixture
def operador(repositorio):
    return repositorio.buscar_por_id("id-operador")


def atualizacao(nome="Clara Cliente", email="cliente@exemplo.com", perfil=Perfil.CLIENTE):
    return AtualizacaoUsuario(nome=nome, email=email, perfil=perfil)


# --- Cadastro ---------------------------------------------------------------


def test_cadastro_guarda_so_o_hash_bcrypt_da_senha(servico, repositorio):
    criado = servico.criar(
        NovoUsuario(nome="Bruno Lima", email="Bruno@Exemplo.com", senha="senha-forte-1", perfil=Perfil.CLIENTE)
    )

    salvo = repositorio.buscar_por_id(criado.id)
    assert salvo.senha_hash != "senha-forte-1"
    assert salvo.senha_hash.startswith("$2b$")
    assert bcrypt.checkpw(b"senha-forte-1", salvo.senha_hash.encode())
    assert salvo.email == "bruno@exemplo.com"


def test_cadastro_recusa_email_ja_usado(servico):
    with pytest.raises(ErroConflito):
        servico.criar(
            NovoUsuario(nome="Outra", email="CLIENTE@exemplo.com", senha="senha-forte-1", perfil=Perfil.CLIENTE)
        )


def test_busca_de_id_inexistente_da_nao_encontrado(servico):
    with pytest.raises(ErroNaoEncontrado):
        servico.buscar("id-que-nao-existe")


# --- Atualização --------------------------------------------------------------


def test_operador_atualiza_nome_e_email_de_cliente(servico, operador):
    atualizado = servico.atualizar("id-cliente", atualizacao(nome="Clara Souza", email="clara@exemplo.com"), operador)

    assert atualizado.nome == "Clara Souza"
    assert atualizado.email == "clara@exemplo.com"


def test_operador_nao_altera_perfil(servico, operador, repositorio):
    # Escalação de privilégio: operador não promove ninguém, nem a si mesmo.
    with pytest.raises(ErroPermissao):
        servico.atualizar("id-cliente", atualizacao(perfil=Perfil.ADMINISTRADOR), operador)

    assert repositorio.buscar_por_id("id-cliente").perfil == Perfil.CLIENTE


def test_operador_nao_altera_dados_de_administrador(servico, operador):
    with pytest.raises(ErroPermissao):
        servico.atualizar(
            "id-admin",
            atualizacao(nome="Ana", email="invasor@exemplo.com", perfil=Perfil.ADMINISTRADOR),
            operador,
        )


def test_administrador_altera_perfil_de_outro_usuario(servico, admin):
    atualizado = servico.atualizar("id-cliente", atualizacao(perfil=Perfil.OPERADOR), admin)

    assert atualizado.perfil == Perfil.OPERADOR


def test_administrador_nao_altera_o_proprio_perfil(servico, admin):
    with pytest.raises(ErroConflito):
        servico.atualizar(
            "id-admin",
            atualizacao(nome="Ana Administradora", email="administrador@exemplo.com", perfil=Perfil.CLIENTE),
            admin,
        )


def test_atualizacao_recusa_email_de_outra_conta(servico, admin):
    with pytest.raises(ErroConflito):
        servico.atualizar("id-cliente", atualizacao(email="operador@exemplo.com"), admin)


# --- Exclusão -----------------------------------------------------------------


def test_administrador_exclui_outro_usuario(servico, admin, repositorio):
    servico.excluir("id-cliente", admin)

    assert repositorio.buscar_por_id("id-cliente") is None


def test_administrador_nao_exclui_a_propria_conta(servico, admin, repositorio):
    with pytest.raises(ErroConflito):
        servico.excluir("id-admin", admin)

    assert repositorio.buscar_por_id("id-admin") is not None


# --- Login --------------------------------------------------------------------


def test_login_com_credenciais_certas_devolve_token_valido(repositorio, config):
    resposta = autenticar(LoginRequisicao(email="cliente@exemplo.com", senha=SENHA_DE_TESTE), repositorio, config)

    assert resposta.tipo == "Bearer"
    assert resposta.usuario.perfil == Perfil.CLIENTE
    assert validar_token(resposta.token, config.jwt_secret)["sub"] == "id-cliente"


def test_login_ignora_maiusculas_e_espacos_no_email(repositorio, config):
    resposta = autenticar(LoginRequisicao(email="  CLIENTE@Exemplo.com ", senha=SENHA_DE_TESTE), repositorio, config)

    assert resposta.usuario.id == "id-cliente"


def test_login_recusa_senha_errada(repositorio, config):
    with pytest.raises(ErroNaoAutenticado):
        autenticar(LoginRequisicao(email="cliente@exemplo.com", senha="senha-errada"), repositorio, config)


def test_email_inexistente_e_senha_errada_tem_a_mesma_resposta(repositorio, config):
    # Enumeração de usuários: de fora, os dois casos são indistinguíveis.
    with pytest.raises(ErroNaoAutenticado) as senha_errada:
        autenticar(LoginRequisicao(email="cliente@exemplo.com", senha="senha-errada"), repositorio, config)
    with pytest.raises(ErroNaoAutenticado) as email_inexistente:
        autenticar(LoginRequisicao(email="ninguem@exemplo.com", senha="qualquer"), repositorio, config)

    assert senha_errada.value.detalhe == email_inexistente.value.detalhe == MENSAGEM_LOGIN_RECUSADO
