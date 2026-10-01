"""Entidades do livro-caixa e contratos (JSON) de entrada e saída.

Dinheiro é sempre inteiro em centavos, nunca float: 0.1 + 0.2 não dá 0.3 em
ponto flutuante, e um centavo perdido num saldo é erro de verdade.
"""

import re
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Literal

from pydantic import BaseModel, BeforeValidator, Field, StringConstraints

from app.modelos import Entrada
from app.sanitizacao import texto_limpo

# Teto de um valor, em centavos (R$ 1 bilhão). Barra número absurdo digitado
# por engano e soma que estouraria o inteiro de 64 bits do MongoDB.
LIMITE_EM_CENTAVOS = 100_000_000_000
# Teto do texto de um extrato em CSV (caracteres). Um mês de extrato fica bem
# abaixo; o limite barra requisição enorme antes de qualquer leitura.
TAMANHO_MAXIMO_DO_CSV = 500_000
# Pessoas numa divisão (racha) de um lançamento.
MAXIMO_DE_PESSOAS = 20
# Empresas que uma pessoa cadastra no espaço empresarial. Barra quem criaria
# livros-caixa vazios sem fim com a mesma conta.
MAXIMO_DE_EMPRESAS = 5
# Convidados da família além do titular no Modo Família. É o que uma
# assinatura da família cobre: "eu + 4 convidados", até 5 pessoas no total.
MAXIMO_DE_MEMBROS_DA_FAMILIA = 4
# Parcelas de uma compra no cartão de crédito (4 anos).
MAXIMO_DE_PARCELAS = 48
# Lançamentos numa exclusão em lote (o teto de uma consulta do extrato).
MAXIMO_NA_EXCLUSAO = 1000
# Linhas ajustadas na conferência de uma importação (o teto de linhas dela).
MAXIMO_DE_AJUSTES = 1000


class TipoEspaco(StrEnum):
    """Só dois tipos: o espaço pessoal e o empresarial. Cada documento é um
    livro-caixa separado: trocar de livro é trocar de documento, e nada de um
    aparece no outro.

    O pessoal é um por pessoa e leva o Modo Família dentro dele (a família não
    é um terceiro tipo). O espaço empresarial é o conjunto das empresas da
    pessoa, e cada empresa é um livro-caixa próprio: contas, caixa e DRE de dois
    CNPJs nunca se misturam."""

    PF = "PF"  # pessoal: um por pessoa, criado sozinho no primeiro acesso
    PJ = "PJ"  # uma empresa do espaço empresarial


class RegimeTributario(StrEnum):
    """Regime da empresa: decide os tributos sugeridos na aba Impostos."""

    MEI = "MEI"
    SIMPLES = "SIMPLES"  # Simples Nacional
    PRESUMIDO = "PRESUMIDO"  # Lucro Presumido
    REAL = "REAL"  # Lucro Real


class Plano(StrEnum):
    """Plano de assinatura da pessoa, guardado no espaço pessoal dela (um por
    pessoa). Nasce FREE. O cliente não troca o próprio plano: sem checkout
    ainda, só o back-office muda (PUT /clientes/{uid}/plano), e é a API que
    decide o que cada plano libera. Assim, esconder um botão na tela nunca é a
    única trava."""

    FREE = "FREE"
    FAMILIA = "FAMILIA"
    # Tudo do Família, mais as empresas.
    EMPRESARIAL = "EMPRESARIAL"


# Planos que liberam o Modo Família (pessoas da casa, filtro "de quem") e a
# divisão do gasto com o nome e a parte de cada pessoa.
PLANOS_COM_FAMILIA = frozenset({Plano.FAMILIA, Plano.EMPRESARIAL})


def libera_familia(plano: "Plano") -> bool:
    return plano in PLANOS_COM_FAMILIA


class Papel(StrEnum):
    """Papel de uma pessoa dentro de um espaço."""

    DONO = "DONO"


