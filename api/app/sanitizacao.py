"""Limpeza do texto livre que chega do cliente (nome de conta, cartão e
categoria, descrição de lançamento, pessoa do racha, nome de usuário do
back-office), antes de qualquer validação de tamanho e de gravar.

É a mesma regra da tela (web/src/regras/sanitizacao.ts), mas é esta que vale:
a requisição pode chegar sem passar pela tela.

Contra o quê:
- XSS: sem "<" e ">", nenhum texto gravado vira tag, mesmo que um dia seja
  mostrado fora do React (o painel do back-office, um e-mail, um relatório);
- injeção de fórmula (CSV injection): texto que começa com =, +, - ou @ vira
  fórmula quando o dado vai para uma planilha;
- caracteres invisíveis: controle, largura zero e os que invertem a direção do
  texto, que enganam quem lê.

Injeção de SQL não se aplica (o banco é o MongoDB). A de operador do Mongo
("$ne", "$where") não chega ao banco: cada campo tem tipo (texto, número,
data), e um objeto no lugar de um texto é recusado com 400
(tests/test_sanitizacao.py).
"""

import re
import unicodedata

_CONTROLE = re.compile(r"[\x00-\x1f\x7f-\x9f]")
_INVISIVEIS = re.compile(r"[\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]")
_SINAIS_DE_TAG = re.compile(r"[<>\uff1c\uff1e]")
# Os de largura cheia (U+FF1D, U+FF0B, U+FF0D, U+FF20) também: planilhas os
# tratam como os normais.
_COMECO_DE_FORMULA = re.compile(r"^[=+\-@\uff1d\uff0b\uff0d\uff20\s]+")


def limpar_texto(texto: str) -> str:
    """Texto sem sinal de tag, sem começo de fórmula, sem caractere de controle
    ou invisível, com os espaços apertados e sem espaço nas pontas."""
    texto = unicodedata.normalize("NFC", texto)
    texto = _CONTROLE.sub(" ", texto)
    texto = _INVISIVEIS.sub("", texto)
    texto = _SINAIS_DE_TAG.sub("", texto)
    texto = " ".join(texto.split())
    return _COMECO_DE_FORMULA.sub("", texto)


def texto_limpo(valor: object) -> object:
    """Para o BeforeValidator dos campos de texto livre: limpa o que é texto e
    deixa o resto seguir para a validação do tipo, que o recusa."""
    return limpar_texto(valor) if isinstance(valor, str) else valor
