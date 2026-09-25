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

from app.financeiro.importacao import normalizar
from app.financeiro.modelos import (
    AtualizacaoConta,
    Categoria,
    Conta,
    CorCategoria,
    NovaCompra,
    NovaConta,
    NovoLancamento,
    Partida,
    TipoCategoria,
    TipoConta,
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
CAMPOS_DO_CARTAO = ("limite_centavos", "dia_fechamento", "dia_vencimento")
CARTAO_NAO_TRANSFERE = "Cartão de crédito não é origem de transferência. Para quitar a fatura, use Pagar fatura."


def conferir_conta(dados: NovaConta | AtualizacaoConta, atual: Conta | None = None) -> dict[str, str]:
    """Erros por campo de uma conta nova (atual = None) ou editada.

    Cartão de crédito pede limite e os dias de fechamento e vencimento; as
    outras contas não têm nada disso. O tipo muda livremente entre as contas
    comuns, mas conta não vira cartão, nem o contrário: os lançamentos dela
    mudariam de sentido (dinheiro guardado virando dívida)."""
    cartao = dados.tipo == TipoConta.CARTAO_CREDITO
    if atual is not None and atual.cartao != cartao:
        return {"tipo": "Conta não vira cartão de crédito, nem cartão vira conta. Crie outro cadastro."}

    erros: dict[str, str] = {}
    for campo in CAMPOS_DO_CARTAO:
        preenchido = getattr(dados, campo) is not None
        if cartao and not preenchido:
            erros[campo] = OBRIGATORIO
        elif not cartao and preenchido:
            erros[campo] = "Só cartão de crédito tem limite, fechamento e vencimento."
    if cartao and dados.dia_fechamento is not None and dados.dia_fechamento == dados.dia_vencimento:
        erros["dia_vencimento"] = "A fatura vence depois de fechar: use um dia diferente do fechamento."
    # A dívida do cartão nasce das compras, cada uma na sua fatura. Uma dívida
    # inicial não teria fatura nem data.
    if cartao and isinstance(dados, NovaConta) and dados.saldo_inicial_centavos != 0:
        erros["saldo_inicial_centavos"] = "O cartão começa sem dívida: importe a fatura ou lance as compras."
    return erros


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
    erros = _conferir_contas_e_categoria(dados, conta, categoria, conta_destino)
    erros.update(conferir_divisao(dados))
    return erros


def conferir_divisao(dados: NovoLancamento) -> dict[str, str]:
    """Racha: cada pessoa uma vez só e a soma das partes até o valor do
    lançamento. O que sobra é a parte de quem lançou; transferência entre
    contas próprias não tem o que dividir."""
    if not dados.divisao:
        return {}
    if dados.tipo == TipoLancamento.TRANSFERENCIA:
        return {"divisao": "Transferência entre contas não se divide entre pessoas."}
    return _conferir_partes(dados.divisao, dados.valor_centavos)


def _conferir_partes(divisao: list, valor_centavos: int) -> dict[str, str]:
    erros: dict[str, str] = {}
    vistas: set[str] = set()
    for indice, parte in enumerate(divisao):
        nome = " ".join(parte.pessoa.split()).casefold()
        if nome in vistas:
            erros[f"divisao.{indice}.pessoa"] = "Esta pessoa já está na divisão."
        vistas.add(nome)
    if sum(parte.valor_centavos for parte in divisao) > valor_centavos:
        erros["divisao"] = "As partes somam mais que o valor do lançamento."
    return erros


def _conferir_contas_e_categoria(
    dados: NovoLancamento,
    conta: Conta | None,
    categoria: Categoria | None,
    conta_destino: Conta | None,
) -> dict[str, str]:
    erros: dict[str, str] = {}

    if erro := _erro_da_conta(conta):
        erros["conta_id"] = erro

    if dados.tipo == TipoLancamento.TRANSFERENCIA:
        # O dinheiro vai de uma conta para o cartão (pagamento), nunca sai dele.
        if conta is not None and conta.cartao:
            erros["conta_id"] = CARTAO_NAO_TRANSFERE
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


def conferir_compra(dados: NovaCompra, cartao: Conta | None, categoria: Categoria | None) -> dict[str, str]:
    """Erros por campo de uma compra no cartão. cartao já é o do espaço e do
    tipo certo (o serviço responde 404 antes, se não for)."""
    erros: dict[str, str] = {}
    if cartao is not None and not cartao.ativa:
        erros["cartao"] = "Cartão desativado: reative-o para lançar compras."
    if erro := _erro_da_categoria(categoria, TipoCategoria.DESPESA):
        erros["categoria_id"] = erro
    if dados.parcelas > dados.valor_centavos:
        erros["parcelas"] = "Cada parcela precisa de pelo menos um centavo."
    if dados.divisao and dados.parcelas > 1:
        erros["divisao"] = "A divisão entre pessoas vale só para compra à vista."
    elif dados.divisao:
        erros.update(_conferir_partes(dados.divisao, dados.valor_centavos))
    return erros


def conferir_pagamento(conta: Conta | None) -> dict[str, str]:
    """A conta de onde sai o pagamento da fatura: do espaço, ativa e que não
    seja um cartão (cartão não paga cartão)."""
    if erro := _erro_da_conta(conta):
        return {"conta_id": erro}
    if conta.cartao:
        return {"conta_id": "O pagamento sai de uma conta, não de um cartão de crédito."}
    return {}


def categoria_pelo_nome(categorias: list[Categoria], nome: str | None, tipo: TipoCategoria) -> Categoria | None:
    """Categoria ativa do tipo com o nome escrito na coluna de categoria do
    extrato, comparado sem acento, caixa nem pontuação. None se não houver."""
    if not nome:
        return None
    procurado = normalizar(nome)
    return next(
        (c for c in categorias if c.ativa and c.tipo == tipo and normalizar(c.nome) == procurado),
        None,
    )


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
