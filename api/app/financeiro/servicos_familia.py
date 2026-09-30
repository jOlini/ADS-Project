"""Modo Família do espaço pessoal, sem nada de HTTP.

A família não é um terceiro tipo de espaço: é um modo do espaço pessoal, que o
titular liga e desliga. As pessoas da casa são perfis dentro dele, sem login
próprio (o titular lança por elas), e um lançamento é de uma delas quando o
"responsável" tem o nome dela. Assim o extrato, os rachas e os relatórios que
já existem passam a separar por pessoa sem mudar o livro-caixa.

Assinatura: uma só, a do titular, cobre a casa inteira (o titular e até
MAXIMO_DE_MEMBROS_DA_FAMILIA pessoas). Ninguém da família precisa assinar.

Trava do plano: ligar o modo, incluir ou editar pessoas e filtrar relatórios
por pessoa pedem o Plano Família (ou o Empresarial, que inclui o Família). No
Free, a API responde 403 mesmo que a tela seja burlada. Tirar uma pessoa
continua liberado: é apagar dado, e isso a pessoa sempre pode.
"""

from uuid import uuid4

from app.erros import ErroConflito, ErroNaoEncontrado, ErroPermissao, ErroValidacao
from app.financeiro.modelos import (
    MAXIMO_DE_MEMBROS_DA_FAMILIA,
    AtualizacaoFamilia,
    Espaco,
    Familia,
    FiltroDePessoa,
    NovaPessoaDaFamilia,
    PessoaDaFamilia,
    TipoEspaco,
    libera_familia,
)
from app.financeiro.regras import chave_da_pessoa
from app.financeiro.repositorio import RepositorioLivroCaixa

SO_NO_PESSOAL = "O Modo Família fica no espaço pessoal."
PESSOA_NAO_ENCONTRADA = "Pessoa da família não encontrada."
LIMITE_DA_FAMILIA = (
    f"A família já tem {MAXIMO_DE_MEMBROS_DA_FAMILIA} pessoas além de você, o que a assinatura da família cobre. "
    "Remova alguém para incluir outra pessoa."
)
NOME_REPETIDO = "Já existe uma pessoa com este nome na família."
NOME_DO_TITULAR = '"Você" é o titular da conta. Use o nome da pessoa.'
SO_NO_PLANO_FAMILIA = (
    "O Modo Família faz parte do Plano Família. No Free, o espaço pessoal é só seu: "
    "as pessoas da casa e o filtro por pessoa ficam bloqueados."
)
# Valor do filtro dos relatórios para os lançamentos sem responsável.
TITULAR = "titular"


class ServicoFamilia:
    def __init__(self, repositorio: RepositorioLivroCaixa):
        self.repositorio = repositorio

    def familia(self, espaco: Espaco) -> Familia:
        self._conferir_pessoal(espaco)
        return espaco.familia

    def ligar(self, espaco: Espaco, dados: AtualizacaoFamilia) -> Familia:
        """Liga ou desliga. Desligado, a família some da tela, mas as pessoas
        continuam guardadas para quando o modo voltar."""
        self._conferir_pessoal(espaco)
        # Desligar é sempre possível; ligar pede o plano.
        if dados.ativa:
            self._conferir_plano(espaco)
        espaco.familia.ativa = dados.ativa
        return self.repositorio.atualizar_familia(espaco).familia

    def incluir(self, espaco: Espaco, dados: NovaPessoaDaFamilia) -> PessoaDaFamilia:
        self._conferir_pessoal(espaco)
        self._conferir_plano(espaco)
        if len(espaco.familia.pessoas) >= MAXIMO_DE_MEMBROS_DA_FAMILIA:
            raise ErroConflito(LIMITE_DA_FAMILIA)
        self._conferir_nome(espaco, dados.nome)
        pessoa = PessoaDaFamilia(id=uuid4().hex, nome=dados.nome, cor=dados.cor)
        espaco.familia.pessoas.append(pessoa)
        self.repositorio.atualizar_familia(espaco)
        return pessoa

    def editar(self, espaco: Espaco, id: str, dados: NovaPessoaDaFamilia) -> tuple[PessoaDaFamilia, int]:
        """Troca nome e cor. Com o nome novo, os lançamentos em que a pessoa é
        responsável (ou parte de um racha) passam para ele: o histórico dela
        continua dela. Devolve a pessoa e quantos lançamentos mudaram."""
        self._conferir_pessoal(espaco)
        self._conferir_plano(espaco)
        pessoa = self._pessoa(espaco, id)
        self._conferir_nome(espaco, dados.nome, ignorar=pessoa.id)
        antigo, pessoa.nome, pessoa.cor = pessoa.nome, dados.nome, dados.cor
        self.repositorio.atualizar_familia(espaco)
        renomeados = self.repositorio.renomear_pessoa(espaco.id, antigo, pessoa.nome) if antigo != pessoa.nome else 0
        return pessoa, renomeados

    def remover(self, espaco: Espaco, id: str) -> None:
        """Tira a pessoa da família. Os lançamentos dela ficam no extrato com
        o nome escrito, como os de qualquer responsável."""
        self._conferir_pessoal(espaco)
        pessoa = self._pessoa(espaco, id)
        espaco.familia.pessoas = [outra for outra in espaco.familia.pessoas if outra.id != pessoa.id]
        self.repositorio.atualizar_familia(espaco)

    def filtro(self, espaco: Espaco, membro: str | None) -> FiltroDePessoa | None:
        """O filtro "de quem" de um relatório: None (todos), o titular ou uma
        pessoa da família pelo id. Só no espaço pessoal."""
        if not membro:
            return None
        if espaco.tipo != TipoEspaco.PF:
            raise ErroValidacao({"membro": SO_NO_PESSOAL})
        self._conferir_plano(espaco)
        if membro == TITULAR:
            return FiltroDePessoa(None)
        pessoa = next((p for p in espaco.familia.pessoas if p.id == membro), None)
        if pessoa is None:
            raise ErroValidacao({"membro": PESSOA_NAO_ENCONTRADA})
        return FiltroDePessoa(pessoa.nome)

    @staticmethod
    def _conferir_pessoal(espaco: Espaco) -> None:
        # 404 e não 409: numa empresa, a família simplesmente não existe.
        if espaco.tipo != TipoEspaco.PF:
            raise ErroNaoEncontrado(SO_NO_PESSOAL)

    @staticmethod
    def _conferir_plano(espaco: Espaco) -> None:
        # 403: o espaço é da pessoa, mas o plano dela não cobre o recurso.
        if not libera_familia(espaco.plano):
            raise ErroPermissao(SO_NO_PLANO_FAMILIA)

    @staticmethod
    def _pessoa(espaco: Espaco, id: str) -> PessoaDaFamilia:
        pessoa = next((p for p in espaco.familia.pessoas if p.id == id), None)
        if pessoa is None:
            raise ErroNaoEncontrado(PESSOA_NAO_ENCONTRADA)
        return pessoa

    @staticmethod
    def _conferir_nome(espaco: Espaco, nome: str, ignorar: str | None = None) -> None:
        # Nome é o que liga a pessoa aos lançamentos: dois iguais (sem acento
        # e caixa) misturariam os gastos das duas.
        chave = chave_da_pessoa(nome)
        if chave in ("voce", "eu"):
            raise ErroValidacao({"nome": NOME_DO_TITULAR})
        if any(chave_da_pessoa(p.nome) == chave for p in espaco.familia.pessoas if p.id != ignorar):
            raise ErroValidacao({"nome": NOME_REPETIDO})
