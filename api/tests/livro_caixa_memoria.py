"""Mesmo contrato do LivroCaixaMongo, guardando tudo em dicionários.

Reproduz as garantias que no MongoDB vêm dos índices únicos: um espaço
pessoal por pessoa, um estorno por lançamento, uma chave de importação por
espaço e uma origem (tributo ou folha da competência) por espaço.
"""

from copy import deepcopy
from dataclasses import replace

from bson import ObjectId

from app.erros import ErroConflito
from app.financeiro.modelos import TipoLancamento
from app.financeiro.regras import chave_da_pessoa
from app.financeiro.repositorio import (
    MENSAGEM_JA_ESTORNADO,
    Cadastro,
    EspacoPessoalJaExiste,
    LancamentoJaGerado,
    LancamentoJaImportado,
)


def _da_pessoa(lancamento, pessoa):
    # Como o MongoDB com a ordenação de força 1: sem caixa nem acento.
    if pessoa.nome is None:
        return not lancamento.responsavel
    return bool(lancamento.responsavel) and chave_da_pessoa(lancamento.responsavel) == chave_da_pessoa(pessoa.nome)


class LivroCaixaMemoria:
    def __init__(self):
        self.espacos = {}
        self.contas = {}
        self.categorias = {}
        self.lancamentos = {}
        self.cadastros = {cadastro: {} for cadastro in Cadastro}

    # --- Espaços ---

    # O espaço guarda listas (membros, pessoas da família): a cópia é funda,
    # como um documento lido de novo do banco.

    def buscar_espaco(self, id):
        return deepcopy(self.espacos.get(id))

    def buscar_espaco_pessoal(self, uid):
        return next((deepcopy(e) for e in self.espacos.values() if e.pessoal_de == uid), None)

    def listar_espacos_do_membro(self, uid):
        espacos = [e for e in self.espacos.values() if e.papel_de(uid)]
        return [deepcopy(e) for e in sorted(espacos, key=lambda e: e.criado_em)]

    def inserir_espaco(self, espaco):
        if espaco.pessoal_de and self.buscar_espaco_pessoal(espaco.pessoal_de):
            raise EspacoPessoalJaExiste()
        espaco.id = str(ObjectId())
        self.espacos[espaco.id] = deepcopy(espaco)
        return espaco

    def atualizar_espaco(self, espaco):
        guardado = self.espacos[espaco.id]
        guardado.nome, guardado.cnpj, guardado.regime = espaco.nome, espaco.cnpj, espaco.regime
        return espaco

    def atualizar_familia(self, espaco):
        self.espacos[espaco.id].familia = deepcopy(espaco.familia)
        return espaco

    def atualizar_plano(self, espaco):
        self.espacos[espaco.id].plano = espaco.plano
        return espaco

    def excluir_espaco(self, id):
        if id not in self.espacos:
            return False
        self.categorias = {chave: c for chave, c in self.categorias.items() if c.espaco_id != id}
        for cadastro, itens in self.cadastros.items():
            self.cadastros[cadastro] = {chave: item for chave, item in itens.items() if item.espaco_id != id}
        del self.espacos[id]
        return True

    # --- Contas ---

    def listar_contas(self, espaco_id):
        contas = [c for c in self.contas.values() if c.espaco_id == espaco_id]
        return [replace(c) for c in sorted(contas, key=lambda c: c.criada_em)]

    def buscar_conta(self, espaco_id, id):
        conta = self.contas.get(id)
        return replace(conta) if conta and conta.espaco_id == espaco_id else None

    def inserir_conta(self, conta):
        conta.id = str(ObjectId())
        self.contas[conta.id] = replace(conta)
        return conta

    def atualizar_conta(self, conta):
        self.contas[conta.id] = replace(conta)
        return conta

    def excluir_conta(self, espaco_id, id):
        conta = self.contas.get(id)
        if not conta or conta.espaco_id != espaco_id:
            return False
        del self.contas[id]
        return True

    # --- Categorias ---

    def listar_categorias(self, espaco_id):
        categorias = [c for c in self.categorias.values() if c.espaco_id == espaco_id]
        return [replace(c) for c in sorted(categorias, key=lambda c: (c.tipo.value, c.nome))]

    def buscar_categoria(self, espaco_id, id):
        categoria = self.categorias.get(id)
        return replace(categoria) if categoria and categoria.espaco_id == espaco_id else None

    def inserir_categorias(self, categorias):
        for categoria in categorias:
            categoria.id = str(ObjectId())
            self.categorias[categoria.id] = replace(categoria)
        return categorias

    def atualizar_categoria(self, categoria):
        self.categorias[categoria.id] = replace(categoria)
        return categoria

    def excluir_categoria(self, espaco_id, id):
        categoria = self.categorias.get(id)
        if not categoria or categoria.espaco_id != espaco_id:
            return False
        del self.categorias[id]
        return True

    def contar_lancamentos_da_categoria(self, espaco_id, categoria_id):
        return sum(1 for l in self.lancamentos.values() if l.espaco_id == espaco_id and l.categoria_id == categoria_id)

    def mover_lancamentos_de_categoria(self, espaco_id, de, para):
        movidos = 0
        for lancamento in self.lancamentos.values():
            if lancamento.espaco_id == espaco_id and lancamento.categoria_id == de:
                lancamento.categoria_id = para
                lancamento.partidas = [
                    replace(partida, categoria_id=para) if partida.categoria_id == de else partida for partida in lancamento.partidas
                ]
                movidos += 1
        return movidos

    # --- Lançamentos ---

    def listar_lancamentos(self, espaco_id, de, ate, limite, conta_id=None):
        lancamentos = [
            l
            for l in self.lancamentos.values()
            if l.espaco_id == espaco_id
            and (de is None or l.data >= de)
            and (ate is None or l.data <= ate)
            and (conta_id is None or any(p.conta_id == conta_id for p in l.partidas))
        ]
        # ObjectId cresce com o tempo: desempata lançamentos do mesmo instante.
        lancamentos.sort(key=lambda l: (l.data, l.criado_em, l.id), reverse=True)
        return [replace(l) for l in lancamentos[:limite]]

    def buscar_lancamento(self, espaco_id, id):
        lancamento = self.lancamentos.get(id)
        return replace(lancamento) if lancamento and lancamento.espaco_id == espaco_id else None

    def inserir_lancamento(self, lancamento):
        if lancamento.estorno_de and any(l.estorno_de == lancamento.estorno_de for l in self.lancamentos.values()):
            raise ErroConflito(MENSAGEM_JA_ESTORNADO)
        if lancamento.chave_importacao and lancamento.chave_importacao in self.chaves_importadas(
            lancamento.espaco_id, [lancamento.chave_importacao]
        ):
            raise LancamentoJaImportado()
        if lancamento.origem and any(
            l.espaco_id == lancamento.espaco_id and l.origem == lancamento.origem for l in self.lancamentos.values()
        ):
            raise LancamentoJaGerado()
        lancamento.id = str(ObjectId())
        self.lancamentos[lancamento.id] = replace(lancamento, estornado_por=None)
        return lancamento

    def atualizar_lancamento(self, lancamento):
        chave = lancamento.chave_importacao
        if chave and any(
            l.chave_importacao == chave and l.espaco_id == lancamento.espaco_id and l.id != lancamento.id
            for l in self.lancamentos.values()
        ):
            raise LancamentoJaImportado()
        self.lancamentos[lancamento.id] = replace(lancamento, estornado_por=None)
        return lancamento

    def atualizar_divisao(self, lancamento):
        guardado = self.lancamentos[lancamento.id]
        self.lancamentos[lancamento.id] = replace(guardado, divisao=list(lancamento.divisao))
        return lancamento

    def listar_rachas(self, espaco_id, limite):
        rachas = [
            l
            for l in self.lancamentos.values()
            if l.espaco_id == espaco_id and l.tipo == TipoLancamento.DESPESA and l.divisao and not l.estorno_de
        ]
        rachas.sort(key=lambda l: (l.data, l.criado_em, l.id), reverse=True)
        return [replace(l) for l in rachas[:limite]]

    def contar_lancamentos_manuais(self, espaco_id, desde, cartoes):
        return sum(
            1
            for l in self.lancamentos.values()
            if l.espaco_id == espaco_id
            and l.criado_em >= desde
            and not (l.estorno_de or l.chave_importacao or l.origem or l.reembolso_de)
            and l.parcela in (None, 1)
            and l.conta_destino_id not in cartoes
        )

    def listar_compra(self, espaco_id, compra_id):
        parcelas = [l for l in self.lancamentos.values() if l.espaco_id == espaco_id and l.compra_id == compra_id]
        return [replace(l) for l in sorted(parcelas, key=lambda l: l.parcela)]

    def excluir_lancamentos_da_conta(self, espaco_id, conta_id):
        ids = [
            l.id
            for l in self.lancamentos.values()
            if l.espaco_id == espaco_id and any(p.conta_id == conta_id for p in l.partidas)
        ]
        for id in ids:
            del self.lancamentos[id]
        return len(ids)

    def excluir_lancamento(self, espaco_id, id):
        lancamento = self.lancamentos.get(id)
        if not lancamento or lancamento.espaco_id != espaco_id:
            return False
        del self.lancamentos[id]
        return True

    def excluir_estornos_de(self, espaco_id, id):
        estornos = [l.id for l in self.lancamentos.values() if l.espaco_id == espaco_id and l.estorno_de == id]
        for estorno in estornos:
            del self.lancamentos[estorno]
        return len(estornos)

    def excluir_compra(self, espaco_id, compra_id):
        parcelas = [l.id for l in self.lancamentos.values() if l.espaco_id == espaco_id and l.compra_id == compra_id]
        for parcela in parcelas:
            del self.lancamentos[parcela]
        return len(parcelas)

    def listar_pessoas(self, espaco_id):
        do_espaco = [l for l in self.lancamentos.values() if l.espaco_id == espaco_id]
        nas_divisoes = {parte.pessoa for l in do_espaco for parte in l.divisao}
        return list(nas_divisoes | {l.responsavel for l in do_espaco if l.responsavel})

    def listar_lancamentos_de_origem(self, espaco_id, tipos):
        gerados = [
            l for l in self.lancamentos.values() if l.espaco_id == espaco_id and l.origem and l.origem.tipo in tipos
        ]
        gerados.sort(key=lambda l: (l.origem.competencia, l.data), reverse=True)
        return [replace(l) for l in gerados]

    # --- Cadastros da empresa ---

    def listar_cadastros(self, cadastro, espaco_id):
        itens = [item for item in self.cadastros[cadastro].values() if item.espaco_id == espaco_id]
        return [deepcopy(item) for item in sorted(itens, key=lambda item: item.criado_em)]

    def buscar_cadastro(self, cadastro, espaco_id, id):
        item = self.cadastros[cadastro].get(id)
        return deepcopy(item) if item and item.espaco_id == espaco_id else None

    def inserir_cadastro(self, cadastro, entidade):
        entidade.id = str(ObjectId())
        self.cadastros[cadastro][entidade.id] = deepcopy(entidade)
        return entidade

    def atualizar_cadastro(self, cadastro, entidade):
        self.cadastros[cadastro][entidade.id] = deepcopy(entidade)
        return entidade

    def excluir_cadastro(self, cadastro, espaco_id, id):
        item = self.cadastros[cadastro].get(id)
        if not item or item.espaco_id != espaco_id:
            return False
        del self.cadastros[cadastro][id]
        return True

    def renomear_pessoa(self, espaco_id, antigo, novo):
        chave = chave_da_pessoa(antigo)
        mudados = 0
        for id, lancamento in list(self.lancamentos.items()):
            if lancamento.espaco_id != espaco_id:
                continue
            responsavel = novo if lancamento.responsavel and chave_da_pessoa(lancamento.responsavel) == chave else None
            divisao = [
                replace(parte, pessoa=novo) if chave_da_pessoa(parte.pessoa) == chave else parte
                for parte in lancamento.divisao
            ]
            if responsavel or divisao != lancamento.divisao:
                self.lancamentos[id] = replace(
                    lancamento, responsavel=responsavel or lancamento.responsavel, divisao=divisao
                )
                mudados += 1
        return mudados

    def buscar_estornos(self, espaco_id, ids):
        return {
            l.estorno_de: l.id
            for l in self.lancamentos.values()
            if l.espaco_id == espaco_id and l.estorno_de in ids
        }

    def chaves_importadas(self, espaco_id, chaves):
        return {
            l.chave_importacao
            for l in self.lancamentos.values()
            if l.espaco_id == espaco_id and l.chave_importacao in chaves
        }

    def somar_partidas_por_conta(self, espaco_id):
        somas = {}
        for lancamento in self.lancamentos.values():
            if lancamento.espaco_id != espaco_id:
                continue
            for partida in lancamento.partidas:
                if partida.conta_id:
                    somas[partida.conta_id] = somas.get(partida.conta_id, 0) + partida.valor_centavos
        return somas

    def somar_categorias_por_mes(self, espaco_id, de, ate, conta_id=None, pessoa=None):
        somas = {}
        for lancamento in self.lancamentos.values():
            if lancamento.espaco_id != espaco_id or not de <= lancamento.data <= ate:
                continue
            if conta_id and lancamento.conta_id != conta_id:
                continue
            if pessoa is not None and not _da_pessoa(lancamento, pessoa):
                continue
            mes = lancamento.data.isoformat()[:7]
            for partida in lancamento.partidas:
                if partida.categoria_id:
                    chave = (mes, lancamento.tipo, partida.categoria_id)
                    somas[chave] = somas.get(chave, 0) + partida.valor_centavos
        return somas

    def somar_contas_por_mes(self, espaco_id, conta_ids, ate):
        somas = {}
        for lancamento in self.lancamentos.values():
            if lancamento.espaco_id != espaco_id or lancamento.data > ate:
                continue
            mes = lancamento.data.isoformat()[:7]
            for partida in lancamento.partidas:
                if partida.conta_id in conta_ids:
                    somas[mes] = somas.get(mes, 0) + partida.valor_centavos
        return somas
