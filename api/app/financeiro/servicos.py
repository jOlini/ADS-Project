"""Casos de uso do livro-caixa, sem nada de HTTP.

Quem pode entrar em cada espaço é decidido antes, em acesso.py. Aqui chegam
só o espaço já liberado e o uid de quem pede.
"""

from datetime import UTC, date, datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

from app.erros import ErroConflito, ErroNaoEncontrado, ErroValidacao
from app.financeiro import cartoes, importacao, regras
from app.financeiro.cartoes import PeriodoDaFatura, Referencia, ResumoDoCartao
from app.financeiro.modelos import (
    AtualizacaoCategoria,
    AtualizacaoConta,
    Categoria,
    Conta,
    Espaco,
    Lancamento,
    Membro,
    NovaCategoria,
    NovaCompra,
    NovaConta,
    NovaImportacao,
    NovoLancamento,
    NovoPagamento,
    Papel,
    Parte,
    PedidoDeEstrutura,
    ResultadoDaLinha,
    SituacaoDaFatura,
    SituacaoDaLinha,
    TipoCategoria,
    TipoEspaco,
    TipoLancamento,
)
from app.financeiro.repositorio import EspacoPessoalJaExiste, LancamentoJaImportado, RepositorioLivroCaixa

FUSO_PADRAO = "America/Sao_Paulo"
TAMANHO_MAXIMO_DA_DESCRICAO = 120
# Lançamentos de um cartão lidos de uma vez para o painel e a fatura. Um mês
# de fatura fica muito abaixo; o teto só protege a memória.
LIMITE_DO_CARTAO = 5000