class CorDoMembro(StrEnum):
    """Cor com que cada pessoa da família aparece nos filtros, no extrato e nos
    relatórios. Só ajuda a achar: o nome está sempre escrito ao lado."""

    MENTA = "menta"
    AZUL = "azul"
    ROXO = "roxo"
    CORAL = "coral"
    AMBAR = "ambar"
    ROSA = "rosa"
    TURQUESA = "turquesa"
    GRAFITE = "grafite"


class TipoConta(StrEnum):
    CORRENTE = "CORRENTE"
    POUPANCA = "POUPANCA"
    CARTEIRA = "CARTEIRA"
    INVESTIMENTO = "INVESTIMENTO"
    # Conta de dívida: compra no crédito deixa o saldo negativo (o que se
    # deve), e o pagamento da fatura é uma transferência de uma conta para ele.
    CARTAO_CREDITO = "CARTAO_CREDITO"


class CorDoCartao(StrEnum):
    """Cor do cartão na carteira da tela (Contas & Cartões), como o plástico
    do cartão de verdade. Só enfeite: o nome do cartão está sempre escrito."""

    GRAFITE = "grafite"
    AZUL = "azul"
    ROXO = "roxo"
    VERDE = "verde"
    VINHO = "vinho"
    LARANJA = "laranja"
    DOURADO = "dourado"
    PRATA = "prata"


class MeioDePagamento(StrEnum):
    """Como o dinheiro saiu ou entrou na conta. Só movimentação à vista: a
    compra no crédito não é um meio daqui, ela entra na fatura do cartão."""

    PIX = "PIX"
    DEBITO = "DEBITO"
    DINHEIRO = "DINHEIRO"
    TRANSFERENCIA = "TRANSFERENCIA"  # TED ou DOC


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


class ClasseDeCusto(StrEnum):
    """Como uma despesa da empresa entra na aba Custos (e na margem de lucro)."""

    # Cresce com as vendas: fornecedores, insumos, impostos sobre a venda.
    VARIAVEL = "VARIAVEL"
    # Não muda com as vendas: aluguel, folha, pró-labore, contador.
    FIXO = "FIXO"
    # O dia a dia da operação: marketing, tarifas, manutenção.
    OPERACIONAL = "OPERACIONAL"
    # Não é custo: distribuição de lucros aos sócios.
    FORA = "FORA"


class FuncaoDaCategoria(StrEnum):
    """Categoria que a gestão da empresa usa sozinha (aporte do sócio, folha,
    tributo): é pela função, e não pelo nome, que ela é achada, então renomear
    a categoria não quebra nada."""

    APORTE = "APORTE"
    DISTRIBUICAO = "DISTRIBUICAO"
    PRO_LABORE = "PRO_LABORE"
    SALARIOS = "SALARIOS"
    BENEFICIOS = "BENEFICIOS"
    PRESTADORES = "PRESTADORES"
    ENCARGOS = "ENCARGOS"
    IMPOSTOS = "IMPOSTOS"


class TipoDeOrigem(StrEnum):
    """O que gerou um lançamento da gestão da empresa."""

    TRIBUTO = "TRIBUTO"  # pagamento de um tributo na competência
    SALARIO = "SALARIO"  # salário, pró-labore ou serviço PJ da folha
    BENEFICIOS = "BENEFICIOS"  # benefícios da folha (VR, VT, plano de saúde)


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
class PessoaDaFamilia:
    """Alguém da casa no Modo Família (cônjuge, filho, quem divide as
    contas). É um perfil dentro do espaço pessoal do titular, sem login
    próprio: o titular lança por ela. O lançamento é dela quando o
    "responsável" tem o nome dela."""

    id: str
    nome: str
    cor: CorDoMembro


@dataclass
class Familia:
    """Modo Família do espaço pessoal. Desligar só esconde a família da tela:
    as pessoas cadastradas continuam guardadas para quando religar."""

    ativa: bool = False
    pessoas: list[PessoaDaFamilia] = field(default_factory=list)


