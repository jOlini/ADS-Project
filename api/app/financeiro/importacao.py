"""Leitura do extrato do banco em CSV, em funções puras (sem banco e sem HTTP).

Cada banco exporta de um jeito: ponto e vírgula ou vírgula, cabeçalho na
primeira linha ou depois dos dados da conta, valor com sinal, colunas
separadas de entrada e saída, ou valor sem sinal ao lado de uma coluna D/C.
O Mapeamento diz onde está cada informação. reconhecer() o monta pelos
nomes das colunas ou, sem cabeçalho conhecido, pelo conteúdo das células
(reconhecimento.py), e diz o que ficou em dúvida; quando não consegue, a tela
mostra o começo do arquivo (estrutura()) e a pessoa indica as colunas.

Antes de qualquer leitura, conferir_arquivo() recusa o que não é texto de CSV
(planilha, PDF, binário), e o leitor para em células maiores que
TAMANHO_MAXIMO_DA_CELULA: o arquivo nunca vai inteiro para a memória numa
célula só.

Idempotência: cada linha ganha uma chave calculada a partir da conta, da
data, do valor, da descrição e da ocorrência (a 2ª linha igual no mesmo
arquivo é outra compra, não uma repetição). Importar o mesmo extrato de novo,
ou um extrato de um período que cobre o anterior, não duplica lançamento: a
chave já existe e a linha é pulada.
"""

import csv
import hashlib
import io
from collections import Counter
from dataclasses import dataclass
from datetime import date

from app.financeiro.celulas import (  # noqa: F401 (MENSAGEM_* e as leituras também são usadas por quem importa daqui)
    MENSAGEM_DATA,
    MENSAGEM_VALOR,
    ler_data,
    ler_valor,
    limpar_celula,
    normalizar,
    sinal_do_tipo,
)
from app.financeiro.reconhecimento import (  # noqa: F401 (COLUNAS e Mapeamento continuam importáveis daqui)
    COLUNAS,
    Mapeamento,
    Reconhecimento,
    pelo_cabecalho,
    pelo_conteudo,
)

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
# Linhas lidas para reconhecer as colunas: as dez em que o cabeçalho pode
# estar e as de dados que conferem (ou dão, sem cabeçalho) cada coluna.
LINHAS_PARA_RECONHECER = LINHAS_ANTES_DO_CABECALHO + 30

# Célula maior que isso não é de extrato (a descrição fica em 120). O leitor
# de CSV para no limite em vez de guardar na memória uma "célula" do tamanho
# do arquivo inteiro (aspas sem fechar, arquivo que não é CSV).
TAMANHO_MAXIMO_DA_CELULA = 5_000
csv.field_size_limit(TAMANHO_MAXIMO_DA_CELULA)

# O começo de arquivos que não são CSV, para a mensagem dizer o que fazer.
TRECHO_CONFERIDO = 4096
ASSINATURAS: tuple[tuple[str, str], ...] = (
    ("pk\x03\x04", "Este arquivo é uma planilha do Excel (.xlsx) ou um .zip. No banco, exporte o extrato em CSV."),
    ("%pdf", "Este arquivo é um PDF. No banco, exporte o extrato em CSV."),
    ("{\\rtf", "Este arquivo é um documento formatado (.rtf). No banco, exporte o extrato em CSV."),
    ("<!doctype", "Este arquivo é uma página da web, não um CSV. No banco, exporte o extrato em CSV."),
    ("<html", "Este arquivo é uma página da web, não um CSV. No banco, exporte o extrato em CSV."),
)
MENSAGEM_BINARIO = "Este arquivo não é um texto CSV. No banco, exporte o extrato em CSV."

MENSAGEM_SEM_FORMATO = "Não reconheci as colunas do arquivo. Indique onde estão a data, a descrição e o valor."



class ExtratoIlegivel(ValueError):
    """O arquivo inteiro não serve (sem colunas reconhecidas, vazio, grande demais)."""


@dataclass(frozen=True)
class LinhaDoArquivo:
    """Uma linha do começo do arquivo, já separada em células (para a tela)."""

    numero: int
    celulas: list[str]


