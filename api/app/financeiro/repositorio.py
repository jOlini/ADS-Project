"""Persistência do livro-caixa no MongoDB.

Cada lançamento é um documento com as partidas embutidas. Gravar um documento
é atômico no MongoDB: as duas partidas entram juntas ou nenhuma entra, sem
precisar de transação entre documentos (que exigiria replica set).

Toda consulta leva o espaco_id. Um id de conta, categoria ou lançamento de
outro espaço simplesmente não é encontrado.
"""

from datetime import date
from typing import Protocol

from bson import ObjectId
from pymongo import ASCENDING, DESCENDING
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.erros import ErroConflito
from app.financeiro.modelos import (
    Categoria,
    Conta,
    CorCategoria,
    Espaco,
    Lancamento,
    Membro,
    Papel,
    Partida,
    TipoCategoria,
    TipoConta,
    TipoEspaco,
    TipoLancamento,
)

MENSAGEM_JA_ESTORNADO = "Este lançamento já foi estornado."


class EspacoPessoalJaExiste(Exception):
    """Duas requisições tentaram criar o mesmo espaço pessoal ao mesmo tempo."""


class LancamentoJaImportado(Exception):
    """A linha do extrato já virou lançamento neste espaço (mesma chave de
    importação), por exemplo em duas importações simultâneas do mesmo arquivo."""


class RepositorioLivroCaixa(Protocol):
    def buscar_espaco(self, id: str) -> Espaco | None: ...

    def buscar_espaco_pessoal(self, uid: str) -> Espaco | None: ...

    def listar_espacos_do_membro(self, uid: str) -> list[Espaco]: ...

    def inserir_espaco(self, espaco: Espaco) -> Espaco: ...

    def listar_contas(self, espaco_id: str) -> list[Conta]: ...

    def buscar_conta(self, espaco_id: str, id: str) -> Conta | None: ...

    def inserir_conta(self, conta: Conta) -> Conta: ...

    def atualizar_conta(self, conta: Conta) -> Conta: ...

    def listar_categorias(self, espaco_id: str) -> list[Categoria]: ...

    def buscar_categoria(self, espaco_id: str, id: str) -> Categoria | None: ...

    def inserir_categorias(self, categorias: list[Categoria]) -> list[Categoria]: ...

    def atualizar_categoria(self, categoria: Categoria) -> Categoria: ...

    def listar_lancamentos(self, espaco_id: str, de: date | None, ate: date | None, limite: int) -> list[Lancamento]: ...

    def buscar_lancamento(self, espaco_id: str, id: str) -> Lancamento | None: ...

    def inserir_lancamento(self, lancamento: Lancamento) -> Lancamento: ...

    def buscar_estornos(self, espaco_id: str, ids: list[str]) -> dict[str, str]: ...

    def chaves_importadas(self, espaco_id: str, chaves: list[str]) -> set[str]: ...

    def somar_partidas_por_conta(self, espaco_id: str) -> dict[str, int]: ...


def _object_id(id: str) -> ObjectId | None:
    # Id fora do formato do Mongo não existe: vira 404, não erro 500.
    return ObjectId(id) if ObjectId.is_valid(id) else None


