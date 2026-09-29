"""Categoria de cada linha importada, pela descrição, sem a pessoa escolher.

A ordem, da pista mais forte para a mais fraca:

1. ARQUIVO: a coluna de categoria do extrato traz o nome de uma categoria
   ativa do espaço (como já era).
2. HISTORICO: o mesmo estabelecimento já foi lançado antes nesta conta de
   espaço, quase sempre na mesma categoria ("PADARIA DOCE PAO 12/09" e
   "Padaria Doce Pão" são o mesmo lugar). É o que a pessoa ensinou.
3. REGRA: uma palavra conhecida da descrição (iFood, Uber, farmácia, luz,
   salário) aponta um assunto, e o assunto aponta a categoria da pessoa pelo
   nome ("Alimentação", "Restaurantes"; sem nenhuma, "Mercado").
4. PADRAO: a categoria escolhida na tela para as saídas ou para as entradas.

Tudo em funções puras: quem busca o histórico é o serviço.
"""

from collections import Counter, defaultdict
from collections.abc import Iterable
from dataclasses import dataclass

from app.financeiro.celulas import normalizar
from app.financeiro.modelos import Categoria, TipoCategoria

# De onde veio a categoria da linha (a tela mostra a pista).
# AJUSTE é a categoria que a pessoa escolheu na conferência.
ARQUIVO, HISTORICO, REGRA, PADRAO, AJUSTE = "ARQUIVO", "HISTORICO", "REGRA", "PADRAO", "AJUSTE"

# Palavras que não dizem quem foi o estabelecimento: tipo da operação,
# bandeira, preposição. Saem da chave do histórico.
PALAVRAS_DA_OPERACAO = frozenset(
    """
    compra compras pix enviado enviada recebido recebida transferencia transf ted doc tef pagamento pagto pag
    pgto debito deb credito cred cartao cart elo visa master mastercard maestro hiper amex mc ap aut autorizado
    autorizada no na de da do das dos em para via com ao a o e parcela parc qr code boleto conta
    """.split()
)
# Quantas palavras do estabelecimento formam a chave ("padaria doce pao").
PALAVRAS_NA_CHAVE = 3
# Parte mínima das vezes em que o estabelecimento foi para a mesma categoria.
MAIORIA = 0.6


@dataclass(frozen=True)
class Assunto:
    """Um assunto de gasto ou de receita: as palavras que o denunciam na
    descrição e os nomes de categoria que o recebem, em ordem de preferência
    (o último nome é o que as categorias iniciais do app têm)."""

    tipo: TipoCategoria
    palavras: tuple[str, ...]
    categorias: tuple[str, ...]


def _palavras(texto: str) -> tuple[str, ...]:
    return tuple(texto.split())


DESPESA, RECEITA = TipoCategoria.DESPESA, TipoCategoria.RECEITA

