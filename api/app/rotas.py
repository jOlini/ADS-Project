"""Endpoints REST. Cada rota declara quem pode chamá-la (ver seguranca.py);
aqui fica só o contrato HTTP: método, caminho, corpo e código de resposta."""

from fastapi import APIRouter, Depends, Request, Response, status

from app.config import Configuracoes
from app.modelos import AtualizacaoUsuario, LoginRequisicao, LoginResposta, NovoUsuario, Usuario, UsuarioResposta
from app.repositorio import RepositorioUsuarios
from app.seguranca import (
    administrador_ou_operador,
    equipe_ou_proprio_cadastro,
    obter_config,
    obter_repositorio,
    somente_administrador,
)
from app.servicos import ServicoUsuarios, autenticar

# Descrições dos erros para a documentação interativa (/docs).
ERRO_401 = {401: {"description": "Token ausente, inválido ou expirado"}}
ERRO_403 = {403: {"description": "Perfil sem permissão"}}
ERRO_404 = {404: {"description": "Usuário não encontrado"}}
ERRO_409 = {409: {"description": "Conflito (e-mail já cadastrado ou operação sobre a própria conta)"}}

rotas_autenticacao = APIRouter(prefix="/auth", tags=["Autenticação"])
rotas_usuarios = APIRouter(prefix="/usuarios", tags=["Usuários"], responses={**ERRO_401, **ERRO_403})


def obter_servico(repositorio: RepositorioUsuarios = Depends(obter_repositorio)) -> ServicoUsuarios:
    return ServicoUsuarios(repositorio)


@rotas_autenticacao.post(
    "/login",
    response_model=LoginResposta,
    summary="Autenticar e obter o token JWT",
    responses={401: {"description": "E-mail ou senha inválidos"}},
)
def login(
    credenciais: LoginRequisicao,
    repositorio: RepositorioUsuarios = Depends(obter_repositorio),
    config: Configuracoes = Depends(obter_config),
):
    """Único endpoint público da API."""
    return autenticar(credenciais, repositorio, config)


@rotas_usuarios.get(
    "",
    response_model=list[UsuarioResposta],
    summary="Listar usuários (ADMINISTRADOR, OPERADOR)",
    dependencies=[Depends(administrador_ou_operador)],
)
def listar_usuarios(servico: ServicoUsuarios = Depends(obter_servico)):
    return [UsuarioResposta.de(usuario) for usuario in servico.listar()]


@rotas_usuarios.get(
    "/{id}",
    response_model=UsuarioResposta,
    summary="Consultar um usuário (ADMINISTRADOR, OPERADOR ou o próprio CLIENTE)",
    dependencies=[Depends(equipe_ou_proprio_cadastro)],
    responses=ERRO_404,
)
def buscar_usuario(id: str, servico: ServicoUsuarios = Depends(obter_servico)):
    return UsuarioResposta.de(servico.buscar(id))


@rotas_usuarios.post(
    "",
    response_model=UsuarioResposta,
    status_code=status.HTTP_201_CREATED,
    summary="Criar usuário (ADMINISTRADOR)",
    dependencies=[Depends(somente_administrador)],
    responses=ERRO_409,
)
def criar_usuario(
    dados: NovoUsuario,
    requisicao: Request,
    resposta: Response,
    servico: ServicoUsuarios = Depends(obter_servico),
):
    criado = servico.criar(dados)
    # 201 Created com o cabeçalho Location apontando para o novo recurso.
    resposta.headers["Location"] = str(requisicao.url_for("buscar_usuario", id=criado.id))
    return UsuarioResposta.de(criado)


@rotas_usuarios.put(
    "/{id}",
    response_model=UsuarioResposta,
    summary="Atualizar nome, e-mail e perfil (ADMINISTRADOR, OPERADOR)",
    responses={**ERRO_404, **ERRO_409},
)
def atualizar_usuario(
    id: str,
    dados: AtualizacaoUsuario,
    solicitante: Usuario = Depends(administrador_ou_operador),
    servico: ServicoUsuarios = Depends(obter_servico),
):
    return UsuarioResposta.de(servico.atualizar(id, dados, solicitante))


@rotas_usuarios.delete(
    "/{id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Excluir usuário (ADMINISTRADOR)",
    responses={**ERRO_404, **ERRO_409},
)
def excluir_usuario(
    id: str,
    solicitante: Usuario = Depends(somente_administrador),
    servico: ServicoUsuarios = Depends(obter_servico),
):
    servico.excluir(id, solicitante)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
