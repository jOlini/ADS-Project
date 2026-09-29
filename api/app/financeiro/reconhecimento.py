"""Reconhecimento das colunas do extrato, sem a pessoa indicar nada.

Duas etapas, em funções puras sobre as primeiras linhas do arquivo já
separadas em células:

1. Pelo cabeçalho: cada nome de coluna ganha pontos para cada informação
   (data, descrição, valor...). O nome exato de um banco conhecido vale mais
   que um nome que só contém a palavra ("Valor da transação" contém "valor");
   palavras que desqualificam ("saldo", "US$", "IOF") zeram a coluna para o
   valor. As colunas vão para as informações da maior pontuação para a menor,
   cada coluna uma vez só. Depois, as células conferem: uma coluna de data em
   que quase nada é data fica em dúvida.
2. Pelo conteúdo, quando nenhuma linha serve de cabeçalho (arquivo sem
   cabeçalho, ou com nomes desconhecidos): a coluna em que quase tudo é data
   é a data; a de números é o valor (e a que acompanha o valor linha a linha
   é o saldo, que fica de fora); duas colunas de números que se revezam são
   entrada e saída; a de texto mais variado é a descrição.

O resultado diz de onde veio (CABECALHO ou CONTEUDO) e as informações em
dúvida (duas colunas com o mesmo nome, célula que não confere). Sem dúvida, a
tela vai direto para a conferência dos lançamentos; com dúvida, mostra as
colunas já preenchidas e marca o que conferir.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field, replace

from app.financeiro.celulas import ler_data, ler_valor, normalizar, sinal_do_tipo

PAPEIS = ("data", "descricao", "valor", "credito", "debito", "tipo", "categoria")

# Nomes de coluna aceitos para cada informação, já normalizados (minúsculas,
# sem acento, pontuação trocada por espaço): "Valor (R$)" vira "valor r",
# "Histórico" vira "historico", "D/C" vira "d c". A ordem é a preferência:
# num arquivo com "Título" e "Descrição", a descrição vence. Moldes do que os
# bancos exportam (conta e fatura): Nubank, Itaú, Bradesco, Banco do Brasil,
# Santander, Caixa, Inter, C6, BTG, XP, Sicoob, Sicredi, PicPay, Mercado Pago.
COLUNAS: dict[str, tuple[str, ...]] = {
    "data": (
        "data",
        "data lancamento",
        "data do lancamento",
        "data da transacao",
        "data transacao",
        "data movimento",
        "data mov",
        "data movimentacao",
        "dt lancamento",
        "dt movimento",
        "data da compra",
        "data compra",
        "data operacao",
        "date",
        "transaction date",
        "release date",
    ),
    "valor": (
        "valor",
        "valor r",
        "valor rs",
        "valor em r",
        "valor brl",
        "valor lancamento",
        "valor do lancamento",
        "valor da transacao",
        "valor transacao",
        "valor liquido",
        "quantia",
        "montante",
        "amount",
        "value",
        "transaction net amount",
        "net amount",
    ),
    "credito": ("credito", "credito r", "creditos", "valor credito", "entrada", "entradas", "entrada r", "credit"),
    "debito": ("debito", "debito r", "debitos", "valor debito", "saida", "saidas", "saida r", "debit"),
    "descricao": (
        "descricao",
        "historico",
        "lancamento",
        "descricao do lancamento",
        "detalhes",
        "detalhe",
        "estabelecimento",
        "titulo",
        "favorecido",
        "beneficiario",
        "complemento",
        "description",
        "title",
        "memo",
        "merchant",
        "payee",
        "transaction type",
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

# Palavras que tiram a coluna de uma informação mesmo quando o nome contém a
# palavra certa: "Saldo (R$)" não é valor, "Valor (US$)" é a moeda de fora
# (a fatura em reais tem a coluna "Valor (R$)" ao lado), "Descrição do
# valor" não é a descrição.
BLOQUEIOS: dict[str, frozenset[str]] = {
    "data": frozenset(),
    "valor": frozenset({"saldo", "us", "usd", "dolar", "dolares", "limite", "iof", "cotacao", "original", "moeda"}),
    "credito": frozenset({"saldo", "limite"}),
    "debito": frozenset({"saldo", "limite"}),
    "descricao": frozenset({"data", "valor", "saldo", "tipo"}),
    "tipo": frozenset(),
    "categoria": frozenset(),
}
# Datas de segunda ordem: servem se não houver outra.
DATAS_SECUNDARIAS = frozenset({"contabil", "balancete", "vencimento", "compensacao"})

# Pontos de um nome: exato vale mais que contido; dentro de cada grupo, a
# ordem do COLUNAS desempata.
EXATO, CONTIDO, SECUNDARIA = 1000, 500, 300

# Parte mínima das células que precisa conferir com a informação da coluna.
CONFERE = 0.5
# No reconhecimento pelo conteúdo: coluna "de datas" ou "de números".
QUASE_TUDO = 0.8
# Linhas de dados usadas para conferir e para reconhecer pelo conteúdo.
AMOSTRA = 30

Linhas = Sequence[tuple[int, list[str]]]


@dataclass(frozen=True)
class Mapeamento:
    """Onde está cada informação no arquivo. Colunas contam a partir de 0.
    cabecalho é o número da linha do cabeçalho (1 = primeira); 0 quando o
    arquivo não tem cabeçalho e os lançamentos começam na linha 1. Sem
    cabeçalho mas com linhas antes dos dados (agência, período), é o número
    da última dessas linhas.

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
        return {papel: getattr(self, papel) for papel in PAPEIS if getattr(self, papel) is not None}


