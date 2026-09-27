"""Confere, sem mudar nada, o que o Console do Firebase precisa ter para os
links dos e-mails da conta:

- o domínio do APP_URL entre os domínios autorizados do Authentication;
- a "URL de ação personalizada" (Authentication > Modelos) apontando para
  <APP_URL>/auth/acao, a página do app que recebe os links dos e-mails que o
  próprio Firebase manda (quando a API não pode mandar, como no GitHub Pages).

A URL de ação só muda pelo Console: a API de administração recusa a troca em
projeto sem Identity Platform (EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED).

Uso, em api/:  .\\.venv\\Scripts\\python -m app.emails.console
Lê o api/.env e imprime um JSON com os problemas; o "python subir-app.py
verificar" chama este módulo. Nada de segredo sai na tela.
"""

import json
import sys
from urllib.parse import urlsplit

from pydantic import ValidationError

from app.emails.links import FalhaNoFirebase, GeradorDeLinks, ler_credencial

# Página do app que recebe os links do Firebase (web/src/routes.jsx).
PAGINA_DA_ACAO = "/auth/acao"


def problemas_no_console(configuracao: dict, app_url: str) -> list[str]:
    """Diferenças entre a configuração do Authentication e o APP_URL."""
    app_url = app_url.rstrip("/")
    endereco = urlsplit(app_url)
    problemas = []

    dominio = endereco.hostname or ""
    if dominio and dominio not in configuracao.get("authorizedDomains", []):
        problemas.append(
            f"O domínio {dominio} (do APP_URL) não está em Authentication > Configurações > Domínios autorizados."
        )

    publico = endereco.scheme == "https"
    esperada = f"{app_url}{PAGINA_DA_ACAO}" if publico else f"<endereço público do app>{PAGINA_DA_ACAO}"
    acao = configuracao.get("notification", {}).get("sendEmail", {}).get("callbackUri", "")
    if not acao.endswith(PAGINA_DA_ACAO):
        problemas.append(
            f"A URL de ação personalizada ainda é a página padrão do Firebase ({acao or 'vazia'}). "
            f"Troque em Authentication > Modelos > editar um modelo > Personalizar URL de ação: {esperada}"
        )
    elif publico and acao != esperada:
        problemas.append(f"A URL de ação personalizada ({acao}) não é a do APP_URL ({esperada}).")
    return problemas


def conferir(config) -> dict:
    """Resultado para o subir-app: conferido ou não, e os problemas."""
    if not config.firebase_conta_de_servico:
        return {"conferido": False, "motivo": "FIREBASE_CONTA_DE_SERVICO vazio no api/.env."}
    try:
        gerador = GeradorDeLinks(ler_credencial(config.firebase_conta_de_servico))
        configuracao = gerador.configuracao_do_projeto()
    except (ValueError, FalhaNoFirebase) as falha:
        # As duas mensagens nunca levam a chave: ler_credencial fala só do
        # arquivo, e o FalhaNoFirebase traz só o código do Google.
        return {"conferido": False, "motivo": str(falha)}
    return {
        "conferido": True,
        "projeto": gerador.credencial.projeto,
        "problemas": problemas_no_console(configuracao, config.app_url),
    }


def main() -> int:
    from app.config import Configuracoes

    try:
        config = Configuracoes()
    except ValidationError:
        # A mensagem do pydantic repete o valor recusado (pode ser um segredo).
        resultado = {"conferido": False, "motivo": "api/.env inválido: suba a API para ver o erro."}
    else:
        resultado = conferir(config)
    # ASCII puro: o console do Windows (cp1252) não quebra os acentos.
    print(json.dumps(resultado))
    return 0


if __name__ == "__main__":
    sys.exit(main())
