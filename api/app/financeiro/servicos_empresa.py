"""Gestão de cada empresa do espaço empresarial, sem nada de HTTP: custos,
sociedade e aportes, impostos e a folha (RH).

Tudo o que mexe em dinheiro vira lançamento comum do livro-caixa da empresa
(com partidas dobradas), na categoria da função certa: o extrato, o saldo, o
DRE e o fluxo de caixa enxergam sem regra nova. O sócio e a pessoa da folha
entram como responsável do lançamento; o tributo pago e a folha levam a
origem, que impede lançar a mesma competência duas vezes.
"""

from datetime import date

from app.erros import ErroConflito, ErroNaoEncontrado, ErroValidacao
from app.financeiro import regras, regras_empresa
from app.financeiro.modelos import (
    Categoria,
    Espaco,
    FuncaoDaCategoria,
    Lancamento,
    NovoLancamento,
    Origem,
    TipoCategoria,
    TipoDeOrigem,
    TipoEspaco,
    TipoLancamento,
)
from app.financeiro.modelos_empresa import (
    MAXIMO_DE_COLABORADORES,
    MAXIMO_DE_SOCIOS,
    MAXIMO_DE_TRIBUTOS,
    Beneficio,
    ClassesDeCusto,
    Colaborador,
    NovaFolha,
    NovoColaborador,
    NovoMovimentoDoSocio,
    NovoPagamentoDeTributo,
    NovoSocio,
    NovoTributo,
    PagamentoDoTributoResposta,
    Socio,
    TipoDeMovimento,
    Tributo,
)
from app.financeiro.regras import chave_da_pessoa
from app.financeiro.repositorio import Cadastro, LancamentoJaGerado, RepositorioLivroCaixa
from app.financeiro.servicos import TAMANHO_MAXIMO_DA_DESCRICAO, agora

SO_NA_EMPRESA = "Esta parte é das empresas do espaço empresarial."
NOME_REPETIDO = "Já existe alguém com este nome aqui."
SEM_NINGUEM_NA_FOLHA = "Ninguém ativo na folha desta competência. Cadastre as pessoas (ou reative) antes."