# Estabelecimentos e palavras comuns nos extratos brasileiros, já
# normalizados (sem acento, minúsculas). A primeira regra que casa vence;
# por isso as mais específicas (delivery) vêm antes das gerais (mercado).
ASSUNTOS: tuple[Assunto, ...] = (
    Assunto(
        DESPESA,
        _palavras(
            "ifood rappi aiqfome restaurante lanchonete lanches padaria panificadora pizzaria pizza hamburgueria "
            "burger mcdonalds mcdonald bk subway starbucks cafeteria cafe boteco churrascaria sushi temakeria "
            "outback habibs spoleto giraffas madero sorveteria doceria"
        )
        + ("ze delivery", "burger king", "coco bambu", "mc donalds", "99 food"),
        ("alimentacao", "restaurante", "restaurantes", "comida", "delivery", "refeicao", "refeicoes", "lanches", "mercado"),
    ),
    Assunto(
        DESPESA,
        _palavras(
            "supermercado supermercados mercado mercearia atacadao atacarejo assai carrefour hortifruti sacolao "
            "hipermercado walmart makro zaffari condor savegnago guanabara prezunic acougue emporio feira"
        )
        + ("pao de acucar", "sams club", "oba hortifruti", "st marche", "dia supermercado"),
        ("mercado", "supermercado", "alimentacao", "compras do mes", "feira"),
    ),
    Assunto(
        DESPESA,
        _palavras(
            "uber cabify taxi posto combustivel combustiveis gasolina etanol diesel shell ipiranga petrobras "
            "estacionamento estapar pedagio metro cptm onibus sptrans riocard localiza movida unidas oficina "
            "mecanica pneus detran ipva licenciamento conectcar veloe"
        )
        + ("99 app", "99app", "99 pop", "99 taxi", "99 tecnologia", "auto posto", "br mania", "sem parar", "zona azul", "bilhete unico"),
        ("transporte", "carro", "combustivel", "mobilidade", "veiculo", "veiculos"),
    ),
    Assunto(
        DESPESA,
        _palavras("aluguel condominio iptu imobiliaria quintoandar") + ("quinto andar", "financiamento imobiliario"),
        ("moradia", "aluguel", "casa", "habitacao"),
    ),
    Assunto(
        DESPESA,
        _palavras(
            "energia luz enel cemig copel light cpfl coelba celpe cosern equatorial energisa eletropaulo "
            "neoenergia sabesp copasa cedae sanepar embasa compesa casan corsan comgas naturgy ultragaz liquigas "
            "supergasbras internet vivo claro tim sky telefone telefonia celular"
        )
        + ("agua e esgoto", "oi fibra", "net servicos", "conta de luz", "conta de agua", "gas encanado"),
        ("contas da casa", "contas", "servicos", "utilidades", "casa", "moradia"),
    ),
    Assunto(
        DESPESA,
        _palavras(
            "farmacia farmacias drogaria drogarias drogasil raia panvel pacheco nissei ultrafarma hospital clinica "
            "laboratorio fleury dasa lavoisier delboni unimed amil sulamerica hapvida notredame odonto odontologia "
            "dentista medico consulta exame exames psicologo psicologa fisioterapia academia smartfit bluefit "
            "bodytech gympass wellhub totalpass"
        )
        + ("droga raia", "pague menos", "sao joao farmacias", "bradesco saude", "hermes pardini", "smart fit"),
        ("saude", "farmacia", "medico", "bem estar", "academia"),
    ),
    Assunto(
        DESPESA,
        _palavras(
            "escola colegio faculdade universidade mensalidade curso cursos udemy alura coursera rocketseat "
            "duolingo livraria saraiva papelaria kumon wizard ccaa fisk"
        ),
        ("educacao", "estudos", "cursos", "escola", "faculdade"),
    ),
    Assunto(
        DESPESA,
        _palavras(
            "netflix spotify disney hbo globoplay deezer youtube steam playstation psn xbox nintendo cinema "
            "cinemark kinoplex ingresso ingressos sympla eventim ticketmaster teatro show hotel pousada airbnb "
            "booking decolar latam smiles cvc viagem viagens"
        )
        + ("prime video", "amazon prime", "apple com bill", "gol linhas", "azul linhas", "123 milhas"),
        ("lazer", "diversao", "entretenimento", "assinaturas", "streaming", "viagem", "viagens"),
    ),
    Assunto(
        DESPESA,
        _palavras("petz cobasi petlove veterinario veterinaria agropet") + ("pet shop",),
        ("pets", "pet", "animais", "veterinario"),
    ),
    Assunto(
        DESPESA,
        _palavras(
            "amazon mercadolivre shopee aliexpress shein temu magalu americanas submarino renner riachuelo zara "
            "hering centauro netshoes kabum havan decathlon"
        )
        + ("mercado livre", "magazine luiza", "casas bahia", "ponto frio", "leroy merlin", "tok stok"),
        ("compras", "shopping", "vestuario", "roupas", "eletronicos"),
    ),
    Assunto(
        DESPESA,
        _palavras("tarifa tarifas anuidade iof juros multa encargos darf") + ("cesta de servicos", "pacote de servicos"),
        ("tarifas", "taxas", "tarifas bancarias", "impostos", "encargos"),
    ),
    # Carteiras e maquininhas: o nome delas não diz o que foi comprado. A
    # expressão longa segura a linha na categoria padrão ("Mercado Pago" não
    # é "Mercado").
    Assunto(DESPESA, ("mercado pago", "pagseguro", "pag seguro", "picpay", "sumup", "stone", "cielo"), ()),
    Assunto(RECEITA, ("mercado pago", "pagseguro", "pag seguro", "picpay"), ()),
    Assunto(
        RECEITA,
        _palavras("salario salarios folha proventos remuneracao ferias") + ("pro labore", "decimo terceiro", "13 salario"),
        ("salario", "renda", "trabalho", "proventos"),
    ),
    Assunto(
        RECEITA,
        _palavras("rendimento rendimentos dividendo dividendos jcp resgate cdb tesouro lci lca")
        + ("juros sobre capital", "rend pago"),
        ("rendimentos", "investimentos", "juros", "dividendos", "receita extra"),
    ),
    Assunto(
        RECEITA,
        _palavras("reembolso estorno cashback devolucao ressarcimento"),
        ("reembolsos", "reembolso", "estornos", "receita extra"),
    ),
    Assunto(
        RECEITA,
        _palavras("freela freelance venda vendas premio bonus comissao"),
        ("receita extra", "extra", "vendas", "freelance", "renda extra"),
    ),
)


