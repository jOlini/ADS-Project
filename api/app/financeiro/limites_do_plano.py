"""Limites do Plano Free, em funções puras (sem banco e sem HTTP).

O Free é o essencial para organizar o dinheiro: contas, cartões e lançamentos
com categoria, até um teto. Passou do teto, a API recusa com 403 e diz qual
limite foi atingido (o membro "limite" do Problem Details), para a tela
convidar a pessoa a conhecer o Família ou o Empresarial. Os outros planos não
têm teto. Como as outras travas de plano (DA-104), a conta é feita aqui, no
servidor: a tela só mostra o uso e o convite.

O que conta:

- contas: todas as contas e os cartões do espaço, ativos ou desativados
  (desativar não abre vaga: o cadastro continua lá);
- lançamentos do mês: os feitos à mão desde o primeiro dia do mês, no fuso do
  espaço. A compra parcelada conta uma vez só (a primeira parcela). Não
  contam o extrato importado, o estorno, o reembolso do racha, o pagamento da
  fatura e o que a gestão da empresa gera: são consequências de algo que já
  existe, e travá-los deixaria a pessoa sem pagar a fatura.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from enum import StrEnum
from zoneinfo import ZoneInfo

from app.financeiro.modelos import Plano


@dataclass(frozen=True)
class Limites:
    contas: int
    lancamentos_por_mes: int


LIMITES_DO_FREE = Limites(contas=5, lancamentos_por_mes=100)


class Recurso(StrEnum):
    CONTAS = "contas"
    LANCAMENTOS_DO_MES = "lancamentos_do_mes"


@dataclass(frozen=True)
class Uso:
    usado: int
    # None: o plano não tem teto para este recurso.
    maximo: int | None

    @property
    def atingido(self) -> bool:
        return self.maximo is not None and self.usado >= self.maximo


@dataclass(frozen=True)
class UsoDoPlano:
    plano: Plano
    contas: Uso
    lancamentos_do_mes: Uso


def limites_do_plano(plano: Plano) -> Limites | None:
    """Os tetos do plano, ou None quando ele não tem teto."""
    return LIMITES_DO_FREE if plano == Plano.FREE else None


def uso_do_plano(plano: Plano, contas: int, lancamentos_do_mes: int) -> UsoDoPlano:
    limites = limites_do_plano(plano)
    return UsoDoPlano(
        plano=plano,
        contas=Uso(contas, limites.contas if limites else None),
        lancamentos_do_mes=Uso(lancamentos_do_mes, limites.lancamentos_por_mes if limites else None),
    )


def inicio_do_mes(hoje: date, fuso: str) -> datetime:
    """Meia-noite do primeiro dia do mês no fuso do espaço, em UTC (como o
    criado_em fica gravado)."""
    local = datetime.combine(hoje.replace(day=1), time(), ZoneInfo(fuso))
    return local.astimezone(UTC)


MENSAGENS = {
    Recurso.CONTAS: "O Plano Free guarda até {maximo} contas e cartões. "
    "Para cadastrar mais, conheça o Plano Família ou o Empresarial.",
    Recurso.LANCAMENTOS_DO_MES: "O Plano Free faz até {maximo} lançamentos por mês, e este mês chegou lá. "
    "O extrato importado continua entrando; para lançar à mão sem limite, conheça o Plano Família ou o Empresarial.",
}


def mensagem_do_limite(recurso: Recurso, maximo: int) -> str:
    return MENSAGENS[recurso].format(maximo=maximo)
