"""Cadastros da gestão de cada empresa (espaço empresarial): sócios, tributos e
pessoas da folha, com os contratos (JSON) de entrada e saída.

Como no resto do livro-caixa, dinheiro é inteiro em centavos. Porcentagem é
inteiro em centésimos de ponto (10000 = 100%, 600 = 6%): a alíquota de 4,8% do
IRPJ presumido é 480, sem ponto flutuante no meio da conta.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum
from typing import Annotated

from pydantic import BaseModel, BeforeValidator, Field, StringConstraints

from app.financeiro.modelos import (
    CentavosPositivos,
    ClasseDeCusto,
    Data,
    Descricao,
    DiaDoMes,
    Identificador,
    Nome,
)
from app.modelos import Entrada
from app.sanitizacao import texto_limpo

# Tetos por empresa: barram listas sem fim, muito acima do negócio pequeno.
MAXIMO_DE_SOCIOS = 20
MAXIMO_DE_TRIBUTOS = 30
MAXIMO_DE_COLABORADORES = 200
MAXIMO_DE_BENEFICIOS = 10
# 100% em centésimos de ponto.
CEM_POR_CENTO = 10_000

Percentual = Annotated[int, Field(strict=True, ge=0, le=CEM_POR_CENTO)]
PercentualPositivo = Annotated[int, Field(strict=True, gt=0, le=CEM_POR_CENTO)]
# Mês de competência (AAAA-MM).
Competencia = Annotated[str, StringConstraints(pattern=r"^\d{4}-(0[1-9]|1[0-2])$")]
# Opcional: vazio vira "sem cargo".
Cargo = Annotated[str, StringConstraints(strip_whitespace=True, max_length=60), BeforeValidator(texto_limpo)]


class TipoDeTributo(StrEnum):
    """A guia do tributo (só o rótulo: a conta vem da base e da alíquota)."""

    DAS = "DAS"  # Simples Nacional e MEI
    DARF = "DARF"  # federais: IRPJ, CSLL, PIS, COFINS
    ISS = "ISS"  # municipal, sobre serviços
    GPS = "GPS"  # INSS
    FGTS = "FGTS"
    OUTRO = "OUTRO"


class BaseDoTributo(StrEnum):
    """Sobre o que o tributo é calculado (a provisão do mês)."""

    FATURAMENTO = "FATURAMENTO"  # alíquota sobre a receita bruta da competência
    FOLHA = "FOLHA"  # alíquota sobre os salários CLT da competência
    FIXO = "FIXO"  # valor fixo por competência (o DAS do MEI)


class Periodicidade(StrEnum):
    MENSAL = "MENSAL"
    # Competência = o trimestre, pelo último mês dele (03, 06, 09, 12).
    TRIMESTRAL = "TRIMESTRAL"


class Vinculo(StrEnum):
    CLT = "CLT"  # salário na categoria da folha de pagamento
    PJ = "PJ"  # prestador de serviço com contrato mensal
    PRO_LABORE = "PRO_LABORE"  # sócio que trabalha na empresa


# --- Entidades -------------------------------------------------------------------


@dataclass
class Socio:
    """Sócio no quadro societário. A participação (em centésimos de ponto)
    reparte o lucro na apuração dos dividendos; aportes, pró-labore e
    distribuições são lançamentos com o nome do sócio como responsável."""

    espaco_id: str
    nome: str
    participacao_centesimos: int
    criado_em: datetime
    id: str | None = None


@dataclass
class Tributo:
    """Tributo recorrente da empresa, com o vencimento e a base da provisão.
    O pagamento de cada competência é um lançamento com a origem TRIBUTO."""

    espaco_id: str
    nome: str
    tipo: TipoDeTributo
    base: BaseDoTributo
    dia_vencimento: int
    periodicidade: Periodicidade
    ativo: bool
    criado_em: datetime
    # Alíquota (FATURAMENTO e FOLHA) ou valor fixo (FIXO); o outro fica vazio.
    aliquota_centesimos: int | None = None
    valor_fixo_centavos: int | None = None
    id: str | None = None


@dataclass(frozen=True)
class Beneficio:
    nome: str
    valor_centavos: int


@dataclass
class Colaborador:
    """Pessoa da folha: CLT, PJ ou sócio com pró-labore. Lançar a folha de uma
    competência gera o salário e os benefícios de cada pessoa ativa."""

    espaco_id: str
    nome: str
    vinculo: Vinculo
    salario_centavos: int
    dia_pagamento: int
    ativo: bool
    criado_em: datetime
    cargo: str | None = None
    admissao: date | None = None
    beneficios: list[Beneficio] = field(default_factory=list)
    id: str | None = None


# --- Entrada ---------------------------------------------------------------------


class ClassesDeCusto(Entrada):
    """A classe de cada despesa na aba Custos, pelo id da categoria. null volta
    a categoria para a sugestão da tela."""

    classes: Annotated[dict[Identificador, ClasseDeCusto | None], Field(min_length=1, max_length=200)]


class NovoSocio(Entrada):
    """Sócio novo ou editado (o PUT substitui os dois campos)."""

    nome: Nome
    participacao_centesimos: Percentual


class TipoDeMovimento(StrEnum):
    APORTE = "APORTE"  # dinheiro do sócio entrando na empresa
    DISTRIBUICAO = "DISTRIBUICAO"  # lucro saindo para o sócio (dividendos)
    PRO_LABORE = "PRO_LABORE"  # a remuneração do sócio que trabalha


class NovoMovimentoDoSocio(Entrada):
    """Aporte de capital, distribuição de lucros ou pró-labore do sócio,
    lançado na conta da empresa com o sócio como responsável. Sem descrição,
    vai o tipo e o nome do sócio."""

    tipo: TipoDeMovimento
    conta_id: Identificador
    valor_centavos: CentavosPositivos
    data: Data
    descricao: Descricao | None = None


class NovoTributo(Entrada):
    """Tributo novo ou editado (o PUT substitui tudo). FATURAMENTO e FOLHA
    pedem a alíquota; FIXO, o valor. A coerência fica em regras_empresa."""

    nome: Nome
    tipo: TipoDeTributo
    base: BaseDoTributo
    aliquota_centesimos: PercentualPositivo | None = None
    valor_fixo_centavos: CentavosPositivos | None = None
    dia_vencimento: DiaDoMes
    periodicidade: Periodicidade = Periodicidade.MENSAL
    ativo: Annotated[bool, Field(strict=True)] = True


class NovoPagamentoDeTributo(Entrada):
    """O pagamento da guia de uma competência (valor editável: juros, multa)."""

    competencia: Competencia
    conta_id: Identificador
    valor_centavos: CentavosPositivos
    data: Data


class NovoBeneficio(Entrada):
    nome: Nome
    valor_centavos: CentavosPositivos


class NovoColaborador(Entrada):
    """Pessoa da folha nova ou editada (o PUT substitui tudo)."""

    nome: Nome
    vinculo: Vinculo
    salario_centavos: CentavosPositivos
    dia_pagamento: DiaDoMes = 5
    cargo: Cargo | None = None
    admissao: Data | None = None
    beneficios: Annotated[list[NovoBeneficio], Field(max_length=MAXIMO_DE_BENEFICIOS)] = []
    ativo: Annotated[bool, Field(strict=True)] = True


class NovaFolha(Entrada):
    """Lança a folha de uma competência: salário e benefícios de cada pessoa
    ativa, saindo da conta indicada. Sem data, cada pessoa recebe no dia de
    pagamento dela, no mês seguinte ao da competência."""

    competencia: Competencia
    conta_id: Identificador
    data: Data | None = None


# --- Saída -----------------------------------------------------------------------


class SocioResposta(BaseModel):
    id: str
    nome: str
    participacao_centesimos: int

    @classmethod
    def de(cls, socio: Socio) -> "SocioResposta":
        return cls(id=socio.id, nome=socio.nome, participacao_centesimos=socio.participacao_centesimos)


class PagamentoDoTributoResposta(BaseModel):
    competencia: str
    lancamento_id: str
    valor_centavos: int
    data: date


class TributoResposta(BaseModel):
    id: str
    nome: str
    tipo: TipoDeTributo
    base: BaseDoTributo
    aliquota_centesimos: int | None
    valor_fixo_centavos: int | None
    dia_vencimento: int
    periodicidade: Periodicidade
    ativo: bool
    # Competências já pagas (lançamentos com a origem deste tributo), da mais
    # nova para a mais antiga.
    pagamentos: list[PagamentoDoTributoResposta]

    @classmethod
    def de(cls, tributo: Tributo, pagamentos: list[PagamentoDoTributoResposta]) -> "TributoResposta":
        return cls(
            id=tributo.id,
            nome=tributo.nome,
            tipo=tributo.tipo,
            base=tributo.base,
            aliquota_centesimos=tributo.aliquota_centesimos,
            valor_fixo_centavos=tributo.valor_fixo_centavos,
            dia_vencimento=tributo.dia_vencimento,
            periodicidade=tributo.periodicidade,
            ativo=tributo.ativo,
            pagamentos=pagamentos,
        )


class BeneficioResposta(BaseModel):
    nome: str
    valor_centavos: int


class ColaboradorResposta(BaseModel):
    id: str
    nome: str
    vinculo: Vinculo
    cargo: str | None
    salario_centavos: int
    beneficios: list[BeneficioResposta]
    dia_pagamento: int
    admissao: date | None
    ativo: bool
    # Competências (AAAA-MM) em que o salário desta pessoa já foi lançado, da
    # mais nova para a mais antiga.
    competencias_lancadas: list[str]

    @classmethod
    def de(cls, colaborador: Colaborador, competencias: list[str]) -> "ColaboradorResposta":
        return cls(
            id=colaborador.id,
            nome=colaborador.nome,
            vinculo=colaborador.vinculo,
            cargo=colaborador.cargo,
            salario_centavos=colaborador.salario_centavos,
            beneficios=[BeneficioResposta(nome=b.nome, valor_centavos=b.valor_centavos) for b in colaborador.beneficios],
            dia_pagamento=colaborador.dia_pagamento,
            admissao=colaborador.admissao,
            ativo=colaborador.ativo,
            competencias_lancadas=competencias,
        )


class FolhaResposta(BaseModel):
    competencia: str
    # Lançamentos criados agora (salário e benefícios contam separados).
    lancados: int
    # Pessoas cujo salário já estava lançado na competência (puladas).
    ja_lancados: int
    total_centavos: int
    lancamento_ids: list[str]
