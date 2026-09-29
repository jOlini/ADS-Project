"""Leitura de uma célula do extrato (data, valor, D/C, texto), em funções puras.

Separado da importação para o reconhecimento das colunas (reconhecimento.py)
usar as mesmas regras da leitura das linhas: uma coluna "é de data" quando as
células dela são lidas como data aqui.
"""

import re
import unicodedata
from datetime import date

from app.financeiro.modelos import LIMITE_EM_CENTAVOS
from app.sanitizacao import limpar_texto

MENSAGEM_DATA = "Data inválida. Use DD/MM/AAAA ou AAAA-MM-DD."
MENSAGEM_VALOR = "Valor inválido. Use o formato 1.234,56, com - nas saídas."

_DATA_BR = re.compile(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})$")
_DATA_ISO = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")


def normalizar(texto: str) -> str:
    sem_acento = unicodedata.normalize("NFKD", texto).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", " ", sem_acento.lower()).strip()


def limpar_celula(texto: str) -> str:
    """Texto de uma célula (descrição ou categoria) sem controle, espaço
    repetido, sinal de tag nem começo de fórmula (app/sanitizacao.py).

    Injeção de fórmula (CSV injection): uma célula que começa com =, +, - ou
    @ vira fórmula quando o texto volta a uma planilha, e =HYPERLINK(...) ou
    =cmd|... agem no computador de quem abre. O arquivo vem de fora (banco ou
    qualquer pessoa), então esses caracteres do começo saem antes de gravar.
    O valor não passa por aqui: o sinal dele é lido em ler_valor."""
    return limpar_texto(texto)


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
