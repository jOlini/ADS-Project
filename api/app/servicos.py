"""Regras de negócio de usuários e de login, sem nada de HTTP.

Quem pode chamar cada operação é decidido antes, em seguranca.py. Aqui ficam
as regras que dependem do usuário-alvo, que a camada HTTP não enxerga.
"""

from datetime import UTC, datetime

from app.config import Configuracoes
from app.erros import ErroConflito, ErroNaoAutenticado, ErroNaoEncontrado, ErroPermissao
from app.modelos import AtualizacaoUsuario, LoginRequisicao, LoginResposta, NovoUsuario, Perfil, Usuario, UsuarioResposta
from app.repositorio import RepositorioUsuarios
from app.senhas import conferir_senha, gerar_hash, hash_ficticio
from app.tokens import gerar_token

# Uma única mensagem para "e-mail não existe" e "senha errada": a resposta
# não pode revelar qual dos dois falhou (enumeração de usuários).
MENSAGEM_LOGIN_RECUSADO = "E-mail ou senha inválidos."


def normalizar_email(email: str) -> str:
    """"Ana@X.com" e "ana@x.com" são a mesma conta, no cadastro e no login."""
    return email.strip().lower()


class ServicoUsuarios:
    def __init__(self, repositorio: RepositorioUsuarios):
        self.repositorio = repositorio

    def listar(self) -> list[Usuario]:
        return self.repositorio.listar()

    def buscar(self, id: str) -> Usuario:
        usuario = self.repositorio.buscar_por_id(id)
        if usuario is None:
            raise ErroNaoEncontrado("Usuário não encontrado.")
        return usuario

    def criar(self, dados: NovoUsuario) -> Usuario:
        email = normalizar_email(dados.email)
        if self.repositorio.existe_email(email):
            raise ErroConflito("E-mail já cadastrado.")

        agora = datetime.now(UTC)
        usuario = Usuario(
            nome=dados.nome,
            email=email,
            senha_hash=gerar_hash(dados.senha),
            perfil=dados.perfil,
            criado_em=agora,
            atualizado_em=agora,
        )
        return self.repositorio.inserir(usuario)

    def atualizar(self, id: str, dados: AtualizacaoUsuario, solicitante: Usuario) -> Usuario:
        usuario = self.buscar(id)
        mudou_perfil = dados.perfil != usuario.perfil

        # Sem estas duas regras, um operador poderia se promover a
        # administrador (escalação de privilégio) ou trocar o e-mail de um
        # administrador e trancá-lo fora do sistema.
        if solicitante.perfil == Perfil.OPERADOR:
            if usuario.perfil == Perfil.ADMINISTRADOR:
                raise ErroPermissao("Operador não altera dados de administrador.")
            if mudou_perfil:
                raise ErroPermissao("Apenas administradores alteram o perfil de acesso.")

        # Um administrador que rebaixa a si mesmo pode deixar o sistema sem
        # nenhum administrador. A troca de perfil precisa vir de outra conta.
        if mudou_perfil and usuario.id == solicitante.id:
            raise ErroConflito("Não é permitido alterar o próprio perfil.")

        email = normalizar_email(dados.email)
        if email != usuario.email and self.repositorio.existe_email(email):
            raise ErroConflito("E-mail já cadastrado.")

        usuario.nome = dados.nome
        usuario.email = email
        usuario.perfil = dados.perfil
        usuario.atualizado_em = datetime.now(UTC)
        return self.repositorio.atualizar(usuario)

    def excluir(self, id: str, solicitante: Usuario) -> None:
        if id == solicitante.id:
            raise ErroConflito("Um administrador não pode excluir a própria conta.")
        self.repositorio.excluir(self.buscar(id).id)


def autenticar(credenciais: LoginRequisicao, repositorio: RepositorioUsuarios, config: Configuracoes) -> LoginResposta:
    usuario = repositorio.buscar_por_email(normalizar_email(credenciais.email))

    # O BCrypt roda mesmo quando o e-mail não existe. Sem isso, "e-mail
    # inexistente" responderia em 1 ms e "senha errada" em ~250 ms, e o tempo
    # de resposta revelaria quais e-mails têm conta.
    senha_hash = usuario.senha_hash if usuario else hash_ficticio()
    senha_confere = conferir_senha(credenciais.senha, senha_hash)

    if usuario is None or not senha_confere:
        raise ErroNaoAutenticado(MENSAGEM_LOGIN_RECUSADO)

    token, expira_em = gerar_token(usuario, config.jwt_secret, config.jwt_expiration)
    return LoginResposta(token=token, expira_em=expira_em, usuario=UsuarioResposta.de(usuario))


def criar_administrador_inicial(repositorio: RepositorioUsuarios, config: Configuracoes) -> Usuario | None:
    """Só um ADMINISTRADOR cria usuários, então alguém precisa existir antes do
    primeiro login. Com o banco vazio, cria esse administrador a partir de
    ADMIN_EMAIL e ADMIN_SENHA. Com qualquer usuário cadastrado, não faz nada.
    A credencial vem do ambiente, nunca do código: o repositório é público."""
    if repositorio.contar() > 0 or not config.admin_email or len(config.admin_senha) < 8:
        return None
    dados = NovoUsuario(
        nome=config.admin_nome,
        email=config.admin_email,
        senha=config.admin_senha,
        perfil=Perfil.ADMINISTRADOR,
    )
    return ServicoUsuarios(repositorio).criar(dados)
