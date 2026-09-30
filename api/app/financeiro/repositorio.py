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
from pymongo.collation import Collation
from pymongo.database import Database
from pymongo.errors import DuplicateKeyError

from app.erros import ErroConflito
from app.financeiro.modelos import (
    Categoria,
    Conta,
    CorCategoria,
    CorDoCartao,
    CorDoMembro,
    Espaco,
    Familia,
    FiltroDePessoa,
    Lancamento,
    MeioDePagamento,
    Membro,
    Papel,
    Parte,
    Partida,
    PessoaDaFamilia,
    RegimeTributario,
    TipoCategoria,
    TipoConta,
    TipoEspaco,
    TipoLancamento,
)

MENSAGEM_JA_ESTORNADO = "Este lançamento já foi estornado."

# Compara nomes de pessoa como a tela: sem diferença de caixa nem de acento
# ("Léo" = "leo"). Força 1 da ordenação do português no MongoDB.
MESMO_NOME = Collation(locale="pt", strength=1)


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

    def atualizar_espaco(self, espaco: Espaco) -> Espaco: ...

    def atualizar_familia(self, espaco: Espaco) -> Espaco: ...

    def excluir_espaco(self, id: str) -> bool: ...

    def listar_contas(self, espaco_id: str) -> list[Conta]: ...

    def buscar_conta(self, espaco_id: str, id: str) -> Conta | None: ...

    def inserir_conta(self, conta: Conta) -> Conta: ...

    def atualizar_conta(self, conta: Conta) -> Conta: ...

    def excluir_conta(self, espaco_id: str, id: str) -> bool: ...

    def listar_categorias(self, espaco_id: str) -> list[Categoria]: ...

    def buscar_categoria(self, espaco_id: str, id: str) -> Categoria | None: ...

    def inserir_categorias(self, categorias: list[Categoria]) -> list[Categoria]: ...

    def atualizar_categoria(self, categoria: Categoria) -> Categoria: ...

    def excluir_categoria(self, espaco_id: str, id: str) -> bool: ...

    def contar_lancamentos_da_categoria(self, espaco_id: str, categoria_id: str) -> int: ...

    def listar_lancamentos(
        self, espaco_id: str, de: date | None, ate: date | None, limite: int, conta_id: str | None = None
    ) -> list[Lancamento]: ...

    def buscar_lancamento(self, espaco_id: str, id: str) -> Lancamento | None: ...

    def inserir_lancamento(self, lancamento: Lancamento) -> Lancamento: ...

    def atualizar_lancamento(self, lancamento: Lancamento) -> Lancamento: ...

    def listar_compra(self, espaco_id: str, compra_id: str) -> list[Lancamento]: ...

    def excluir_lancamento(self, espaco_id: str, id: str) -> bool: ...

    def excluir_lancamentos_da_conta(self, espaco_id: str, conta_id: str) -> int: ...

    def excluir_estornos_de(self, espaco_id: str, id: str) -> int: ...

    def excluir_compra(self, espaco_id: str, compra_id: str) -> int: ...

    def buscar_estornos(self, espaco_id: str, ids: list[str]) -> dict[str, str]: ...

    def listar_pessoas(self, espaco_id: str) -> list[str]: ...

    def renomear_pessoa(self, espaco_id: str, antigo: str, novo: str) -> int: ...

    def chaves_importadas(self, espaco_id: str, chaves: list[str]) -> set[str]: ...

    def somar_partidas_por_conta(self, espaco_id: str) -> dict[str, int]: ...

    def somar_categorias_por_mes(
        self, espaco_id: str, de: date, ate: date, conta_id: str | None = None, pessoa: FiltroDePessoa | None = None
    ) -> dict[tuple[str, TipoLancamento, str], int]: ...

    def somar_contas_por_mes(self, espaco_id: str, conta_ids: list[str], ate: date) -> dict[str, int]: ...


