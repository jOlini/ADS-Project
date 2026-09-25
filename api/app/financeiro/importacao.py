"""Leitura do extrato do banco em CSV, em funções puras (sem banco e sem HTTP).

Cada banco exporta de um jeito: ponto e vírgula ou vírgula, cabeçalho na
primeira linha ou depois dos dados da conta, valor com sinal, colunas
separadas de entrada e saída, ou valor sem sinal ao lado de uma coluna D/C.
O Mapeamento diz onde está cada informação. detectar() tenta montá-lo pelos
nomes das colunas (COLUNAS, comparados sem acento e sem pontuação); quando
não consegue, a tela mostra o começo do arquivo (estrutura()) e a pessoa
indica as colunas.

Idempotência: cada linha ganha uma chave calculada a partir da conta, da
data, do valor, da descrição e da ocorrência (a 2ª linha igual no mesmo
arquivo é outra compra, não uma repetição). Importar o mesmo extrato de novo,
ou um extrato de um período que cobre o anterior, não duplica lançamento: a
chave já existe e a linha é pulada.
"""

import csv
import hashlib
import io
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, replace
from datetime import date

from app.financeiro.modelos import LIMITE_EM_CENTAVOS

# Limite de uma importação (o tamanho do texto fica em modelos.NovaImportacao).
# O extrato de um mês cabe com folga; mais que isso pede um período menor.
MAXIMO_DE_LINHAS = 1000
TAMANHO_MAXIMO_DA_DESCRICAO = 120
MAXIMO_DE_COLUNAS = 50
# Linhas do começo do arquivo que a tela mostra para a pessoa indicar as
# colunas. O cabeçalho automático é procurado só nas primeiras dez.
AMOSTRA_DE_LINHAS = 15
LINHAS_ANTES_DO_CABECALHO = 10
TAMANHO_DA_CELULA_NA_AMOSTRA = 80

DELIMITADORES = (";", ",", "\t", "|")

# Nomes de coluna aceitos para cada informação, já normalizados (minúsculas,
# sem acento, pontuação trocada por espaço): "Valor (R$)" vira "valor r",
# "Histórico" vira "historico", "D/C" vira "d c". A ordem é a preferência:
# num arquivo com "Título" e "Descrição", a descrição vence.
COLUNAS: dict[str, tuple[str, ...]] = {
    "data": (
        "data",
        "data lancamento",
        "data do lancamento",
        "data da transacao",
        "data movimento",
        "data mov",
        "dt lancamento",
        "date",
    ),
    "valor": ("valor", "valor r", "valor rs", "valor em r", "quantia", "amount", "value"),
    "credito": ("credito", "credito r", "creditos", "valor credito", "entrada", "entradas", "entrada r"),
    "debito": ("debito", "debito r", "debitos", "valor debito", "saida", "saidas", "saida r"),
    "descricao": (
        "descricao",
        "historico",
        "lancamento",
        "descricao do lancamento",
        "detalhes",
        "estabelecimento",
        "titulo",
        "description",
        "title",
        "memo",
    ),
    "tipo": (
        "d c",
        "c d",
        "deb cred",
        "cred deb",
        "debito credito",
        "credito debito",
        "natureza",
        "tipo lancamento",
        "tipo de lancamento",
        "tipo transacao",
        "tipo",
    ),
    "categoria": ("categoria", "category"),
}

MENSAGEM_SEM_FORMATO = "Não reconheci as colunas do arquivo. Indique onde estão a data, a descrição e o valor."
MENSAGEM_DATA = "Data inválida. Use DD/MM/AAAA ou AAAA-MM-DD."
MENSAGEM_VALOR = "Valor inválido. Use o formato 1.234,56, com - nas saídas."

