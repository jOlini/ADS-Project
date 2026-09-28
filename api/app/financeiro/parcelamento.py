"""Compras parceladas na fatura importada do banco, em funções puras.

A fatura do banco traz uma linha por parcela, com o número no fim da
descrição: "LOJA X 03/12", "Loja X - Parcela 3/12", "Loja (Parcela 3 de 12)".
Ao importar, a linha vira a parcela 3 de 12 de uma compra, e as parcelas 4 a
12 (as vincendas) entram já nas próximas faturas, ocupando o limite como a
compra lançada pela tela. As parcelas que já passaram (1 e 2) não entram: o
dinheiro delas já saiu, em faturas que o livro-caixa não conhece.

Quando a fatura seguinte chega com a "04/12", a linha acha a parcela que já
estava lá (mesma descrição sem o número, mesmo valor, mesmo total de
parcelas e a fatura certa) e só a confirma, sem duplicar.

Cada banco data a parcela de um jeito:
- com uma data do período da própria fatura (a data do lançamento);
- com a data da compra original (todas as parcelas repetem o dia da compra, e
  a 3ª cai duas faturas depois da data escrita).
posicionar() descobre qual dos dois o arquivo usa: o que junta mais linhas
numa mesma fatura. As compras à vista e as primeiras parcelas ficam no mesmo
lugar nos dois jeitos, e puxam a decisão.
"""

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, replace
from datetime import date
from uuid import uuid4

from app.financeiro import cartoes
from app.financeiro.cartoes import Referencia
from app.financeiro.importacao import normalizar
from app.financeiro.modelos import MAXIMO_DE_PARCELAS, Conta, Lancamento

