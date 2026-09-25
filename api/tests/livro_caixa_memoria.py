"""Mesmo contrato do LivroCaixaMongo, guardando tudo em dicionários.

Reproduz as garantias que no MongoDB vêm dos índices únicos: um espaço
pessoal por pessoa, um estorno por lançamento e uma chave de importação por
espaço.
"""

from dataclasses import replace

from bson import ObjectId

from app.erros import ErroConflito
from app.financeiro.repositorio import MENSAGEM_JA_ESTORNADO, EspacoPessoalJaExiste, LancamentoJaImportado


def _copia(entidade):
    return replace(entidade) if entidade else None


class LivroCaixaMemoria:
    def __init__(self):
        self.espacos = {}
        self.contas = {}
        self.categorias = {}
        self.lancamentos = {}

    # --- Espaços ---

    def buscar_espaco(self, id):
        return _copia(self.espacos.get(id))

    def buscar_espaco_pessoal(self, uid):
        return next((replace(e) for e in self.espacos.values() if e.pessoal_de == uid), None)

    def listar_espacos_do_membro(self, uid):
        espacos = [e for e in self.espacos.values() if e.papel_de(uid)]
        return [replace(e) for e in sorted(espacos, key=lambda e: e.criado_em)]

    def inserir_espaco(self, espaco):
        if espaco.pessoal_de and self.buscar_espaco_pessoal(espaco.pessoal_de):
            raise EspacoPessoalJaExiste()
        espaco.id = str(ObjectId())
        self.espacos[espaco.id] = replace(espaco)
        return espaco

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

    # --- Lançamentos ---

    def listar_lancamentos(self, espaco_id, de, ate, limite):
        lancamentos = [
            l
            for l in self.lancamentos.values()
            if l.espaco_id == espaco_id and (de is None or l.data >= de) and (ate is None or l.data <= ate)
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
        lancamento.id = str(ObjectId())
        self.lancamentos[lancamento.id] = replace(lancamento, estornado_por=None)
        return lancamento

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

    def listar_pessoas(self, espaco_id):
        return list(
            {parte.pessoa for l in self.lancamentos.values() if l.espaco_id == espaco_id for parte in l.divisao}
        )

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