def agora() -> datetime:
    """Instante atual em UTC, cortado em milissegundos: é a precisão das datas
    do MongoDB. Sem o corte, a resposta do POST mostraria um criado_em
    diferente do que o GET devolve depois."""
    instante = datetime.now(UTC)
    return instante.replace(microsecond=instante.microsecond // 1000 * 1000)


class ServicoLivroCaixa:
    def __init__(self, repositorio: RepositorioLivroCaixa):
        self.repositorio = repositorio

    # --- Espaços ---

    def espacos_do_cliente(self, uid: str) -> list[Espaco]:
        """Os espaços da pessoa. No primeiro acesso, cria o espaço pessoal com
        as categorias iniciais: ninguém precisa "abrir conta" para começar."""
        if self.repositorio.buscar_espaco_pessoal(uid) is None:
            self._criar_espaco_pessoal(uid)
        return self.repositorio.listar_espacos_do_membro(uid)

    def _criar_espaco_pessoal(self, uid: str) -> None:
        instante = agora()
        espaco = Espaco(
            tipo=TipoEspaco.PF,
            nome="Pessoal",
            moeda="BRL",
            fuso=FUSO_PADRAO,
            membros=[Membro(uid=uid, papel=Papel.DONO)],
            criado_em=instante,
            pessoal_de=uid,
        )
        try:
            espaco = self.repositorio.inserir_espaco(espaco)
        except EspacoPessoalJaExiste:
            # Outra requisição do mesmo primeiro acesso chegou antes e já criou
            # o espaço (e as categorias). Nada a fazer.
            return
        self.repositorio.inserir_categorias(
            [
                Categoria(espaco.id, nome, tipo, cor, ativa=True, criada_em=instante)
                for nome, tipo, cor in regras.CATEGORIAS_INICIAIS
            ]
        )

    # --- Contas ---

    def contas_com_saldo(self, espaco: Espaco) -> list[tuple[Conta, int]]:
        somas = self.repositorio.somar_partidas_por_conta(espaco.id)
        return [(conta, regras.saldo_da_conta(conta, somas)) for conta in self.repositorio.listar_contas(espaco.id)]

    def conta_com_saldo(self, espaco: Espaco, id: str) -> tuple[Conta, int]:
        conta = self._conta(espaco, id)
        return conta, regras.saldo_da_conta(conta, self.repositorio.somar_partidas_por_conta(espaco.id))

    def criar_conta(self, espaco: Espaco, dados: NovaConta) -> Conta:
        if erros := regras.conferir_conta(dados):
            raise ErroValidacao(erros)
        conta = Conta(
            espaco_id=espaco.id,
            nome=dados.nome,
            tipo=dados.tipo,
            saldo_inicial_centavos=dados.saldo_inicial_centavos,
            ativa=True,
            criada_em=agora(),
            limite_centavos=dados.limite_centavos,
            dia_fechamento=dados.dia_fechamento,
            dia_vencimento=dados.dia_vencimento,
        )
        return self.repositorio.inserir_conta(conta)

    def atualizar_conta(self, espaco: Espaco, id: str, dados: AtualizacaoConta) -> Conta:
        conta = self._conta(espaco, id)
        if erros := regras.conferir_conta(dados, conta):
            raise ErroValidacao(erros)
        conta.nome = dados.nome
        conta.tipo = dados.tipo
        conta.ativa = dados.ativa
        conta.limite_centavos = dados.limite_centavos
        conta.dia_fechamento = dados.dia_fechamento
        conta.dia_vencimento = dados.dia_vencimento
        return self.repositorio.atualizar_conta(conta)

    def _conta(self, espaco: Espaco, id: str) -> Conta:
        conta = self.repositorio.buscar_conta(espaco.id, id)
        if conta is None:
            raise ErroNaoEncontrado("Conta não encontrada.")
        return conta

    # --- Cartões de crédito ---

    def cartoes(self, espaco: Espaco) -> list[tuple[Conta, int, ResumoDoCartao]]:
        """Os cartões do espaço com o painel de cada um."""
        somas = self.repositorio.somar_partidas_por_conta(espaco.id)
        return [
            self._com_resumo(espaco, cartao, regras.saldo_da_conta(cartao, somas))
            for cartao in self.repositorio.listar_contas(espaco.id)
            if cartao.cartao
        ]

    def cartao(self, espaco: Espaco, id: str) -> tuple[Conta, int, ResumoDoCartao]:
        cartao = self._cartao(espaco, id)
        saldo = regras.saldo_da_conta(cartao, self.repositorio.somar_partidas_por_conta(espaco.id))
        return self._com_resumo(espaco, cartao, saldo)

    def _com_resumo(self, espaco: Espaco, cartao: Conta, saldo: int) -> tuple[Conta, int, ResumoDoCartao]:
        hoje = self.hoje(espaco)
        aberta = cartoes.periodo_da_fatura(cartao, cartoes.referencia_da_data(cartao, hoje))
        # Da fatura atual em diante: o que veio antes já está no saldo.
        lancamentos = self.repositorio.listar_lancamentos(espaco.id, aberta.inicio, None, LIMITE_DO_CARTAO, cartao.id)
        return cartao, saldo, cartoes.resumir(cartao, saldo, lancamentos, hoje)

    def fatura(
        self, espaco: Espaco, id: str, referencia: Referencia
    ) -> tuple[Conta, PeriodoDaFatura, SituacaoDaFatura, list[Lancamento]]:
        """Uma fatura do cartão (referência = ano e mês do vencimento) com as
        compras, os créditos e os pagamentos do período dela."""
        cartao = self._cartao(espaco, id)
        periodo = cartoes.periodo_da_fatura(cartao, referencia)
        atual = cartoes.referencia_da_data(cartao, self.hoje(espaco))
        lancamentos = self.repositorio.listar_lancamentos(
            espaco.id, periodo.inicio, periodo.ultimo_dia, LIMITE_DO_CARTAO, cartao.id
        )
        situacao = cartoes.situacao_da_fatura(referencia, atual)
        return cartao, periodo, situacao, self._marcar_estornados(espaco, lancamentos)

    def comprar(self, espaco: Espaco, cartao_id: str, dados: NovaCompra, uid: str) -> list[Lancamento]:
        """Compra no cartão: uma despesa por parcela, cada uma na fatura
        seguinte à da anterior. Todas ocupam o limite desde já.

        As parcelas são gravadas uma a uma. Se a gravação parar no meio,
        excluir qualquer parcela leva as que entraram (mesmo compra_id)."""
        cartao = self._cartao(espaco, cartao_id)
        categoria = self.repositorio.buscar_categoria(espaco.id, dados.categoria_id)
        if erros := regras.conferir_compra(dados, cartao, categoria):
            raise ErroValidacao(erros)

        parcelada = dados.parcelas > 1
        compra_id = uuid4().hex if parcelada else None
        valores = cartoes.valores_das_parcelas(dados.valor_centavos, dados.parcelas)
        datas = cartoes.datas_das_parcelas(cartao, dados.data, dados.parcelas)
        instante = agora()
        gravados = []
        for numero, (valor, data) in enumerate(zip(valores, datas, strict=True), start=1):
            despesa = NovoLancamento(
                tipo=TipoLancamento.DESPESA,
                descricao=dados.descricao,
                data=data,
                valor_centavos=valor,
                conta_id=cartao.id,
                categoria_id=categoria.id,
            )
            lancamento = Lancamento(
                espaco_id=espaco.id,
                tipo=despesa.tipo,
                descricao=despesa.descricao,
                data=despesa.data,
                valor_centavos=despesa.valor_centavos,
                conta_id=despesa.conta_id,
                categoria_id=despesa.categoria_id,
                partidas=regras.montar_partidas(despesa),
                criado_em=instante,
                criado_por=uid,
                divisao=[Parte(parte.pessoa, parte.valor_centavos) for parte in dados.divisao],
                compra_id=compra_id,
                parcela=numero if parcelada else None,
                parcelas=dados.parcelas if parcelada else None,
            )
            gravados.append(self._gravar(lancamento))
        return gravados

    def pagar_fatura(self, espaco: Espaco, cartao_id: str, dados: NovoPagamento, uid: str) -> Lancamento:
        """Transferência da conta para o cartão: sai da conta (débito) e
        libera o limite do cartão no mesmo valor."""
        cartao = self._cartao(espaco, cartao_id)
        conta = self.repositorio.buscar_conta(espaco.id, dados.conta_id)
        if erros := regras.conferir_pagamento(conta):
            raise ErroValidacao(erros)
        transferencia = NovoLancamento(
            tipo=TipoLancamento.TRANSFERENCIA,
            descricao=dados.descricao or f"Pagamento da fatura · {cartao.nome}"[:TAMANHO_MAXIMO_DA_DESCRICAO],
            data=dados.data,
            valor_centavos=dados.valor_centavos,
            conta_id=conta.id,
            conta_destino_id=cartao.id,
        )
        return self._gravar(
            Lancamento(
                espaco_id=espaco.id,
                tipo=transferencia.tipo,
                descricao=transferencia.descricao,
                data=transferencia.data,
                valor_centavos=transferencia.valor_centavos,
                conta_id=transferencia.conta_id,
                conta_destino_id=transferencia.conta_destino_id,
                partidas=regras.montar_partidas(transferencia),
                criado_em=agora(),
                criado_por=uid,
            )
        )

    def _cartao(self, espaco: Espaco, id: str) -> Conta:
        cartao = self.repositorio.buscar_conta(espaco.id, id)
        if cartao is None or not cartao.cartao:
            raise ErroNaoEncontrado("Cartão não encontrado.")
        return cartao

    @staticmethod
    def hoje(espaco: Espaco) -> date:
        return datetime.now(ZoneInfo(espaco.fuso)).date()

    # --- Categorias ---

    def categorias(self, espaco: Espaco) -> list[Categoria]:
        return self.repositorio.listar_categorias(espaco.id)

    def categoria(self, espaco: Espaco, id: str) -> Categoria:
        categoria = self.repositorio.buscar_categoria(espaco.id, id)
        if categoria is None:
            raise ErroNaoEncontrado("Categoria não encontrada.")
        return categoria

    def criar_categoria(self, espaco: Espaco, dados: NovaCategoria) -> Categoria:
        categoria = Categoria(
            espaco_id=espaco.id,
            nome=dados.nome,
            tipo=dados.tipo,
            cor=dados.cor,
            ativa=True,
            criada_em=agora(),
        )
        return self.repositorio.inserir_categorias([categoria])[0]

    def atualizar_categoria(self, espaco: Espaco, id: str, dados: AtualizacaoCategoria) -> Categoria:
        categoria = self.categoria(espaco, id)
        categoria.nome = dados.nome
        categoria.cor = dados.cor
        categoria.ativa = dados.ativa
        return self.repositorio.atualizar_categoria(categoria)

    # --- Lançamentos ---

    def lancamentos(
        self, espaco: Espaco, de: date | None, ate: date | None, limite: int, conta_id: str | None = None
    ) -> list[Lancamento]:
        if de and ate and de > ate:
            raise ErroValidacao({"ate": "A data final vem antes da inicial."})
        if conta_id:
            self._conta(espaco, conta_id)
        lancamentos = self.repositorio.listar_lancamentos(espaco.id, de, ate, limite, conta_id)
        return self._marcar_estornados(espaco, lancamentos)

    def lancamento(self, espaco: Espaco, id: str) -> Lancamento:
        lancamento = self.repositorio.buscar_lancamento(espaco.id, id)
        if lancamento is None:
            raise ErroNaoEncontrado("Lançamento não encontrado.")
        return self._marcar_estornados(espaco, [lancamento])[0]

    def lancar(self, espaco: Espaco, dados: NovoLancamento, uid: str) -> Lancamento:
        conta = self.repositorio.buscar_conta(espaco.id, dados.conta_id)
        categoria = self.repositorio.buscar_categoria(espaco.id, dados.categoria_id) if dados.categoria_id else None
        destino = self.repositorio.buscar_conta(espaco.id, dados.conta_destino_id) if dados.conta_destino_id else None

        erros = regras.conferir_lancamento(dados, conta, categoria, destino)
        if erros:
            raise ErroValidacao(erros)

        lancamento = Lancamento(
            espaco_id=espaco.id,
            tipo=dados.tipo,
            descricao=dados.descricao,
            data=dados.data,
            valor_centavos=dados.valor_centavos,
            conta_id=dados.conta_id,
            categoria_id=dados.categoria_id,
            conta_destino_id=dados.conta_destino_id,
            partidas=regras.montar_partidas(dados),
            criado_em=agora(),
            criado_por=uid,
            divisao=[Parte(parte.pessoa, parte.valor_centavos) for parte in dados.divisao],
        )
        return self._gravar(lancamento)

    def excluir(self, espaco: Espaco, id: str) -> None:
        """Apaga o lançamento de vez (erro de digitação, lançamento duplicado).
        O estorno dele, se houver, sai junto: sozinho, ele mudaria o saldo sem
        nada para anular. Excluir um estorno devolve o original ao normal.

        O estorno sai antes do original: se a operação parar no meio, sobra o
        original sem estorno, que é um estado válido. A segunda passada pega
        um estorno gravado entre a leitura e a exclusão.

        Parcela de compra no cartão leva a compra inteira: uma parcela sozinha
        não existe, porque o limite foi ocupado pelo total."""
        lancamento = self.lancamento(espaco, id)
        if lancamento.compra_id:
            self.repositorio.excluir_compra(espaco.id, lancamento.compra_id)
            return
        self.repositorio.excluir_estornos_de(espaco.id, lancamento.id)
        self.repositorio.excluir_lancamento(espaco.id, lancamento.id)
        self.repositorio.excluir_estornos_de(espaco.id, lancamento.id)

    def pessoas(self, espaco: Espaco) -> list[str]:
        """Nomes já usados em divisões, para a tela sugerir. Nomes que só
        mudam na caixa ou nos espaços aparecem uma vez."""
        unicos: dict[str, str] = {}
        for nome in self.repositorio.listar_pessoas(espaco.id):
            unicos.setdefault(" ".join(nome.split()).casefold(), nome)
        return sorted(unicos.values(), key=str.casefold)

    def estornar(self, espaco: Espaco, id: str, uid: str) -> Lancamento:
        """Anula um lançamento com outro de sinal trocado, na data de hoje. O
        original continua no histórico, e a divisão entre pessoas vem junto
        (o racha também é desfeito)."""
        original = self.lancamento(espaco, id)
        if original.compra_id:
            raise ErroConflito("Compra parcelada não se estorna parcela por parcela. Para desfazer, exclua a compra.")
        if original.estorno_de:
            raise ErroConflito("Um estorno não pode ser estornado.")
        if original.estornado_por:
            raise ErroConflito("Este lançamento já foi estornado.")

        estorno = Lancamento(
            espaco_id=espaco.id,
            tipo=original.tipo,
            descricao=f"Estorno: {original.descricao}"[:TAMANHO_MAXIMO_DA_DESCRICAO],
            data=datetime.now(ZoneInfo(espaco.fuso)).date(),
            valor_centavos=original.valor_centavos,
            conta_id=original.conta_id,
            categoria_id=original.categoria_id,
            conta_destino_id=original.conta_destino_id,
            partidas=regras.inverter(original.partidas),
            criado_em=agora(),
            criado_por=uid,
            estorno_de=original.id,
            divisao=list(original.divisao),
        )
        return self._gravar(estorno)

    # --- Importação de extrato ---

    def estrutura(self, dados: PedidoDeEstrutura) -> importacao.Estrutura:
        """Começo do arquivo em células e as colunas reconhecidas pelo nome,
        para a tela confirmar ou pedir que a pessoa indique cada uma."""
        try:
            return importacao.estrutura(dados.csv, dados.delimitador)
        except importacao.ExtratoIlegivel as erro:
            raise ErroValidacao({"csv": str(erro)}) from erro

    def importar(self, espaco: Espaco, dados: NovaImportacao, uid: str) -> list[ResultadoDaLinha]:
        """Lança cada linha do extrato na conta escolhida: valor negativo vira
        despesa, positivo vira receita. Linha já importada antes (mesma chave)
        é pulada, e linha ilegível volta com o motivo; as outras entram mesmo
        assim. Com dados.simular, nada é gravado.

        Sem dados.mapeamento, as colunas são reconhecidas pelo nome. Com a
        coluna de categoria, a linha vai para a categoria ativa de mesmo nome;
        sem nome conhecido, para a categoria padrão do tipo.

        Cada lançamento é gravado sozinho (atômico). Se a importação parar no
        meio, rodar de novo termina o que faltou, sem duplicar o que entrou.
        """
        conta = self.repositorio.buscar_conta(espaco.id, dados.conta_id)
        despesa = self.repositorio.buscar_categoria(espaco.id, dados.categoria_despesa_id)
        receita = self.repositorio.buscar_categoria(espaco.id, dados.categoria_receita_id)
        erros = regras.conferir_importacao(conta, despesa, receita)

        mapeamento = importacao.Mapeamento(**dados.mapeamento.model_dump()) if dados.mapeamento else None
        erros_do_mapeamento = importacao.conferir_mapeamento(mapeamento) if mapeamento else {}
        erros.update({f"mapeamento.{papel}": mensagem for papel, mensagem in erros_do_mapeamento.items()})
        if not erros_do_mapeamento:
            try:
                lidas, recusadas = importacao.ler_extrato(dados.csv, mapeamento)
            except importacao.ExtratoIlegivel as erro:
                erros["csv"] = str(erro)
        if erros:
            raise ErroValidacao(erros)

        categorias = self.repositorio.listar_categorias(espaco.id)
        chaves = importacao.chaves_de_importacao(conta.id, lidas)
        ja_importadas = self.repositorio.chaves_importadas(espaco.id, chaves)
        resultados = [ResultadoDaLinha(r.linha, SituacaoDaLinha.INVALIDA, erro=r.erro) for r in recusadas]
        for linha, chave in zip(lidas, chaves, strict=True):
            tipo = TipoCategoria.RECEITA if linha.valor_centavos > 0 else TipoCategoria.DESPESA
            padrao = receita if tipo == TipoCategoria.RECEITA else despesa
            categoria = regras.categoria_pelo_nome(categorias, linha.categoria, tipo) or padrao
            situacao, lancamento_id = self._importar_linha(
                espaco, linha, chave, chave in ja_importadas, categoria.id, dados, uid
            )
            resultados.append(
                ResultadoDaLinha(
                    linha.linha,
                    situacao,
                    data=linha.data,
                    descricao=linha.descricao,
                    valor_centavos=linha.valor_centavos,
                    categoria_id=categoria.id,
                    lancamento_id=lancamento_id,
                )
            )
        return sorted(resultados, key=lambda resultado: resultado.linha)

    def _importar_linha(
        self,
        espaco: Espaco,
        linha: importacao.LinhaDoExtrato,
        chave: str,
        ja_importada: bool,
        categoria_id: str,
        dados: NovaImportacao,
        uid: str,
    ) -> tuple[SituacaoDaLinha, str | None]:
        if ja_importada:
            return SituacaoDaLinha.JA_IMPORTADA, None
        if dados.simular:
            return SituacaoDaLinha.NOVA, None

        receita = linha.valor_centavos > 0
        # Validado como um lançamento digitado: o que vem do arquivo passa
        # pelos mesmos limites de descrição, data e valor.
        novo = NovoLancamento(
            tipo=TipoLancamento.RECEITA if receita else TipoLancamento.DESPESA,
            descricao=linha.descricao,
            data=linha.data,
            valor_centavos=abs(linha.valor_centavos),
            conta_id=dados.conta_id,
            categoria_id=categoria_id,
        )
        lancamento = Lancamento(
            espaco_id=espaco.id,
            tipo=novo.tipo,
            descricao=novo.descricao,
            data=novo.data,
            valor_centavos=novo.valor_centavos,
            conta_id=novo.conta_id,
            categoria_id=novo.categoria_id,
            partidas=regras.montar_partidas(novo),
            criado_em=agora(),
            criado_por=uid,
            chave_importacao=chave,
        )
        try:
            return SituacaoDaLinha.IMPORTADA, self._gravar(lancamento).id
        except LancamentoJaImportado:
            # Outra importação do mesmo arquivo gravou esta linha agora há pouco.
            return SituacaoDaLinha.JA_IMPORTADA, None

    def _gravar(self, lancamento: Lancamento) -> Lancamento:
        # Última barreira antes do banco: nenhum caminho grava lançamento
        # desbalanceado, mesmo que uma regra acima mude no futuro.
        if not regras.soma_zero(lancamento.partidas):
            raise AssertionError("Partidas do lançamento não somam zero.")
        return self.repositorio.inserir_lancamento(lancamento)

    def _marcar_estornados(self, espaco: Espaco, lancamentos: list[Lancamento]) -> list[Lancamento]:
        estornos = self.repositorio.buscar_estornos(espaco.id, [lancamento.id for lancamento in lancamentos])
        for lancamento in lancamentos:
            lancamento.estornado_por = estornos.get(lancamento.id)
        return lancamentos