class LivroCaixaMongo:
    def __init__(self, banco: Database):
        self._espacos = banco["espacos"]
        self._contas = banco["contas"]
        self._categorias = banco["categorias"]
        self._lancamentos = banco["lancamentos"]

        # Um espaço pessoal por pessoa, mesmo com dois primeiros acessos juntos.
        self._espacos.create_index(
            "pessoal_de", unique=True, partialFilterExpression={"pessoal_de": {"$type": "string"}}
        )
        self._espacos.create_index("membros.uid")
        self._contas.create_index([("espaco_id", ASCENDING), ("criada_em", ASCENDING)])
        self._categorias.create_index([("espaco_id", ASCENDING), ("tipo", ASCENDING), ("nome", ASCENDING)])
        self._lancamentos.create_index([("espaco_id", ASCENDING), ("data", DESCENDING), ("criado_em", DESCENDING)])
        # Um lançamento só pode ser estornado uma vez. A checagem do serviço dá
        # a mensagem; o índice é a garantia contra dois estornos simultâneos.
        self._lancamentos.create_index(
            "estorno_de", unique=True, partialFilterExpression={"estorno_de": {"$type": "string"}}
        )
        # Uma linha de extrato vira no máximo um lançamento por espaço. O serviço
        # pula as chaves conhecidas; o índice segura duas importações ao mesmo tempo.
        self._lancamentos.create_index(
            [("espaco_id", ASCENDING), ("chave_importacao", ASCENDING)],
            unique=True,
            partialFilterExpression={"chave_importacao": {"$type": "string"}},
        )

    # --- Espaços ---

    def buscar_espaco(self, id: str) -> Espaco | None:
        oid = _object_id(id)
        documento = self._espacos.find_one({"_id": oid}) if oid else None
        return _para_espaco(documento) if documento else None

    def buscar_espaco_pessoal(self, uid: str) -> Espaco | None:
        documento = self._espacos.find_one({"pessoal_de": uid})
        return _para_espaco(documento) if documento else None

    def listar_espacos_do_membro(self, uid: str) -> list[Espaco]:
        documentos = self._espacos.find({"membros.uid": uid}).sort("criado_em", ASCENDING)
        return [_para_espaco(documento) for documento in documentos]

    def inserir_espaco(self, espaco: Espaco) -> Espaco:
        documento = {
            "tipo": espaco.tipo.value,
            "nome": espaco.nome,
            "moeda": espaco.moeda,
            "fuso": espaco.fuso,
            "membros": [{"uid": membro.uid, "papel": membro.papel.value} for membro in espaco.membros],
            "criado_em": espaco.criado_em,
        }
        if espaco.pessoal_de:
            documento["pessoal_de"] = espaco.pessoal_de
        try:
            resultado = self._espacos.insert_one(documento)
        except DuplicateKeyError as erro:
            raise EspacoPessoalJaExiste() from erro
        espaco.id = str(resultado.inserted_id)
        return espaco

    # --- Contas ---

    def listar_contas(self, espaco_id: str) -> list[Conta]:
        documentos = self._contas.find({"espaco_id": espaco_id}).sort("criada_em", ASCENDING)
        return [_para_conta(documento) for documento in documentos]

    def buscar_conta(self, espaco_id: str, id: str) -> Conta | None:
        oid = _object_id(id)
        documento = self._contas.find_one({"_id": oid, "espaco_id": espaco_id}) if oid else None
        return _para_conta(documento) if documento else None

    def inserir_conta(self, conta: Conta) -> Conta:
        conta.id = str(self._contas.insert_one(_documento_da_conta(conta)).inserted_id)
        return conta

    def atualizar_conta(self, conta: Conta) -> Conta:
        self._contas.replace_one({"_id": ObjectId(conta.id), "espaco_id": conta.espaco_id}, _documento_da_conta(conta))
        return conta

    # --- Categorias ---

    def listar_categorias(self, espaco_id: str) -> list[Categoria]:
        documentos = self._categorias.find({"espaco_id": espaco_id}).sort([("tipo", ASCENDING), ("nome", ASCENDING)])
        return [_para_categoria(documento) for documento in documentos]

    def buscar_categoria(self, espaco_id: str, id: str) -> Categoria | None:
        oid = _object_id(id)
        documento = self._categorias.find_one({"_id": oid, "espaco_id": espaco_id}) if oid else None
        return _para_categoria(documento) if documento else None

    def inserir_categorias(self, categorias: list[Categoria]) -> list[Categoria]:
        resultado = self._categorias.insert_many([_documento_da_categoria(categoria) for categoria in categorias])
        for categoria, id in zip(categorias, resultado.inserted_ids, strict=True):
            categoria.id = str(id)
        return categorias

    def atualizar_categoria(self, categoria: Categoria) -> Categoria:
        self._categorias.replace_one(
            {"_id": ObjectId(categoria.id), "espaco_id": categoria.espaco_id}, _documento_da_categoria(categoria)
        )
        return categoria

    # --- Lançamentos ---

    def listar_lancamentos(self, espaco_id: str, de: date | None, ate: date | None, limite: int) -> list[Lancamento]:
        filtro: dict = {"espaco_id": espaco_id}
        # A data fica gravada como texto AAAA-MM-DD: a ordem do texto é a ordem
        # das datas, então $gte/$lte e a ordenação funcionam direto.
        periodo = {}
        if de:
            periodo["$gte"] = de.isoformat()
        if ate:
            periodo["$lte"] = ate.isoformat()
        if periodo:
            filtro["data"] = periodo
        documentos = (
            self._lancamentos.find(filtro)
            .sort([("data", DESCENDING), ("criado_em", DESCENDING), ("_id", DESCENDING)])
            .limit(limite)
        )
        return [_para_lancamento(documento) for documento in documentos]

    def buscar_lancamento(self, espaco_id: str, id: str) -> Lancamento | None:
        oid = _object_id(id)
        documento = self._lancamentos.find_one({"_id": oid, "espaco_id": espaco_id}) if oid else None
        return _para_lancamento(documento) if documento else None

    def inserir_lancamento(self, lancamento: Lancamento) -> Lancamento:
        documento = {
            "espaco_id": lancamento.espaco_id,
            "tipo": lancamento.tipo.value,
            "descricao": lancamento.descricao,
            "data": lancamento.data.isoformat(),
            "valor_centavos": lancamento.valor_centavos,
            "conta_id": lancamento.conta_id,
            "categoria_id": lancamento.categoria_id,
            "conta_destino_id": lancamento.conta_destino_id,
            "partidas": [
                {"conta_id": p.conta_id, "categoria_id": p.categoria_id, "valor_centavos": p.valor_centavos}
                for p in lancamento.partidas
            ],
            "criado_em": lancamento.criado_em,
            "criado_por": lancamento.criado_por,
        }
        if lancamento.estorno_de:
            documento["estorno_de"] = lancamento.estorno_de
        if lancamento.chave_importacao:
            documento["chave_importacao"] = lancamento.chave_importacao
        try:
            lancamento.id = str(self._lancamentos.insert_one(documento).inserted_id)
        except DuplicateKeyError as erro:
            # Dois índices únicos na coleção: o keyPattern diz qual barrou.
            if "chave_importacao" in (erro.details or {}).get("keyPattern", {}):
                raise LancamentoJaImportado() from erro
            raise ErroConflito(MENSAGEM_JA_ESTORNADO) from erro
        return lancamento

    def buscar_estornos(self, espaco_id: str, ids: list[str]) -> dict[str, str]:
        """{id do lançamento original: id do estorno}, para os ids pedidos."""
        documentos = self._lancamentos.find(
            {"espaco_id": espaco_id, "estorno_de": {"$in": ids}}, {"_id": 1, "estorno_de": 1}
        )
        return {documento["estorno_de"]: str(documento["_id"]) for documento in documentos}

    def chaves_importadas(self, espaco_id: str, chaves: list[str]) -> set[str]:
        """As chaves pedidas que já viraram lançamento neste espaço."""
        documentos = self._lancamentos.find(
            {"espaco_id": espaco_id, "chave_importacao": {"$in": chaves}}, {"_id": 0, "chave_importacao": 1}
        )
        return {documento["chave_importacao"] for documento in documentos}

    def somar_partidas_por_conta(self, espaco_id: str) -> dict[str, int]:
        """{id da conta: soma das partidas}. O banco soma inteiros de 64 bits,
        sem passar por float."""
        grupos = self._lancamentos.aggregate(
            [
                {"$match": {"espaco_id": espaco_id}},
                {"$unwind": "$partidas"},
                {"$match": {"partidas.conta_id": {"$type": "string"}}},
                {"$group": {"_id": "$partidas.conta_id", "total": {"$sum": "$partidas.valor_centavos"}}},
            ]
        )
        return {grupo["_id"]: grupo["total"] for grupo in grupos}