@dataclass(frozen=True)
class Reconhecimento:
    mapeamento: Mapeamento
    origem: str  # "CABECALHO" ou "CONTEUDO"
    duvidas: tuple[str, ...] = field(default=())


# --- Pelo cabeçalho ------------------------------------------------------------


def pontos_do_nome(nome: str, papel: str) -> int:
    """Quanto um nome de coluna (já normalizado) serve para a informação; 0 se
    não serve."""
    if not nome:
        return 0
    palavras = set(nome.split())
    aceitos = COLUNAS[papel]
    secundaria = SECUNDARIA if papel == "data" and palavras & DATAS_SECUNDARIAS else 0
    if nome in aceitos:
        return EXATO - aceitos.index(nome) - secundaria
    if palavras & BLOQUEIOS[papel]:
        return 0
    for indice, aceito in enumerate(aceitos):
        if f" {aceito} " in f" {nome} ":
            return CONTIDO - indice - secundaria
    return 0


def pelo_cabecalho(linhas: Linhas, delimitador: str, numero: int, celulas: list[str]) -> Reconhecimento | None:
    """Mapeamento com a linha `numero` como cabeçalho, ou None se ela não tiver
    data, descrição e valor (ou entrada e saída). `linhas` é o começo do
    arquivo, para conferir as células de baixo."""
    nomes = [normalizar(celula) for celula in celulas]
    candidatos = sorted(
        (
            (pontos, -PAPEIS.index(papel), papel, coluna)
            for papel in PAPEIS
            for coluna, nome in enumerate(nomes)
            if (pontos := pontos_do_nome(nome, papel)) > 0
        ),
        reverse=True,
    )
    achadas: dict[str, int] = {}
    pontos_de: dict[str, int] = {}
    usadas: set[int] = set()
    for pontos, _, papel, coluna in candidatos:
        if papel not in achadas and coluna not in usadas:
            achadas[papel] = coluna
            pontos_de[papel] = pontos
            usadas.add(coluna)

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
    dados = _dados_depois(linhas, numero)
    if mapeamento.tipo is not None and not _coluna_de_tipo(dados, mapeamento.tipo):
        mapeamento = replace(mapeamento, tipo=None)

    # Dúvida: outra coluna com os mesmos pontos para a mesma informação (dois
    # "Valor"), ou células que não conferem com a informação da coluna.
    duvidas = [
        papel
        for papel in mapeamento.colunas()
        if papel in pontos_de and sum(pontos_do_nome(nome, papel) == pontos_de[papel] for nome in nomes) > 1
    ]
    if dados:
        if _proporcao(dados, mapeamento.data, _e_data) < CONFERE:
            duvidas.append("data")
        if mapeamento.valor is not None and _proporcao(dados, mapeamento.valor, _e_numero) < CONFERE:
            duvidas.append("valor")
    return Reconhecimento(mapeamento, "CABECALHO", tuple(dict.fromkeys(duvidas)))


