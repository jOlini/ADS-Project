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

    if erro := _erro_da_conta(conta):
        erros["conta_id"] = erro

    if dados.tipo == TipoLancamento.TRANSFERENCIA:
        if dados.categoria_id is not None:
            erros["categoria_id"] = "Transferência entre contas não tem categoria."
        if dados.conta_destino_id is None:
            erros["conta_destino_id"] = OBRIGATORIO
        elif dados.conta_destino_id == dados.conta_id:
            erros["conta_destino_id"] = "Escolha uma conta de destino diferente da de origem."
        elif erro := _erro_da_conta(conta_destino):
            erros["conta_destino_id"] = erro
        return erros

    if dados.conta_destino_id is not None:
        erros["conta_destino_id"] = "Só transferência tem conta de destino."
    if dados.categoria_id is None:
        erros["categoria_id"] = OBRIGATORIO
    elif erro := _erro_da_categoria(categoria, TipoCategoria(dados.tipo.value)):
        erros["categoria_id"] = erro
    return erros


def conferir_importacao(
    conta: Conta | None,
    categoria_despesa: Categoria | None,
    categoria_receita: Categoria | None,
) -> dict[str, str]:
    """Erros por campo do destino de uma importação de extrato (vazio = pode
    importar). Mesmas regras de um lançamento: conta e categorias do espaço,
    ativas, e cada categoria do seu tipo."""
    erros: dict[str, str] = {}
    if erro := _erro_da_conta(conta):
        erros["conta_id"] = erro
    if erro := _erro_da_categoria(categoria_despesa, TipoCategoria.DESPESA):
        erros["categoria_despesa_id"] = erro
    if erro := _erro_da_categoria(categoria_receita, TipoCategoria.RECEITA):
        erros["categoria_receita_id"] = erro
    return erros


def _erro_da_conta(conta: Conta | None) -> str | None:
    if conta is None:
        return "Conta não encontrada."
    if not conta.ativa:
        return "Conta desativada: reative-a para lançar nela."
    return None


def _erro_da_categoria(categoria: Categoria | None, tipo: TipoCategoria) -> str | None:
    if categoria is None:
        return "Categoria não encontrada."
    if not categoria.ativa:
        return "Categoria desativada: reative-a para lançar nela."
    if categoria.tipo != tipo:
        return f"Use uma categoria de {tipo.value.lower()}."
    return None


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
