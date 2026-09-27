"""Tokens do back-office revogados antes de vencer (logout).

O JWT se sustenta sozinho: assinatura e "exp" bastam para a API aceitá-lo, e
nada no servidor desliga um token já emitido. Sem esta lista, o logout do
painel só apagava o token do navegador, e uma cópia vazada (XSS, print, log de
proxy) continuava valendo até o "exp". Aqui fica o "jti" de cada token
encerrado, só até a hora em que ele venceria: depois dela, o próprio "exp"
recusa o token e a entrada pode sumir.

Duas implementações do mesmo contrato (Protocol ListaDeRevogacao):
- RevogacaoMongo: coleção tokens_revogados com índice TTL. Vale para todas as
  instâncias da API e sobrevive ao reinício; é a usada em execução.
- RevogacaoEmMemoria: testes e prévias sem banco.
"""

import threading
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Protocol

from pymongo import ASCENDING
from pymongo.database import Database


class ListaDeRevogacao(Protocol):
    def revogar(self, jti: str, expira_em: datetime) -> None: ...

    def revogado(self, jti: str) -> bool: ...


class RevogacaoEmMemoria:
    def __init__(self, relogio: Callable[[], datetime] = lambda: datetime.now(UTC)):
        self._revogados: dict[str, datetime] = {}
        self._relogio = relogio
        # As rotas síncronas do FastAPI rodam em threads.
        self._trava = threading.Lock()

    def revogar(self, jti: str, expira_em: datetime) -> None:
        with self._trava:
            # Os já vencidos saem a cada revogação: a lista nunca passa do
            # número de tokens encerrados que ainda estariam valendo.
            agora = self._relogio()
            for vencido in [chave for chave, expira in self._revogados.items() if expira <= agora]:
                del self._revogados[vencido]
            self._revogados[jti] = expira_em

    def revogado(self, jti: str) -> bool:
        with self._trava:
            return jti in self._revogados


class RevogacaoMongo:
    def __init__(self, banco: Database):
        self._colecao = banco["tokens_revogados"]
        # TTL: o MongoDB apaga o documento sozinho quando "expira_em" passa (a
        # varredura roda a cada minuto; até lá, o "exp" do token já o recusa).
        self._colecao.create_index([("expira_em", ASCENDING)], expireAfterSeconds=0)

    def revogar(self, jti: str, expira_em: datetime) -> None:
        # upsert: revogar duas vezes o mesmo token não falha.
        self._colecao.update_one({"_id": jti}, {"$set": {"expira_em": expira_em}}, upsert=True)

    def revogado(self, jti: str) -> bool:
        # O jti vem de um token com a nossa assinatura já conferida: é sempre
        # o texto que tokens.py gerou, nunca um operador do Mongo.
        return self._colecao.count_documents({"_id": jti}, limit=1) > 0
