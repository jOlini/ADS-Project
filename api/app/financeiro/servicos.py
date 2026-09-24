"""Casos de uso do livro-caixa, sem nada de HTTP.

Quem pode entrar em cada espaço é decidido antes, em acesso.py. Aqui chegam
só o espaço já liberado e o uid de quem pede.
"""

from datetime import UTC, date, datetime
from zoneinfo import ZoneInfo

from app.erros import ErroConflito, ErroNaoEncontrado, ErroValidacao
from app.financeiro import importacao, regras
from app.financeiro.modelos import (
    AtualizacaoCategoria,
    AtualizacaoConta,
    Categoria,
    Conta,
    Espaco,
    Lancamento,
    Membro,
    NovaCategoria,
    NovaConta,
    NovaImportacao,
    NovoLancamento,
    Papel,
    ResultadoDaLinha,
    SituacaoDaLinha,
    TipoEspaco,
    TipoLancamento,
)
from app.financeiro.repositorio import EspacoPessoalJaExiste, LancamentoJaImportado, RepositorioLivroCaixa

FUSO_PADRAO = "America/Sao_Paulo"
TAMANHO_MAXIMO_DA_DESCRICAO = 120


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
        conta = Conta(
            espaco_id=espaco.id,
            nome=dados.nome,
            tipo=dados.tipo,
            saldo_inicial_centavos=dados.saldo_inicial_centavos,
            ativa=True,
            criada_em=agora(),
        )
        return self.repositorio.inserir_conta(conta)

    def atualizar_conta(self, espaco: Espaco, id: str, dados: AtualizacaoConta) -> Conta:
        conta = self._conta(espaco, id)
        conta.nome = dados.nome
        conta.tipo = dados.tipo
        conta.ativa = dados.ativa
        return self.repositorio.atualizar_conta(conta)

    def _conta(self, espaco: Espaco, id: str) -> Conta:
        conta = self.repositorio.buscar_conta(espaco.id, id)
        if conta is None:
            raise ErroNaoEncontrado("Conta não encontrada.")
        return conta

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

    def lancamentos(self, espaco: Espaco, de: date | None, ate: date | None, limite: int) -> list[Lancamento]:
        if de and ate and de > ate:
            raise ErroValidacao({"ate": "A data final vem antes da inicial."})
        lancamentos = self.repositorio.listar_lancamentos(espaco.id, de, ate, limite)
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
        )
        return self._gravar(lancamento)

    def estornar(self, espaco: Espaco, id: str, uid: str) -> Lancamento:
        """Anula um lançamento com outro de sinal trocado, na data de hoje. O
        original continua no histórico: nada é editado nem apagado."""
        original = self.lancamento(espaco, id)
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
        )
        return self._gravar(estorno)

    # --- Importação de extrato ---

    def importar(self, espaco: Espaco, dados: NovaImportacao, uid: str) -> list[ResultadoDaLinha]:
        """Lança cada linha do extrato na conta escolhida: valor negativo vira
        despesa, positivo vira receita. Linha já importada antes (mesma chave)
        é pulada, e linha ilegível volta com o motivo; as outras entram mesmo
        assim. Com dados.simular, nada é gravado.

        Cada lançamento é gravado sozinho (atômico). Se a importação parar no
        meio, rodar de novo termina o que faltou, sem duplicar o que entrou.
        """
        conta = self.repositorio.buscar_conta(espaco.id, dados.conta_id)
        despesa = self.repositorio.buscar_categoria(espaco.id, dados.categoria_despesa_id)
        receita = self.repositorio.buscar_categoria(espaco.id, dados.categoria_receita_id)
        erros = regras.conferir_importacao(conta, despesa, receita)
        try:
            lidas, recusadas = importacao.ler_extrato(dados.csv)
        except importacao.ExtratoIlegivel as erro:
            erros["csv"] = str(erro)
        if erros:
            raise ErroValidacao(erros)

        chaves = importacao.chaves_de_importacao(conta.id, lidas)
        ja_importadas = self.repositorio.chaves_importadas(espaco.id, chaves)
        resultados = [ResultadoDaLinha(r.linha, SituacaoDaLinha.INVALIDA, erro=r.erro) for r in recusadas]
        for linha, chave in zip(lidas, chaves, strict=True):
            situacao, lancamento_id = self._importar_linha(
                espaco, linha, chave, chave in ja_importadas, dados, uid
            )
            resultados.append(
                ResultadoDaLinha(
                    linha.linha,
                    situacao,
                    data=linha.data,
                    descricao=linha.descricao,
                    valor_centavos=linha.valor_centavos,
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
            categoria_id=dados.categoria_receita_id if receita else dados.categoria_despesa_id,
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