# --- Conversão documento <-> entidade ------------------------------------------


def _para_espaco(documento: dict) -> Espaco:
    return Espaco(
        id=str(documento["_id"]),
        tipo=TipoEspaco(documento["tipo"]),
        nome=documento["nome"],
        moeda=documento["moeda"],
        fuso=documento["fuso"],
        membros=[Membro(uid=m["uid"], papel=Papel(m["papel"])) for m in documento["membros"]],
        criado_em=documento["criado_em"],
        pessoal_de=documento.get("pessoal_de"),
    )


def _documento_da_conta(conta: Conta) -> dict:
    return {
        "espaco_id": conta.espaco_id,
        "nome": conta.nome,
        "tipo": conta.tipo.value,
        "saldo_inicial_centavos": conta.saldo_inicial_centavos,
        "ativa": conta.ativa,
        "criada_em": conta.criada_em,
    }


def _para_conta(documento: dict) -> Conta:
    return Conta(
        id=str(documento["_id"]),
        espaco_id=documento["espaco_id"],
        nome=documento["nome"],
        tipo=TipoConta(documento["tipo"]),
        saldo_inicial_centavos=documento["saldo_inicial_centavos"],
        ativa=documento["ativa"],
        criada_em=documento["criada_em"],
    )


def _documento_da_categoria(categoria: Categoria) -> dict:
    return {
        "espaco_id": categoria.espaco_id,
        "nome": categoria.nome,
        "tipo": categoria.tipo.value,
        "cor": categoria.cor.value,
        "ativa": categoria.ativa,
        "criada_em": categoria.criada_em,
    }


def _para_categoria(documento: dict) -> Categoria:
    return Categoria(
        id=str(documento["_id"]),
        espaco_id=documento["espaco_id"],
        nome=documento["nome"],
        tipo=TipoCategoria(documento["tipo"]),
        cor=CorCategoria(documento["cor"]),
        ativa=documento["ativa"],
        criada_em=documento["criada_em"],
    )


def _para_lancamento(documento: dict) -> Lancamento:
    return Lancamento(
        id=str(documento["_id"]),
        espaco_id=documento["espaco_id"],
        tipo=TipoLancamento(documento["tipo"]),
        descricao=documento["descricao"],
        data=date.fromisoformat(documento["data"]),
        valor_centavos=documento["valor_centavos"],
        conta_id=documento["conta_id"],
        categoria_id=documento.get("categoria_id"),
        conta_destino_id=documento.get("conta_destino_id"),
        partidas=[
            Partida(p["valor_centavos"], conta_id=p.get("conta_id"), categoria_id=p.get("categoria_id"))
            for p in documento["partidas"]
        ],
        criado_em=documento["criado_em"],
        criado_por=documento["criado_por"],
        estorno_de=documento.get("estorno_de"),
        chave_importacao=documento.get("chave_importacao"),
    )
