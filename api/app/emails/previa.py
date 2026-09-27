"""Prévia dos modelos de e-mail, com dados fictícios, para revisar o visual.

Uso, em api/:  .\\.venv\\Scripts\\python -m app.emails.previa <pasta>
Grava confirmacao.html, nova-senha.html e key.html na pasta; abra no
navegador (e no modo escuro do sistema, para ver a outra paleta).
"""

import sys
from pathlib import Path

from app.emails.mensagens import mensagem_da_key, mensagem_de_confirmacao, mensagem_de_nova_senha

ENDERECO = "https://app.exemplo.com"


def gravar_previas(pasta: Path) -> list[Path]:
    pasta.mkdir(parents=True, exist_ok=True)
    mensagens = {
        "confirmacao": mensagem_de_confirmacao(f"{ENDERECO}/auth/verificar-email#oobCode=CODIGO-DE-EXEMPLO"),
        "nova-senha": mensagem_de_nova_senha(f"{ENDERECO}/auth/redefinir-senha#oobCode=CODIGO-DE-EXEMPLO"),
        "key": mensagem_da_key("PF-7KQ2-M9XA-C4TD", f"{ENDERECO}/cadastro"),
    }
    arquivos = []
    for nome, mensagem in mensagens.items():
        arquivo = pasta / f"{nome}.html"
        arquivo.write_text(mensagem.html, encoding="utf-8")
        arquivos.append(arquivo)
    return arquivos


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Uso: python -m app.emails.previa <pasta>")
    for arquivo in gravar_previas(Path(sys.argv[1])):
        print(arquivo.resolve())