def _object_id(id: str) -> ObjectId | None:
    # Id fora do formato do Mongo não existe: vira 404, não erro 500.
    return ObjectId(id) if ObjectId.is_valid(id) else None


# Só os tipos de hoje (pessoal e empresa). Um espaço de família gravado quando
# a família era um tipo à parte fica fora da lista e responde 404: a família
# passou a ser o Modo Família do espaço pessoal. O documento continua no banco.
_TIPOS_ATUAIS = {"tipo": {"$in": [tipo.value for tipo in TipoEspaco]}}


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
        # Extrato de uma conta ou fatura de um cartão.
        self._lancamentos.create_index([("espaco_id", ASCENDING), ("partidas.conta_id", ASCENDING), ("data", DESCENDING)])
        self._lancamentos.create_index(
            [("espaco_id", ASCENDING), ("compra_id", ASCENDING)], partialFilterExpression={"compra_id": {"$type": "string"}}
        )
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
        documento = self._espacos.find_one({"_id": oid, **_TIPOS_ATUAIS}) if oid else None
        return _para_espaco(documento) if documento else None

    def buscar_espaco_pessoal(self, uid: str) -> Espaco | None:
        documento = self._espacos.find_one({"pessoal_de": uid})
        return _para_espaco(documento) if documento else None

    def listar_espacos_do_membro(self, uid: str) -> list[Espaco]:
        documentos = self._espacos.find({"membros.uid": uid, **_TIPOS_ATUAIS}).sort("criado_em", ASCENDING)
        return [_para_espaco(documento) for documento in documentos]

    def inserir_espaco(self, espaco: Espaco) -> Espaco:
        documento = {
            "tipo": espaco.tipo.value,
            "nome": espaco.nome,
            "moeda": espaco.moeda,
            "fuso": espaco.fuso,
            "membros": [{"uid": membro.uid, "papel": membro.papel.value} for membro in espaco.membros],
            "criado_em": espaco.criado_em,
            **_dados_da_empresa(espaco),
        }
        if espaco.pessoal_de:
            documento["pessoal_de"] = espaco.pessoal_de
        try:
            resultado = self._espacos.insert_one(documento)
        except DuplicateKeyError as erro:
            raise EspacoPessoalJaExiste() from erro
        espaco.id = str(resultado.inserted_id)
        return espaco

    def atualizar_espaco(self, espaco: Espaco) -> Espaco:
        self._espacos.update_one(
            {"_id": _object_id(espaco.id)}, {"$set": {"nome": espaco.nome, **_dados_da_empresa(espaco)}}
        )
        return espaco

    def atualizar_familia(self, espaco: Espaco) -> Espaco:
        """Grava o Modo Família inteiro (ligado ou não e as pessoas)."""
        familia = {
            "ativa": espaco.familia.ativa,
            "pessoas": [{"id": p.id, "nome": p.nome, "cor": p.cor.value} for p in espaco.familia.pessoas],
        }
        self._espacos.update_one({"_id": _object_id(espaco.id)}, {"$set": {"familia": familia}})
        return espaco

    def excluir_espaco(self, id: str) -> bool:
        """Apaga o espaço e as categorias dele. Quem chama já conferiu que não
        há contas nem lançamentos (servicos.excluir_espaco)."""
        oid = _object_id(id)
        if not oid:
            return False
        self._categorias.delete_many({"espaco_id": id})
        return self._espacos.delete_one({"_id": oid}).deleted_count == 1

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

    def excluir_conta(self, espaco_id: str, id: str) -> bool:
        oid = _object_id(id)
        return bool(oid) and self._contas.delete_one({"_id": oid, "espaco_id": espaco_id}).deleted_count == 1

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

    def excluir_categoria(self, espaco_id: str, id: str) -> bool:
        oid = _object_id(id)
        return bool(oid) and self._categorias.delete_one({"_id": oid, "espaco_id": espaco_id}).deleted_count == 1

    def contar_lancamentos_da_categoria(self, espaco_id: str, categoria_id: str) -> int:
        return self._lancamentos.count_documents({"espaco_id": espaco_id, "categoria_id": categoria_id})

    # --- Lançamentos ---

    def listar_lancamentos(
        self, espaco_id: str, de: date | None, ate: date | None, limite: int, conta_id: str | None = None
    ) -> list[Lancamento]:
        filtro: dict = {"espaco_id": espaco_id}
        # A conta aparece nas partidas tanto como origem quanto como destino.
        if conta_id:
            filtro["partidas.conta_id"] = conta_id
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
            **_campos_editaveis(lancamento),
            "conta_id": lancamento.conta_id,
            "conta_destino_id": lancamento.conta_destino_id,
            "criado_em": lancamento.criado_em,
            "criado_por": lancamento.criado_por,
        }
        if lancamento.estorno_de:
            documento["estorno_de"] = lancamento.estorno_de
        if lancamento.chave_importacao:
            documento["chave_importacao"] = lancamento.chave_importacao
        if lancamento.divisao:
            documento["divisao"] = [
                {"pessoa": parte.pessoa, "valor_centavos": parte.valor_centavos} for parte in lancamento.divisao
            ]
        if lancamento.responsavel:
            documento["responsavel"] = lancamento.responsavel
        if lancamento.compra_id:
            documento["compra_id"] = lancamento.compra_id
            documento["parcela"] = lancamento.parcela
            documento["parcelas"] = lancamento.parcelas
        if lancamento.chave_parcelamento:
            documento["chave_parcelamento"] = lancamento.chave_parcelamento
        if lancamento.meio:
            documento["meio"] = lancamento.meio.value
        try:
            lancamento.id = str(self._lancamentos.insert_one(documento).inserted_id)
        except DuplicateKeyError as erro:
            # Dois índices únicos na coleção: o keyPattern diz qual barrou.
            if "chave_importacao" in (erro.details or {}).get("keyPattern", {}):
                raise LancamentoJaImportado() from erro
            raise ErroConflito(MENSAGEM_JA_ESTORNADO) from erro
        return lancamento

    def atualizar_lancamento(self, lancamento: Lancamento) -> Lancamento:
        """Grava o que a edição muda (descrição, data, valor, categoria,
        partidas, meio e responsável) e a chave de importação de uma parcela prevista que
        a fatura do banco confirmou. O resto não muda depois de lançado."""
        definir = _campos_editaveis(lancamento)
        remover = {}
        opcionais = (
            ("meio", lancamento.meio),
            ("responsavel", lancamento.responsavel),
            ("chave_importacao", lancamento.chave_importacao),
        )
        for campo, valor in opcionais:
            if valor is None:
                remover[campo] = ""
            else:
                definir[campo] = valor.value if isinstance(valor, MeioDePagamento) else valor
        mudancas = {"$set": definir, **({"$unset": remover} if remover else {})}
        try:
            self._lancamentos.update_one({"_id": ObjectId(lancamento.id), "espaco_id": lancamento.espaco_id}, mudancas)
        except DuplicateKeyError as erro:
            raise LancamentoJaImportado() from erro
        return lancamento

    def listar_compra(self, espaco_id: str, compra_id: str) -> list[Lancamento]:
        """As parcelas de uma compra no cartão, da primeira à última."""
        documentos = self._lancamentos.find({"espaco_id": espaco_id, "compra_id": compra_id}).sort("parcela", ASCENDING)
        return [_para_lancamento(documento) for documento in documentos]

    def excluir_lancamento(self, espaco_id: str, id: str) -> bool:
        oid = _object_id(id)
        return bool(oid) and self._lancamentos.delete_one({"_id": oid, "espaco_id": espaco_id}).deleted_count == 1

    def excluir_lancamentos_da_conta(self, espaco_id: str, conta_id: str) -> int:
        """Todos os lançamentos que mexem na conta (origem ou destino)."""
        return self._lancamentos.delete_many({"espaco_id": espaco_id, "partidas.conta_id": conta_id}).deleted_count

    def excluir_estornos_de(self, espaco_id: str, id: str) -> int:
        return self._lancamentos.delete_many({"espaco_id": espaco_id, "estorno_de": id}).deleted_count

    def excluir_compra(self, espaco_id: str, compra_id: str) -> int:
        """Todas as parcelas de uma compra no cartão."""
        return self._lancamentos.delete_many({"espaco_id": espaco_id, "compra_id": compra_id}).deleted_count

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

    def listar_pessoas(self, espaco_id: str) -> list[str]:
        """Nomes já usados em divisões e como responsável no espaço, sem
        repetição exata."""
        filtro = {"espaco_id": espaco_id}
        nomes = self._lancamentos.distinct("divisao.pessoa", filtro) + self._lancamentos.distinct("responsavel", filtro)
        return list(dict.fromkeys(nomes))

    def renomear_pessoa(self, espaco_id: str, antigo: str, novo: str) -> int:
        """Troca o nome de uma pessoa nos lançamentos do espaço, como
        responsável e nas partes das divisões (sem diferença de caixa nem de
        acento). Devolve quantos lançamentos mudaram."""
        responsavel = self._lancamentos.update_many(
            {"espaco_id": espaco_id, "responsavel": antigo}, {"$set": {"responsavel": novo}}, collation=MESMO_NOME
        )
        divisao = self._lancamentos.update_many(
            {"espaco_id": espaco_id, "divisao.pessoa": antigo},
            {"$set": {"divisao.$[parte].pessoa": novo}},
            array_filters=[{"parte.pessoa": antigo}],
            collation=MESMO_NOME,
        )
        return responsavel.modified_count + divisao.modified_count

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

    # --- Relatórios ---
    # Somas feitas pelo banco ($group), sem trazer os lançamentos: o relatório
    # de um ano não esbarra no teto da listagem nem enche a memória da API.
    # O mês é o prefixo AAAA-MM do texto da data, sem conta de fuso.

    def somar_categorias_por_mes(
        self, espaco_id: str, de: date, ate: date, conta_id: str | None = None, pessoa: FiltroDePessoa | None = None
    ) -> dict[tuple[str, TipoLancamento, str], int]:
        """{(mês, tipo do lançamento, categoria): soma das partidas de
        categoria} no período. Transferência não tem partida de categoria e
        fica de fora. Com conta_id, só os lançamentos daquela conta (a de
        origem: numa receita ou despesa, a única). Com pessoa, só os
        lançamentos dela (do titular: os sem responsável)."""
        filtro: dict = {"espaco_id": espaco_id, "data": {"$gte": de.isoformat(), "$lte": ate.isoformat()}}
        if conta_id:
            filtro["conta_id"] = conta_id
        if pessoa is not None:
            # None no filtro do MongoDB acha o campo ausente: o lançamento sem
            # responsável é do titular.
            filtro["responsavel"] = pessoa.nome
        grupos = self._lancamentos.aggregate(
            [
                {"$match": filtro},
                {"$unwind": "$partidas"},
                {"$match": {"partidas.categoria_id": {"$type": "string"}}},
                {
                    "$group": {
                        "_id": {
                            "mes": {"$substrCP": ["$data", 0, 7]},
                            "tipo": "$tipo",
                            "categoria_id": "$partidas.categoria_id",
                        },
                        "total": {"$sum": "$partidas.valor_centavos"},
                    }
                },
            ],
            # A comparação sem acento só com o nome de uma pessoa: com ela, o
            # banco não usa o índice de espaco_id e data para o texto.
            collation=MESMO_NOME if pessoa is not None and pessoa.nome else None,
        )
        return {
            (grupo["_id"]["mes"], TipoLancamento(grupo["_id"]["tipo"]), grupo["_id"]["categoria_id"]): grupo["total"]
            for grupo in grupos
        }

    def somar_contas_por_mes(self, espaco_id: str, conta_ids: list[str], ate: date) -> dict[str, int]:
        """{mês: soma das partidas das contas pedidas}, de todo o histórico
        até a data. Transferência entre duas das contas pedidas se anula."""
        filtro = {"espaco_id": espaco_id, "data": {"$lte": ate.isoformat()}, "partidas.conta_id": {"$in": conta_ids}}
        grupos = self._lancamentos.aggregate(
            [
                {"$match": filtro},
                {"$unwind": "$partidas"},
                {"$match": {"partidas.conta_id": {"$in": conta_ids}}},
                {"$group": {"_id": {"$substrCP": ["$data", 0, 7]}, "total": {"$sum": "$partidas.valor_centavos"}}},
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
        cnpj=documento.get("cnpj"),
        regime=RegimeTributario(documento["regime"]) if documento.get("regime") else None,
        familia=_para_familia(documento.get("familia")),
    )


def _para_familia(documento: dict | None) -> Familia:
    if not documento:
        return Familia()
    return Familia(
        ativa=documento["ativa"],
        pessoas=[PessoaDaFamilia(id=p["id"], nome=p["nome"], cor=CorDoMembro(p["cor"])) for p in documento["pessoas"]],
    )


def _dados_da_empresa(espaco: Espaco) -> dict:
    """CNPJ e regime, só no documento da empresa."""
    if espaco.tipo != TipoEspaco.PJ:
        return {}
    return {"cnpj": espaco.cnpj, "regime": espaco.regime.value if espaco.regime else None}


def _documento_da_conta(conta: Conta) -> dict:
    documento = {
        "espaco_id": conta.espaco_id,
        "nome": conta.nome,
        "tipo": conta.tipo.value,
        "saldo_inicial_centavos": conta.saldo_inicial_centavos,
        "ativa": conta.ativa,
        "criada_em": conta.criada_em,
    }
    if conta.cartao:
        documento["limite_centavos"] = conta.limite_centavos
        documento["dia_fechamento"] = conta.dia_fechamento
        documento["dia_vencimento"] = conta.dia_vencimento
        documento["cor"] = (conta.cor or CorDoCartao.GRAFITE).value
    return documento


def _para_conta(documento: dict) -> Conta:
    return Conta(
        id=str(documento["_id"]),
        espaco_id=documento["espaco_id"],
        nome=documento["nome"],
        tipo=TipoConta(documento["tipo"]),
        saldo_inicial_centavos=documento["saldo_inicial_centavos"],
        ativa=documento["ativa"],
        criada_em=documento["criada_em"],
        limite_centavos=documento.get("limite_centavos"),
        dia_fechamento=documento.get("dia_fechamento"),
        dia_vencimento=documento.get("dia_vencimento"),
        # Cartão gravado antes da cor existir sai grafite.
        cor=CorDoCartao(documento.get("cor", CorDoCartao.GRAFITE)) if documento["tipo"] == TipoConta.CARTAO_CREDITO else None,
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
        divisao=[Parte(p["pessoa"], p["valor_centavos"]) for p in documento.get("divisao", [])],
        responsavel=documento.get("responsavel"),
        compra_id=documento.get("compra_id"),
        parcela=documento.get("parcela"),
        parcelas=documento.get("parcelas"),
        chave_parcelamento=documento.get("chave_parcelamento"),
        meio=MeioDePagamento(documento["meio"]) if documento.get("meio") else None,
    )


def _campos_editaveis(lancamento: Lancamento) -> dict:
    """Os campos que a edição pode mudar, no formato do documento."""
    return {
        "descricao": lancamento.descricao,
        "data": lancamento.data.isoformat(),
        "valor_centavos": lancamento.valor_centavos,
        "categoria_id": lancamento.categoria_id,
        "partidas": [
            {"conta_id": p.conta_id, "categoria_id": p.categoria_id, "valor_centavos": p.valor_centavos}
            for p in lancamento.partidas
        ],
    }