def _coluna_de_tipo(dados: list[list[str]], coluna: int) -> bool:
    """A coluna "Tipo" às vezes diz "Pix" ou "Boleto", não D ou C: só entra
    no mapeamento se as primeiras linhas trouxerem sinal reconhecível."""
    vistos = 0
    for celulas in dados:
        if coluna >= len(celulas) or not celulas[coluna].strip():
            continue
        if sinal_do_tipo(celulas[coluna]) is None:
            return False
        vistos += 1
    return vistos > 0


# --- Pelo conteúdo -------------------------------------------------------------


def pelo_conteudo(linhas: Linhas, delimitador: str) -> Reconhecimento | None:
    """Mapeamento tirado das células, sem nome de coluna. None quando não há
    coluna de datas, de números e de texto que se distingam."""
    inicio = next((indice for indice, (_, celulas) in enumerate(linhas) if _parece_lancamento(celulas)), None)
    if inicio is None:
        return None
    primeira = linhas[inicio][0]
    dados = [celulas for _, celulas in linhas[inicio:] if sum(bool(celula.strip()) for celula in celulas) >= 2][:AMOSTRA]
    largura = max(len(celulas) for celulas in dados)
    colunas = range(largura)

    data = max(colunas, key=lambda coluna: _proporcao(dados, coluna, _e_data, vazias_contam=True))
    if _proporcao(dados, data, _e_data, vazias_contam=True) < QUASE_TUDO:
        return None

    outras = [coluna for coluna in colunas if coluna != data]
    numeros = {coluna: _proporcao(dados, coluna, _e_numero, vazias_contam=True) for coluna in outras}
    cheias = [coluna for coluna in outras if numeros[coluna] >= QUASE_TUDO]
    ralas = [coluna for coluna in outras if 0.2 <= numeros[coluna] < QUASE_TUDO and _proporcao(dados, coluna, _e_numero) >= QUASE_TUDO]
    duvidas: list[str] = []

    saldos = {b for a in cheias for b in cheias if a != b and _acompanha(dados, a, b)}
    valores = [coluna for coluna in cheias if coluna not in saldos]
    papeis: dict[str, int] = {}
    if valores:
        # Com mais de uma, a que tem sinal (saída negativa) é o valor.
        com_sinal = [coluna for coluna in valores if any((_numero(celulas, coluna) or 0) < 0 for celulas in dados)]
        escolhidas = com_sinal or valores
        papeis["valor"] = escolhidas[0]
        if len(escolhidas) > 1:
            duvidas.append("valor")
    else:
        par = _entrada_e_saida(dados, ralas)
        if par is None:
            return None
        (credito, debito), certo = par
        papeis["credito"], papeis["debito"] = credito, debito
        if not certo:
            duvidas.extend(("credito", "debito"))

    usadas = {data, *papeis.values(), *saldos}
    if "valor" in papeis and not any((_numero(celulas, papeis["valor"]) or 0) < 0 for celulas in dados):
        # Valor sem sinal: uma coluna de D/C ao lado dá o sinal.
        tipo = next((coluna for coluna in outras if coluna not in usadas and _coluna_de_tipo(dados, coluna)), None)
        if tipo is not None:
            papeis["tipo"] = tipo
            usadas.add(tipo)

    textos = sorted(
        ((_pontos_de_texto(dados, coluna), coluna) for coluna in outras if coluna not in usadas),
        reverse=True,
    )
    if not textos or textos[0][0] <= 0:
        return None
    papeis["descricao"] = textos[0][1]
    if len(textos) > 1 and textos[1][0] >= textos[0][0] * 0.85:
        duvidas.append("descricao")

    mapeamento = Mapeamento(delimitador=delimitador, cabecalho=primeira - 1, data=data, **papeis)
    return Reconhecimento(mapeamento, "CONTEUDO", tuple(duvidas))