# "03/12", "3 / 12", "Parcela 3/12", "PARC 03/12", "(Parcela 3 de 12)", no fim
# da descrição. O número não pode ser pedaço de outro ("101/12").
_PARCELA = re.compile(
    r"[\s\-–(:·]*(?:(?:parcela|parc|pcl)\.?\s*)?(?<!\d)(\d{1,2})(?:\s*/\s*|\s+de\s+)(\d{1,2})\s*\)?\s*$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class ParcelaNaDescricao:
    # A descrição sem o número da parcela ("LOJA X").
    base: str
    numero: int
    total: int
    # Onde o número da parcela está na descrição, para escrever as seguintes.
    inicio: int
    fim: int

    @property
    def chave(self) -> str:
        return normalizar(self.base)


@dataclass(frozen=True)
class ParcelaConhecida:
    """Uma parcela que já está no cartão (gravada ou planejada nesta
    importação). importada = já veio de um arquivo, com chave de importação;
    senão, foi gerada pelo parcelamento e espera a linha da fatura dela."""

    compra_id: str
    numero: int
    referencia: Referencia
    importada: bool
    lancamento_id: str | None = None


@dataclass(frozen=True)
class PlanoDaLinha:
    """O que fazer com uma linha parcelada da fatura."""

    compra_id: str
    numero: int
    total: int
    chave: str
    valor_centavos: int
    # A parcela já estava no cartão (gerada antes): a linha só a confirma.
    prevista: ParcelaConhecida | None
    # Parcelas vincendas que faltam no cartão: (número, data).
    futuras: list[tuple[int, date]]


def parcela_na_descricao(descricao: str) -> ParcelaNaDescricao | None:
    """O número e o total da parcela no fim da descrição, ou None. "15/09"
    (parcela maior que o total) não é parcela: é uma data no texto."""
    achado = _PARCELA.search(descricao)
    if not achado:
        return None
    numero, total = int(achado.group(1)), int(achado.group(2))
    base = descricao[: achado.start()].strip(" -–(:·")
    if not base or not 2 <= total <= MAXIMO_DE_PARCELAS or not 1 <= numero <= total:
        return None
    return ParcelaNaDescricao(base, numero, total, achado.start(1), achado.end(1))


def descricao_da_parcela(descricao: str, parcela: ParcelaNaDescricao, numero: int) -> str:
    """A mesma descrição com outro número de parcela, no mesmo formato
    ("LOJA X 03/12" vira "LOJA X 04/12")."""
    largura = parcela.fim - parcela.inicio
    return descricao[: parcela.inicio] + str(numero).zfill(largura) + descricao[parcela.fim :]


def chave_da_descricao(descricao: str) -> str:
    parcela = parcela_na_descricao(descricao)
    return normalizar(parcela.base if parcela else descricao)


def posicionar(cartao: Conta, linhas: list[tuple[date, ParcelaNaDescricao | None]]) -> list[date]:
    """A data com que cada linha entra no cartão, na mesma ordem.

    Só as parcelas a partir da 2ª podem mudar de data: com a data da compra
    original no arquivo, a parcela N vai para N - 1 faturas depois dela (no
    dia equivalente, dentro do período da fatura)."""
    no_arquivo = [data for data, _ in linhas]
    pela_compra = [
        cartoes.datas_das_parcelas(cartao, data, parcela.numero)[-1] if parcela and parcela.numero > 1 else data
        for data, parcela in linhas
    ]

    def concentracao(datas: list[date]) -> int:
        faturas = Counter(cartoes.referencia_da_data(cartao, data) for data in datas)
        return max(faturas.values(), default=0)

    return pela_compra if concentracao(pela_compra) > concentracao(no_arquivo) else no_arquivo


class Parcelamentos:
    """As compras parceladas do cartão, agrupadas para achar a compra de uma
    linha da fatura. Uma compra é identificada pela descrição sem o número
    (normalizada), pelo total de parcelas e pelo valor da parcela."""

    def __init__(self, cartao: Conta, lancamentos: list[Lancamento]):
        self._cartao = cartao
        # (chave, total, valor) -> compra_id -> número da parcela -> parcela
        self._compras: dict[tuple[str, int, int], dict[str, dict[int, ParcelaConhecida]]] = defaultdict(dict)
        for lancamento in lancamentos:
            if not (lancamento.compra_id and lancamento.parcela and lancamento.parcelas):
                continue
            chave = lancamento.chave_parcelamento or chave_da_descricao(lancamento.descricao)
            self._registrar(
                (chave, lancamento.parcelas, lancamento.valor_centavos),
                ParcelaConhecida(
                    lancamento.compra_id,
                    lancamento.parcela,
                    cartoes.referencia_da_data(cartao, lancamento.data),
                    importada=lancamento.chave_importacao is not None,
                    lancamento_id=lancamento.id,
                ),
            )

    def _registrar(self, grupo: tuple[str, int, int], parcela: ParcelaConhecida) -> None:
        self._compras[grupo].setdefault(parcela.compra_id, {})[parcela.numero] = parcela

    def _compra_da_linha(self, grupo: tuple[str, int, int], numero: int, referencia: Referencia) -> str | None:
        """A compra em que a parcela cabe: todas as parcelas dela na fatura
        certa em relação a esta, e o lugar desta ainda sem linha do arquivo
        (senão é outra compra igual)."""
        for compra_id, parcelas in self._compras.get(grupo, {}).items():
            ocupada = numero in parcelas and parcelas[numero].importada
            coerente = all(
                parcela.referencia == cartoes.somar_meses(referencia, parcela.numero - numero)
                for parcela in parcelas.values()
            )
            if coerente and not ocupada:
                return compra_id
        return None

    def planejar(self, parcela: ParcelaNaDescricao, data: date, valor_centavos: int) -> PlanoDaLinha:
        """Plano de uma linha parcelada (valor da parcela, sem sinal) que entra
        no cartão nesta data. Já deixa a linha e as parcelas vincendas
        registradas: a próxima linha do mesmo arquivo as enxerga."""
        grupo = (parcela.chave, parcela.total, valor_centavos)
        referencia = cartoes.referencia_da_data(self._cartao, data)
        compra_id = self._compra_da_linha(grupo, parcela.numero, referencia)
        existentes = self._compras[grupo].get(compra_id, {}) if compra_id else {}
        compra_id = compra_id or uuid4().hex
        prevista = existentes.get(parcela.numero)

        datas = cartoes.datas_das_parcelas(self._cartao, data, parcela.total - parcela.numero + 1)
        futuras = [
            (parcela.numero + indice, data_da_parcela)
            for indice, data_da_parcela in enumerate(datas[1:], start=1)
            if parcela.numero + indice not in existentes
        ]

        self._registrar(
            grupo,
            ParcelaConhecida(
                compra_id,
                parcela.numero,
                referencia,
                importada=True,
                lancamento_id=prevista.lancamento_id if prevista else None,
            ),
        )
        for numero, data_da_parcela in futuras:
            self._registrar(
                grupo,
                ParcelaConhecida(compra_id, numero, cartoes.referencia_da_data(self._cartao, data_da_parcela), False),
            )
        return PlanoDaLinha(compra_id, parcela.numero, parcela.total, parcela.chave, valor_centavos, prevista, futuras)

    def anotar(self, plano: PlanoDaLinha, numero: int, lancamento_id: str) -> None:
        """Guarda o id de uma parcela vincenda que acabou de ser gravada: outra
        linha do mesmo arquivo pode confirmá-la."""
        parcelas = self._compras[(plano.chave, plano.total, plano.valor_centavos)][plano.compra_id]
        parcelas[numero] = replace(parcelas[numero], lancamento_id=lancamento_id)
