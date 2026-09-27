"""Prévia dos modelos de e-mail, com dados fictícios, para revisar o visual.

Uso, em api/:  .\\.venv\\Scripts\\python -m app.emails.previa <pasta> [endereço do app]
Grava confirmacao.html, nova-senha.html e key.html na pasta; abra no
navegador (e no modo escuro do sistema, para ver a outra paleta). O monograma
vem do endereço do app: com o "npm run dev" no ar, o padrão já o mostra; sem
ele, aparece o texto alternativo, como no Outlook com as imagens bloqueadas.
"""

import sys
from pathlib import Path

from app.emails.mensagens import mensagem_da_key, mensagem_de_confirmacao, mensagem_de_nova_senha

ENDERECO = "http://localhost:5173/ADS-Project"


def gravar_previas(pasta: Path, endereco: str = ENDERECO) -> list[Path]:
    pasta.mkdir(parents=True, exist_ok=True)
    mensagens = {
        "confirmacao": mensagem_de_confirmacao(f"{endereco}/auth/verificar-email#oobCode=CODIGO-DE-EXEMPLO", endereco),
        "nova-senha": mensagem_de_nova_senha(f"{endereco}/auth/redefinir-senha#oobCode=CODIGO-DE-EXEMPLO", endereco),
        "key": mensagem_da_key("PF-7KQ2-M9XA-C4TD", f"{endereco}/cadastro", endereco),
    }
    arquivos = []
    for nome, mensagem in mensagens.items():
        arquivo = pasta / f"{nome}.html"
        arquivo.write_text(mensagem.html, encoding="utf-8")
        arquivos.append(arquivo)
    return arquivos


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3):
        sys.exit("Uso: python -m app.emails.previa <pasta> [endereço do app]")
    for arquivo in gravar_previas(Path(sys.argv[1]), *sys.argv[2:]):
        print(arquivo.resolve())