def _parece_lancamento(celulas: list[str]) -> bool:
    """Uma data numa coluna e um número em outra."""
    datas = {indice for indice, celula in enumerate(celulas) if _e_data(celula)}
    return bool(datas) and any(_e_numero(celula) for indice, celula in enumerate(celulas) if indice not in datas)


def _entrada_e_saida(dados: list[list[str]], ralas: list[int]) -> tuple[tuple[int, int], bool] | None:
    """Duas colunas de números que se revezam (em cada linha, uma ou outra):
    entrada e saída. A que traz número negativo é a saída; sem sinal, fica a
    ordem mais comum nos bancos (entrada antes da saída), em dúvida."""
    for a in ralas:
        for b in ralas:
            if a >= b:
                continue
            revezam = sum(bool(_numero(celulas, a)) != bool(_numero(celulas, b)) for celulas in dados)
            if revezam / len(dados) < QUASE_TUDO:
                continue
            negativa_a = any((_numero(celulas, a) or 0) < 0 for celulas in dados)
            negativa_b = any((_numero(celulas, b) or 0) < 0 for celulas in dados)
            if negativa_a != negativa_b:
                return ((b, a) if negativa_a else (a, b)), True
            return (a, b), False
    return None


def _acompanha(dados: list[list[str]], valor: int, saldo: int) -> bool:
    """A coluna `saldo` muda, de uma linha para a outra, exatamente o `valor`
    da linha (extrato do mais antigo para o mais novo, ou o contrário)."""
    pares = confere = 0
    for anterior, atual in zip(dados, dados[1:], strict=False):
        saldo_antes, saldo_agora = _numero(anterior, saldo), _numero(atual, saldo)
        valor_antes, valor_agora = _numero(anterior, valor), _numero(atual, valor)
        if None in (saldo_antes, saldo_agora, valor_antes, valor_agora):
            continue
        pares += 1
        confere += saldo_agora - saldo_antes == valor_agora or saldo_antes - saldo_agora == valor_antes
    return pares >= 2 and confere / pares >= 0.6


def _pontos_de_texto(dados: list[list[str]], coluna: int) -> float:
    """Letras por célula vezes a variedade (descrições mudam de linha para
    linha; "Pix enviado" se repete). Coluna de datas, números ou D/C vale 0."""
    celulas = [linha[coluna].strip() for linha in dados if coluna < len(linha) and linha[coluna].strip()]
    if len(celulas) < len(dados) * CONFERE:
        return 0
    if sum(_e_data(c) or _e_numero(c) or sinal_do_tipo(c) is not None for c in celulas) > len(celulas) / 2:
        return 0
    letras = sum(sum(caractere.isalpha() for caractere in celula) for celula in celulas) / len(celulas)
    if letras < 3:
        return 0
    return letras * (len(set(celulas)) / len(celulas))


# --- Células ------------------------------------------------------------------


def _dados_depois(linhas: Linhas, cabecalho: int) -> list[list[str]]:
    return [celulas for numero, celulas in linhas if numero > cabecalho and any(celula.strip() for celula in celulas)][
        :AMOSTRA
    ]


def _e_data(celula: str) -> bool:
    return ler_data(celula) is not None


def _e_numero(celula: str) -> bool:
    texto = celula.strip()
    return bool(texto) and any(caractere.isdigit() for caractere in texto) and ler_valor(texto) is not None and not _e_data(texto)


def _numero(celulas: list[str], coluna: int) -> int | None:
    if coluna >= len(celulas) or not celulas[coluna].strip():
        return None
    return ler_valor(celulas[coluna]) if _e_numero(celulas[coluna]) else None


def _proporcao(dados: list[list[str]], coluna: int, teste, vazias_contam: bool = False) -> float:
    """Parte das células da coluna que passam no teste. Sem vazias_contam, as
    vazias ficam de fora da conta (coluna de entrada tem vazio nas saídas)."""
    celulas = [linha[coluna] if coluna < len(linha) else "" for linha in dados]
    if not vazias_contam:
        celulas = [celula for celula in celulas if celula.strip()]
    if not celulas:
        return 0.0
    return sum(teste(celula) for celula in celulas) / len(celulas)
