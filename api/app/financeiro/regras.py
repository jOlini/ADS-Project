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

import unicodedata
from dataclasses import replace

from app.financeiro.importacao import normalizar
from app.financeiro.modelos import (
    AtualizacaoConta,
    AtualizacaoLancamento,
    Categoria,
    ClasseDeCusto,
    Conta,
    CorCategoria,
    FuncaoDaCategoria,
    Lancamento,
    NovaCompra,
    NovaConta,
    NovoLancamento,
    Partida,
    TipoCategoria,
    TipoConta,
    TipoEspaco,
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

# Empresa: o vocabulário do caixa de um negócio pequeno (vendas, serviços,
# impostos, fornecedores, folha, sócios), no lugar de salário e mercado.
CATEGORIAS_DA_EMPRESA: list[tuple[str, TipoCategoria, CorCategoria]] = [
    ("Impostos", TipoCategoria.DESPESA, CorCategoria.SAUDE),
    ("Fornecedores", TipoCategoria.DESPESA, CorCategoria.MERCADO),
    ("Folha de pagamento", TipoCategoria.DESPESA, CorCategoria.CASA),
    ("Encargos da folha", TipoCategoria.DESPESA, CorCategoria.CASA),
    ("Benefícios", TipoCategoria.DESPESA, CorCategoria.CASA),
    ("Pró-labore", TipoCategoria.DESPESA, CorCategoria.MORADIA),
    ("Prestadores de serviço", TipoCategoria.DESPESA, CorCategoria.TRANSPORTE),
    ("Aluguel e estrutura", TipoCategoria.DESPESA, CorCategoria.TRANSPORTE),
    ("Marketing", TipoCategoria.DESPESA, CorCategoria.LAZER),
    ("Tarifas bancárias", TipoCategoria.DESPESA, CorCategoria.NEUTRO),
    ("Outras despesas", TipoCategoria.DESPESA, CorCategoria.NEUTRO),
    ("Distribuição de lucros", TipoCategoria.DESPESA, CorCategoria.NEUTRO),
    ("Vendas", TipoCategoria.RECEITA, CorCategoria.ENTRADA),
    ("Serviços prestados", TipoCategoria.RECEITA, CorCategoria.ENTRADA),
    ("Aportes dos sócios", TipoCategoria.RECEITA, CorCategoria.NEUTRO),
    ("Outras receitas", TipoCategoria.RECEITA, CorCategoria.NEUTRO),
]

# Classe na aba Custos das despesas iniciais da empresa. As outras despesas
# (e as que a pessoa criar) ganham a sugestão da tela pelo nome.
CLASSES_INICIAIS: dict[str, ClasseDeCusto] = {
    "Impostos": ClasseDeCusto.VARIAVEL,
    "Fornecedores": ClasseDeCusto.VARIAVEL,
    "Folha de pagamento": ClasseDeCusto.FIXO,
    "Encargos da folha": ClasseDeCusto.FIXO,
    "Benefícios": ClasseDeCusto.FIXO,
    "Pró-labore": ClasseDeCusto.FIXO,
    "Prestadores de serviço": ClasseDeCusto.FIXO,
    "Aluguel e estrutura": ClasseDeCusto.FIXO,
    "Marketing": ClasseDeCusto.OPERACIONAL,
    "Tarifas bancárias": ClasseDeCusto.OPERACIONAL,
    "Outras despesas": ClasseDeCusto.OPERACIONAL,
    "Distribuição de lucros": ClasseDeCusto.FORA,
}

# A categoria que a gestão da empresa usa para cada função: nome, tipo e cor
# com que ela nasce se ainda não existir (empresa criada antes dela, ou a
# pessoa excluiu). Todas estão entre as iniciais.
CATEGORIAS_DA_GESTAO: dict[FuncaoDaCategoria, str] = {
    FuncaoDaCategoria.APORTE: "Aportes dos sócios",
    FuncaoDaCategoria.DISTRIBUICAO: "Distribuição de lucros",
    FuncaoDaCategoria.PRO_LABORE: "Pró-labore",
    FuncaoDaCategoria.SALARIOS: "Folha de pagamento",
    FuncaoDaCategoria.BENEFICIOS: "Benefícios",
    FuncaoDaCategoria.PRESTADORES: "Prestadores de serviço",
    FuncaoDaCategoria.ENCARGOS: "Encargos da folha",
    FuncaoDaCategoria.IMPOSTOS: "Impostos",
}


def gestao_da_categoria(tipo: TipoEspaco, nome: str) -> tuple[ClasseDeCusto | None, FuncaoDaCategoria | None]:
    """Classe de custo e função de uma categoria inicial (só na empresa)."""
    if tipo != TipoEspaco.PJ:
        return None, None
    funcao = next((funcao for funcao, padrao in CATEGORIAS_DA_GESTAO.items() if padrao == nome), None)
    return CLASSES_INICIAIS.get(nome), funcao


def categoria_padrao(funcao: FuncaoDaCategoria) -> tuple[str, TipoCategoria, CorCategoria]:
    """Nome, tipo e cor com que nasce a categoria de uma função da gestão."""
    nome = CATEGORIAS_DA_GESTAO[funcao]
    return next(item for item in CATEGORIAS_DA_EMPRESA if item[0] == nome)


def categorias_iniciais(tipo: TipoEspaco) -> list[tuple[str, TipoCategoria, CorCategoria]]:
    """As categorias que nascem com o espaço pessoal e com cada empresa."""
    return CATEGORIAS_DA_EMPRESA if tipo == TipoEspaco.PJ else CATEGORIAS_INICIAIS


OBRIGATORIO = "Campo obrigatório."
CAMPOS_DO_CARTAO = ("limite_centavos", "dia_fechamento", "dia_vencimento")
CARTAO_NAO_TRANSFERE = "Cartão de crédito não é origem de transferência. Para quitar a fatura, use Pagar fatura."
COMPRA_PELO_CARTAO = "Compra no crédito entra na fatura do cartão (Nova compra), não no extrato das contas."
EDICAO_VAZIA = "Informe o que mudar: descrição, data, valor, categoria, meio ou responsável."
ESTORNADO_SO_RENOMEIA = (
    "Lançamento estornado (ou estorno) só muda a descrição, o meio e o responsável: o estorno espelha o original."
)
TRANSFERENCIA_SEM_RESPONSAVEL = "Transferência entre contas próprias não tem responsável."
PARCELA_SO_RENOMEIA = "Parcela de compra no cartão não muda data nem valor. Para isso, exclua a compra e lance de novo."


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


def conferir_destino_da_categoria(categoria: Categoria, destino: Categoria | None) -> dict[str, str]:
    """Para onde vão os lançamentos de uma categoria excluída: outra categoria
    do espaço, do mesmo tipo (despesa continua despesa) e ativa. Erros no
    campo mover_para (vazio = pode mover)."""
    if destino is None:
        return {"mover_para": "Categoria de destino não encontrada."}
    if destino.id == categoria.id:
        return {"mover_para": "Escolha outra categoria: esta é a que sai."}
    if destino.tipo != categoria.tipo:
        tipo = "despesa" if categoria.tipo == TipoCategoria.DESPESA else "receita"
        return {"mover_para": f"Escolha uma categoria de {tipo}, como a que sai."}
    if not destino.ativa:
        return {"mover_para": "A categoria de destino está desativada. Ative-a ou escolha outra."}
    return {}


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
    if dados.responsavel and dados.tipo == TipoLancamento.TRANSFERENCIA:
        erros["responsavel"] = TRANSFERENCIA_SEM_RESPONSAVEL
    return erros


SO_UMA_DIVISAO = "Use a divisão por pessoa ou o número de pessoas, não os dois."
TRANSFERENCIA_SEM_DIVISAO = "Transferência entre contas não se divide entre pessoas."
SO_A_VISTA = "A divisão entre pessoas vale só para compra à vista."


def conferir_divisao(dados: NovoLancamento) -> dict[str, str]:
    """Racha: cada pessoa uma vez só e a soma das partes até o valor do
    lançamento. O que sobra é a parte de quem lançou; transferência entre
    contas próprias não tem o que dividir. A anotação do Free (dividido_entre)
    segue a mesma regra do tipo e não vem junto com as partes."""
    if dados.dividido_entre is not None:
        if dados.tipo == TipoLancamento.TRANSFERENCIA:
            return {"dividido_entre": TRANSFERENCIA_SEM_DIVISAO}
        if dados.divisao:
            return {"dividido_entre": SO_UMA_DIVISAO}
    if not dados.divisao:
        return {}
    if dados.tipo == TipoLancamento.TRANSFERENCIA:
        return {"divisao": TRANSFERENCIA_SEM_DIVISAO}
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

    # Lançamentos é só o dinheiro à vista das contas; o cartão tem a fatura.
    if conta is not None and conta.cartao:
        erros["conta_id"] = COMPRA_PELO_CARTAO
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
        erros["divisao"] = SO_A_VISTA
    elif dados.divisao:
        erros.update(_conferir_partes(dados.divisao, dados.valor_centavos))
    if dados.dividido_entre is not None:
        if dados.parcelas > 1:
            erros["dividido_entre"] = SO_A_VISTA
        elif dados.divisao:
            erros["dividido_entre"] = SO_UMA_DIVISAO
    return erros


def conferir_pagamento(conta: Conta | None) -> dict[str, str]:
    """A conta de onde sai o pagamento da fatura: do espaço, ativa e que não
    seja um cartão (cartão não paga cartão)."""
    if erro := _erro_da_conta(conta):
        return {"conta_id": erro}
    if conta.cartao:
        return {"conta_id": "O pagamento sai de uma conta, não de um cartão de crédito."}
    return {}


def chave_da_pessoa(nome: str) -> str:
    """O nome de uma pessoa como ele é comparado: sem acento, sem caixa e com
    os espaços apertados ("Léo " e "leo" são a mesma pessoa), como a tela faz
    (web/src/regras/responsavel.ts) e o MongoDB (repositorio.MESMO_NOME)."""
    sem_acento = "".join(letra for letra in unicodedata.normalize("NFD", nome) if not unicodedata.combining(letra))
    return " ".join(sem_acento.casefold().split())


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


def conferir_edicao(
    lancamento: Lancamento,
    dados: AtualizacaoLancamento,
    conta: Conta | None,
    categoria: Categoria | None,
) -> dict[str, str]:
    """Erros por campo de uma edição (PATCH). Só contam os campos enviados.

    - estorno e lançamento estornado só mudam a descrição, o meio e o
      responsável: o estorno é o espelho do original, e mudar o valor de um
      lado deixaria o outro errado;
    - parcela de compra no cartão muda a descrição e a categoria (da compra
      inteira), não a data nem o valor, que vêm do parcelamento;
    - compra no cartão não tem meio (ela é o crédito);
    - transferência entre contas próprias não tem responsável;
    - o novo valor não pode ficar abaixo das partes do racha."""
    enviados = dados.model_fields_set
    if not enviados:
        return {"lancamento": EDICAO_VAZIA}
    erros: dict[str, str] = {}
    for campo in ("descricao", "data", "valor_centavos"):
        if campo in enviados and getattr(dados, campo) is None:
            erros[campo] = OBRIGATORIO
    if lancamento.estorno_de or lancamento.estornado_por:
        for campo in enviados & {"data", "valor_centavos", "categoria_id"}:
            erros[campo] = ESTORNADO_SO_RENOMEIA
    elif lancamento.compra_id:
        for campo in enviados & {"data", "valor_centavos"}:
            erros[campo] = PARCELA_SO_RENOMEIA
    if "categoria_id" in enviados and "categoria_id" not in erros:
        if lancamento.tipo == TipoLancamento.TRANSFERENCIA:
            erros["categoria_id"] = "Transferência entre contas não tem categoria."
        elif erro := _erro_da_categoria(categoria, TipoCategoria(lancamento.tipo.value)):
            erros["categoria_id"] = erro
    if dados.meio is not None and conta is not None and conta.cartao:
        erros["meio"] = "Compra no cartão não tem meio de pagamento: ela entra na fatura."
    if dados.responsavel and lancamento.tipo == TipoLancamento.TRANSFERENCIA:
        erros["responsavel"] = TRANSFERENCIA_SEM_RESPONSAVEL
    novo_valor = dados.valor_centavos
    if novo_valor and "valor_centavos" not in erros and sum(p.valor_centavos for p in lancamento.divisao) > novo_valor:
        erros["valor_centavos"] = "As partes da divisão somam mais que o novo valor."
    return erros


def aplicar_edicao(lancamento: Lancamento, dados: AtualizacaoLancamento) -> Lancamento:
    """O lançamento com os campos enviados já trocados (conferidos antes) e as
    partidas remontadas: o novo valor e a nova categoria mudam os dois lados."""
    campos = {campo: getattr(dados, campo) for campo in dados.model_fields_set}
    editado = replace(lancamento, **campos)
    if {"valor_centavos", "categoria_id"} & campos.keys():
        editado.partidas = montar_partidas(editado)
    return editado


def montar_partidas(dados: NovoLancamento | Lancamento) -> list[Partida]:
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
