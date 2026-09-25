"""Entidades do livro-caixa e contratos (JSON) de entrada e saída.

Dinheiro é sempre inteiro em centavos, nunca float: 0.1 + 0.2 não dá 0.3 em
ponto flutuante, e um centavo perdido num saldo é erro de verdade.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, Field, StringConstraints

from app.modelos import Entrada

# Teto de um valor, em centavos (R$ 1 bilhão). Barra número absurdo digitado
# por engano e soma que estouraria o inteiro de 64 bits do MongoDB.
LIMITE_EM_CENTAVOS = 100_000_000_000
# Teto do texto de um extrato em CSV (caracteres). Um mês de extrato fica bem
# abaixo; o limite barra requisição enorme antes de qualquer leitura.
TAMANHO_MAXIMO_DO_CSV = 500_000
# Pessoas numa divisão (racha) de um lançamento.
MAXIMO_DE_PESSOAS = 20
# Parcelas de uma compra no cartão de crédito (4 anos).
MAXIMO_DE_PARCELAS = 48


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
    # Conta de dívida: compra no crédito deixa o saldo negativo (o que se
    # deve), e o pagamento da fatura é uma transferência de uma conta para ele.
    CARTAO_CREDITO = "CARTAO_CREDITO"


class SituacaoDaFatura(StrEnum):
    ABERTA = "ABERTA"  # o período dela contém hoje: ainda recebe compras
    FECHADA = "FECHADA"
    FUTURA = "FUTURA"  # só parcelas de compras já feitas


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
    # Só cartão de crédito: o limite e os dias do mês em que a fatura fecha e
    # vence. Nas outras contas ficam vazios.
    limite_centavos: int | None = None
    dia_fechamento: int | None = None
    dia_vencimento: int | None = None
    id: str | None = None

    @property
    def cartao(self) -> bool:
        return self.tipo == TipoConta.CARTAO_CREDITO


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


@dataclass(frozen=True)
class Parte:
    """Quanto de um lançamento cabe a uma pessoa (racha). A soma das partes
    vai até o valor do lançamento; o que sobra é a parte de quem lançou."""

    pessoa: str
    valor_centavos: int


@dataclass
class Lancamento:
    """Não se edita depois de gravado. Correção de valor é o estorno
    (lançamento inverso; o original fica no histórico); erro de digitação e
    lançamento duplicado saem com a exclusão. As partidas somam zero."""

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
    divisao: list[Parte] = field(default_factory=list)
    # Compra parcelada no cartão: cada parcela é um lançamento, na data da
    # fatura em que ela cai, e todas levam o mesmo compra_id.
    compra_id: str | None = None
    parcela: int | None = None
    parcelas: int | None = None
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
    categoria_id: str | None = None
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
# Dia do mês. 29, 30 e 31 viram o último dia nos meses mais curtos.
DiaDoMes = Annotated[int, Field(strict=True, ge=1, le=31)]


class NovaConta(Entrada):
    """Cartão de crédito (tipo CARTAO_CREDITO) pede limite e os dias de
    fechamento e vencimento da fatura; as outras contas não os aceitam
    (regras.conferir_conta)."""

    nome: Nome
    tipo: TipoConta
    # Dinheiro que já estava na conta antes do primeiro lançamento. Fixo depois
    # de criado: mudá-lo reescreveria o saldo de todos os dias passados.
    saldo_inicial_centavos: Centavos = 0
    limite_centavos: CentavosPositivos | None = None
    dia_fechamento: DiaDoMes | None = None
    dia_vencimento: DiaDoMes | None = None


class AtualizacaoConta(Entrada):
    """PUT substitui a parte editável inteira. Desativar tira a conta das
    escolhas de novos lançamentos, sem apagar o histórico. Conta não vira
    cartão, nem cartão vira conta."""

    nome: Nome
    tipo: TipoConta
    ativa: Booleano
    limite_centavos: CentavosPositivos | None = None
    dia_fechamento: DiaDoMes | None = None
    dia_vencimento: DiaDoMes | None = None


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


class NovaParte(Entrada):
    pessoa: Nome
    valor_centavos: CentavosPositivos


class NovoLancamento(Entrada):
    """Receita e despesa pedem conta e categoria; transferência pede conta de
    origem (conta_id) e de destino. A coerência entre os campos é conferida em
    regras.conferir_lancamento. As partidas são montadas pela API, nunca
    enviadas pelo cliente: assim a soma zero não depende de quem chama.

    divisao (opcional, só receita e despesa) reparte o valor entre pessoas."""

    tipo: TipoLancamento
    descricao: Descricao
    data: Data
    valor_centavos: CentavosPositivos
    conta_id: Identificador
    categoria_id: Identificador | None = None
    conta_destino_id: Identificador | None = None
    divisao: Annotated[list[NovaParte], Field(max_length=MAXIMO_DE_PESSOAS)] = []


class NovaCompra(Entrada):
    """Compra no cartão de crédito. Em parcelas, cada uma vira uma despesa no
    cartão, a primeira na data da compra e as outras um mês depois da
    anterior: cada parcela cai numa fatura. O valor é o total da compra.
    Racha (divisao) só na compra à vista."""

    descricao: Descricao
    data: Data
    valor_centavos: CentavosPositivos
    categoria_id: Identificador
    parcelas: Annotated[int, Field(strict=True, ge=1, le=MAXIMO_DE_PARCELAS)] = 1
    divisao: Annotated[list[NovaParte], Field(max_length=MAXIMO_DE_PESSOAS)] = []


class NovoPagamento(Entrada):
    """Pagamento da fatura: sai da conta indicada (conta_id, nunca um cartão)
    e entra no cartão, liberando o limite."""

    conta_id: Identificador
    valor_centavos: CentavosPositivos
    data: Data
    descricao: Descricao | None = None


TextoDoCsv = Annotated[str, StringConstraints(min_length=1, max_length=TAMANHO_MAXIMO_DO_CSV)]
Delimitador = Literal[";", ",", "\t", "|"]
# Coluna do arquivo, contada a partir de 0.
Coluna = Annotated[int, Field(strict=True, ge=0, lt=50)]


class MapeamentoDoExtrato(Entrada):
    """Onde está cada informação no CSV (importacao.Mapeamento). A coerência
    entre as colunas é conferida em importacao.conferir_mapeamento."""

    delimitador: Delimitador
    # Linha do cabeçalho (1 = primeira); 0 quando o arquivo não tem cabeçalho.
    cabecalho: Annotated[int, Field(strict=True, ge=0, le=50)]
    data: Coluna
    descricao: Coluna
    valor: Coluna | None = None
    credito: Coluna | None = None
    debito: Coluna | None = None
    tipo: Coluna | None = None
    categoria: Coluna | None = None
    inverter_sinal: Booleano = False


class NovaImportacao(Entrada):
    """Extrato do banco em CSV (o texto do arquivo) e onde lançar cada linha:
    saídas (valor negativo) na categoria de despesa, entradas na de receita,
    todas na mesma conta. Linha com o nome de uma categoria ativa do espaço
    na coluna de categoria vai para ela. Sem mapeamento, as colunas são
    reconhecidas pelo nome. Com simular=true, a API só confere o arquivo e diz
    o que entraria, sem gravar nada."""

    conta_id: Identificador
    categoria_despesa_id: Identificador
    categoria_receita_id: Identificador
    csv: TextoDoCsv
    mapeamento: MapeamentoDoExtrato | None = None
    simular: Booleano = False


class PedidoDeEstrutura(Entrada):
    """CSV para a API mostrar o começo do arquivo e sugerir as colunas. O
    delimitador, se vier, troca o que a API adivinharia."""

    csv: TextoDoCsv
    delimitador: Delimitador | None = None


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
    # Só cartão de crédito; null nas outras contas.
    limite_centavos: int | None
    dia_fechamento: int | None
    dia_vencimento: int | None

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
            limite_centavos=conta.limite_centavos,
            dia_fechamento=conta.dia_fechamento,
            dia_vencimento=conta.dia_vencimento,
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


class ParteResposta(BaseModel):
    pessoa: str
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
    divisao: list[ParteResposta]
    estorno_de: str | None
    estornado_por: str | None
    compra_id: str | None
    parcela: int | None
    parcelas: int | None
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
            divisao=[ParteResposta(pessoa=parte.pessoa, valor_centavos=parte.valor_centavos) for parte in lancamento.divisao],
            estorno_de=lancamento.estorno_de,
            estornado_por=lancamento.estornado_por,
            compra_id=lancamento.compra_id,
            parcela=lancamento.parcela,
            parcelas=lancamento.parcelas,
            criado_em=lancamento.criado_em,
        )


class PeriodoDaFaturaResposta(BaseModel):
    # Ano e mês do vencimento (AAAA-MM): o nome da fatura.
    referencia: str
    # Primeiro dia cujas compras entram nesta fatura.
    inicio: date
    # Dia em que a fatura fecha: a compra feita nele já vai para a próxima.
    fechamento: date
    vencimento: date

    @classmethod
    def de(cls, periodo) -> "PeriodoDaFaturaResposta":
        ano, mes = periodo.referencia
        return cls(
            referencia=f"{ano:04d}-{mes:02d}",
            inicio=periodo.inicio,
            fechamento=periodo.fechamento,
            vencimento=periodo.vencimento,
        )


class CartaoResposta(BaseModel):
    """Painel do cartão de crédito. Todos os valores em centavos."""

    id: str
    nome: str
    ativa: bool
    limite_centavos: int
    dia_fechamento: int
    dia_vencimento: int
    # Saldo do cartão no livro-caixa: negativo é o que se deve.
    saldo_centavos: int
    # Quanto do limite está ocupado (todas as faturas e parcelas futuras).
    usado_centavos: int
    # Limite menos o usado; negativo quando o limite foi ultrapassado.
    disponivel_centavos: int
    fatura_atual: PeriodoDaFaturaResposta
    fatura_atual_centavos: int
    # Faturas já fechadas ainda não pagas, e a última fechada (vencimento).
    a_pagar_centavos: int
    ultima_fechada: PeriodoDaFaturaResposta
    parcelamentos_futuros_centavos: int

    @classmethod
    def de(cls, cartao: Conta, saldo_centavos: int, resumo) -> "CartaoResposta":
        return cls(
            id=cartao.id,
            nome=cartao.nome,
            ativa=cartao.ativa,
            limite_centavos=cartao.limite_centavos,
            dia_fechamento=cartao.dia_fechamento,
            dia_vencimento=cartao.dia_vencimento,
            saldo_centavos=saldo_centavos,
            usado_centavos=resumo.usado,
            disponivel_centavos=resumo.disponivel,
            fatura_atual=PeriodoDaFaturaResposta.de(resumo.fatura_atual),
            fatura_atual_centavos=resumo.total_da_fatura_atual,
            a_pagar_centavos=resumo.a_pagar,
            ultima_fechada=PeriodoDaFaturaResposta.de(resumo.ultima_fechada),
            parcelamentos_futuros_centavos=resumo.parcelamentos_futuros,
        )


class FaturaResposta(PeriodoDaFaturaResposta):
    cartao_id: str
    situacao: SituacaoDaFatura
    # Compras menos créditos (estornos, reembolsos) do período.
    total_centavos: int
    # Pagamentos recebidos no período (quitam faturas, não mudam o total).
    pagamentos_centavos: int
    lancamentos: list[LancamentoResposta]


class LinhaImportadaResposta(BaseModel):
    linha: int
    situacao: SituacaoDaLinha
    data: date | None
    descricao: str | None
    # Com sinal, como no extrato: negativo é saída.
    valor_centavos: int | None
    # Categoria em que a linha entra (ou entraria, na simulação).
    categoria_id: str | None
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
                    categoria_id=resultado.categoria_id,
                    lancamento_id=resultado.lancamento_id,
                    erro=resultado.erro,
                )
                for resultado in resultados
            ],
        )


class LinhaDoArquivoResposta(BaseModel):
    numero: int
    celulas: list[str]


class EstruturaResposta(BaseModel):
    """Começo do arquivo em células e o mapeamento sugerido (null quando as
    colunas não foram reconhecidas pelo nome)."""

    delimitador: str
    linhas: list[LinhaDoArquivoResposta]
    mapeamento: MapeamentoDoExtrato | None
