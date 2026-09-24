"""Entidades do livro-caixa e contratos (JSON) de entrada e saída.

Dinheiro é sempre inteiro em centavos, nunca float: 0.1 + 0.2 não dá 0.3 em
ponto flutuante, e um centavo perdido num saldo é erro de verdade.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, Field, StringConstraints

from app.modelos import Entrada

# Teto de um valor, em centavos (R$ 1 bilhão). Barra número absurdo digitado
# por engano e soma que estouraria o inteiro de 64 bits do MongoDB.
LIMITE_EM_CENTAVOS = 100_000_000_000
# Teto do texto de um extrato em CSV (caracteres). Um mês de extrato fica bem
# abaixo; o limite barra requisição enorme antes de qualquer leitura.
TAMANHO_MAXIMO_DO_CSV = 500_000


class TipoEspaco(StrEnum):
    PF = "PF"


class Papel(StrEnum):
    """Papel de uma pessoa dentro de um espaço."""

    DONO = "DONO"


class TipoConta(StrEnum):
    CORRENTE = "CORRENTE"
    POUPANCA = "POUPANCA"
    CARTEIRA = "CARTEIRA"
    INVESTIMENTO = "INVESTIMENTO"


class TipoCategoria(StrEnum):
    RECEITA = "RECEITA"
    DESPESA = "DESPESA"


class TipoLancamento(StrEnum):
    RECEITA = "RECEITA"
    DESPESA = "DESPESA"
    TRANSFERENCIA = "TRANSFERENCIA"


class SituacaoDaLinha(StrEnum):
    """O que aconteceu com cada linha de um extrato importado."""

    NOVA = "NOVA"  # simulação: seria importada
    IMPORTADA = "IMPORTADA"
    JA_IMPORTADA = "JA_IMPORTADA"  # a chave da linha já existe no espaço
    INVALIDA = "INVALIDA"  # a linha não virou lançamento (motivo em "erro")


class CorCategoria(StrEnum):
    """Mesmos nomes das variáveis --cat-* do CSS da área do cliente."""

    MORADIA = "moradia"
    MERCADO = "mercado"
    TRANSPORTE = "transporte"
    CASA = "casa"
    SAUDE = "saude"
    LAZER = "lazer"
    ENTRADA = "entrada"
    NEUTRO = "neutro"


# --- Entidades (como ficam guardadas) ------------------------------------------


@dataclass
class Membro:
    uid: str
    papel: Papel


@dataclass
class Espaco:
    """Um livro-caixa. Toda conta, categoria e lançamento pertence a um espaço,
    e toda consulta filtra por ele."""

    tipo: TipoEspaco
    nome: str
    moeda: str
    fuso: str
    membros: list[Membro]
    criado_em: datetime
    # uid do dono quando é o espaço pessoal (um por pessoa, índice único).
    pessoal_de: str | None = None
    id: str | None = None

    def papel_de(self, uid: str) -> Papel | None:
        return next((membro.papel for membro in self.membros if membro.uid == uid), None)


@dataclass
class Conta:
    espaco_id: str
    nome: str
    tipo: TipoConta
    saldo_inicial_centavos: int
    ativa: bool
    criada_em: datetime
    id: str | None = None


@dataclass
class Categoria:
    espaco_id: str
    nome: str
    tipo: TipoCategoria
    cor: CorCategoria
    ativa: bool
    criada_em: datetime
    id: str | None = None


@dataclass(frozen=True)
class Partida:
    """Um lado do lançamento: dinheiro que entra (+) ou sai (−) de uma conta ou
    de uma categoria. Exatamente um dos dois ids é preenchido."""

    valor_centavos: int
    conta_id: str | None = None
    categoria_id: str | None = None


@dataclass
class Lancamento:
    """Imutável depois de gravado: correção é feita com estorno, nunca com
    edição ou exclusão. As partidas somam zero."""

    espaco_id: str
    tipo: TipoLancamento
    descricao: str
    data: date
    valor_centavos: int
    conta_id: str
    partidas: list[Partida]
    criado_em: datetime
    criado_por: str
    categoria_id: str | None = None
    conta_destino_id: str | None = None
    estorno_de: str | None = None
    # Chave de idempotência da linha do extrato que gerou o lançamento
    # (importacao.chaves_de_importacao). Única no espaço: a mesma linha
    # importada de novo não vira outro lançamento.
    chave_importacao: str | None = None
    id: str | None = None
    # Calculado na leitura (id do estorno deste lançamento); não é gravado.
    estornado_por: str | None = field(default=None, compare=False)


@dataclass(frozen=True)
class ResultadoDaLinha:
    """Uma linha do extrato depois da importação (ou da simulação)."""

    linha: int
    situacao: SituacaoDaLinha
    data: date | None = None
    descricao: str | None = None
    valor_centavos: int | None = None
    lancamento_id: str | None = None
    erro: str | None = None


# --- Entrada (corpo das requisições) -------------------------------------------


def _data_sem_numero(valor):
    # O modo flexível do Pydantic aceitaria um número como timestamp Unix
    # (0 viraria 1970-01-01). Data de lançamento chega como "AAAA-MM-DD".
    if isinstance(valor, int | float):
        raise ValueError("Data inválida. Use o formato AAAA-MM-DD.")
    return valor


# strict: "10" (texto) e 10.5 (fração de centavo) são recusados, e true não vira 1.
Centavos = Annotated[int, Field(strict=True, ge=-LIMITE_EM_CENTAVOS, le=LIMITE_EM_CENTAVOS)]
CentavosPositivos = Annotated[int, Field(strict=True, gt=0, le=LIMITE_EM_CENTAVOS)]
Nome = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
Descricao = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Identificador = Annotated[str, StringConstraints(min_length=1, max_length=64)]
Booleano = Annotated[bool, Field(strict=True)]
Data = Annotated[date, BeforeValidator(_data_sem_numero)]


class NovaConta(Entrada):
    nome: Nome
    tipo: TipoConta
    # Dinheiro que já estava na conta antes do primeiro lançamento. Fixo depois
    # de criado: mudá-lo reescreveria o saldo de todos os dias passados.
    saldo_inicial_centavos: Centavos = 0


class AtualizacaoConta(Entrada):
    """PUT substitui a parte editável inteira. Desativar tira a conta das
    escolhas de novos lançamentos, sem apagar o histórico."""

    nome: Nome
    tipo: TipoConta
    ativa: Booleano


class NovaCategoria(Entrada):
    nome: Nome
    tipo: TipoCategoria
    cor: CorCategoria = CorCategoria.NEUTRO


class AtualizacaoCategoria(Entrada):
    """O tipo não muda: uma categoria de despesa com lançamentos não pode virar
    de receita sem desfazer o sentido deles."""

    nome: Nome
    cor: CorCategoria
    ativa: Booleano


class NovoLancamento(Entrada):
    """Receita e despesa pedem conta e categoria; transferência pede conta de
    origem (conta_id) e de destino. A coerência entre os campos é conferida em
    regras.conferir_lancamento. As partidas são montadas pela API, nunca
    enviadas pelo cliente: assim a soma zero não depende de quem chama."""

    tipo: TipoLancamento
    descricao: Descricao
    data: Data
    valor_centavos: CentavosPositivos
    conta_id: Identificador
    categoria_id: Identificador | None = None
    conta_destino_id: Identificador | None = None


class NovaImportacao(Entrada):
    """Extrato do banco em CSV (o texto do arquivo) e onde lançar cada linha:
    saídas (valor negativo) na categoria de despesa, entradas na de receita,
    todas na mesma conta. Com simular=true, a API só confere o arquivo e diz o
    que entraria, sem gravar nada."""

    conta_id: Identificador
    categoria_despesa_id: Identificador
    categoria_receita_id: Identificador
    csv: Annotated[str, StringConstraints(min_length=1, max_length=TAMANHO_MAXIMO_DO_CSV)]
    simular: Booleano = False


# --- Saída ---------------------------------------------------------------------


class EspacoResposta(BaseModel):
    id: str
    tipo: TipoEspaco
    nome: str
    moeda: str
    fuso: str
    papel: Papel

    @classmethod
    def de(cls, espaco: Espaco, uid: str) -> "EspacoResposta":
        return cls(
            id=espaco.id,
            tipo=espaco.tipo,
            nome=espaco.nome,
            moeda=espaco.moeda,
            fuso=espaco.fuso,
            papel=espaco.papel_de(uid),
        )


class ContaResposta(BaseModel):
    id: str
    nome: str
    tipo: TipoConta
    saldo_inicial_centavos: int
    # Saldo inicial + todas as partidas da conta.
    saldo_centavos: int
    ativa: bool
    criada_em: datetime

    @classmethod
    def de(cls, conta: Conta, saldo_centavos: int) -> "ContaResposta":
        return cls(
            id=conta.id,
            nome=conta.nome,
            tipo=conta.tipo,
            saldo_inicial_centavos=conta.saldo_inicial_centavos,
            saldo_centavos=saldo_centavos,
            ativa=conta.ativa,
            criada_em=conta.criada_em,
        )


class CategoriaResposta(BaseModel):
    id: str
    nome: str
    tipo: TipoCategoria
    cor: CorCategoria
    ativa: bool

    @classmethod
    def de(cls, categoria: Categoria) -> "CategoriaResposta":
        return cls(
            id=categoria.id,
            nome=categoria.nome,
            tipo=categoria.tipo,
            cor=categoria.cor,
            ativa=categoria.ativa,
        )


class PartidaResposta(BaseModel):
    conta_id: str | None
    categoria_id: str | None
    valor_centavos: int


class LancamentoResposta(BaseModel):
    id: str
    tipo: TipoLancamento
    descricao: str
    data: date
    valor_centavos: int
    conta_id: str
    categoria_id: str | None
    conta_destino_id: str | None
    partidas: list[PartidaResposta]
    estorno_de: str | None
    estornado_por: str | None
    criado_em: datetime

    @classmethod
    def de(cls, lancamento: Lancamento) -> "LancamentoResposta":
        return cls(
            id=lancamento.id,
            tipo=lancamento.tipo,
            descricao=lancamento.descricao,
            data=lancamento.data,
            valor_centavos=lancamento.valor_centavos,
            conta_id=lancamento.conta_id,
            categoria_id=lancamento.categoria_id,
            conta_destino_id=lancamento.conta_destino_id,
            partidas=[
                PartidaResposta(
                    conta_id=partida.conta_id,
                    categoria_id=partida.categoria_id,
                    valor_centavos=partida.valor_centavos,
                )
                for partida in lancamento.partidas
            ],
            estorno_de=lancamento.estorno_de,
            estornado_por=lancamento.estornado_por,
            criado_em=lancamento.criado_em,
        )


class LinhaImportadaResposta(BaseModel):
    linha: int
    situacao: SituacaoDaLinha
    data: date | None
    descricao: str | None
    # Com sinal, como no extrato: negativo é saída.
    valor_centavos: int | None
    lancamento_id: str | None
    erro: str | None


class ImportacaoResposta(BaseModel):
    simulacao: bool
    novas: int
    importadas: int
    ja_importadas: int
    invalidas: int
    linhas: list[LinhaImportadaResposta]

    @classmethod
    def de(cls, resultados: list[ResultadoDaLinha], simulacao: bool) -> "ImportacaoResposta":
        contagem = {situacao: 0 for situacao in SituacaoDaLinha}
        for resultado in resultados:
            contagem[resultado.situacao] += 1
        return cls(
            simulacao=simulacao,
            novas=contagem[SituacaoDaLinha.NOVA],
            importadas=contagem[SituacaoDaLinha.IMPORTADA],
            ja_importadas=contagem[SituacaoDaLinha.JA_IMPORTADA],
            invalidas=contagem[SituacaoDaLinha.INVALIDA],
            linhas=[
                LinhaImportadaResposta(
                    linha=resultado.linha,
                    situacao=resultado.situacao,
                    data=resultado.data,
                    descricao=resultado.descricao,
                    valor_centavos=resultado.valor_centavos,
                    lancamento_id=resultado.lancamento_id,
                    erro=resultado.erro,
                )
                for resultado in resultados
            ],
        )
