"""Limites de uso da API: tentativas de login e tamanho do corpo.

Sem eles, o POST /auth/login (único endpoint público) aceita palpites de senha
sem parar (força bruta), e um corpo de qualquer tamanho chega inteiro à memória
antes de a validação recusar (negação de serviço).
"""

import threading
import time
from collections import deque
from math import ceil

from fastapi import Request
from starlette.exceptions import HTTPException

from app.erros import MENSAGEM_CORPO_GRANDE, ErroMuitasTentativas, problema

# Força bruta: 5 senhas erradas para o mesmo e-mail, vindas do mesmo endereço,
# em 15 minutos, travam esse par até a falha mais antiga sair da janela. O
# limite por endereço (20) pega quem troca de e-mail a cada palpite (credential
# stuffing). O e-mail sozinho não é chave: qualquer um trancaria de propósito
# a conta do administrador.
MAXIMO_POR_EMAIL = 5
MAXIMO_POR_ENDERECO = 20
JANELA_EM_SEGUNDOS = 15 * 60

# Acima disto, as chaves vencidas são varridas de uma vez (memória limitada).
CHAVES_ANTES_DA_LIMPEZA = 10_000

# 2 MiB: folga para o maior corpo legítimo, a importação do extrato (CSV de até
# 500 mil caracteres, modelos.TAMANHO_MAXIMO_DO_CSV, com acentos e aspas).
TAMANHO_MAXIMO_DO_CORPO = 2 * 1024 * 1024


class LimiteDeTentativas:
    """Janela deslizante de falhas de login, em memória.

    Vale para uma instância da API (o docker compose sobe uma só). Com várias
    réplicas, cada uma contaria à parte: aí o contador precisa de um
    armazenamento comum (ex.: coleção no MongoDB com índice TTL).

    As rotas síncronas do FastAPI rodam em threads, daí a trava.
    """

    def __init__(
        self,
        maximo_por_email: int = MAXIMO_POR_EMAIL,
        maximo_por_endereco: int = MAXIMO_POR_ENDERECO,
        janela_em_segundos: int = JANELA_EM_SEGUNDOS,
        relogio=time.monotonic,
    ):
        self.maximo_por_email = maximo_por_email
        self.maximo_por_endereco = maximo_por_endereco
        self.janela = janela_em_segundos
        self._relogio = relogio
        self._falhas: dict[tuple, deque[float]] = {}
        self._trava = threading.Lock()

    def conferir(self, endereco: str, email: str) -> None:
        """Lança ErroMuitasTentativas quando o par ou o endereço está travado.

        Roda antes de conferir a senha, com o e-mail existindo ou não: o 429
        não revela quais e-mails têm conta."""
        with self._trava:
            agora = self._relogio()
            espera = max(
                self._espera(("email", endereco, email), self.maximo_por_email, agora),
                self._espera(("endereco", endereco), self.maximo_por_endereco, agora),
            )
        if espera > 0:
            raise ErroMuitasTentativas(espera)

    def registrar_falha(self, endereco: str, email: str) -> None:
        with self._trava:
            agora = self._relogio()
            if len(self._falhas) > CHAVES_ANTES_DA_LIMPEZA:
                self._varrer(agora)
            for chave in (("email", endereco, email), ("endereco", endereco)):
                self._falhas.setdefault(chave, deque()).append(agora)

    def registrar_sucesso(self, endereco: str, email: str) -> None:
        # Só o par é zerado. Zerar o endereço deixaria quem tem uma conta
        # válida intercalar um login certo e seguir testando outros e-mails.
        with self._trava:
            self._falhas.pop(("email", endereco, email), None)

    def _espera(self, chave: tuple, maximo: int, agora: float) -> int:
        """Segundos até a chave aceitar nova tentativa (0 = liberada)."""
        falhas = self._falhas.get(chave)
        if falhas is None:
            return 0
        while falhas and falhas[0] <= agora - self.janela:
            falhas.popleft()
        if not falhas:
            del self._falhas[chave]
            return 0
        if len(falhas) < maximo:
            return 0
        return max(1, ceil(falhas[0] + self.janela - agora))

    def _varrer(self, agora: float) -> None:
        vencidas = [chave for chave, falhas in self._falhas.items() if falhas[-1] <= agora - self.janela]
        for chave in vencidas:
            del self._falhas[chave]


def obter_limite_de_login(requisicao: Request) -> LimiteDeTentativas:
    return requisicao.app.state.limite_de_login


def endereco_de(requisicao: Request) -> str:
    """IP de quem conectou. O X-Forwarded-For fica de fora de propósito: é
    um cabeçalho que o próprio cliente escreve, e trocá-lo a cada palpite
    furaria o limite."""
    return requisicao.client.host if requisicao.client else "desconhecido"


class LimiteDoCorpo:
    """Middleware ASGI que recusa com 413 o corpo acima do limite.

    O Content-Length declarado é conferido antes de ler qualquer byte. Sem ele
    (envio em partes), os bytes são contados na leitura e a leitura para ao
    passar do limite, antes de o corpo inteiro ocupar a memória.
    """

    def __init__(self, app, maximo: int = TAMANHO_MAXIMO_DO_CORPO):
        self.app = app
        self.maximo = maximo

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declarado = dict(scope["headers"]).get(b"content-length", b"")
        if declarado.isdigit() and int(declarado) > self.maximo:
            await problema(413, MENSAGEM_CORPO_GRANDE, scope["path"])(scope, receive, send)
            return

        recebido = 0

        async def receber_com_limite():
            nonlocal recebido
            mensagem = await receive()
            if mensagem["type"] == "http.request":
                recebido += len(mensagem.get("body", b""))
                if recebido > self.maximo:
                    # O FastAPI repassa o HTTPException levantado na leitura do
                    # corpo, e o tratador de erros.py monta o Problem Details.
                    raise HTTPException(status_code=413)
            return mensagem

        await self.app(scope, receber_com_limite, send)
