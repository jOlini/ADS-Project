"""Leitura do extrato do banco em CSV, em funções puras (sem banco e sem HTTP).

O arquivo precisa de três colunas: data, descrição e valor, com o valor
negativo nas saídas. Cada banco escreve o cabeçalho de um jeito, então os
nomes aceitos ficam em COLUNAS, comparados sem acento e sem pontuação.

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
from dataclasses import dataclass
from datetime import date

from app.financeiro.modelos import LIMITE_EM_CENTAVOS

# Limite de uma importação (o tamanho do texto fica em modelos.NovaImportacao).
# O extrato de um mês cabe com folga; mais que isso pede um período menor.
MAXIMO_DE_LINHAS = 1000
TAMANHO_MAXIMO_DA_DESCRICAO = 120

# Nomes de coluna aceitos, já normalizados (minúsculas, sem acento, pontuação
# trocada por espaço): "Valor (R$)" vira "valor r", "Histórico" vira "historico".
COLUNAS = {
    "data": {"data", "data lancamento", "data do lancamento", "data da transacao", "data movimento"},
    "descricao": {"descricao", "historico", "lancamento", "descricao do lancamento", "detalhes", "estabelecimento"},
    "valor": {"valor", "valor r", "valor rs", "valor em r", "quantia"},
}
DELIMITADORES = (";", ",", "\t")
# O cabeçalho pode vir depois de algumas linhas com os dados da conta.
LINHAS_ANTES_DO_CABECALHO = 10

_DATA_BR = re.compile(r"^(\d{2})[/-](\d{2})[/-](\d{4})$")
_DATA_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")
_CONTROLE = re.compile(r"[\x00-\x1f\x7f]")


class ExtratoIlegivel(ValueError):
    """O arquivo inteiro não serve (sem cabeçalho, vazio, grande demais)."""


@dataclass(frozen=True)
class LinhaDoExtrato:
    """Uma linha aproveitada. valor_centavos tem sinal: negativo é saída."""

    linha: int
    data: date
    descricao: str
    valor_centavos: int


@dataclass(frozen=True)
class LinhaRecusada:
    linha: int
    erro: str


def normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", sem_acento.lower()).strip()


def ler_extrato(texto: str) -> tuple[list[LinhaDoExtrato], list[LinhaRecusada]]:
    """Linhas aproveitadas e linhas recusadas (com o motivo), na ordem do arquivo.

    Linha em branco é ignorada. Linha de saldo ("SALDO ANTERIOR", "SALDO DO
    DIA") é recusada: não é lançamento, e importá-la inventaria uma receita.
    """
    texto = texto.lstrip("﻿")
    indices, linhas = _achar_cabecalho(texto)

    lidas: list[LinhaDoExtrato] = []
    recusadas: list[LinhaRecusada] = []
    for numero, celulas in linhas:
        if not any(celula.strip() for celula in celulas):
            continue
        if max(indices.values()) >= len(celulas):
            recusadas.append(LinhaRecusada(numero, "Linha com colunas faltando."))
            continue
        resultado = _ler_linha(numero, *(celulas[indices[coluna]] for coluna in ("data", "descricao", "valor")))
        (lidas if isinstance(resultado, LinhaDoExtrato) else recusadas).append(resultado)

    if len(lidas) + len(recusadas) > MAXIMO_DE_LINHAS:
        raise ExtratoIlegivel(f"O arquivo passa de {MAXIMO_DE_LINHAS} lançamentos. Exporte um período menor.")
    if not lidas and not recusadas:
        raise ExtratoIlegivel("O arquivo não tem lançamentos depois do cabeçalho.")
    return lidas, recusadas


def _achar_cabecalho(texto: str):
    """({coluna: índice}, [(número da linha no arquivo, células)]) das linhas
    depois do cabeçalho. Tenta cada delimitador até achar uma linha com as
    três colunas."""
    for delimitador in DELIMITADORES:
        leitor = csv.reader(io.StringIO(texto, newline=""), delimiter=delimitador)
        try:
            indices = _procurar_cabecalho(leitor)
        except csv.Error:
            continue
        if indices is None:
            continue
        try:
            return indices, [(leitor.line_num, celulas) for celulas in leitor]
        except csv.Error as erro:
            raise ExtratoIlegivel("O arquivo não é um CSV válido.") from erro
    raise ExtratoIlegivel("Não achei o cabeçalho com as colunas Data, Descrição e Valor.")


def _procurar_cabecalho(leitor) -> dict[str, int] | None:
    for celulas in leitor:
        if indices := _indices_das_colunas(celulas):
            return indices
        if leitor.line_num >= LINHAS_ANTES_DO_CABECALHO:
            return None
    return None


def _indices_das_colunas(celulas: list[str]) -> dict[str, int] | None:
    nomes = [normalizar(celula) for celula in celulas]
    indices = {}
    for coluna, aceitos in COLUNAS.items():
        indice = next((i for i, nome in enumerate(nomes) if nome in aceitos), None)
        if indice is None:
            return None
        indices[coluna] = indice
    return indices


def _ler_linha(numero: int, data_bruta: str, descricao_bruta: str, valor_bruto: str):
    descricao = " ".join(_CONTROLE.sub(" ", descricao_bruta).split())[:TAMANHO_MAXIMO_DA_DESCRICAO]
    if not descricao:
        return LinhaRecusada(numero, "Linha sem descrição.")
    if normalizar(descricao).split(" ")[0] == "saldo":
        return LinhaRecusada(numero, "Linha de saldo, não é lançamento.")

    data = ler_data(data_bruta)
    if data is None:
        return LinhaRecusada(numero, "Data inválida. Use DD/MM/AAAA ou AAAA-MM-DD.")

    valor = ler_valor(valor_bruto)
    if valor is None:
        return LinhaRecusada(numero, "Valor inválido. Use o formato 1.234,56, com - nas saídas.")
    if valor == 0:
        return LinhaRecusada(numero, "Valor zero não vira lançamento.")
    return LinhaDoExtrato(numero, data, descricao, valor)


def ler_data(texto: str) -> date | None:
    texto = texto.strip()
    if encontrado := _DATA_BR.match(texto):
        dia, mes, ano = encontrado.groups()
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
    quinhentos). A conta é feita em texto, sem float."""
    limpo = re.sub(r"\s", "", texto.replace("R$", "").replace("r$", ""))
    negativo = limpo[:1] in ("-", "−")
    if negativo or limpo[:1] == "+":
        limpo = limpo[1:]

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