_DATA_BR = re.compile(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$")
_DATA_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
_CONTROLE = re.compile(r"[\x00-\x1f\x7f]")


class ExtratoIlegivel(ValueError):
    """O arquivo inteiro não serve (sem colunas reconhecidas, vazio, grande demais)."""


@dataclass(frozen=True)
class Mapeamento:
    """Onde está cada informação no arquivo. Colunas contam a partir de 0.
    cabecalho é o número da linha do cabeçalho (1 = primeira); 0 quando o
    arquivo não tem cabeçalho e os lançamentos começam na linha 1.

    O valor vem de uma coluna só (valor, com sinal ou ao lado da coluna tipo,
    que diz D ou C) ou de duas (credito e debito). inverter_sinal serve para a
    fatura de cartão, em que a compra vem positiva."""

    delimitador: str
    cabecalho: int
    data: int
    descricao: int
    valor: int | None = None
    credito: int | None = None
    debito: int | None = None
    tipo: int | None = None
    categoria: int | None = None
    inverter_sinal: bool = False

    def colunas(self) -> dict[str, int]:
        """{informação: coluna} só das informações indicadas."""
        papeis = ("data", "descricao", "valor", "credito", "debito", "tipo", "categoria")
        return {papel: getattr(self, papel) for papel in papeis if getattr(self, papel) is not None}


@dataclass(frozen=True)
class LinhaDoArquivo:
    """Uma linha do começo do arquivo, já separada em células (para a tela)."""

    numero: int
    celulas: list[str]


@dataclass(frozen=True)
class Estrutura:
    delimitador: str
    linhas: list[LinhaDoArquivo]
    # Preenchido quando detectar() reconheceu as colunas.
    mapeamento: Mapeamento | None


@dataclass(frozen=True)
class LinhaDoExtrato:
    """Uma linha aproveitada. valor_centavos tem sinal: negativo é saída.
    categoria é o texto da coluna de categoria do arquivo, se houver."""

    linha: int
    data: date
    descricao: str
    valor_centavos: int
    categoria: str | None = None


@dataclass(frozen=True)
class LinhaRecusada:
    linha: int
    erro: str


def normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", sem_acento.lower()).strip()


# --- Formato do arquivo --------------------------------------------------------


def detectar(texto: str, delimitador: str | None = None) -> Mapeamento | None:
    """Mapeamento montado pelos nomes das colunas, ou None se nenhuma das
    primeiras linhas tiver data, descrição e valor (ou crédito e débito)."""
    texto = _sem_bom(texto)
    for tentativa in (delimitador,) if delimitador else DELIMITADORES:
        try:
            linhas = _primeiras_linhas(texto, tentativa, LINHAS_ANTES_DO_CABECALHO)
        except csv.Error:
            continue
        for numero, celulas in linhas:
            if mapeamento := _mapear_pelo_nome(texto, tentativa, numero, celulas):
                return mapeamento
    return None


def estrutura(texto: str, delimitador: str | None = None) -> Estrutura:
    """O começo do arquivo separado em células, para a pessoa conferir ou
    indicar as colunas, e o mapeamento automático quando ele existe."""
    texto = _sem_bom(texto)
    mapeamento = detectar(texto, delimitador)
    escolhido = mapeamento.delimitador if mapeamento else (delimitador or _adivinhar_delimitador(texto))
    try:
        linhas = _primeiras_linhas(texto, escolhido, AMOSTRA_DE_LINHAS)
    except csv.Error as erro:
        raise ExtratoIlegivel("O arquivo não é um CSV válido.") from erro
    amostra = [
        LinhaDoArquivo(numero, [celula[:TAMANHO_DA_CELULA_NA_AMOSTRA] for celula in celulas[:MAXIMO_DE_COLUNAS]])
        for numero, celulas in linhas
        if any(celula.strip() for celula in celulas)
    ]
    if not amostra:
        raise ExtratoIlegivel("O arquivo está vazio.")
    return Estrutura(escolhido, amostra, mapeamento)


def conferir_mapeamento(mapeamento: Mapeamento) -> dict[str, str]:
    """Erros de coerência por informação (vazio = dá para ler o arquivo)."""
    erros: dict[str, str] = {}
    tem_colunas_separadas = mapeamento.credito is not None or mapeamento.debito is not None
    if mapeamento.valor is None and not tem_colunas_separadas:
        erros["valor"] = "Indique a coluna do valor, ou as de entrada e saída."
    elif mapeamento.valor is not None and tem_colunas_separadas:
        erros["valor"] = "Use a coluna do valor ou as de entrada e saída, não as duas."
    if mapeamento.tipo is not None and mapeamento.valor is None:
        erros["tipo"] = "A coluna D/C acompanha a coluna do valor."

    vistas: set[int] = set()
    for papel, coluna in mapeamento.colunas().items():
        if coluna in vistas:
            erros.setdefault(papel, "Esta coluna já foi usada para outra informação.")
        vistas.add(coluna)
    return erros


def _mapear_pelo_nome(texto: str, delimitador: str, numero: int, celulas: list[str]) -> Mapeamento | None:
    nomes = [normalizar(celula) for celula in celulas]
    usadas: set[int] = set()
    achadas: dict[str, int] = {}
    for papel, aceitos in COLUNAS.items():
        for aceito in aceitos:
            indice = next((i for i, nome in enumerate(nomes) if nome == aceito and i not in usadas), None)
            if indice is not None:
                achadas[papel] = indice
                usadas.add(indice)
                break

    if "data" not in achadas or "descricao" not in achadas:
        return None
    if "valor" in achadas:
        # Com a coluna do valor, entrada e saída separadas sobram (ex.: "Saída"
        # como texto do tipo); a coluna D/C só vale se o conteúdo for D/C.
        achadas.pop("credito", None)
        achadas.pop("debito", None)
    elif "credito" not in achadas and "debito" not in achadas:
        return None
    else:
        achadas.pop("tipo", None)

    mapeamento = Mapeamento(
        delimitador=delimitador,
        cabecalho=numero,
        # Fatura de cartão exportada em inglês (date, title, amount): a compra
        # vem positiva e o pagamento da fatura, negativo.
        inverter_sinal={"title", "amount"} <= set(nomes),
        **achadas,
    )
    if mapeamento.tipo is not None and not _coluna_de_tipo_valida(texto, mapeamento):
        mapeamento = replace(mapeamento, tipo=None)
    return mapeamento


def _coluna_de_tipo_valida(texto: str, mapeamento: Mapeamento) -> bool:
    """A coluna "Tipo" às vezes diz "Pix" ou "Boleto", não D ou C: só entra
    no mapeamento se as primeiras linhas trouxerem sinal reconhecível."""
    vistos = 0
    for _, celulas in _linhas_depois_do_cabecalho(texto, mapeamento):
        if mapeamento.tipo >= len(celulas) or not celulas[mapeamento.tipo].strip():
            continue
        if sinal_do_tipo(celulas[mapeamento.tipo]) is None:
            return False
        vistos += 1
        if vistos == 20:
            break
    return vistos > 0


def _adivinhar_delimitador(texto: str) -> str:
    """Sem colunas reconhecidas, o separador que divide as primeiras linhas no
    mesmo número de células (maior que 1) mais vezes."""
    melhor, placar = DELIMITADORES[0], (0, 0)
    for delimitador in DELIMITADORES:
        try:
            linhas = _primeiras_linhas(texto, delimitador, AMOSTRA_DE_LINHAS)
        except csv.Error:
            continue
        contagem = Counter(len(celulas) for _, celulas in linhas if len(celulas) > 1)
        if contagem:
            colunas, vezes = contagem.most_common(1)[0]
            if (vezes, colunas) > placar:
                melhor, placar = delimitador, (vezes, colunas)
    return melhor


def _primeiras_linhas(texto: str, delimitador: str, limite: int) -> list[tuple[int, list[str]]]:
    leitor = csv.reader(io.StringIO(texto, newline=""), delimiter=delimitador)
    linhas = []
    for celulas in leitor:
        if leitor.line_num > limite:
            break
        linhas.append((leitor.line_num, celulas))
    return linhas


def _linhas_depois_do_cabecalho(texto: str, mapeamento: Mapeamento):
    leitor = csv.reader(io.StringIO(texto, newline=""), delimiter=mapeamento.delimitador)
    for celulas in leitor:
        if leitor.line_num > mapeamento.cabecalho:
            yield leitor.line_num, celulas


def _sem_bom(texto: str) -> str:
    return texto.lstrip("﻿")


# --- Linhas --------------------------------------------------------------------


def ler_extrato(texto: str, mapeamento: Mapeamento | None = None) -> tuple[list[LinhaDoExtrato], list[LinhaRecusada]]:
    """Linhas aproveitadas e linhas recusadas (com o motivo), na ordem do arquivo.

    Sem mapeamento, as colunas são detectadas pelo nome. Linha em branco é
    ignorada. Linha de saldo ("SALDO ANTERIOR", "SALDO DO DIA") é recusada:
    não é lançamento, e importá-la inventaria uma receita.
    """
    texto = _sem_bom(texto)
    if mapeamento is None:
        mapeamento = detectar(texto)
        if mapeamento is None:
            raise ExtratoIlegivel(MENSAGEM_SEM_FORMATO)

    lidas: list[LinhaDoExtrato] = []
    recusadas: list[LinhaRecusada] = []
    try:
        for numero, celulas in _linhas_depois_do_cabecalho(texto, mapeamento):
            if not any(celula.strip() for celula in celulas):
                continue
            resultado = _ler_linha(numero, celulas, mapeamento)
            (lidas if isinstance(resultado, LinhaDoExtrato) else recusadas).append(resultado)
            if len(lidas) + len(recusadas) > MAXIMO_DE_LINHAS:
                raise ExtratoIlegivel(f"O arquivo passa de {MAXIMO_DE_LINHAS} lançamentos. Exporte um período menor.")
    except csv.Error as erro:
        raise ExtratoIlegivel("O arquivo não é um CSV válido.") from erro

    if not lidas and not recusadas:
        raise ExtratoIlegivel("O arquivo não tem lançamentos depois do cabeçalho.")
    return lidas, recusadas


def _ler_linha(numero: int, celulas: list[str], mapeamento: Mapeamento):
    # Data, descrição e valor precisam existir na linha. Crédito, débito, tipo
    # e categoria podem faltar no fim (o banco corta as células vazias).
    obrigatorias = [mapeamento.data, mapeamento.descricao] + ([mapeamento.valor] if mapeamento.valor is not None else [])
    if max(obrigatorias) >= len(celulas):
        return LinhaRecusada(numero, "Linha com colunas faltando.")

    def celula(coluna: int | None) -> str:
        return celulas[coluna] if coluna is not None and coluna < len(celulas) else ""

    descricao = _limpar(celula(mapeamento.descricao))[:TAMANHO_MAXIMO_DA_DESCRICAO]
    if not descricao:
        return LinhaRecusada(numero, "Linha sem descrição.")
    if normalizar(descricao).split(" ")[0] == "saldo":
        return LinhaRecusada(numero, "Linha de saldo, não é lançamento.")

    data = ler_data(celula(mapeamento.data))
    if data is None:
        return LinhaRecusada(numero, MENSAGEM_DATA)

    valor, erro = _valor_da_linha(celula, mapeamento)
    if erro:
        return LinhaRecusada(numero, erro)
    if valor == 0:
        return LinhaRecusada(numero, "Valor zero não vira lançamento.")
    if mapeamento.inverter_sinal:
        valor = -valor

    categoria = _limpar(celula(mapeamento.categoria)) or None
    return LinhaDoExtrato(numero, data, descricao, valor, categoria)


def _valor_da_linha(celula, mapeamento: Mapeamento) -> tuple[int | None, str | None]:
    if mapeamento.valor is not None:
        valor = ler_valor(celula(mapeamento.valor))
        if valor is None:
            return None, MENSAGEM_VALOR
        if mapeamento.tipo is None:
            return valor, None
        sinal = sinal_do_tipo(celula(mapeamento.tipo))
        if sinal is None:
            return None, "Tipo não reconhecido. Use D ou C (débito ou crédito)."
        return abs(valor) * sinal, None

    # Colunas separadas: a saída vale negativo e a entrada positivo, venha o
    # número com sinal ou não.
    entrada, saida = celula(mapeamento.credito).strip(), celula(mapeamento.debito).strip()
    if not entrada and not saida:
        return None, "Linha sem valor de entrada nem de saída."
    credito = ler_valor(entrada) if entrada else 0
    debito = ler_valor(saida) if saida else 0
    if credito is None or debito is None:
        return None, MENSAGEM_VALOR
    return abs(credito) - abs(debito), None


def _limpar(texto: str) -> str:
    return " ".join(_CONTROLE.sub(" ", texto).split())


def sinal_do_tipo(texto: str) -> int | None:
    """-1 para débito/saída, 1 para crédito/entrada, None se não reconhecer."""
    bruto = texto.strip()
    if bruto in ("-", "+"):
        return -1 if bruto == "-" else 1
    palavra = normalizar(bruto)
    if palavra in ("d", "db", "deb") or palavra.startswith(("debito", "saida")):
        return -1
    if palavra in ("c", "cr", "cred") or palavra.startswith(("credito", "entrada")):
        return 1
    return None


def ler_data(texto: str) -> date | None:
    """DD/MM/AAAA (também com - ou . e ano de dois dígitos, lido como 20AA) ou
    AAAA-MM-DD, com ou sem a hora depois."""
    texto = texto.strip()
    if encontrado := _DATA_BR.match(texto):
        dia, mes, ano = encontrado.groups()
        if len(ano) == 2:
            ano = f"20{ano}"
    elif encontrado := _DATA_ISO.match(texto):
        ano, mes, dia = encontrado.groups()
    else:
        return None
    try:
        return date(int(ano), int(mes), int(dia))
    except ValueError:
        return None


def ler_valor(texto: str) -> int | None:
    """Centavos com sinal, ou None. Mesma regra do campo de valor da área do
    cliente (web/src/regras/dinheiro.js): "1.234,56" e "-80" no jeito
    brasileiro, ponto decimal só sem ambiguidade ("10.5"; "1.500" é mil e
    quinhentos). Aceita também o sinal no fim ("80,00-") e a letra D ou C
    depois do número ("80,00 D"). A conta é feita em texto, sem float."""
    limpo = re.sub(r"\s", "", texto.replace("R$", "").replace("r$", ""))
    negativo = limpo[:1] in ("-", "−")
    if negativo or limpo[:1] == "+":
        limpo = limpo[1:]
    elif sufixo := re.fullmatch(r"(.*\d)([-−DdCc])", limpo):
        limpo, marca = sufixo.groups()
        negativo = marca in ("-", "−", "D", "d")

    decimais = ""
    if "," in limpo:
        partes = limpo.split(",")
        if len(partes) != 2 or not re.fullmatch(r"\d{1,3}(\.\d{3})*|\d+", partes[0]):
            return None
        inteiro, decimais = partes[0].replace(".", ""), partes[1]
    elif re.fullmatch(r"\d+\.\d{1,2}", limpo):
        inteiro, decimais = limpo.split(".")
    elif re.fullmatch(r"\d{1,3}(\.\d{3})+|\d+", limpo):
        inteiro = limpo.replace(".", "")
    else:
        return None

    if not re.fullmatch(r"\d{0,2}", decimais):
        return None
    centavos = int(inteiro) * 100 + int(decimais.ljust(2, "0"))
    if centavos > LIMITE_EM_CENTAVOS:
        return None
    return -centavos if negativo else centavos


def chaves_de_importacao(conta_id: str, linhas: list[LinhaDoExtrato]) -> list[str]:
    """Uma chave por linha (SHA-256 em hexadecimal), na mesma ordem.

    A descrição entra normalizada (sem acento, caixa e espaços extras), para
    o mesmo extrato exportado de novo dar as mesmas chaves. A ocorrência
    separa duas compras iguais no mesmo dia: a 1ª e a 2ª têm chaves diferentes.
    """
    ocorrencias: Counter = Counter()
    chaves = []
    for linha in linhas:
        base = (conta_id, linha.data.isoformat(), str(linha.valor_centavos), normalizar(linha.descricao))
        ocorrencias[base] += 1
        texto = "|".join((*base, str(ocorrencias[base])))
        chaves.append(hashlib.sha256(texto.encode("utf-8")).hexdigest())
    return chaves