def chave_do_estabelecimento(descricao: str) -> str:
    """As primeiras palavras do estabelecimento, sem número, data, parcela nem
    o tipo da operação: "COMPRA CARTAO DEB PADARIA DOCE PAO 12/09" e
    "Padaria Doce Pão" dão "padaria doce pao"."""
    palavras = [
        palavra
        for palavra in normalizar(descricao).split()
        if palavra not in PALAVRAS_DA_OPERACAO and not palavra.isdigit() and len(palavra) > 1
    ]
    return " ".join(palavras[:PALAVRAS_NA_CHAVE])


def assunto_da_descricao(descricao: str, tipo: TipoCategoria) -> Assunto | None:
    """O assunto do tipo com a expressão mais longa inteira na descrição:
    "mercado livre" vence "mercado", "pao de acucar" vence "pao". No empate,
    vale a ordem de ASSUNTOS."""
    texto = f" {normalizar(descricao)} "
    melhor, tamanho = None, 0
    for assunto in ASSUNTOS:
        if assunto.tipo != tipo:
            continue
        for palavra in assunto.palavras:
            if len(palavra) > tamanho and f" {palavra} " in texto:
                melhor, tamanho = assunto, len(palavra)
    return melhor


class Categorizador:
    """Categoria de cada linha de uma importação. Monta uma vez, com as
    categorias do espaço e o histórico de lançamentos (descrição, tipo e
    categoria), e responde linha a linha."""

    def __init__(self, categorias: list[Categoria], historico: Iterable[tuple[str, TipoCategoria, str | None]]):
        self._ativas = [categoria for categoria in categorias if categoria.ativa and categoria.id]
        self._por_id = {categoria.id: categoria for categoria in self._ativas}
        contagem: dict[tuple[str, TipoCategoria], Counter] = defaultdict(Counter)
        for descricao, tipo, categoria_id in historico:
            chave = chave_do_estabelecimento(descricao)
            if chave and categoria_id in self._por_id:
                contagem[(chave, tipo)][categoria_id] += 1
        self._historico = contagem

    def por_id(self, categoria_id: str) -> Categoria:
        """Categoria ativa pelo id (já conferida pelo serviço)."""
        return self._por_id[categoria_id]

    def pelo_nome(self, nome: str | None, tipo: TipoCategoria) -> Categoria | None:
        """Categoria ativa do tipo com o nome escrito na coluna de categoria do
        extrato, comparado sem acento, caixa nem pontuação."""
        if not nome:
            return None
        procurado = normalizar(nome)
        return next((c for c in self._ativas if c.tipo == tipo and normalizar(c.nome) == procurado), None)

    def pelo_historico(self, descricao: str, tipo: TipoCategoria, padrao: Categoria) -> Categoria | None:
        """A categoria em que o estabelecimento quase sempre foi lançado. A
        categoria padrão não conta como lição: ela é só onde a linha caiu por
        falta de pista, e deixaria a regra de fora."""
        contagem = self._historico.get((chave_do_estabelecimento(descricao), tipo))
        if not contagem:
            return None
        categoria_id, vezes = contagem.most_common(1)[0]
        if categoria_id == padrao.id or vezes / sum(contagem.values()) < MAIORIA:
            return None
        return self._por_id[categoria_id]

    def pela_regra(self, descricao: str, tipo: TipoCategoria) -> Categoria | None:
        assunto = assunto_da_descricao(descricao, tipo)
        if assunto is None:
            return None
        nomes = {normalizar(categoria.nome): categoria for categoria in self._ativas if categoria.tipo == tipo}
        return next((nomes[nome] for nome in assunto.categorias if nome in nomes), None)

    def categorizar(
        self, descricao: str, tipo: TipoCategoria, texto_da_coluna: str | None, padrao: Categoria
    ) -> tuple[Categoria, str]:
        """(categoria, origem) da linha, na ordem descrita no módulo."""
        if categoria := self.pelo_nome(texto_da_coluna, tipo):
            return categoria, ARQUIVO
        if categoria := self.pelo_historico(descricao, tipo, padrao):
            return categoria, HISTORICO
        if categoria := self.pela_regra(descricao, tipo):
            return categoria, REGRA
        return padrao, PADRAO