@dataclass(frozen=True)
class FiltroDePessoa:
    """De quem são os lançamentos de um relatório: do titular (nome None,
    lançamento sem responsável) ou de uma pessoa da família (o nome, sem
    diferença de caixa nem de acento)."""

    nome: str | None


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
    # Só na empresa: CNPJ (só os caracteres, sem pontuação) e regime.
    cnpj: str | None = None
    regime: RegimeTributario | None = None
    # Só no pessoal.
    familia: Familia = field(default_factory=Familia)
    # Só no pessoal: o plano da pessoa dona dele.
    plano: Plano = Plano.FREE
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
    cor: CorDoCartao | None = None
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
    # Só nas despesas da empresa: a classe na aba Custos (None = a tela
    # sugere pelo nome) e a função na gestão (aporte, folha, tributo).
    classe_de_custo: ClasseDeCusto | None = None
    funcao: FuncaoDaCategoria | None = None
    id: str | None = None


@dataclass(frozen=True)
class Partida:
    """Um lado do lançamento: dinheiro que entra (+) ou sai (−) de uma conta ou
    de uma categoria. Exatamente um dos dois ids é preenchido."""

    valor_centavos: int
    conta_id: str | None = None
    categoria_id: str | None = None


@dataclass(frozen=True)
class Origem:
    """Lançamento gerado pela gestão da empresa: o pagamento de um tributo ou a
    folha de uma pessoa, numa competência (AAAA-MM). Único no espaço: a mesma
    folha ou o mesmo imposto não entram duas vezes. Excluir o lançamento
    libera a competência para lançar de novo."""

    tipo: TipoDeOrigem
    id: str
    competencia: str


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
    # A divisão do Free: só em quantas pessoas o gasto foi dividido, como
    # anotação. Sem nomes, não separa o gasto de ninguém.
    dividido_entre: int | None = None
    # Pessoa responsável pelo lançamento (quem gastou ou de quem é a receita),
    # só o nome. Vazio = quem lançou. Diferente da divisão: o valor inteiro é
    # dela, sem partes.
    responsavel: str | None = None
    # Compra parcelada no cartão: cada parcela é um lançamento, na data da
    # fatura em que ela cai, e todas levam o mesmo compra_id.
    compra_id: str | None = None
    parcela: int | None = None
    parcelas: int | None = None
    # Descrição normalizada da compra parcelada que veio da fatura do banco
    # (sem o "3/12"): acha a parcela já lançada quando a fatura seguinte
    # chega, mesmo depois de a pessoa renomear a compra.
    chave_parcelamento: str | None = None
    meio: MeioDePagamento | None = None
    origem: Origem | None = None
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
    # Fatura em que a linha entra (só na importação da fatura de um cartão).
    fatura: tuple[int, int] | None = None
    # O que aconteceu além do básico (parcela lançada, parcelas geradas).
    observacao: str | None = None
    # De onde veio a categoria: ARQUIVO, HISTORICO, REGRA, PADRAO ou AJUSTE
    # (categorizacao.py).
    origem_da_categoria: str | None = None


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
# Texto livre passa pela limpeza (app/sanitizacao.py) antes do tamanho: "<>"
# sozinho não é um nome, e o que conta para o limite é o que fica gravado.
Nome = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60), BeforeValidator(texto_limpo)]
Descricao = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120), BeforeValidator(texto_limpo)
]
Identificador = Annotated[str, StringConstraints(min_length=1, max_length=64)]
Booleano = Annotated[bool, Field(strict=True)]
Data = Annotated[date, BeforeValidator(_data_sem_numero)]
# Em quantas pessoas o gasto foi dividido (a anotação do Free), contando
# quem lançou: de 2 ao máximo de uma divisão.
DivididoEntre = Annotated[int, Field(strict=True, ge=2, le=MAXIMO_DE_PESSOAS)]
# Dia do mês. 29, 30 e 31 viram o último dia nos meses mais curtos.
DiaDoMes = Annotated[int, Field(strict=True, ge=1, le=31)]


def _cnpj(valor):
    # CNPJ numérico ou alfanumérico (o da Receita Federal desde julho de 2026):
    # 12 caracteres de 0 a 9 ou A a Z e 2 dígitos verificadores. Pontuação e
    # espaço não contam; o que fica gravado são os 14 caracteres. Texto vazio
    # é "sem CNPJ".
    if not isinstance(valor, str):
        return valor
    limpo = re.sub(r"[.\-/\s]", "", valor).upper()
    if not limpo:
        return None
    if not re.fullmatch(r"[0-9A-Z]{12}[0-9]{2}", limpo) or len(set(limpo)) == 1 or not _digitos_conferem(limpo):
        raise ValueError("CNPJ inválido. Confira os 14 caracteres.")
    return limpo