@dataclass(frozen=True)
class Estrutura:
    delimitador: str
    linhas: list[LinhaDoArquivo]
    # Preenchido quando as colunas foram reconhecidas (reconhecer()).
    mapeamento: Mapeamento | None
    # "CABECALHO" ou "CONTEUDO"; None sem mapeamento.
    origem: str | None = None
    # Informações do mapeamento que a pessoa deve conferir (reconhecimento.py).
    duvidas: tuple[str, ...] = ()


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


# --- Formato do arquivo --------------------------------------------------------


def reconhecer(texto: str, delimitador: str | None = None) -> Reconhecimento | None:
    """Colunas reconhecidas pelo cabeçalho (uma das primeiras dez linhas) ou,
    sem cabeçalho conhecido, pelo conteúdo das células (reconhecimento.py).
    None quando nem um nem outro dá data, descrição e valor."""
    texto = _sem_bom(texto)
    for tentativa in (delimitador,) if delimitador else DELIMITADORES:
        try:
            linhas = _primeiras_linhas(texto, tentativa, LINHAS_PARA_RECONHECER)
        except csv.Error:
            continue
        for numero, celulas in linhas:
            if numero > LINHAS_ANTES_DO_CABECALHO:
                break
            if achado := pelo_cabecalho(linhas, tentativa, numero, celulas):
                return achado
    escolhido = delimitador or _adivinhar_delimitador(texto)
    try:
        linhas = _primeiras_linhas(texto, escolhido, LINHAS_PARA_RECONHECER)
    except csv.Error as erro:
        # Nenhum separador lê o começo do arquivo (aspas sem fechar, célula
        # maior que TAMANHO_MAXIMO_DA_CELULA): não é um CSV.
        raise ExtratoIlegivel("O arquivo não é um CSV válido.") from erro
    return pelo_conteudo(linhas, escolhido) if linhas else None


def detectar(texto: str, delimitador: str | None = None) -> Mapeamento | None:
    """Mapeamento reconhecido sem ajuda: pelo cabeçalho, ou pelo conteúdo sem
    nada em dúvida. None quando é preciso a pessoa indicar as colunas."""
    achado = reconhecer(texto, delimitador)
    if achado is None or (achado.origem == "CONTEUDO" and achado.duvidas):
        return None
    return achado.mapeamento


def conferir_arquivo(texto: str) -> None:
    """Recusa (ExtratoIlegivel) o que não é texto de CSV antes de ler qualquer
    linha: planilha do Excel, PDF, página da web ou arquivo binário renomeado
    para .csv. A tela confere o começo do arquivo também, mas a requisição
    pode chegar sem ela."""
    inicio = _sem_bom(texto)[:TRECHO_CONFERIDO]
    for assinatura, mensagem in ASSINATURAS:
        if inicio.lstrip().lower().startswith(assinatura):
            raise ExtratoIlegivel(mensagem)
    controles = sum(1 for caractere in inicio if caractere < " " and caractere not in "\t\r\n")
    if "\x00" in texto or controles > len(inicio) * 0.01:
        raise ExtratoIlegivel(MENSAGEM_BINARIO)


def estrutura(texto: str, delimitador: str | None = None) -> Estrutura:
    """O começo do arquivo separado em células, para a pessoa conferir ou
    indicar as colunas, e o mapeamento reconhecido quando ele existe (com a
    origem e o que ficou em dúvida)."""
    conferir_arquivo(texto)
    texto = _sem_bom(texto)
    achado = reconhecer(texto, delimitador)
    escolhido = achado.mapeamento.delimitador if achado else (delimitador or _adivinhar_delimitador(texto))
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
    if achado is None:
        return Estrutura(escolhido, amostra, None)
    return Estrutura(escolhido, amostra, achado.mapeamento, achado.origem, achado.duvidas)


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
    conferir_arquivo(texto)
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

    descricao = limpar_celula(celula(mapeamento.descricao))[:TAMANHO_MAXIMO_DA_DESCRICAO]
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

    categoria = limpar_celula(celula(mapeamento.categoria)) or None
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
