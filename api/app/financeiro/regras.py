"""Regras do livro-caixa em funções puras, testáveis sem banco e sem HTTP.

Partidas dobradas: todo lançamento mexe em dois lados que se anulam. Contas
(corrente, poupança, carteira) e categorias funcionam como os dois lados:

    despesa de R$ 50 no mercado:  conta corrente −5000 · categoria Mercado +5000
    receita de R$ 6.800 salário:  conta corrente +680000 · categoria Salário −680000
    transferência de R$ 500:      conta corrente −50000 · conta poupança +50000

A soma das partidas é sempre zero. O saldo de uma conta não é um número
gravado e atualizado: é o saldo inicial mais a soma das partidas dela. Assim
nenhum saldo fica "descolado" do histórico que o explica.
"""

from app.financeiro.modelos import (
    Categoria,
    Conta,
    CorCategoria,
    NovoLancamento,
    Partida,
    TipoCategoria,
    TipoLancamento,
)

# Categorias criadas junto com o espaço pessoal, para o primeiro lançamento não
# exigir cadastro. A pessoa pode renomear, recolorir ou desativar cada uma.
CATEGORIAS_INICIAIS: list[tuple[str, TipoCategoria, CorCategoria]] = [
    ("Moradia", TipoCategoria.DESPESA, CorCategoria.MORADIA),
    ("Mercado", TipoCategoria.DESPESA, CorCategoria.MERCADO),
    ("Transporte", TipoCategoria.DESPESA, CorCategoria.TRANSPORTE),
    ("Contas da casa", TipoCategoria.DESPESA, CorCategoria.CASA),
    ("Saúde", TipoCategoria.DESPESA, CorCategoria.SAUDE),
    ("Lazer", TipoCategoria.DESPESA, CorCategoria.LAZER),
    ("Outras despesas", TipoCategoria.DESPESA, CorCategoria.NEUTRO),
    ("Salário", TipoCategoria.RECEITA, CorCategoria.ENTRADA),
    ("Receita extra", TipoCategoria.RECEITA, CorCategoria.ENTRADA),
    ("Outras receitas", TipoCategoria.RECEITA, CorCategoria.NEUTRO),
]

OBRIGATORIO = "Campo obrigatório."


def conferir_lancamento(
    dados: NovoLancamento,
    conta: Conta | None,
    categoria: Categoria | None,
    conta_destino: Conta | None,
) -> dict[str, str]:
    """Erros de coerência por campo (vazio = pode lançar).

    conta, categoria e conta_destino são o que o banco devolveu para os ids do
    corpo, já filtrado pelo espaço: None quando o id não existe ou é de outro
    espaço. Por isso "não encontrada" também cobre "não é sua".
    """
    erros: dict[str, str] = {}

    if conta is None:
        erros["conta_id"] = "Conta não encontrada."
    elif not conta.ativa:
        erros["conta_id"] = "Conta desativada: reative-a para lançar nela."

    if dados.tipo == TipoLancamento.TRANSFERENCIA:
        if dados.categoria_id is not None:
            erros["categoria_id"] = "Transferência entre contas não tem categoria."
        if dados.conta_destino_id is None:
            erros["conta_destino_id"] = OBRIGATORIO
        elif dados.conta_destino_id == dados.conta_id:
            erros["conta_destino_id"] = "Escolha uma conta de destino diferente da de origem."
        elif conta_destino is None:
            erros["conta_destino_id"] = "Conta não encontrada."
        elif not conta_destino.ativa:
            erros["conta_destino_id"] = "Conta desativada: reative-a para lançar nela."
        return erros

    if dados.conta_destino_id is not None:
        erros["conta_destino_id"] = "Só transferência tem conta de destino."
    if dados.categoria_id is None:
        erros["categoria_id"] = OBRIGATORIO
    elif categoria is None:
        erros["categoria_id"] = "Categoria não encontrada."
    elif not categoria.ativa:
        erros["categoria_id"] = "Categoria desativada: reative-a para lançar nela."
    elif categoria.tipo.value != dados.tipo.value:
        erros["categoria_id"] = f"Use uma categoria de {dados.tipo.value.lower()}."
    return erros


def montar_partidas(dados: NovoLancamento) -> list[Partida]:
    """As duas partidas de um lançamento já conferido (soma zero)."""
    valor = dados.valor_centavos
    if dados.tipo == TipoLancamento.RECEITA:
        return [Partida(valor, conta_id=dados.conta_id), Partida(-valor, categoria_id=dados.categoria_id)]
    if dados.tipo == TipoLancamento.DESPESA:
        return [Partida(-valor, conta_id=dados.conta_id), Partida(valor, categoria_id=dados.categoria_id)]
    return [Partida(-valor, conta_id=dados.conta_id), Partida(valor, conta_id=dados.conta_destino_id)]


def inverter(partidas: list[Partida]) -> list[Partida]:
    """Partidas do estorno: os mesmos lados com o sinal trocado. Somadas às
    originais, zeram o efeito do lançamento em todas as contas e categorias."""
    return [Partida(-partida.valor_centavos, partida.conta_id, partida.categoria_id) for partida in partidas]


def soma_zero(partidas: list[Partida]) -> bool:
    return len(partidas) >= 2 and sum(partida.valor_centavos for partida in partidas) == 0


def saldo_da_conta(conta: Conta, somas_por_conta: dict[str, int]) -> int:
    return conta.saldo_inicial_centavos + somas_por_conta.get(conta.id, 0)