class ServicoEmpresa:
    def __init__(self, repositorio: RepositorioLivroCaixa):
        self.repositorio = repositorio

    # --- Custos ---

    def classificar_custos(self, espaco: Espaco, dados: ClassesDeCusto) -> list[Categoria]:
        """Grava a classe (variável, fixo, operacional, fora) de cada despesa
        pedida, tudo ou nada: com um id errado, nenhuma muda."""
        self._conferir_empresa(espaco)
        categorias, erros = [], {}
        for id, classe in dados.classes.items():
            categoria = self.repositorio.buscar_categoria(espaco.id, id)
            if categoria is None:
                erros[f"classes.{id}"] = "Categoria não encontrada."
            elif categoria.tipo != TipoCategoria.DESPESA:
                erros[f"classes.{id}"] = "Só despesa tem classe de custo."
            else:
                categoria.classe_de_custo = classe
                categorias.append(categoria)
        if erros:
            raise ErroValidacao(erros)
        for categoria in categorias:
            self.repositorio.atualizar_categoria(categoria)
        return self.repositorio.listar_categorias(espaco.id)

    # --- Sociedade e aportes ---

    def socios(self, espaco: Espaco) -> list[Socio]:
        self._conferir_empresa(espaco)
        return self.repositorio.listar_cadastros(Cadastro.SOCIOS, espaco.id)

    def incluir_socio(self, espaco: Espaco, dados: NovoSocio) -> Socio:
        socios = self.socios(espaco)
        if len(socios) >= MAXIMO_DE_SOCIOS:
            raise ErroConflito(f"O quadro já tem {MAXIMO_DE_SOCIOS} sócios.")
        self._conferir_socio(socios, dados)
        socio = Socio(espaco.id, dados.nome, dados.participacao_centesimos, agora())
        return self.repositorio.inserir_cadastro(Cadastro.SOCIOS, socio)

    def editar_socio(self, espaco: Espaco, id: str, dados: NovoSocio) -> tuple[Socio, int]:
        """Com o nome novo, aportes, pró-labores e distribuições do sócio (o
        responsável dos lançamentos) passam para ele."""
        socios = self.socios(espaco)
        socio = self._achar(socios, id, "Sócio não encontrado.")
        self._conferir_socio(socios, dados, ignorar=socio.id)
        antigo, socio.nome, socio.participacao_centesimos = socio.nome, dados.nome, dados.participacao_centesimos
        self.repositorio.atualizar_cadastro(Cadastro.SOCIOS, socio)
        return socio, self._renomear(espaco, antigo, socio.nome)

    def remover_socio(self, espaco: Espaco, id: str) -> None:
        """Os lançamentos do sócio ficam no extrato, com o nome dele."""
        self._achar(self.socios(espaco), id, "Sócio não encontrado.")
        self.repositorio.excluir_cadastro(Cadastro.SOCIOS, espaco.id, id)

    def lancar_movimento(self, espaco: Espaco, socio_id: str, dados: NovoMovimentoDoSocio, uid: str) -> Lancamento:
        """Aporte (entra na conta), distribuição de lucros ou pró-labore (saem
        dela), com o sócio como responsável."""
        socio = self._achar(self.socios(espaco), socio_id, "Sócio não encontrado.")
        conta = self.repositorio.buscar_conta(espaco.id, dados.conta_id)
        if erro := regras_empresa.conferir_conta_da_empresa(conta):
            raise ErroValidacao({"conta_id": erro})
        categoria = self.garantir_categoria(espaco, regras_empresa.FUNCAO_DO_MOVIMENTO[dados.tipo])
        descricao = dados.descricao or f"{regras_empresa.DESCRICAO_DO_MOVIMENTO[dados.tipo]} · {socio.nome}"
        tipo = TipoLancamento.RECEITA if dados.tipo == TipoDeMovimento.APORTE else TipoLancamento.DESPESA
        return self._lancar(espaco, tipo, conta.id, categoria, dados.valor_centavos, dados.data, descricao, socio.nome, uid)

    def _conferir_socio(self, socios: list[Socio], dados: NovoSocio, ignorar: str | None = None) -> None:
        erros = {}
        if any(chave_da_pessoa(outro.nome) == chave_da_pessoa(dados.nome) for outro in socios if outro.id != ignorar):
            erros["nome"] = NOME_REPETIDO
        if erro := regras_empresa.conferir_participacao(socios, dados.participacao_centesimos, ignorar):
            erros["participacao_centesimos"] = erro
        if erros:
            raise ErroValidacao(erros)

    # --- Impostos ---

    def tributos(self, espaco: Espaco) -> list[tuple[Tributo, list[PagamentoDoTributoResposta]]]:
        """Os tributos com as competências já pagas (da mais nova para a mais
        antiga), lidas dos lançamentos com a origem de cada um."""
        self._conferir_empresa(espaco)
        pagamentos: dict[str, list[PagamentoDoTributoResposta]] = {}
        for lancamento in self.repositorio.listar_lancamentos_de_origem(espaco.id, [TipoDeOrigem.TRIBUTO]):
            pagamentos.setdefault(lancamento.origem.id, []).append(
                PagamentoDoTributoResposta(
                    competencia=lancamento.origem.competencia,
                    lancamento_id=lancamento.id,
                    valor_centavos=lancamento.valor_centavos,
                    data=lancamento.data,
                )
            )
        return [(tributo, pagamentos.get(tributo.id, [])) for tributo in self._tributos(espaco)]

    def tributo(self, espaco: Espaco, id: str) -> tuple[Tributo, list[PagamentoDoTributoResposta]]:
        for item in self.tributos(espaco):
            if item[0].id == id:
                return item
        raise ErroNaoEncontrado("Tributo não encontrado.")

    def incluir_tributo(self, espaco: Espaco, dados: NovoTributo) -> Tributo:
        tributos = self._tributos(espaco)
        if len(tributos) >= MAXIMO_DE_TRIBUTOS:
            raise ErroConflito(f"A empresa já tem {MAXIMO_DE_TRIBUTOS} tributos cadastrados.")
        if erros := regras_empresa.conferir_tributo(dados):
            raise ErroValidacao(erros)
        tributo = Tributo(espaco.id, criado_em=agora(), **dados.model_dump())
        return self.repositorio.inserir_cadastro(Cadastro.TRIBUTOS, tributo)

    def editar_tributo(self, espaco: Espaco, id: str, dados: NovoTributo) -> Tributo:
        """Muda o cadastro; os pagamentos já lançados continuam como estão."""
        tributo = self._achar(self._tributos(espaco), id, "Tributo não encontrado.")
        if erros := regras_empresa.conferir_tributo(dados):
            raise ErroValidacao(erros)
        for campo, valor in dados.model_dump().items():
            setattr(tributo, campo, valor)
        return self.repositorio.atualizar_cadastro(Cadastro.TRIBUTOS, tributo)

    def remover_tributo(self, espaco: Espaco, id: str) -> None:
        """Os pagamentos já lançados ficam no extrato, na categoria deles."""
        self._achar(self._tributos(espaco), id, "Tributo não encontrado.")
        self.repositorio.excluir_cadastro(Cadastro.TRIBUTOS, espaco.id, id)

    def pagar_tributo(self, espaco: Espaco, id: str, dados: NovoPagamentoDeTributo, uid: str) -> Lancamento:
        """A guia paga de uma competência: despesa na categoria de impostos (ou
        de encargos, se o tributo é sobre a folha), com a origem do tributo."""
        tributo = self._achar(self._tributos(espaco), id, "Tributo não encontrado.")
        erros = {}
        if erro := regras_empresa.conferir_competencia(tributo.periodicidade, dados.competencia):
            erros["competencia"] = erro
        conta = self.repositorio.buscar_conta(espaco.id, dados.conta_id)
        if erro := regras_empresa.conferir_conta_da_empresa(conta):
            erros["conta_id"] = erro
        if erros:
            raise ErroValidacao(erros)
        categoria = self.garantir_categoria(espaco, regras_empresa.funcao_do_tributo(tributo.base))
        competencia = regras_empresa.texto_da_competencia(dados.competencia)
        try:
            return self._lancar(
                espaco,
                TipoLancamento.DESPESA,
                conta.id,
                categoria,
                dados.valor_centavos,
                dados.data,
                f"{tributo.nome} · {competencia}",
                None,
                uid,
                Origem(TipoDeOrigem.TRIBUTO, tributo.id, dados.competencia),
            )
        except LancamentoJaGerado:
            raise ErroConflito(
                f"{tributo.nome} de {competencia} já está pago. Para refazer, exclua o pagamento no extrato."
            ) from None

    def _tributos(self, espaco: Espaco) -> list[Tributo]:
        self._conferir_empresa(espaco)
        return self.repositorio.listar_cadastros(Cadastro.TRIBUTOS, espaco.id)

    # --- Pessoal (RH) ---

    def colaboradores(self, espaco: Espaco) -> list[tuple[Colaborador, list[str]]]:
        """As pessoas da folha com as competências em que o salário de cada uma
        já foi lançado (da mais nova para a mais antiga)."""
        lancadas: dict[str, list[str]] = {}
        for lancamento in self.repositorio.listar_lancamentos_de_origem(espaco.id, [TipoDeOrigem.SALARIO]):
            lancadas.setdefault(lancamento.origem.id, []).append(lancamento.origem.competencia)
        return [(pessoa, lancadas.get(pessoa.id, [])) for pessoa in self._colaboradores(espaco)]

    def colaborador(self, espaco: Espaco, id: str) -> tuple[Colaborador, list[str]]:
        for item in self.colaboradores(espaco):
            if item[0].id == id:
                return item
        raise ErroNaoEncontrado("Pessoa não encontrada na folha.")

    def incluir_colaborador(self, espaco: Espaco, dados: NovoColaborador) -> Colaborador:
        pessoas = self._colaboradores(espaco)
        if len(pessoas) >= MAXIMO_DE_COLABORADORES:
            raise ErroConflito(f"A folha já tem {MAXIMO_DE_COLABORADORES} pessoas.")
        self._conferir_nome(pessoas, dados.nome)
        colaborador = Colaborador(espaco.id, criado_em=agora(), **self._campos_do_colaborador(dados))
        return self.repositorio.inserir_cadastro(Cadastro.COLABORADORES, colaborador)

    def editar_colaborador(self, espaco: Espaco, id: str, dados: NovoColaborador) -> tuple[Colaborador, int]:
        """Muda o cadastro (a próxima folha usa os valores novos; as lançadas
        continuam). Com o nome novo, os lançamentos da pessoa passam para ele."""
        pessoas = self._colaboradores(espaco)
        colaborador = self._achar(pessoas, id, "Pessoa não encontrada na folha.")
        self._conferir_nome(pessoas, dados.nome, ignorar=colaborador.id)
        antigo = colaborador.nome
        for campo, valor in self._campos_do_colaborador(dados).items():
            setattr(colaborador, campo, valor)
        self.repositorio.atualizar_cadastro(Cadastro.COLABORADORES, colaborador)
        return colaborador, self._renomear(espaco, antigo, colaborador.nome)

    def remover_colaborador(self, espaco: Espaco, id: str) -> None:
        """Para quem saiu, o caminho é desativar (a folha lançada fica). Remover
        tira do cadastro; os lançamentos continuam no extrato."""
        self._achar(self._colaboradores(espaco), id, "Pessoa não encontrada na folha.")
        self.repositorio.excluir_cadastro(Cadastro.COLABORADORES, espaco.id, id)

    def lancar_folha(self, espaco: Espaco, dados: NovaFolha, uid: str) -> tuple[list[Lancamento], int]:
        """Salário (na categoria do vínculo) e benefícios de cada pessoa ativa na
        competência, saindo da conta indicada. Quem já tem o salário lançado na
        competência é pulado: lançar de novo não duplica. Devolve os lançamentos
        criados e quantas pessoas já estavam lançadas."""
        pessoas = [
            pessoa
            for pessoa in self._colaboradores(espaco)
            if regras_empresa.ativo_na_competencia(pessoa, dados.competencia)
        ]
        erros = {}
        if not pessoas:
            erros["competencia"] = SEM_NINGUEM_NA_FOLHA
        conta = self.repositorio.buscar_conta(espaco.id, dados.conta_id)
        if erro := regras_empresa.conferir_conta_da_empresa(conta):
            erros["conta_id"] = erro
        if erros:
            raise ErroValidacao(erros)

        competencia = regras_empresa.texto_da_competencia(dados.competencia)
        beneficios = self.garantir_categoria(espaco, FuncaoDaCategoria.BENEFICIOS)
        categorias = {
            vinculo: self.garantir_categoria(espaco, funcao) for vinculo, funcao in regras_empresa.FUNCAO_DO_VINCULO.items()
        }
        lancados, ja_lancados = [], 0
        for pessoa in pessoas:
            data = dados.data or regras_empresa.data_de_pagamento(dados.competencia, pessoa.dia_pagamento)
            rotulo = regras_empresa.DESCRICAO_DO_VINCULO[pessoa.vinculo]
            try:
                lancados.append(
                    self._lancar(
                        espaco,
                        TipoLancamento.DESPESA,
                        conta.id,
                        categorias[pessoa.vinculo],
                        pessoa.salario_centavos,
                        data,
                        f"{rotulo} · {pessoa.nome} · {competencia}",
                        pessoa.nome,
                        uid,
                        Origem(TipoDeOrigem.SALARIO, pessoa.id, dados.competencia),
                    )
                )
            except LancamentoJaGerado:
                ja_lancados += 1
                continue
            total_dos_beneficios = sum(beneficio.valor_centavos for beneficio in pessoa.beneficios)
            if total_dos_beneficios:
                try:
                    lancados.append(
                        self._lancar(
                            espaco,
                            TipoLancamento.DESPESA,
                            conta.id,
                            beneficios,
                            total_dos_beneficios,
                            data,
                            f"Benefícios · {pessoa.nome} · {competencia}",
                            pessoa.nome,
                            uid,
                            Origem(TipoDeOrigem.BENEFICIOS, pessoa.id, dados.competencia),
                        )
                    )
                except LancamentoJaGerado:
                    pass
        return lancados, ja_lancados

    def _colaboradores(self, espaco: Espaco) -> list[Colaborador]:
        self._conferir_empresa(espaco)
        return self.repositorio.listar_cadastros(Cadastro.COLABORADORES, espaco.id)

    @staticmethod
    def _campos_do_colaborador(dados: NovoColaborador) -> dict:
        return {
            "nome": dados.nome,
            "vinculo": dados.vinculo,
            "cargo": dados.cargo or None,
            "salario_centavos": dados.salario_centavos,
            "dia_pagamento": dados.dia_pagamento,
            "admissao": dados.admissao,
            "beneficios": [Beneficio(b.nome, b.valor_centavos) for b in dados.beneficios],
            "ativo": dados.ativo,
        }

    @staticmethod
    def _conferir_nome(pessoas: list[Colaborador], nome: str, ignorar: str | None = None) -> None:
        # O nome vai como responsável dos lançamentos da folha: dois iguais
        # misturariam os custos das duas pessoas.
        if any(chave_da_pessoa(outra.nome) == chave_da_pessoa(nome) for outra in pessoas if outra.id != ignorar):
            raise ErroValidacao({"nome": NOME_REPETIDO})

    # --- Categorias da gestão ---

    def garantir_categoria(self, espaco: Espaco, funcao: FuncaoDaCategoria) -> Categoria:
        """A categoria da função (aporte, folha, tributo). Empresa criada antes
        das funções tem a categoria pelo nome: ela ganha a função. Sem nenhuma
        das duas (a pessoa excluiu), a categoria nasce de novo."""
        categorias = self.repositorio.listar_categorias(espaco.id)
        if categoria := next((c for c in categorias if c.funcao == funcao), None):
            return categoria
        nome, tipo, cor = regras.categoria_padrao(funcao)
        pelo_nome = next(
            (c for c in categorias if c.tipo == tipo and chave_da_pessoa(c.nome) == chave_da_pessoa(nome)), None
        )
        if pelo_nome:
            pelo_nome.funcao = funcao
            return self.repositorio.atualizar_categoria(pelo_nome)
        classe, _ = regras.gestao_da_categoria(TipoEspaco.PJ, nome)
        nova = Categoria(espaco.id, nome, tipo, cor, True, agora(), classe_de_custo=classe, funcao=funcao)
        return self.repositorio.inserir_categorias([nova])[0]

    # --- Apoio ---

    def _lancar(
        self,
        espaco: Espaco,
        tipo: TipoLancamento,
        conta_id: str,
        categoria: Categoria,
        valor_centavos: int,
        data: date,
        descricao: str,
        responsavel: str | None,
        uid: str,
        origem: Origem | None = None,
    ) -> Lancamento:
        # Passa pelo mesmo contrato de um lançamento digitado (descrição,
        # valor, data) antes de virar partidas.
        novo = NovoLancamento(
            tipo=tipo,
            descricao=descricao[:TAMANHO_MAXIMO_DA_DESCRICAO],
            data=data,
            valor_centavos=valor_centavos,
            conta_id=conta_id,
            categoria_id=categoria.id,
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
            responsavel=responsavel,
            origem=origem,
        )
        if not regras.soma_zero(lancamento.partidas):
            raise AssertionError("Partidas do lançamento não somam zero.")
        return self.repositorio.inserir_lancamento(lancamento)

    def _renomear(self, espaco: Espaco, antigo: str, novo: str) -> int:
        return self.repositorio.renomear_pessoa(espaco.id, antigo, novo) if antigo != novo else 0

    def _conferir_empresa(self, espaco: Espaco) -> None:
        # 404 e não 409: no espaço pessoal, a gestão da empresa não existe.
        if espaco.tipo != TipoEspaco.PJ:
            raise ErroNaoEncontrado(SO_NA_EMPRESA)

    @staticmethod
    def _achar(itens: list, id: str, mensagem: str):
        item = next((item for item in itens if item.id == id), None)
        if item is None:
            raise ErroNaoEncontrado(mensagem)
        return item