def _digitos_conferem(cnpj: str) -> bool:
    # Cada caractere vale o código ASCII menos 48 (os dígitos continuam 0 a 9),
    # com os pesos de sempre do CNPJ.
    valores = [ord(caractere) - 48 for caractere in cnpj]
    for tamanho in (12, 13):
        pesos = [(indice % 8) + 2 for indice in range(tamanho)][::-1]
        resto = sum(valor * peso for valor, peso in zip(valores[:tamanho], pesos, strict=True)) % 11
        if valores[tamanho] != (0 if resto < 2 else 11 - resto):
            return False
    return True


Cnpj = Annotated[str | None, BeforeValidator(_cnpj)]


class NovoEspaco(Entrada):
    """Empresa do espaço empresarial (tipo PJ). O pessoal não entra por aqui:
    ele já existe desde o primeiro acesso (servicos.criar_espaco recusa PF).
    CNPJ e regime são opcionais; o regime decide os tributos sugeridos."""

    tipo: TipoEspaco
    nome: Nome
    cnpj: Cnpj = None
    regime: RegimeTributario | None = None


class AtualizacaoEspaco(Entrada):
    """PATCH: o nome e, na empresa, o CNPJ e o regime enviados. cnpj: null (ou
    vazio) tira o CNPJ."""

    nome: Nome | None = None
    cnpj: Cnpj = None
    regime: RegimeTributario | None = None


class AtualizacaoFamilia(Entrada):
    """Liga ou desliga o Modo Família do espaço pessoal."""

    ativa: Booleano


class NovaPessoaDaFamilia(Entrada):
    """Pessoa da família (nova ou editada: o PUT substitui nome e cor)."""

    nome: Nome
    cor: CorDoMembro


class AtualizacaoPlano(Entrada):
    """Troca o plano de um cliente (back-office). Sem checkout ainda: é o
    caminho para liberar o Família ou o Empresarial."""

    plano: Plano


