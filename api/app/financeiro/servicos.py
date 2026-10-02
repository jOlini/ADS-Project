"""Casos de uso do livro-caixa, sem nada de HTTP.

Quem pode entrar em cada espaço é decidido antes, em acesso.py. Aqui chegam
só o espaço já liberado e o uid de quem pede.
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

from app.erros import ErroConflito, ErroNaoEncontrado, ErroPermissao, ErroValidacao
from app.financeiro import cartoes, importacao, parcelamento, regras, relatorios
from app.financeiro.categorizacao import AJUSTE, Categorizador
from app.financeiro.cartoes import PeriodoDaFatura, Referencia, ResumoDaFatura, ResumoDoCartao
from app.financeiro.modelos import (
    MAXIMO_DE_EMPRESAS,
    AtualizacaoCategoria,
    AtualizacaoConta,
    AtualizacaoEspaco,
    AtualizacaoLancamento,
    Categoria,
    Conta,
    CorDoCartao,
    Espaco,
    FiltroDePessoa,
    Lancamento,
    Membro,
    NovaCategoria,
    NovaCompra,
    NovaConta,
    NovaImportacao,
    NovoEspaco,
    NovoLancamento,
    NovoPagamento,
    Papel,
    Parte,
    PedidoDeEstrutura,
    Plano,
    ResultadoDaLinha,
    SituacaoDaFatura,
    SituacaoDaLinha,
    TipoCategoria,
    TipoConta,
    TipoEspaco,
    TipoLancamento,
    libera_familia,
)
from app.financeiro.repositorio import EspacoPessoalJaExiste, LancamentoJaImportado, RepositorioLivroCaixa

FUSO_PADRAO = "America/Sao_Paulo"
TAMANHO_MAXIMO_DA_DESCRICAO = 120
# Lançamentos de um cartão lidos de uma vez para o painel e a fatura. Um mês
# de fatura fica muito abaixo; o teto só protege a memória.
LIMITE_DO_CARTAO = 5000
# Lançamentos mais recentes que ensinam a categoria de cada estabelecimento
# na importação (categorizacao.py).
LIMITE_DO_HISTORICO = 2000

PESSOAL_JA_EXISTE = (
    "O espaço pessoal já existe: ele é criado no primeiro acesso. Aqui entram as empresas do espaço empresarial."
)
PESSOAL_FIXO = "O espaço pessoal não muda de nome nem pode ser excluído."
SO_O_DONO = "Só quem cadastrou a empresa pode editá-la ou excluí-la."
ESPACO_COM_DADOS = "Só dá para excluir uma empresa sem movimento. Exclua antes as contas e os lançamentos dela."
DIVISAO_SO_NO_FAMILIA = (
    "Dividir o gasto com o nome e a parte de cada pessoa faz parte do Plano Família. "
    "No Free, anote só em quantas pessoas o gasto foi dividido."
)
CLIENTE_SEM_ESPACO = "Cliente sem espaço pessoal: ele precisa entrar no app uma vez antes de mudar de plano."
LIMITE_DE_EMPRESAS = (
    f"Você já cadastrou {MAXIMO_DE_EMPRESAS} empresas. Exclua uma empresa sem movimento para cadastrar outra."
)


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

    def plano_do_cliente(self, espaco: Espaco, uid: str) -> Plano:
        """O plano de quem pede, guardado no espaço pessoal dela. Numa empresa,
        vale o plano do pessoal de quem está lançando. O plano simulado por um
        super admin (simulacao.py) vale nos dois casos."""
        if espaco.tipo == TipoEspaco.PF or espaco.plano_simulado:
            return espaco.plano_em_vigor
        pessoal = self.repositorio.buscar_espaco_pessoal(uid)
        return pessoal.plano if pessoal else Plano.FREE

    def mudar_plano(self, uid: str, plano: Plano) -> Espaco:
        """Back-office: troca o plano de um cliente (no espaço pessoal dele).
        O cliente que nunca entrou no app não tem espaço: 404, sem criar um
        espaço para um uid qualquer."""
        pessoal = self.repositorio.buscar_espaco_pessoal(uid)
        if pessoal is None:
            raise ErroNaoEncontrado(CLIENTE_SEM_ESPACO)
        pessoal.plano = plano
        return self.repositorio.atualizar_plano(pessoal)

    def _conferir_divisao_do_plano(self, espaco: Espaco, uid: str, divisao: list) -> None:
        # A divisão com nome e valor separa o gasto de cada pessoa, que é o
        # Modo Família por outro caminho: no Free, 403 antes de qualquer
        # outra conferência, mesmo que a tela seja burlada.
        if divisao and not libera_familia(self.plano_do_cliente(espaco, uid)):
            raise ErroPermissao(DIVISAO_SO_NO_FAMILIA)

    def criar_espaco(self, uid: str, dados: NovoEspaco) -> Espaco:
        """Empresa do espaço empresarial, com quem cadastrou como dono e as
        categorias de empresa. Cada empresa é um livro-caixa separado do
        pessoal e das outras empresas."""
        if dados.tipo == TipoEspaco.PF:
            raise ErroValidacao({"tipo": PESSOAL_JA_EXISTE})
        # Garante o pessoal antes (e primeiro na lista, que sai por data).
        empresas = [
            espaco
            for espaco in self.espacos_do_cliente(uid)
            if espaco.tipo == TipoEspaco.PJ and espaco.papel_de(uid) == Papel.DONO
        ]
        if len(empresas) >= MAXIMO_DE_EMPRESAS:
            raise ErroConflito(LIMITE_DE_EMPRESAS)
        instante = agora()
        espaco = self.repositorio.inserir_espaco(
            Espaco(
                tipo=dados.tipo,
                nome=dados.nome,
                moeda="BRL",
                fuso=FUSO_PADRAO,
                membros=[Membro(uid=uid, papel=Papel.DONO)],
                criado_em=instante,
                cnpj=dados.cnpj,
                regime=dados.regime,
            )
        )
        self._criar_categorias_iniciais(espaco, instante)
        return espaco

    def atualizar_espaco(self, espaco: Espaco, uid: str, dados: AtualizacaoEspaco) -> Espaco:
        """Nome, CNPJ e regime da empresa: só os campos enviados mudam."""
        self._conferir_dono(espaco, uid)
        enviados = dados.model_fields_set
        if "nome" in enviados:
            if dados.nome is None:
                raise ErroValidacao({"nome": regras.OBRIGATORIO})
            espaco.nome = dados.nome
        if "cnpj" in enviados:
            espaco.cnpj = dados.cnpj
        if "regime" in enviados:
            espaco.regime = dados.regime
        return self.repositorio.atualizar_espaco(espaco)

    def excluir_espaco(self, espaco: Espaco, uid: str) -> None:
        """Só a empresa sem movimento sai (sem contas e sem lançamentos): um
        clique errado não apaga o histórico de uma empresa."""
        self._conferir_dono(espaco, uid)
        if self.repositorio.listar_contas(espaco.id) or self.repositorio.listar_lancamentos(espaco.id, None, None, 1):
            raise ErroConflito(ESPACO_COM_DADOS)
        self.repositorio.excluir_espaco(espaco.id)

    @staticmethod
    def _conferir_dono(espaco: Espaco, uid: str) -> None:
        if espaco.tipo == TipoEspaco.PF:
            raise ErroConflito(PESSOAL_FIXO)
        if espaco.papel_de(uid) != Papel.DONO:
            raise ErroPermissao(SO_O_DONO)

    def _criar_categorias_iniciais(self, espaco: Espaco, instante: datetime) -> None:
        categorias = []
        for nome, tipo, cor in regras.categorias_iniciais(espaco.tipo):
            # Na empresa, as iniciais já nascem com a classe de custo e a
            # função na gestão (aporte, folha, tributo).
            classe, funcao = regras.gestao_da_categoria(espaco.tipo, nome)
            categorias.append(
                Categoria(espaco.id, nome, tipo, cor, True, instante, classe_de_custo=classe, funcao=funcao)
            )
        self.repositorio.inserir_categorias(categorias)

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
        self._criar_categorias_iniciais(espaco, instante)

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
            cor=dados.cor or (CorDoCartao.GRAFITE if dados.tipo == TipoConta.CARTAO_CREDITO else None),
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
        # Sem cor no corpo, a conta (ou o cartão) fica com a que tinha.
        conta.cor = dados.cor or conta.cor
        return self.repositorio.atualizar_conta(conta)

    def excluir_conta(self, espaco: Espaco, id: str) -> int:
        """Apaga a conta (ou o cartão) e todos os lançamentos que mexem nela,
        inclusive as transferências e os pagamentos de fatura com outras
        contas (o saldo delas muda junto). Para guardar o histórico, o caminho
        é desativar. Os lançamentos saem antes da conta: se a operação parar
        no meio, a conta continua lá e excluir de novo termina. Devolve quantos
        lançamentos saíram."""
        conta = self._conta(espaco, id)
        excluidos = self.repositorio.excluir_lancamentos_da_conta(espaco.id, conta.id)
        self.repositorio.excluir_conta(espaco.id, conta.id)
        return excluidos

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

    def faturas(self, espaco: Espaco, id: str) -> list[ResumoDaFatura]:
        """As faturas do cartão que têm lançamentos (e a atual), da mais nova
        para a mais antiga."""
        cartao = self._cartao(espaco, id)
        lancamentos = self.repositorio.listar_lancamentos(espaco.id, None, None, LIMITE_DO_CARTAO, cartao.id)
        return cartoes.resumir_faturas(cartao, lancamentos, self.hoje(espaco))

    def excluir_fatura(self, espaco: Espaco, id: str, referencia: Referencia) -> int:
        """Apaga as compras e os créditos de uma fatura. Compra parcelada sai
        inteira, com as parcelas das outras faturas, como na exclusão de uma
        parcela. O pagamento fica: ele saiu de uma conta e aparece no extrato
        dela (sai pela seleção na fatura ou no extrato)."""
        cartao = self._cartao(espaco, id)
        periodo = cartoes.periodo_da_fatura(cartao, referencia)
        lancamentos = self.repositorio.listar_lancamentos(
            espaco.id, periodo.inicio, periodo.ultimo_dia, LIMITE_DO_CARTAO, cartao.id
        )
        return self.excluir_varios(espaco, [l.id for l in lancamentos if not cartoes.eh_pagamento(l, cartao.id)])

    def comprar(self, espaco: Espaco, cartao_id: str, dados: NovaCompra, uid: str) -> list[Lancamento]:
        """Compra no cartão: uma despesa por parcela, cada uma na fatura
        seguinte à da anterior. Todas ocupam o limite desde já.

        As parcelas são gravadas uma a uma. Se a gravação parar no meio,
        excluir qualquer parcela leva as que entraram (mesmo compra_id)."""
        cartao = self._cartao(espaco, cartao_id)
        self._conferir_divisao_do_plano(espaco, uid, dados.divisao)
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
                dividido_entre=dados.dividido_entre,
                responsavel=dados.responsavel,
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

    def excluir_categoria(self, espaco: Espaco, id: str, mover_para: str | None = None) -> int:
        """Exclui a categoria. Com lançamentos e sem destino, 409: apagá-la
        deixaria o extrato sem o "para onde foi" deles. Com mover_para (outra
        categoria do mesmo tipo, ativa), os lançamentos passam para ela antes
        da exclusão, e o relatório por categoria continua somando certo.
        Desativar segue como a saída que mantém tudo como está.

        Ordem segura sem transação: primeiro os lançamentos mudam de
        categoria, depois a categoria sai. Se a operação parar no meio, os
        lançamentos já estão no destino e excluir de novo termina. Devolve
        quantos lançamentos mudaram."""
        categoria = self.categoria(espaco, id)
        usados = self.repositorio.contar_lancamentos_da_categoria(espaco.id, categoria.id)
        if mover_para is None:
            if usados:
                quantos = "1 lançamento" if usados == 1 else f"{usados} lançamentos"
                raise ErroConflito(
                    f'"{categoria.nome}" está em {quantos}. Escolha para qual categoria eles vão, '
                    "ou desative a categoria para tirá-la das opções sem mexer no histórico.",
                    lancamentos=usados,
                )
            self.repositorio.excluir_categoria(espaco.id, categoria.id)
            return 0

        destino = self.repositorio.buscar_categoria(espaco.id, mover_para)
        if erros := regras.conferir_destino_da_categoria(categoria, destino):
            raise ErroValidacao(erros)
        # A gestão da empresa acha a categoria pela função (aporte, folha,
        # tributo): mover os lançamentos para uma categoria sem a função os
        # tiraria das telas de Sociedade, Pessoal e Impostos.
        if usados and categoria.funcao is not None:
            raise ErroConflito(
                f'"{categoria.nome}" é usada pela gestão da empresa. Desative-a em vez de excluir, para não perder o histórico.'
            )
        movidos = self.repositorio.mover_lancamentos_de_categoria(espaco.id, categoria.id, destino.id) if usados else 0
        self.repositorio.excluir_categoria(espaco.id, categoria.id)
        return movidos

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
        self._conferir_divisao_do_plano(espaco, uid, dados.divisao)
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
            dividido_entre=dados.dividido_entre,
            responsavel=dados.responsavel,
            meio=dados.meio,
        )
        return self._gravar(lancamento)

    def editar(self, espaco: Espaco, id: str, dados: AtualizacaoLancamento) -> Lancamento:
        """Muda descrição, data, valor, categoria, meio ou responsável, com as
        restrições de regras.conferir_edicao. Na parcela de uma compra no
        cartão, a descrição, a categoria e o responsável mudam na compra
        inteira: as parcelas são uma compra só."""
        lancamento = self.lancamento(espaco, id)
        conta = self.repositorio.buscar_conta(espaco.id, lancamento.conta_id)
        categoria = self.repositorio.buscar_categoria(espaco.id, dados.categoria_id) if dados.categoria_id else None
        if erros := regras.conferir_edicao(lancamento, dados, conta, categoria):
            raise ErroValidacao(erros)
        alvos = self.repositorio.listar_compra(espaco.id, lancamento.compra_id) if lancamento.compra_id else [lancamento]
        for alvo in alvos:
            editado = regras.aplicar_edicao(alvo, dados)
            if not regras.soma_zero(editado.partidas):
                raise AssertionError("Partidas do lançamento não somam zero.")
            self.repositorio.atualizar_lancamento(editado)
        return self.lancamento(espaco, id)

    def excluir(self, espaco: Espaco, id: str) -> None:
        """Apaga o lançamento de vez (erro de digitação, lançamento duplicado).
        O estorno dele, se houver, sai junto: sozinho, ele mudaria o saldo sem
        nada para anular. Excluir um estorno devolve o original ao normal.

        O estorno sai antes do original: se a operação parar no meio, sobra o
        original sem estorno, que é um estado válido. A segunda passada pega
        um estorno gravado entre a leitura e a exclusão.

        Parcela de compra no cartão leva a compra inteira: uma parcela sozinha
        não existe, porque o limite foi ocupado pelo total."""
        self._excluir(espaco, self.lancamento(espaco, id))

    def excluir_varios(self, espaco: Espaco, ids: list[str]) -> int:
        """Exclusão em lote (seleção do extrato ou da fatura), com as mesmas
        regras da exclusão de um. Id que já saiu (outra parcela da mesma
        compra, estorno de outro da lista) ou que não é do espaço é pulado.
        Devolve quantos lançamentos saíram do banco."""
        excluidos = 0
        for id in dict.fromkeys(ids):
            lancamento = self.repositorio.buscar_lancamento(espaco.id, id)
            if lancamento is not None:
                excluidos += self._excluir(espaco, lancamento)
        return excluidos

    def _excluir(self, espaco: Espaco, lancamento: Lancamento) -> int:
        if lancamento.compra_id:
            return self.repositorio.excluir_compra(espaco.id, lancamento.compra_id)
        excluidos = self.repositorio.excluir_estornos_de(espaco.id, lancamento.id)
        excluidos += int(self.repositorio.excluir_lancamento(espaco.id, lancamento.id))
        return excluidos + self.repositorio.excluir_estornos_de(espaco.id, lancamento.id)

    def pessoas(self, espaco: Espaco) -> list[str]:
        """Nomes já usados em divisões e como responsável, para a tela
        sugerir. Nomes que só mudam na caixa ou nos espaços aparecem uma vez."""
        unicos: dict[str, str] = {}
        for nome in self.repositorio.listar_pessoas(espaco.id):
            unicos.setdefault(" ".join(nome.split()).casefold(), nome)
        return sorted(unicos.values(), key=str.casefold)

    def estornar(self, espaco: Espaco, id: str, uid: str) -> Lancamento:
        """Anula um lançamento com outro de sinal trocado, na data de hoje. O
        original continua no histórico, e a divisão entre pessoas e o
        responsável vêm junto (o racha também é desfeito)."""
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
            dividido_entre=original.dividido_entre,
            responsavel=original.responsavel,
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

    def importar(self, espaco: Espaco, dados: NovaImportacao, uid: str) -> tuple[list[ResultadoDaLinha], int]:
        """Lança cada linha do extrato na conta escolhida: valor negativo vira
        despesa, positivo vira receita. Linha já importada antes (mesma chave)
        é pulada, e linha ilegível volta com o motivo; as outras entram mesmo
        assim. Com dados.simular, nada é gravado.

        Sem dados.mapeamento, as colunas são reconhecidas pelo nome (ou pelo
        conteúdo, sem dúvida). A categoria de cada linha vem da coluna de
        categoria do arquivo, do histórico do mesmo estabelecimento, das regras
        pela descrição ou, sem pista, da categoria padrão do tipo
        (categorizacao.py). dados.ajustes troca a descrição e a categoria de
        uma linha, como a pessoa editou na conferência; a chave da linha
        continua a do arquivo (importar de novo não duplica).

        Na fatura de um cartão, a linha parcelada ("LOJA 03/12") vira a parcela
        da compra e gera as parcelas vincendas nas próximas faturas; a parcela
        que já estava lá (gerada por uma importação anterior) só é confirmada
        (parcelamento.py). Devolve os resultados por linha e quantas parcelas
        futuras entraram (ou entrariam, na simulação).

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
        erros = self._conferir_ajustes(dados, lidas, categorias)
        if erros:
            raise ErroValidacao(erros)
        categorizador = Categorizador(categorias, self._historico_das_categorias(espaco))
        chaves = importacao.chaves_de_importacao(conta.id, lidas)
        ja_importadas = self.repositorio.chaves_importadas(espaco.id, chaves)
        # Só a compra (saída) na fatura de um cartão tem parcelas a gerar.
        parcelas = [
            parcelamento.parcela_na_descricao(linha.descricao) if conta.cartao and linha.valor_centavos < 0 else None
            for linha in lidas
        ]
        datas = [linha.data for linha in lidas]
        parcelamentos = None
        if conta.cartao:
            datas = parcelamento.posicionar(conta, list(zip(datas, parcelas, strict=True)))
            if any(parcelas):
                no_cartao = self.repositorio.listar_lancamentos(espaco.id, None, None, LIMITE_DO_CARTAO, conta.id)
                parcelamentos = parcelamento.Parcelamentos(conta, no_cartao)

        resultados = [ResultadoDaLinha(r.linha, SituacaoDaLinha.INVALIDA, erro=r.erro) for r in recusadas]
        futuras = 0
        for linha, chave, data, parcela in zip(lidas, chaves, datas, parcelas, strict=True):
            tipo = TipoCategoria.RECEITA if linha.valor_centavos > 0 else TipoCategoria.DESPESA
            padrao = receita if tipo == TipoCategoria.RECEITA else despesa
            categoria, origem = categorizador.categorizar(linha.descricao, tipo, linha.categoria, padrao)
            ajuste = dados.ajustes.get(linha.linha)
            if ajuste and ajuste.categoria_id:
                categoria, origem = categorizador.por_id(ajuste.categoria_id), AJUSTE
            descricao = ajuste.descricao if ajuste and ajuste.descricao else linha.descricao
            item = _LinhaAImportar(linha, chave, data, categoria.id, descricao)
            observacao = None
            if chave in ja_importadas:
                situacao, lancamento_id = SituacaoDaLinha.JA_IMPORTADA, None
            elif parcela and parcelamentos:
                situacao, lancamento_id, observacao, geradas = self._importar_parcela(
                    espaco, item, parcela, parcelamentos, dados, uid
                )
                futuras += geradas
            else:
                situacao, lancamento_id = self._importar_linha(espaco, item, dados, uid)
            resultados.append(
                ResultadoDaLinha(
                    linha.linha,
                    situacao,
                    data=linha.data,
                    descricao=descricao,
                    valor_centavos=linha.valor_centavos,
                    categoria_id=categoria.id,
                    origem_da_categoria=origem,
                    lancamento_id=lancamento_id,
                    fatura=cartoes.referencia_da_data(conta, data) if conta.cartao else None,
                    observacao=observacao,
                )
            )
        return sorted(resultados, key=lambda resultado: resultado.linha), futuras

    def _historico_das_categorias(self, espaco: Espaco) -> list[tuple[str, TipoCategoria, str | None]]:
        """(descrição, tipo, categoria) dos lançamentos recentes de receita e
        despesa: é com eles que o estabelecimento conhecido volta para a
        categoria de sempre."""
        recentes = self.repositorio.listar_lancamentos(espaco.id, None, None, LIMITE_DO_HISTORICO)
        return [
            (lancamento.descricao, TipoCategoria(lancamento.tipo.value), lancamento.categoria_id)
            for lancamento in recentes
            if lancamento.tipo != TipoLancamento.TRANSFERENCIA and not lancamento.estorno_de
        ]

    @staticmethod
    def _conferir_ajustes(
        dados: NovaImportacao, lidas: list[importacao.LinhaDoExtrato], categorias: list[Categoria]
    ) -> dict[str, str]:
        """A categoria escolhida na conferência precisa ser uma categoria ativa
        do espaço, do tipo da linha (saída em despesa, entrada em receita).
        Ajuste de uma linha que não virou lançamento não tem efeito."""
        ativas = {categoria.id: categoria for categoria in categorias if categoria.ativa}
        tipo_da_linha = {
            linha.linha: TipoCategoria.RECEITA if linha.valor_centavos > 0 else TipoCategoria.DESPESA for linha in lidas
        }
        erros = {}
        for numero, ajuste in dados.ajustes.items():
            if not ajuste.categoria_id or numero not in tipo_da_linha:
                continue
            categoria = ativas.get(ajuste.categoria_id)
            if categoria is None:
                erros[f"ajustes.{numero}.categoria_id"] = "Categoria não encontrada ou desativada."
            elif categoria.tipo != tipo_da_linha[numero]:
                erros[f"ajustes.{numero}.categoria_id"] = (
                    "Saída vai numa categoria de despesa, e entrada, numa de receita."
                )
        return erros

    def _importar_linha(
        self,
        espaco: Espaco,
        item: "_LinhaAImportar",
        dados: NovaImportacao,
        uid: str,
        plano: parcelamento.PlanoDaLinha | None = None,
    ) -> tuple[SituacaoDaLinha, str | None]:
        if dados.simular:
            return SituacaoDaLinha.NOVA, None

        linha = item.linha
        receita = linha.valor_centavos > 0
        # Validado como um lançamento digitado: o que vem do arquivo passa
        # pelos mesmos limites de descrição, data e valor.
        novo = NovoLancamento(
            tipo=TipoLancamento.RECEITA if receita else TipoLancamento.DESPESA,
            descricao=item.descricao,
            data=item.data,
            valor_centavos=abs(linha.valor_centavos),
            conta_id=dados.conta_id,
            categoria_id=item.categoria_id,
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
            chave_importacao=item.chave,
            **_campos_da_parcela(plano, plano.numero if plano else None),
        )
        try:
            return SituacaoDaLinha.IMPORTADA, self._gravar(lancamento).id
        except LancamentoJaImportado:
            # Outra importação do mesmo arquivo gravou esta linha agora há pouco.
            return SituacaoDaLinha.JA_IMPORTADA, None

    def _importar_parcela(
        self,
        espaco: Espaco,
        item: "_LinhaAImportar",
        parcela: parcelamento.ParcelaNaDescricao,
        parcelamentos: parcelamento.Parcelamentos,
        dados: NovaImportacao,
        uid: str,
    ) -> tuple[SituacaoDaLinha, str | None, str, int]:
        """Linha parcelada da fatura: confirma a parcela que já estava no
        cartão ou lança a parcela da compra, e lança as vincendas que faltam.
        Devolve também a observação da linha e quantas parcelas futuras
        entraram."""
        plano = parcelamentos.planejar(parcela, item.data, -item.linha.valor_centavos)
        texto = f"Parcela {plano.numero} de {plano.total}"
        if plano.prevista:
            situacao, lancamento_id = SituacaoDaLinha.JA_IMPORTADA, plano.prevista.lancamento_id
            texto += " já estava na fatura, lançada pelo parcelamento"
            if not dados.simular and lancamento_id:
                self._confirmar_parcela(espaco, lancamento_id, item)
        else:
            situacao, lancamento_id = self._importar_linha(espaco, item, dados, uid, plano)
            if situacao == SituacaoDaLinha.JA_IMPORTADA:
                return situacao, None, None, 0

        if plano.futuras:
            primeira, ultima = plano.futuras[0][0], plano.futuras[-1][0]
            if primeira == ultima:
                texto += f". A parcela {primeira} entra na próxima fatura"
            else:
                faixa = f"{primeira} e {ultima}" if ultima == primeira + 1 else f"{primeira} a {ultima}"
                texto += f". As parcelas {faixa} entram nas próximas faturas"
        if not dados.simular:
            for numero, data in plano.futuras:
                gerada = self._gravar(self._parcela_gerada(espaco, item, parcela, plano, numero, data, dados.conta_id, uid))
                parcelamentos.anotar(plano, numero, gerada.id)
        return situacao, lancamento_id, f"{texto}.", len(plano.futuras)

    def _confirmar_parcela(self, espaco: Espaco, lancamento_id: str, item: "_LinhaAImportar") -> None:
        """A parcela gerada antes ganha a chave da linha que a confirmou (a
        mesma fatura importada de novo já é reconhecida) e a data do banco."""
        prevista = self.repositorio.buscar_lancamento(espaco.id, lancamento_id)
        if prevista is None:
            return
        prevista.chave_importacao = item.chave
        prevista.data = item.data
        try:
            self.repositorio.atualizar_lancamento(prevista)
        except LancamentoJaImportado:
            pass

    def _parcela_gerada(
        self,
        espaco: Espaco,
        item: "_LinhaAImportar",
        parcela: parcelamento.ParcelaNaDescricao,
        plano: parcelamento.PlanoDaLinha,
        numero: int,
        data: date,
        conta_id: str,
        uid: str,
    ) -> Lancamento:
        """Uma parcela vincenda da compra, com a descrição no formato do banco
        ("LOJA X 04/12") e sem chave: ela espera a linha da fatura dela."""
        despesa = NovoLancamento(
            tipo=TipoLancamento.DESPESA,
            descricao=parcelamento.descricao_da_parcela(item.linha.descricao, parcela, numero)[:TAMANHO_MAXIMO_DA_DESCRICAO],
            data=data,
            valor_centavos=-item.linha.valor_centavos,
            conta_id=conta_id,
            categoria_id=item.categoria_id,
        )
        return Lancamento(
            espaco_id=espaco.id,
            tipo=despesa.tipo,
            descricao=despesa.descricao,
            data=despesa.data,
            valor_centavos=despesa.valor_centavos,
            conta_id=despesa.conta_id,
            categoria_id=despesa.categoria_id,
            partidas=regras.montar_partidas(despesa),
            criado_em=agora(),
            criado_por=uid,
            **_campos_da_parcela(plano, numero),
        )

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

    # --- Relatórios ---

    def periodo_do_relatorio(
        self, espaco: Espaco, de: str | None, ate: str | None, conta_id: str | None
    ) -> tuple[relatorios.Mes, relatorios.Mes]:
        """Meses inicial e final (padrão: os 12 que terminam no mês de hoje) e
        a conta do filtro, que precisa ser do espaço."""
        inicio, fim, erros = relatorios.periodo_pedido(de, ate, self.hoje(espaco))
        if erros:
            raise ErroValidacao(erros)
        if conta_id:
            self._conta(espaco, conta_id)
        return inicio, fim

    def relatorio_mensal(
        self,
        espaco: Espaco,
        de: relatorios.Mes,
        ate: relatorios.Mes,
        conta_id: str | None = None,
        pessoa: FiltroDePessoa | None = None,
    ) -> list[relatorios.ResultadoDoMes]:
        """Receitas, despesas e saldo no fim de cada mês do período. O saldo é
        o das contas (sem os cartões) ou, com conta_id, o daquela conta. Com
        pessoa, receitas e despesas são só as dela; o saldo continua o das
        contas, que são da casa inteira."""
        fim = relatorios.ultimo_dia(ate)
        somas = self.repositorio.somar_categorias_por_mes(espaco.id, relatorios.primeiro_dia(de), fim, conta_id, pessoa)
        todas = self.repositorio.listar_contas(espaco.id)
        # Sem filtro, o saldo em contas: todas menos os cartões, inclusive as
        # desativadas (o dinheiro delas continua existindo).
        contas = [conta for conta in todas if conta.id == conta_id] if conta_id else [c for c in todas if not c.cartao]
        somas_das_contas = self.repositorio.somar_contas_por_mes(espaco.id, [conta.id for conta in contas], fim)
        saldo_inicial = sum(conta.saldo_inicial_centavos for conta in contas)
        return relatorios.resultado_por_mes(relatorios.meses_do_periodo(de, ate), somas, saldo_inicial, somas_das_contas)

    def gasto_por_categoria(
        self,
        espaco: Espaco,
        de: relatorios.Mes,
        ate: relatorios.Mes,
        conta_id: str | None = None,
        pessoa: FiltroDePessoa | None = None,
    ) -> list[tuple[relatorios.GastoDaCategoria, Categoria | None]]:
        """Gasto de cada categoria no período, com o cadastro dela (None se a
        categoria não existir mais). Com pessoa, só os gastos dela."""
        somas = self.repositorio.somar_categorias_por_mes(
            espaco.id, relatorios.primeiro_dia(de), relatorios.ultimo_dia(ate), conta_id, pessoa
        )
        categorias = {categoria.id: categoria for categoria in self.repositorio.listar_categorias(espaco.id)}
        return [(gasto, categorias.get(gasto.categoria_id)) for gasto in relatorios.gasto_por_categoria(somas)]

    def compromisso_nos_cartoes(
        self, espaco: Espaco
    ) -> list[tuple[Conta, ResumoDoCartao, list[relatorios.FaturaComprometida]]]:
        """Cada cartão com o painel e as faturas da atual em diante, com as
        parcelas já lançadas."""
        hoje = self.hoje(espaco)
        somas = self.repositorio.somar_partidas_por_conta(espaco.id)
        resultado = []
        for cartao in self.repositorio.listar_contas(espaco.id):
            if not cartao.cartao:
                continue
            atual = cartoes.referencia_da_data(cartao, hoje)
            inicio = cartoes.periodo_da_fatura(cartao, atual).inicio
            lancamentos = self.repositorio.listar_lancamentos(espaco.id, inicio, None, LIMITE_DO_CARTAO, cartao.id)
            resumo = cartoes.resumir(cartao, regras.saldo_da_conta(cartao, somas), lancamentos, hoje)
            resultado.append((cartao, resumo, relatorios.faturas_comprometidas(cartao, lancamentos, atual)))
        return resultado


@dataclass(frozen=True)
class _LinhaAImportar:
    """Uma linha do extrato pronta para virar lançamento: a chave de
    idempotência, a data com que entra (na fatura do cartão, a parcela pode
    mudar de data, ver parcelamento.posicionar) e a categoria escolhida."""

    linha: importacao.LinhaDoExtrato
    chave: str
    data: date
    categoria_id: str
    # A descrição gravada: a do arquivo ou a que a pessoa editou. A parcela
    # continua lida da descrição do arquivo (linha.descricao), no formato do
    # banco, para a fatura seguinte reconhecer as parcelas geradas.
    descricao: str


def _campos_da_parcela(plano: parcelamento.PlanoDaLinha | None, numero: int | None) -> dict:
    """Os campos que ligam o lançamento à compra parcelada do plano."""
    if plano is None:
        return {}
    return {"compra_id": plano.compra_id, "parcela": numero, "parcelas": plano.total, "chave_parcelamento": plano.chave}