class NovaConta(Entrada):
    """Cartão de crédito (tipo CARTAO_CREDITO) pede limite e os dias de
    fechamento e vencimento da fatura, e aceita a cor; as outras contas não
    têm nada disso (regras.conferir_conta)."""

    nome: Nome
    tipo: TipoConta
    # Dinheiro que já estava na conta antes do primeiro lançamento. Fixo depois
    # de criado: mudá-lo reescreveria o saldo de todos os dias passados.
    saldo_inicial_centavos: Centavos = 0
    limite_centavos: CentavosPositivos | None = None
    dia_fechamento: DiaDoMes | None = None
    dia_vencimento: DiaDoMes | None = None
    cor: CorDoCartao | None = None


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
    cor: CorDoCartao | None = None


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

    divisao (opcional, só receita e despesa) reparte o valor entre pessoas,
    com o nome e a parte de cada uma: só no Plano Família ou Empresarial.
    dividido_entre (opcional, só receita e despesa) é a divisão do Free: só
    em quantas pessoas o valor foi dividido, como anotação. Um ou outro.
    responsavel (opcional, só receita e despesa) diz de quem é o lançamento
    inteiro, sem precisar de divisão.
    meio (opcional) diz como o dinheiro se moveu: PIX, débito, dinheiro ou
    transferência bancária. Compra no crédito não entra por aqui."""

    tipo: TipoLancamento
    descricao: Descricao
    data: Data
    valor_centavos: CentavosPositivos
    conta_id: Identificador
    categoria_id: Identificador | None = None
    conta_destino_id: Identificador | None = None
    divisao: Annotated[list[NovaParte], Field(max_length=MAXIMO_DE_PESSOAS)] = []
    dividido_entre: DivididoEntre | None = None
    responsavel: Nome | None = None
    meio: MeioDePagamento | None = None


class AtualizacaoLancamento(Entrada):
    """PATCH: só os campos enviados mudam. O tipo, a conta e a divisão não
    mudam (para isso, exclua e lance de novo). As restrições de cada caso
    (estorno, parcela de compra, compra no cartão) ficam em
    regras.conferir_edicao. meio: null tira o meio do lançamento; responsavel:
    null volta o lançamento para quem lançou."""

    descricao: Descricao | None = None
    data: Data | None = None
    valor_centavos: CentavosPositivos | None = None
    categoria_id: Identificador | None = None
    meio: MeioDePagamento | None = None
    responsavel: Nome | None = None


class ExclusaoEmLote(Entrada):
    """Lançamentos a excluir de uma vez (seleção do extrato ou da fatura)."""

    ids: Annotated[list[Identificador], Field(min_length=1, max_length=MAXIMO_NA_EXCLUSAO)]


class NovaCompra(Entrada):
    """Compra no cartão de crédito. Em parcelas, cada uma vira uma despesa no
    cartão, a primeira na data da compra e as outras um mês depois da
    anterior: cada parcela cai numa fatura. O valor é o total da compra.
    Racha (divisao, ou dividido_entre no Free) só na compra à vista; o
    responsável vale para todas as parcelas."""

    descricao: Descricao
    data: Data
    valor_centavos: CentavosPositivos
    categoria_id: Identificador
    parcelas: Annotated[int, Field(strict=True, ge=1, le=MAXIMO_DE_PARCELAS)] = 1
    divisao: Annotated[list[NovaParte], Field(max_length=MAXIMO_DE_PESSOAS)] = []
    dividido_entre: DivididoEntre | None = None
    responsavel: Nome | None = None


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


class AjusteDaLinha(Entrada):
    """O que a pessoa editou numa linha na conferência da importação."""

    descricao: Descricao | None = None
    categoria_id: Identificador | None = None


# Número da linha no arquivo (1 = primeira), como a simulação devolve.
NumeroDaLinha = Annotated[int, Field(ge=1, le=100_000)]


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
    # Descrição e categoria editadas na conferência, pelo número da linha. A
    # chave da linha continua a do arquivo: a mesma linha, editada ou não, não
    # entra duas vezes.
    ajustes: Annotated[dict[NumeroDaLinha, AjusteDaLinha], Field(max_length=MAXIMO_DE_AJUSTES)] = {}


class PedidoDeEstrutura(Entrada):
    """CSV para a API mostrar o começo do arquivo e sugerir as colunas. O
    delimitador, se vier, troca o que a API adivinharia."""

    csv: TextoDoCsv
    delimitador: Delimitador | None = None


# --- Saída ---------------------------------------------------------------------


class PessoaDaFamiliaResposta(BaseModel):
    id: str
    nome: str
    cor: CorDoMembro


class FamiliaResposta(BaseModel):
    # Ligado de verdade: o modo gravado E um plano que libera a família. Sem
    # o plano, sai false mesmo com o modo gravado ligado (as pessoas ficam
    # guardadas para quando o plano voltar).
    ativa: bool
    pessoas: list[PessoaDaFamiliaResposta]
    # Quantas pessoas cabem além do titular (a assinatura da família é uma só).
    maximo_de_pessoas: int

    @classmethod
    def de(cls, familia: Familia, plano: Plano) -> "FamiliaResposta":
        return cls(
            ativa=familia.ativa and libera_familia(plano),
            pessoas=[PessoaDaFamiliaResposta(id=p.id, nome=p.nome, cor=p.cor) for p in familia.pessoas],
            maximo_de_pessoas=MAXIMO_DE_MEMBROS_DA_FAMILIA,
        )


class EspacoResposta(BaseModel):
    id: str
    tipo: TipoEspaco
    nome: str
    moeda: str
    fuso: str
    papel: Papel
    # Só na empresa; null no pessoal.
    cnpj: str | None
    regime: RegimeTributario | None
    # Só no pessoal; null na empresa.
    familia: FamiliaResposta | None
    plano: Plano | None

    @classmethod
    def de(cls, espaco: Espaco, uid: str) -> "EspacoResposta":
        pessoal = espaco.tipo == TipoEspaco.PF
        return cls(
            id=espaco.id,
            tipo=espaco.tipo,
            nome=espaco.nome,
            moeda=espaco.moeda,
            fuso=espaco.fuso,
            papel=espaco.papel_de(uid),
            cnpj=espaco.cnpj,
            regime=espaco.regime,
            familia=FamiliaResposta.de(espaco.familia, espaco.plano) if pessoal else None,
            plano=espaco.plano if pessoal else None,
        )


class PlanoResposta(BaseModel):
    uid: str
    plano: Plano


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
    cor: CorDoCartao | None

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
            cor=conta.cor,
        )


class CategoriaResposta(BaseModel):
    id: str
    nome: str
    tipo: TipoCategoria
    cor: CorCategoria
    ativa: bool
    # Só na empresa (null no pessoal): a classe na aba Custos, se a pessoa
    # escolheu, e a função da categoria na gestão.
    classe_de_custo: ClasseDeCusto | None = None
    funcao: FuncaoDaCategoria | None = None

    @classmethod
    def de(cls, categoria: Categoria) -> "CategoriaResposta":
        return cls(
            id=categoria.id,
            nome=categoria.nome,
            tipo=categoria.tipo,
            cor=categoria.cor,
            ativa=categoria.ativa,
            classe_de_custo=categoria.classe_de_custo,
            funcao=categoria.funcao,
        )


class PartidaResposta(BaseModel):
    conta_id: str | None
    categoria_id: str | None
    valor_centavos: int


class ParteResposta(BaseModel):
    pessoa: str
    valor_centavos: int


class OrigemResposta(BaseModel):
    tipo: TipoDeOrigem
    id: str
    competencia: str


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
    # A anotação do Free: em quantas pessoas foi dividido (null sem ela).
    dividido_entre: int | None = None
    responsavel: str | None
    estorno_de: str | None
    estornado_por: str | None
    compra_id: str | None
    parcela: int | None
    parcelas: int | None
    meio: MeioDePagamento | None
    # Tributo pago ou folha lançada pela gestão da empresa; null nos outros.
    origem: OrigemResposta | None = None
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
            dividido_entre=lancamento.dividido_entre,
            responsavel=lancamento.responsavel,
            estorno_de=lancamento.estorno_de,
            estornado_por=lancamento.estornado_por,
            compra_id=lancamento.compra_id,
            parcela=lancamento.parcela,
            parcelas=lancamento.parcelas,
            meio=lancamento.meio,
            origem=OrigemResposta(**vars(lancamento.origem)) if lancamento.origem else None,
            criado_em=lancamento.criado_em,
        )


class ExclusaoResposta(BaseModel):
    # Lançamentos que saíram do banco (cada parcela da mesma compra e cada
    # estorno contam).
    excluidos: int


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
    cor: CorDoCartao
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
            cor=cartao.cor or CorDoCartao.GRAFITE,
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


class ResumoDaFaturaResposta(PeriodoDaFaturaResposta):
    """Uma fatura na lista do cartão, sem os lançamentos."""

    situacao: SituacaoDaFatura
    total_centavos: int
    pagamentos_centavos: int
    # Compras e créditos do período (o pagamento não conta).
    quantidade: int

    @classmethod
    def de(cls, resumo) -> "ResumoDaFaturaResposta":
        return cls(
            **PeriodoDaFaturaResposta.de(resumo.periodo).model_dump(),
            situacao=resumo.situacao,
            total_centavos=resumo.total,
            pagamentos_centavos=resumo.pagamentos,
            quantidade=resumo.quantidade,
        )


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
    # Fatura em que a linha entra (AAAA-MM), só na fatura de um cartão.
    fatura: str | None
    # Parcela reconhecida, parcelas geradas ou já lançadas.
    observacao: str | None
    # De onde veio a categoria: ARQUIVO (coluna do extrato), HISTORICO (o
    # mesmo estabelecimento, antes), REGRA (palavra da descrição), PADRAO ou
    # AJUSTE (escolhida na conferência).
    origem_da_categoria: str | None = None


class ImportacaoResposta(BaseModel):
    simulacao: bool
    novas: int
    importadas: int
    ja_importadas: int
    invalidas: int
    # Parcelas das próximas faturas geradas a partir das compras parceladas
    # da fatura (na simulação, as que seriam geradas).
    parcelas_futuras: int
    linhas: list[LinhaImportadaResposta]

    @classmethod
    def de(cls, resultados: list[ResultadoDaLinha], simulacao: bool, parcelas_futuras: int = 0) -> "ImportacaoResposta":
        contagem = {situacao: 0 for situacao in SituacaoDaLinha}
        for resultado in resultados:
            contagem[resultado.situacao] += 1
        return cls(
            simulacao=simulacao,
            novas=contagem[SituacaoDaLinha.NOVA],
            importadas=contagem[SituacaoDaLinha.IMPORTADA],
            ja_importadas=contagem[SituacaoDaLinha.JA_IMPORTADA],
            invalidas=contagem[SituacaoDaLinha.INVALIDA],
            parcelas_futuras=parcelas_futuras,
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
                    fatura=f"{resultado.fatura[0]:04d}-{resultado.fatura[1]:02d}" if resultado.fatura else None,
                    observacao=resultado.observacao,
                    origem_da_categoria=resultado.origem_da_categoria,
                )
                for resultado in resultados
            ],
        )


class LinhaDoArquivoResposta(BaseModel):
    numero: int
    celulas: list[str]


class EstruturaResposta(BaseModel):
    """Começo do arquivo em células e o mapeamento sugerido (null quando as
    colunas não foram reconhecidas)."""

    delimitador: str
    linhas: list[LinhaDoArquivoResposta]
    mapeamento: MapeamentoDoExtrato | None
    # CABECALHO (pelos nomes das colunas) ou CONTEUDO (pelas células, sem
    # cabeçalho conhecido); null sem mapeamento.
    origem: Literal["CABECALHO", "CONTEUDO"] | None = None
    # Informações do mapeamento a conferir (duas colunas com o mesmo nome,
    # células que não conferem). Vazio: a tela segue sem pedir nada.
    duvidas: list[str] = []


# --- Relatórios (saída) ----------------------------------------------------------


class MesDoRelatorioResposta(BaseModel):
    # Ano e mês (AAAA-MM).
    mes: str
    # Receitas menos os estornos delas; transferência não entra.
    receitas_centavos: int
    # Despesas (com as compras no cartão, no mês da parcela) menos os estornos
    # delas; o pagamento da fatura não entra, porque a compra já contou.
    despesas_centavos: int
    sobra_centavos: int
    # Saldo das contas no último dia do mês, sem os cartões (dívida). Com
    # conta_id, o saldo daquela conta.
    saldo_final_centavos: int


class RelatorioMensalResposta(BaseModel):
    de: str
    ate: str
    conta_id: str | None
    # Pessoa da família (id) ou "titular" do filtro; null = todos.
    membro: str | None = None
    meses: list[MesDoRelatorioResposta]


class GastoDaCategoriaResposta(BaseModel):
    categoria_id: str
    nome: str
    cor: CorCategoria
    valor_centavos: int
    # Porcentagem do total do período, arredondada.
    fatia: int


class GastoPorCategoriaResposta(BaseModel):
    de: str
    ate: str
    conta_id: str | None
    membro: str | None = None
    total_centavos: int
    # Da categoria com mais gasto para a com menos; só as que têm gasto.
    categorias: list[GastoDaCategoriaResposta]


class FaturaComprometidaResposta(PeriodoDaFaturaResposta):
    situacao: SituacaoDaFatura
    # Compras menos créditos do período (as parcelas já lançadas).
    total_centavos: int


class CompromissoDoCartaoResposta(BaseModel):
    cartao_id: str
    nome: str
    ativa: bool
    limite_centavos: int
    # Dívida de hoje: faturas fechadas não pagas, a atual e as futuras.
    usado_centavos: int
    # O que falta pagar das faturas já fechadas.
    a_pagar_centavos: int
    # A fatura aberta e as seguintes, até a última parcela lançada.
    faturas: list[FaturaComprometidaResposta]
