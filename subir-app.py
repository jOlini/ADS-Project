#!/usr/bin/env python3
"""
Pessoal Finance (ADS-Project) — helper de inicialização local.

    python subir-app.py up                  sobe o ambiente (detalhes abaixo)
    python subir-app.py status              mostra o que está no ar e os links importantes
    python subir-app.py testes              roda lint e testes da API e do front-end
    python subir-app.py down                derruba o ambiente (os dados do banco ficam)
    python subir-app.py tunnel start        abre um endereço público temporário (Cloudflare)
    python subir-app.py tunnel stop         fecha esse endereço (o app volta a ser só local)

"up" faz, nesta ordem:
    0. Configuração: cria o api/.env a partir do api/.env.example, com JWT_SECRET
       e ADMIN_SENHA aleatórios, se ele ainda não existir. Copia o projeto
       Firebase do web/.env quando o FIREBASE_PROJECT_ID está vazio. Avisa se
       falta o web/.env.
    1. Ambiente virtual: cria o api/.venv e instala o requirements-dev.txt nele,
       nunca no Python da máquina. Se nada mudou desde a última vez, não reinstala.
       Precisa de Python 3.11+: procura um na máquina (lançador "py" no Windows),
       instala o 3.13 pelo winget se faltar e, sem conseguir, explica como
       atualizar. Um .venv que não roda ou de Python antigo é recriado.
    2. Dependências do front-end: "npm ci" em web/ quando o node_modules falta ou
       o package-lock.json mudou.
    3. Docker: abre o Docker Desktop se ele estiver fechado (Windows) e baixa uma a
       uma as imagens de base, com até 3 tentativas. Imagem já presente é pulada.
    4. Containers: "docker compose up -d --build" (MongoDB + API) e espera os
       healthchecks.
    5. Front-end: sobe o Vite em segundo plano na porta 5173, aberto para a rede
       local (--host 0.0.0.0): celular e outros computadores da mesma rede
       abrem o app pelo IP desta máquina. Se já estiver no ar, reaproveita.
    6. Painel: imprime os links importantes, os endereços Local e Network (rede
       local) e como entrar no painel administrativo.

"tunnel start" abre um Quick Tunnel da Cloudflare (sem conta) para a área do
cliente e mostra o endereço público temporário (*.trycloudflare.com), que muda a
cada início. A API entra pelo proxy do Vite, só nas rotas do cliente
(web/vite.config.js). Usa o cloudflared do PATH ou baixa o oficial para
.subir-app/. "tunnel stop" encerra o cloudflared; o "down" também.

Só usa a biblioteca padrão: roda com o Python do sistema, antes do ".venv",
mesmo que ele seja antigo demais para a API (ex.: 3.10).
Idempotente: rodar de novo com tudo no ar apenas confirma o estado e reimprime
o painel.

Código de saída: 0 = sucesso; 1 = alguma etapa falhou.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import secrets
import shutil
import socket
import subprocess
import sys
import tarfile
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parent
PASTA_API = RAIZ / "api"
PASTA_WEB = RAIZ / "web"

ENV_API = PASTA_API / ".env"
MODELO_ENV_API = PASTA_API / ".env.example"
ENV_WEB = PASTA_WEB / ".env"

PASTA_VENV = PASTA_API / ".venv"
ARQUIVO_REQUISITOS = PASTA_API / "requirements-dev.txt"
# Marca o que foi instalado no .venv: evita reinstalar a cada subida.
MARCA_REQUISITOS = PASTA_VENV / ".requisitos.sha256"
# A API usa StrEnum e datetime.UTC, que chegaram no Python 3.11. O CI e o
# Docker usam o 3.13: é o preferido no .venv e o instalado quando falta um.
PYTHON_MINIMO = (3, 11)
PYTHON_RECOMENDADO = (3, 13)

PACKAGE_LOCK = PASTA_WEB / "package-lock.json"
NODE_MODULES = PASTA_WEB / "node_modules"
MARCA_NODE_MODULES = NODE_MODULES / ".package-lock.sha256"
NODE_MINIMO = 20

# PID e log do Vite em segundo plano. A pasta está no .gitignore.
PASTA_ESTADO = RAIZ / ".subir-app"
ESTADO_WEB = PASTA_ESTADO / "web.json"
LOG_WEB = PASTA_ESTADO / "web.log"
# Túnel da Cloudflare: PID, endereço, log e o cloudflared baixado, na mesma pasta.
ESTADO_TUNEL = PASTA_ESTADO / "tunel.json"
LOG_TUNEL = PASTA_ESTADO / "cloudflared.log"

PORTA_API = 8081
PORTA_WEB = 5173
URL_API = f"http://localhost:{PORTA_API}"
CAMINHO_WEB = "/ADS-Project/"
URL_WEB = f"http://localhost:{PORTA_WEB}{CAMINHO_WEB}"
# O Vite escuta em todas as interfaces: a área do cliente abre pelo IP desta
# máquina em qualquer aparelho da mesma rede.
HOST_DA_REDE = "0.0.0.0"
# Texto do <title> da área do cliente: confirma que a porta é mesmo deste projeto.
# Lido do web/index.html, e não fixo aqui, para acompanhar a troca de marca: com o
# título fixo, a mudança para "OliFine" fez o script derrubar um Vite saudável.
_TITULO = re.search(r"<title>\s*(.*?)\s*</title>", (PASTA_WEB / "index.html").read_text(encoding="utf-8"), re.DOTALL)
MARCA_DO_APP = _TITULO.group(1) if _TITULO else "OliFine"

REPOSITORIO_PADRAO = "https://github.com/jOlini/ADS-Project"
CAMINHO_DOCKER_DESKTOP = Path(os.environ.get("ProgramFiles", r"C:\Program Files")) / "Docker" / "Docker" / "Docker Desktop.exe"

TENTATIVAS_DOWNLOAD = 3
ESPERA_ENTRE_TENTATIVAS_S = 5
TIMEOUT_DOCKER_S = 180
TIMEOUT_SAUDE_S = 180
INTERVALO_SAUDE_S = 3
TIMEOUT_WEB_S = 60
TIMEOUT_ENCERRAR_S = 10

# Quick Tunnel: sem conta nem configuração na Cloudflare. O endereço é sorteado
# a cada início e deixa de existir quando o cloudflared para.
URL_DOWNLOAD_CLOUDFLARED = "https://github.com/cloudflare/cloudflared/releases/latest/download/{arquivo}"
TIMEOUT_DOWNLOAD_S = 300
TIMEOUT_URL_TUNEL_S = 60
# O endereço do Quick Tunnel tem palavras separadas por hífen. Exigir o hífen
# evita confundir com "https://api.trycloudflare.com", que aparece nas mensagens de falha.
_REGEX_URL_TUNEL = re.compile(r"https://[a-z0-9]+(?:-[a-z0-9]+)+\.trycloudflare\.com")

_REGEX_FROM = re.compile(r"^\s*FROM\s+(\S+)", re.IGNORECASE | re.MULTILINE)


# =============================================================================
# Saída no terminal
# =============================================================================
LARGURA = 96


def _preparar_saida() -> bool:
    """
    Põe a saída em UTF-8 e diz se o terminal aceita os caracteres de moldura.

    O console do Windows (cp1252) quebra ao imprimir "─" quando a saída é
    redirecionada para um arquivo. Nesse caso o painel usa "-", "|" e "+".
    """
    # line_buffering: cada linha sai na hora, antes da saída dos comandos
    # (docker, npm) que o script chama. Sem isso, com a saída redirecionada,
    # as mensagens do script apareceriam depois das deles.
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
        except (AttributeError, OSError, ValueError):
            pass
    # No console clássico do Windows, as cores ANSI só funcionam depois que
    # o modo de terminal virtual é ligado; rodar um comando vazio no cmd liga.
    if platform.system() == "Windows" and sys.stdout.isatty():
        os.system("")
    return "utf" in (sys.stdout.encoding or "").lower()


UNICODE_OK = _preparar_saida()
# Traço horizontal, barra vertical e cantos/junções da moldura do painel.
TRACO, BARRA = ("─", "│") if UNICODE_OK else ("-", "|")
CANTOS = ("┌", "┐", "└", "┘", "├", "┤") if UNICODE_OK else ("+",) * 6
PONTO = "·" if UNICODE_OK else "-"


def _cor(texto: str, codigo: str) -> str:
    """Aplica cor ANSI, exceto quando a saída não é um terminal."""
    if not sys.stdout.isatty() or os.getenv("NO_COLOR"):
        return texto
    return f"\033[{codigo}m{texto}\033[0m"


def titulo(texto: str) -> None:
    print()
    print(_cor(f"{TRACO * 2} {texto} ".ljust(LARGURA, TRACO), "1;36"))


def passo(texto: str) -> None:
    print(f"   {texto}")


def ok(texto: str) -> None:
    print(f"   {_cor('OK', '1;32')}  {texto}")


def aviso(texto: str) -> None:
    print(f"   {_cor('!', '1;33')}   {texto}")


def erro(texto: str) -> None:
    print(f"   {_cor('ERRO', '1;31')}  {texto}", file=sys.stderr)


def caixa(titulo_caixa: str, secoes: list[list[str]], cor: str = "1;36") -> None:
    """Moldura com título e seções separadas por linha horizontal."""
    superior_esq, superior_dir, inferior_esq, inferior_dir, juncao_esq, juncao_dir = CANTOS
    meio = TRACO * (LARGURA - 2)
    barra = _cor(BARRA, cor)
    print()
    print(_cor(superior_esq + meio + superior_dir, cor))
    print(_cor(BARRA + f" {titulo_caixa} ".center(LARGURA - 2) + BARRA, cor))
    for secao in secoes:
        print(_cor(juncao_esq + meio + juncao_dir, cor))
        for linha in secao:
            print(barra + f" {linha}".ljust(LARGURA - 2) + barra)
    print(_cor(inferior_esq + meio + inferior_dir, cor))
    print()


# =============================================================================
# Utilidades
# =============================================================================
def rodar(comando: list[str], *, pasta: Path = RAIZ, silencioso: bool = False) -> subprocess.CompletedProcess:
    """Executa um comando e devolve o resultado. Comando ausente vira código 127."""
    try:
        return subprocess.run(
            comando,
            cwd=pasta,
            capture_output=silencioso,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except OSError as falha:
        return subprocess.CompletedProcess(comando, 127, "", str(falha))


def ler_env(arquivo: Path) -> dict[str, str]:
    """Lê um .env sem dependências externas (KEY=valor, ignora comentários)."""
    valores: dict[str, str] = {}
    if not arquivo.is_file():
        return valores
    for linha in arquivo.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        chave, _, valor = linha.partition("=")
        valores[chave.strip()] = valor.strip().strip('"').strip("'")
    return valores


def python_do_venv() -> Path:
    """Caminho do Python dentro do .venv (Windows e Linux/macOS)."""
    if platform.system() == "Windows":
        return PASTA_VENV / "Scripts" / "python.exe"
    return PASTA_VENV / "bin" / "python"


def hash_de_arquivos(*arquivos: Path) -> str:
    """Hash do conteúdo, seguindo os "-r outro.txt" dos arquivos de requisitos."""
    conteudo = b""
    pendentes = list(arquivos)
    vistos: set[Path] = set()
    while pendentes:
        arquivo = pendentes.pop(0).resolve()
        if arquivo in vistos or not arquivo.is_file():
            continue
        vistos.add(arquivo)
        bruto = arquivo.read_bytes()
        conteudo += bruto
        if arquivo.suffix == ".txt":
            for linha in bruto.decode("utf-8", "replace").splitlines():
                limpo = linha.strip()
                if limpo.startswith("-r "):
                    pendentes.append(arquivo.parent / limpo[3:].strip())
    return hashlib.sha256(conteudo).hexdigest()


def porta_em_uso(porta: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as conexao:
        conexao.settimeout(1)
        return conexao.connect_ex(("127.0.0.1", porta)) == 0


def ler_pagina(url: str) -> str | None:
    """Corpo da resposta, "" para resposta de erro HTTP, None se nada respondeu."""
    try:
        # Sem proxy: os endereços são locais.
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(url, timeout=3) as resposta:
            return resposta.read(200_000).decode("utf-8", "replace")
    except urllib.error.HTTPError:
        return ""
    except (urllib.error.URLError, OSError):
        return None


def e_deste_projeto(url: str) -> bool:
    return MARCA_DO_APP in (ler_pagina(url) or "")


def processo_ativo(pid: int | None, nome: str) -> bool:
    """Confere o PID e o nome do processo: um PID reaproveitado por outro programa não conta."""
    if not pid:
        return False
    if platform.system() == "Windows":
        lista = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        return nome in lista.stdout.lower()
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    comando = subprocess.run(["ps", "-p", str(pid), "-o", "comm="], capture_output=True, text=True)
    return nome in comando.stdout.lower()


def encerrar_processo(pid: int, nome: str) -> bool:
    """Encerra o processo e os filhos dele."""
    if platform.system() == "Windows":
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
    else:
        try:
            os.killpg(pid, 15)
        except OSError:
            pass
    limite = time.monotonic() + TIMEOUT_ENCERRAR_S
    while time.monotonic() < limite:
        if not processo_ativo(pid, nome):
            return True
        time.sleep(0.5)
    return not processo_ativo(pid, nome)


def ip_na_rede() -> str | None:
    """IPv4 desta máquina na rede local: o da interface da rota padrão, o
    mesmo que outro aparelho da rede usa para chegar aqui.

    O "connect" de um socket UDP não manda pacote nenhum: só faz o sistema
    escolher a interface. Assim os adaptadores virtuais (WSL, Docker), que
    outro aparelho não alcança, ficam de fora."""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as conexao:
            conexao.connect(("10.255.255.255", 1))
            ip = conexao.getsockname()[0]
    except OSError:
        return None
    return None if ip.startswith(("127.", "0.", "169.254.")) else ip


def url_web_na_rede() -> str | None:
    ip = ip_na_rede()
    return f"http://{ip}:{PORTA_WEB}{CAMINHO_WEB}" if ip else None


def endereco_do_repositorio() -> str:
    """URL do GitHub a partir do remoto "origin" (https ou ssh)."""
    resultado = rodar(["git", "remote", "get-url", "origin"], silencioso=True)
    remoto = resultado.stdout.strip() if resultado.returncode == 0 else ""
    achado = re.search(r"github\.com[:/]([^/]+)/([^/\s]+?)(?:\.git)?$", remoto)
    if not achado:
        return REPOSITORIO_PADRAO
    return f"https://github.com/{achado.group(1)}/{achado.group(2)}"


# =============================================================================
# 0. Configuração (.env)
# =============================================================================
def definir_chave(texto: str, chave: str, valor: str) -> str:
    """Troca o valor de CHAVE=... no texto de um .env; acrescenta a linha se ela falta."""
    # Função no lugar do texto de troca: um valor com "\" não vira escape do re.
    novo, trocas = re.subn(rf"(?m)^{chave}=.*$", lambda _: f"{chave}={valor}", texto)
    if trocas:
        return novo
    return texto.rstrip("\n") + f"\n{chave}={valor}\n"


def criar_env_da_api() -> bool:
    """Cria o api/.env a partir do modelo, com segredo e senha aleatórios."""
    if not MODELO_ENV_API.is_file():
        erro("api/.env.example não encontrado: não há de onde criar o api/.env.")
        return False
    texto = MODELO_ENV_API.read_text(encoding="utf-8")
    texto = definir_chave(texto, "JWT_SECRET", secrets.token_urlsafe(48))
    texto = definir_chave(texto, "ADMIN_SENHA", secrets.token_urlsafe(12))
    ENV_API.write_text(texto, encoding="utf-8", newline="\n")
    ok("api/.env criado a partir do api/.env.example, com JWT_SECRET e ADMIN_SENHA aleatórios.")
    passo("A senha do administrador inicial está na chave ADMIN_SENHA do api/.env.")
    return True


def garantir_configuracao() -> bool:
    titulo("Configuração (.env)")
    if ENV_API.is_file():
        ok("api/.env encontrado.")
    elif not criar_env_da_api():
        return False

    env_api = ler_env(ENV_API)
    segredo = env_api.get("JWT_SECRET", "")
    if len(segredo.encode("utf-8")) < 32:
        erro("JWT_SECRET no api/.env tem menos de 32 bytes: a API não sobe assim.")
        erro('Gere outro com: python -c "import secrets; print(secrets.token_urlsafe(48))"')
        return False
    if segredo.startswith("troque-"):
        aviso("JWT_SECRET no api/.env ainda é o texto do exemplo. Troque por uma chave aleatória.")
    if env_api.get("ADMIN_SENHA") == "troque-esta-senha":
        aviso("ADMIN_SENHA no api/.env ainda é o texto do exemplo. Troque antes de gravar evidências.")

    # O livro-caixa só aceita o ID token do projeto Firebase da área do cliente.
    # Vazio, a API responde 503 ("Login do cliente indisponível") a todo login;
    # diferente do web/.env, responde 401. O api/.env criado antes do web/.env
    # (máquina nova) fica vazio: por isso a cópia acontece a cada subida.
    projeto_api = env_api.get("FIREBASE_PROJECT_ID", "")
    projeto_web = ler_env(ENV_WEB).get("VITE_FIREBASE_PROJECT_ID", "") if ENV_WEB.is_file() else ""
    if not projeto_api and projeto_web:
        texto = ENV_API.read_text(encoding="utf-8")
        ENV_API.write_text(definir_chave(texto, "FIREBASE_PROJECT_ID", projeto_web), encoding="utf-8", newline="\n")
        ok(f"FIREBASE_PROJECT_ID copiado do web/.env para o api/.env ({projeto_web}).")
    elif not projeto_api:
        aviso("FIREBASE_PROJECT_ID vazio no api/.env: o livro-caixa (/espacos) responde 503.")
    elif projeto_web and projeto_api != projeto_web:
        aviso(f"FIREBASE_PROJECT_ID ({projeto_api}) difere do VITE_FIREBASE_PROJECT_ID ({projeto_web}) do web/.env.")

    if not ENV_WEB.is_file():
        aviso("web/.env não encontrado: a área do cliente abre com o aviso 'Firebase não configurado'.")
        aviso("Copie web/.env.example para web/.env e preencha com o app Web do Firebase (README).")
    elif ler_env(ENV_WEB).get("VITE_FIREBASE_EMULADOR", "").lower() == "true":
        aviso("web/.env usa os emuladores do Firebase: eles precisam estar no ar (portas 9099 e 8088).")
    else:
        ok("web/.env encontrado.")
    return True


# =============================================================================
# 1. Ambiente virtual (api/.venv)
# =============================================================================
def versao_do_python(comando: list[str]) -> tuple[int, int] | None:
    """(maior, menor) do Python chamado pelo comando, ou None se ele não roda."""
    try:
        # stdin fechado: um "py -3.x" de versão ausente pode oferecer instalação
        # e ficaria esperando a resposta.
        resultado = subprocess.run(
            [*comando, "-c", "import sys; print(*sys.version_info[:2])"],
            stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=30,
        )
        maior, menor = map(int, resultado.stdout.split())
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return None
    return (maior, menor) if resultado.returncode == 0 else None


def texto_versao(versao: tuple[int, int]) -> str:
    return f"{versao[0]}.{versao[1]}"


def encontrar_python() -> tuple[list[str], tuple[int, int]] | None:
    """
    Procura um Python 3.11+ na máquina, não só o que roda este script.

    O "python" do PATH pode ser antigo mesmo com um Python novo instalado: no
    Windows o lançador "py" acha todos, e o winget instala em
    %LOCALAPPDATA%\\Programs\\Python sem mexer no PATH do terminal já aberto.
    Entre os achados, fica o mais próximo do 3.13 do CI e do Docker.
    """
    candidatos: list[list[str]] = [[sys.executable]]
    menores = range(PYTHON_MINIMO[1], PYTHON_RECOMENDADO[1] + 3)
    if platform.system() == "Windows":
        if shutil.which("py"):
            candidatos += [["py", f"-3.{menor}"] for menor in menores]
        programas = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "Python"
        candidatos += [[str(programas / f"Python3{menor}" / "python.exe")] for menor in menores]
    else:
        candidatos += [[caminho] for menor in menores if (caminho := shutil.which(f"python3.{menor}"))]

    achados = []
    for comando in candidatos:
        if (versao := versao_do_python(comando)) and versao >= PYTHON_MINIMO:
            achados.append((comando, versao))
    if not achados:
        return None
    return min(achados, key=lambda achado: (abs(achado[1][1] - PYTHON_RECOMENDADO[1]), achado[1]))


def instalar_python() -> bool:
    """Instala o Python recomendado pelo winget, só para este usuário (sem administrador)."""
    if platform.system() != "Windows" or not shutil.which("winget"):
        return False
    pacote = f"Python.Python.{texto_versao(PYTHON_RECOMENDADO)}"
    passo(f"Instalando o Python {texto_versao(PYTHON_RECOMENDADO)} pelo winget ({pacote})...")
    # Sem aceitar termos em nome do usuário: se o winget pedir, ele responde aqui.
    comando = ["winget", "install", "--id", pacote, "--exact", "--source", "winget", "--scope", "user", "--silent"]
    return rodar(comando).returncode == 0


def explicar_atualizacao_do_python() -> None:
    """Passo a passo para quando o script não consegue um Python novo sozinho."""
    recomendado = texto_versao(PYTHON_RECOMENDADO)
    erro(f"O api/.venv precisa de Python {texto_versao(PYTHON_MINIMO)}+ "
         f"(o CI e o Docker usam o {recomendado}); nenhum foi encontrado nem instalado.")
    passo("Como atualizar o Python:")
    if platform.system() == "Windows":
        passo(f"  1. No PowerShell: winget install --id Python.Python.{recomendado} -e --scope user")
        passo("     Sem winget (ou bloqueado): baixe em https://www.python.org/downloads/ e,")
        passo("     no instalador, marque 'Add python.exe to PATH'. Não precisa de administrador.")
    elif platform.system() == "Darwin":
        passo(f"  1. brew install python@{recomendado}   (ou o instalador de https://www.python.org/downloads/)")
    else:
        passo(f"  1. sudo apt install python{recomendado} python{recomendado}-venv   "
              "(ou o gerenciador de pacotes da sua distribuição)")
    passo("  2. Feche e abra o terminal: o PATH novo só vale em terminal novo.")
    passo("  3. Rode de novo: python subir-app.py up")


def criar_venv() -> bool:
    """Cria (ou recria) o api/.venv com um Python 3.11+, instalando um se faltar."""
    python = encontrar_python()
    if python is None:
        aviso(f"Nenhum Python {texto_versao(PYTHON_MINIMO)}+ encontrado "
              f"(o que roda este script é o {platform.python_version()}).")
        if instalar_python():
            python = encontrar_python()
    if python is None:
        explicar_atualizacao_do_python()
        return False

    comando, versao = python
    passo(f"Criando o ambiente virtual com o Python {texto_versao(versao)}...")
    # --clear: um .venv quebrado ou de Python antigo é esvaziado antes.
    if rodar([*comando, "-m", "venv", "--clear", str(PASTA_VENV)]).returncode != 0:
        erro(f"Não foi possível criar o api/.venv com o Python {texto_versao(versao)}.")
        erro(f"Apague a pasta api/.venv e rode de novo. Persistindo: reinstale o Python {texto_versao(versao)}.")
        return False
    ok(f"Ambiente criado em api/.venv (Python {texto_versao(versao)}).")
    return True


def garantir_venv() -> bool:
    """Cria o api/.venv e instala as dependências quando necessário."""
    titulo("Ambiente virtual (api/.venv)")
    # Um .venv copiado de outra máquina, ou cujo Python base foi desinstalado ou
    # atualizado, tem o python.exe mas não roda: é recriado, não reaproveitado.
    versao_venv = versao_do_python([str(python_do_venv())]) if python_do_venv().is_file() else None
    if versao_venv and versao_venv >= PYTHON_MINIMO:
        ok(f"Ambiente já existe (Python {texto_versao(versao_venv)}).")
    else:
        if PASTA_VENV.exists():
            if versao_venv:
                motivo = f"Python {texto_versao(versao_venv)}, abaixo do {texto_versao(PYTHON_MINIMO)}"
            else:
                motivo = "o Python dele não roda" if python_do_venv().is_file() else "está incompleto"
            aviso(f"O api/.venv existe mas não serve ({motivo}): recriando.")
        if not criar_venv():
            return False

    impressao = hash_de_arquivos(ARQUIVO_REQUISITOS)
    if MARCA_REQUISITOS.is_file() and MARCA_REQUISITOS.read_text(encoding="utf-8").strip() == impressao:
        ok("Dependências já instaladas (requirements-dev.txt sem mudanças).")
        return True

    passo("Instalando as dependências no .venv (pode demorar na primeira vez)...")
    if rodar([str(python_do_venv()), "-m", "pip", "install", "--quiet", "--upgrade", "pip"]).returncode != 0:
        aviso("Não foi possível atualizar o pip; seguindo com a versão atual.")
    comando = [str(python_do_venv()), "-m", "pip", "install", "--quiet", "-r", str(ARQUIVO_REQUISITOS)]
    if rodar(comando).returncode != 0:
        erro("Falha ao instalar o api/requirements-dev.txt.")
        return False
    MARCA_REQUISITOS.write_text(impressao, encoding="utf-8")
    ok("Dependências instaladas no .venv.")
    return True


# =============================================================================
# 2. Dependências do front-end (web/node_modules)
# =============================================================================
def comando_npm() -> str | None:
    return shutil.which("npm")


def garantir_node_modules() -> bool:
    titulo("Dependências do front-end (web/node_modules)")
    node = shutil.which("node")
    npm = comando_npm()
    if not node or not npm:
        erro(f"Node.js não encontrado. Instale o Node.js {NODE_MINIMO}+ (https://nodejs.org).")
        return False
    versao = rodar([node, "--version"], silencioso=True).stdout.strip()
    ok(f"Node.js {versao}")
    if (achado := re.match(r"v(\d+)", versao)) and int(achado.group(1)) < NODE_MINIMO:
        aviso(f"O projeto usa Node.js {NODE_MINIMO}+ (o CI roda com o 20).")

    impressao = hash_de_arquivos(PACKAGE_LOCK)
    instalado = (NODE_MODULES / "vite").is_dir() and MARCA_NODE_MODULES.is_file()
    if instalado and MARCA_NODE_MODULES.read_text(encoding="utf-8").strip() == impressao:
        ok("Dependências já instaladas (package-lock.json sem mudanças).")
        return True

    # O "npm ci" apaga o node_modules; com o Vite rodando, o Windows trava os arquivos.
    parar_front_end(silencioso=True)
    passo("npm ci (instala exatamente as versões do package-lock.json)...")
    if rodar([npm, "ci", "--no-fund", "--no-audit"], pasta=PASTA_WEB).returncode != 0:
        erro("O 'npm ci' falhou. Se o 'npm run dev' estiver aberto em outro terminal, feche e rode de novo.")
        return False
    MARCA_NODE_MODULES.write_text(impressao, encoding="utf-8")
    ok("Dependências instaladas em web/node_modules.")
    return True


# =============================================================================
# 3. Docker e imagens
# =============================================================================
def docker_responde() -> bool:
    return rodar(["docker", "info"], silencioso=True).returncode == 0


def garantir_docker() -> bool:
    titulo("Docker")
    if shutil.which("docker") is None:
        erro("O comando 'docker' não está no PATH. Instale o Docker Desktop.")
        return False
    if docker_responde():
        ok("Docker respondendo.")
        return True

    if platform.system() == "Windows" and CAMINHO_DOCKER_DESKTOP.is_file():
        passo("Docker parado. Abrindo o Docker Desktop...")
        subprocess.Popen([str(CAMINHO_DOCKER_DESKTOP)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        limite = time.monotonic() + TIMEOUT_DOCKER_S
        while time.monotonic() < limite:
            time.sleep(INTERVALO_SAUDE_S)
            if docker_responde():
                ok("Docker Desktop iniciado.")
                return True
        erro(f"O Docker não respondeu em {TIMEOUT_DOCKER_S}s. Abra o Docker Desktop e rode de novo.")
        return False

    erro("O Docker não respondeu. Abra o Docker Desktop e espere ele iniciar.")
    return False


def imagens_necessarias() -> list[str]:
    """Imagens do compose e as imagens de base dos Dockerfiles, sem repetição."""
    resultado = rodar(["docker", "compose", "config", "--format", "json"], silencioso=True)
    if resultado.returncode != 0:
        return []
    try:
        servicos = json.loads(resultado.stdout).get("services", {})
    except json.JSONDecodeError:
        return []

    imagens: list[str] = []
    for servico in servicos.values():
        construcao = servico.get("build")
        if not construcao:
            if servico.get("image"):
                imagens.append(servico["image"])
            continue
        dockerfile = Path(construcao.get("context", ".")) / construcao.get("dockerfile", "Dockerfile")
        if dockerfile.is_file():
            imagens += _REGEX_FROM.findall(dockerfile.read_text(encoding="utf-8"))
    # dict.fromkeys preserva a ordem e remove repetidas.
    return list(dict.fromkeys(imagem for imagem in imagens if imagem.lower() != "scratch"))


def baixar_imagens() -> bool:
    """
    Garante as imagens de base na máquina, uma a uma.

    Imagem já presente é pulada. Um download interrompido continua de onde
    parou: o Docker guarda as camadas já concluídas e só busca o que falta.
    """
    titulo("Imagens do Docker")
    imagens = imagens_necessarias()
    if not imagens:
        erro("Não foi possível ler o docker-compose.yml ('docker compose config' falhou).")
        return False

    for imagem in imagens:
        if rodar(["docker", "image", "inspect", imagem], silencioso=True).returncode == 0:
            ok(f"{imagem} (já na máquina)")
            continue
        for tentativa in range(1, TENTATIVAS_DOWNLOAD + 1):
            passo(f"Baixando {imagem} (tentativa {tentativa}/{TENTATIVAS_DOWNLOAD})...")
            if rodar(["docker", "pull", imagem]).returncode == 0:
                ok(imagem)
                break
            if tentativa < TENTATIVAS_DOWNLOAD:
                aviso(f"Falha ao baixar {imagem}. Nova tentativa em {ESPERA_ENTRE_TENTATIVAS_S}s "
                      "(as camadas já concluídas são aproveitadas).")
                time.sleep(ESPERA_ENTRE_TENTATIVAS_S)
        else:
            erro(f"Não foi possível baixar {imagem} em {TENTATIVAS_DOWNLOAD} tentativas.")
            erro("Rode 'python subir-app.py up' de novo: o download continua de onde parou.")
            return False
    return True


# =============================================================================
# 4. Containers (MongoDB + API)
# =============================================================================
def estado_dos_servicos() -> list[dict]:
    """Containers do compose (o "docker compose ps" devolve um JSON por linha)."""
    resultado = rodar(["docker", "compose", "ps", "--all", "--format", "json"], silencioso=True)
    if resultado.returncode != 0:
        return []
    servicos = []
    for linha in resultado.stdout.splitlines():
        linha = linha.strip()
        if not linha:
            continue
        try:
            dados = json.loads(linha)
        except json.JSONDecodeError:
            continue
        servicos += dados if isinstance(dados, list) else [dados]
    return servicos


def _rotulo_estado(servico: dict) -> str:
    saude = (servico.get("Health") or "").strip()
    estado = (servico.get("State") or "").strip()
    return f"{estado} ({saude})" if saude else estado


def api_do_compose_no_ar() -> bool:
    return any(
        s.get("Service") == "api" and (s.get("State") or "").lower() == "running" for s in estado_dos_servicos()
    )


def subir_containers(reconstruir: bool) -> bool:
    titulo("Containers (MongoDB + API)")
    # Porta 8081 ocupada sem a API do compose no ar: outro processo (ex.: um
    # uvicorn rodando à mão) faria o "docker compose up" falhar no meio.
    if porta_em_uso(PORTA_API) and not api_do_compose_no_ar():
        erro(f"A porta {PORTA_API} está ocupada por outro programa (um 'uvicorn' rodando à mão?).")
        erro("Encerre esse programa e rode de novo.")
        return False

    comando = ["docker", "compose", "up", "-d"]
    if reconstruir:
        comando.append("--build")
    # Aberta pela rede (http://<ip>:5173), a área do cliente chama a API de
    # outra origem: o compose repassa esta variável à API, que a soma ao
    # CORS_ORIGENS. Nada é gravado no api/.env, porque o IP muda de rede em rede.
    ip = ip_na_rede()
    os.environ["CORS_ORIGENS_REDE"] = f"http://{ip}:{PORTA_WEB}" if ip else ""
    passo(" ".join(comando))
    if rodar(comando).returncode != 0:
        erro("O 'docker compose up' falhou. Veja a mensagem acima.")
        return False
    return aguardar_saude()


def aguardar_saude() -> bool:
    """Espera todos os serviços do compose ficarem "healthy"."""
    passo("Aguardando os healthchecks (MongoDB responde ao ping, API responde em /openapi.json)...")
    limite = time.monotonic() + TIMEOUT_SAUDE_S
    pendentes: list[str] = []
    while time.monotonic() < limite:
        servicos = estado_dos_servicos()
        pendentes = [
            f"{s.get('Service', '?')}: {_rotulo_estado(s)}"
            for s in servicos
            if (s.get("State") or "").lower() != "running" or (s.get("Health") or "healthy").lower() != "healthy"
        ]
        if servicos and not pendentes:
            ok("MongoDB e API responderam.")
            return True
        time.sleep(INTERVALO_SAUDE_S)

    erro(f"Tempo esgotado ({TIMEOUT_SAUDE_S}s) esperando: {', '.join(pendentes) or 'containers'}")
    aviso("Veja o motivo com: docker compose logs api")
    return False


# =============================================================================
# 5. Front-end (Vite em segundo plano)
# =============================================================================
def ler_estado_web() -> dict | None:
    try:
        return json.loads(ESTADO_WEB.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def vite_do_script_ativo() -> dict | None:
    """Estado salvo, se o processo do Vite iniciado por este script ainda roda."""
    estado = ler_estado_web()
    if estado and processo_ativo(estado.get("pid"), "node"):
        return estado
    return None


def subir_front_end() -> bool:
    titulo("Front-end (Vite)")
    estado = vite_do_script_ativo()
    if estado and e_deste_projeto(URL_WEB):
        if estado.get("rede"):
            ok(f"Vite já no ar (PID {estado['pid']}). Nada foi reiniciado.")
            return True
        # Subido por uma versão anterior do script, só para esta máquina.
        passo("Vite no ar sem acesso pela rede local. Reiniciando com --host...")
        parar_front_end(silencioso=True)
    if porta_em_uso(PORTA_WEB):
        if e_deste_projeto(URL_WEB):
            ok("Vite já rodando fora deste script (um 'npm run dev' aberto). Reaproveitado.")
            if not e_deste_projeto(url_web_na_rede() or ""):
                aviso("Esse Vite não atende pela rede local: feche o 'npm run dev' e rode de novo para abrir no celular.")
            return True
        erro(f"A porta {PORTA_WEB} está ocupada por outro programa.")
        return False

    node = shutil.which("node")
    vite = NODE_MODULES / "vite" / "bin" / "vite.js"
    if not node or not vite.is_file():
        erro("Vite não encontrado em web/node_modules. Rode 'python subir-app.py up' sem '--sem-web'.")
        return False

    PASTA_ESTADO.mkdir(exist_ok=True)
    # Chama o node direto, sem o "npm run dev": assim o PID salvo é o do
    # próprio Vite, e o "down" encerra o processo certo.
    comando = [node, str(vite), "--port", str(PORTA_WEB), "--strictPort", "--host", HOST_DA_REDE]
    # O Vite continua rodando depois que este terminal fecha.
    opcoes: dict = {"stdin": subprocess.DEVNULL, "stderr": subprocess.STDOUT, "cwd": PASTA_WEB}
    if platform.system() == "Windows":
        opcoes["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
    else:
        opcoes["start_new_session"] = True
    passo(f"Subindo o Vite em segundo plano na porta {PORTA_WEB}, aberto para a rede local...")
    with LOG_WEB.open("wb") as log:
        processo = subprocess.Popen(comando, stdout=log, **opcoes)

    limite = time.monotonic() + TIMEOUT_WEB_S
    while time.monotonic() < limite:
        if e_deste_projeto(URL_WEB):
            ESTADO_WEB.write_text(
                json.dumps(
                    {"pid": processo.pid, "porta": PORTA_WEB, "rede": True, "inicio": datetime.now().isoformat(timespec="seconds")},
                    indent=2,
                ),
                encoding="utf-8",
            )
            ok(f"Vite no ar (PID {processo.pid}). Log: {LOG_WEB.relative_to(RAIZ)}")
            return True
        if processo.poll() is not None:
            break
        time.sleep(0.5)

    if processo.poll() is None:
        encerrar_processo(processo.pid, "node")
    erro(f"O Vite não respondeu em {URL_WEB}. Últimas linhas de {LOG_WEB.relative_to(RAIZ)}:")
    for linha in LOG_WEB.read_text(encoding="utf-8", errors="replace").strip().splitlines()[-5:]:
        erro(f"  {linha}")
    return False


def parar_front_end(silencioso: bool = False) -> bool:
    estado = vite_do_script_ativo()
    if not estado:
        ESTADO_WEB.unlink(missing_ok=True)
        if not silencioso:
            if porta_em_uso(PORTA_WEB):
                aviso(f"Há um Vite rodando fora deste script na porta {PORTA_WEB}: feche o terminal do 'npm run dev'.")
            else:
                ok("Vite já estava parado.")
        return True
    if not silencioso:
        passo(f"Encerrando o Vite (PID {estado['pid']})...")
    if not encerrar_processo(estado["pid"], "node"):
        erro(f"Não foi possível encerrar o Vite (PID {estado['pid']}). Encerre 'node' no Gerenciador de Tarefas.")
        return False
    ESTADO_WEB.unlink(missing_ok=True)
    if not silencioso:
        ok("Vite encerrado.")
    return True


# =============================================================================
# 6. Situação e painel de links
# =============================================================================
def resumo_da_situacao() -> None:
    titulo("Situação")
    servicos = {s.get("Service"): s for s in estado_dos_servicos()}
    for nome, descricao in (("mongo", "MongoDB"), ("api", "API FastAPI")):
        servico = servicos.get(nome)
        if not servico:
            aviso(f"{descricao.ljust(22)} fora do ar")
            continue
        saudavel = (servico.get("State") or "").lower() == "running" and (servico.get("Health") or "").lower() == "healthy"
        (ok if saudavel else aviso)(f"{descricao.ljust(22)} {_rotulo_estado(servico)}")

    estado = vite_do_script_ativo()
    if e_deste_projeto(URL_WEB):
        origem = f"PID {estado['pid']}" if estado else "rodando fora deste script"
        ok(f"{'Front-end (Vite)'.ljust(22)} no ar ({origem})")
    else:
        aviso(f"{'Front-end (Vite)'.ljust(22)} fora do ar")

    # Túnel aberto aparece como aviso: o app está exposto na internet.
    tunel = tunel_aberto()
    if tunel:
        aviso(f"{'Túnel (Cloudflare)'.ljust(22)} aberto em {tunel['url']}{CAMINHO_WEB}")
    else:
        ok(f"{'Túnel (Cloudflare)'.ljust(22)} fechado")


def descricao_do_firebase() -> str:
    env_web = ler_env(ENV_WEB)
    if env_web.get("VITE_FIREBASE_EMULADOR", "").lower() == "true":
        return "emuladores locais (Auth 9099, Firestore 8088)"
    if env_web.get("VITE_FIREBASE_PROJECT_ID"):
        return f"projeto {env_web['VITE_FIREBASE_PROJECT_ID']}"
    return "não configurado (crie o web/.env a partir do web/.env.example)"


def painel() -> None:
    """Links importantes e como entrar no painel administrativo (sem mostrar senhas)."""
    repositorio = endereco_do_repositorio()
    dono, nome = repositorio.rstrip("/").split("/")[-2:]
    projeto_firebase = ler_env(ENV_WEB).get("VITE_FIREBASE_PROJECT_ID")
    email_admin = ler_env(ENV_API).get("ADMIN_EMAIL") or "(defina ADMIN_EMAIL no api/.env)"

    local = [
        f"{'Área do cliente (React)'.ljust(26)} {URL_WEB}",
        f"{''.ljust(26)} cadastro {PONTO} login {PONTO} principal",
        f"{'Painel administrativo'.ljust(26)} {URL_API}/painel/",
        f"{'Swagger da API'.ljust(26)} {URL_API}/docs",
    ]
    nuvem = [
        f"{'Publicado (GitHub Pages)'.ljust(26)} https://{dono.lower()}.github.io/{nome}/",
        f"{'Repositório'.ljust(26)} {repositorio}",
        f"{'CI/CD (GitHub Actions)'.ljust(26)} {repositorio}/actions",
        f"{'Pull requests'.ljust(26)} {repositorio}/pulls",
    ]
    if projeto_firebase:
        nuvem.append(f"{'Console do Firebase'.ljust(26)} https://console.firebase.google.com/project/{projeto_firebase}")
    acesso = [
        "Login do painel administrativo (administrador criado com o banco vazio)",
        f"  {'E-mail'.ljust(24)} {email_admin}",
        f"  {'Senha'.ljust(24)} valor da chave ADMIN_SENHA no api/.env",
        f"{'Firebase'.ljust(26)} {descricao_do_firebase()}",
        f"{'MongoDB (só rede interna)'.ljust(26)} docker compose exec mongo mongosh pessoal-finance",
        f"{'Documentação'.ljust(26)} README.md {PONTO} DOCS_API.md",
    ]
    caixa("PESSOAL FINANCE - AMBIENTE LOCAL", [local, nuvem, acesso])
    enderecos_da_area_do_cliente()
    print("   Logs da API:   docker compose logs -f api")
    print(f"   Logs do Vite:  {LOG_WEB.relative_to(RAIZ)}")
    print("   Testes:        python subir-app.py testes")
    print("   Demonstração:  python subir-app.py tunnel start   (fechar: tunnel stop)")
    print("   Parar:         python subir-app.py down")
    print()


# =============================================================================
# 7. Túnel da Cloudflare (acesso externo temporário)
# =============================================================================
def _arquivos_do_cloudflared() -> tuple[str, str]:
    """(arquivo publicado pela Cloudflare, nome do binário local) para este sistema."""
    maquina = platform.machine().lower()
    arquitetura = {
        "amd64": "amd64", "x86_64": "amd64", "arm64": "arm64", "aarch64": "arm64",
        "armv7l": "arm", "armv6l": "arm", "i386": "386", "i686": "386", "x86": "386",
    }.get(maquina, "amd64")
    sistema = platform.system()
    if sistema == "Windows":
        # Windows em ARM roda a versão amd64 pela emulação do próprio sistema.
        return f"cloudflared-windows-{'386' if arquitetura == '386' else 'amd64'}.exe", "cloudflared.exe"
    if sistema == "Darwin":
        return f"cloudflared-darwin-{'arm64' if arquitetura == 'arm64' else 'amd64'}.tgz", "cloudflared"
    return f"cloudflared-linux-{arquitetura}", "cloudflared"


def localizar_cloudflared() -> Path | None:
    """O cloudflared instalado (PATH) ou o já baixado em .subir-app/."""
    instalado = shutil.which("cloudflared")
    if instalado:
        return Path(instalado)
    baixado = PASTA_ESTADO / _arquivos_do_cloudflared()[1]
    return baixado if baixado.is_file() else None


def baixar_cloudflared() -> Path | None:
    """Baixa o cloudflared da página oficial de releases da Cloudflare no GitHub."""
    arquivo, nome_local = _arquivos_do_cloudflared()
    PASTA_ESTADO.mkdir(exist_ok=True)
    destino = PASTA_ESTADO / nome_local
    parcial = PASTA_ESTADO / f"{arquivo}.parcial"
    url = URL_DOWNLOAD_CLOUDFLARED.format(arquivo=arquivo)
    passo(f"Baixando o cloudflared ({arquivo}) de github.com/cloudflare/cloudflared...")
    try:
        # urlopen respeita o proxy do sistema (HTTPS_PROXY), comum em rede de empresa.
        with urllib.request.urlopen(url, timeout=TIMEOUT_DOWNLOAD_S) as resposta, parcial.open("wb") as saida:
            shutil.copyfileobj(resposta, saida)
        if arquivo.endswith(".tgz"):
            with tarfile.open(parcial) as pacote:
                origem = pacote.extractfile("cloudflared")
                if origem is None:
                    raise OSError("pacote sem o binário cloudflared")
                with origem, destino.open("wb") as saida:
                    shutil.copyfileobj(origem, saida)
            parcial.unlink()
        else:
            parcial.replace(destino)
    except (urllib.error.URLError, OSError, tarfile.TarError, KeyError) as falha:
        parcial.unlink(missing_ok=True)
        erro(f"Não foi possível baixar o cloudflared: {falha}")
        erro("Instale à mão (Windows: winget install --id Cloudflare.cloudflared; macOS: brew install cloudflared).")
        return None
    if platform.system() != "Windows":
        destino.chmod(0o755)
    ok(f"cloudflared salvo em {destino.relative_to(RAIZ)}.")
    return destino


def ler_estado_tunel() -> dict | None:
    try:
        return json.loads(ESTADO_TUNEL.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def gravar_estado_tunel(pid: int, url: str | None) -> None:
    ESTADO_TUNEL.write_text(
        json.dumps(
            {"pid": pid, "url": url, "porta": PORTA_WEB, "inicio": datetime.now().isoformat(timespec="seconds")},
            indent=2,
        ),
        encoding="utf-8",
    )


def tunel_aberto() -> dict | None:
    """Estado salvo, se o cloudflared iniciado por este script ainda roda."""
    estado = ler_estado_tunel()
    if estado and estado.get("url") and processo_ativo(estado.get("pid"), "cloudflared"):
        return estado
    return None


def aguardar_url_do_tunel(processo: subprocess.Popen) -> str | None:
    """Lê o log do cloudflared até aparecer o endereço *.trycloudflare.com."""
    limite = time.monotonic() + TIMEOUT_URL_TUNEL_S
    while time.monotonic() < limite:
        try:
            achado = _REGEX_URL_TUNEL.search(LOG_TUNEL.read_text(encoding="utf-8", errors="replace"))
        except OSError:
            achado = None
        if achado:
            return achado.group(0)
        if processo.poll() is not None:
            return None
        time.sleep(0.5)
    return None


def mostrar_tunel(url: str) -> None:
    caixa(
        "ACESSO EXTERNO ABERTO (TÚNEL DA CLOUDFLARE)",
        [
            [f"Área do cliente: {url}{CAMINHO_WEB}"],
            [
                "Qualquer pessoa com este endereço chega ao login, e o cadastro está aberto.",
                "Mande só para quem vai ver a demonstração. O endereço muda a cada início.",
                "Painel administrativo e Swagger não passam pelo túnel: continuam só locais.",
                "Fechar: python subir-app.py tunnel stop   (ou npm run tunnel:stop em web/)",
            ],
        ],
        cor="1;33",
    )


def parar_tunel() -> bool:
    """Encerra o cloudflared do "tunnel start": o endereço público deixa de existir."""
    estado = ler_estado_tunel()
    if not estado:
        ok("Nenhum túnel aberto: o app já é só local.")
        return True
    pid = estado.get("pid")
    if processo_ativo(pid, "cloudflared"):
        passo(f"Encerrando o cloudflared (PID {pid})...")
        if not encerrar_processo(pid, "cloudflared"):
            erro(f"Não foi possível encerrar o cloudflared (PID {pid}). Encerre 'cloudflared' no Gerenciador de Tarefas.")
            return False
    else:
        aviso("O cloudflared já não estava rodando (máquina reiniciada ou processo encerrado).")
    ESTADO_TUNEL.unlink(missing_ok=True)
    ok(f"Túnel fechado: {estado.get('url') or 'o endereço público'} deixou de funcionar.")
    return True


# =============================================================================
# Comandos
# =============================================================================
def enderecos_da_area_do_cliente() -> None:
    """Local e Network da área do cliente, no formato do próprio Vite."""
    if not e_deste_projeto(URL_WEB):
        return
    seta = "➜" if UNICODE_OK else "->"
    na_rede = url_web_na_rede()
    print(f"   {_cor(seta, '1;32')}  {'Local:'.ljust(9)}{_cor(URL_WEB, '36')}")
    if not na_rede:
        print(f"   {_cor(seta, '1;32')}  {'Network:'.ljust(9)}nenhuma rede local encontrada")
    elif e_deste_projeto(na_rede):
        print(f"   {_cor(seta, '1;32')}  {'Network:'.ljust(9)}{_cor(na_rede, '36')}")
        passo("Na mesma rede (Wi-Fi ou cabo), abra o endereço Network no celular ou em outro computador.")
        passo("Não abriu? Libere o Node.js no Firewall do Windows (rede privada). Em rede de empresa, ele pode estar bloqueado.")
    else:
        print(f"   {_cor(seta, '1;32')}  {'Network:'.ljust(9)}{na_rede} (sem resposta)")
        aviso("O Vite não atende pela rede. Rode 'python subir-app.py up' para reiniciá-lo com --host.")
    print()


def comando_up(reconstruir: bool, com_web: bool) -> int:
    print(_cor("Pessoal Finance — subindo o ambiente local", "1;36"))
    if not garantir_configuracao():
        return 1
    # A API em si roda no Docker, então a subida segue sem o .venv. Mas os
    # testes e o editor dependem dele: a falha volta no fim e o código de saída é 1.
    venv_pronto = garantir_venv()
    if not venv_pronto:
        aviso("Seguindo sem o .venv (a API roda no Docker; 'testes' e o editor dependem dele).")
    if com_web and not garantir_node_modules():
        return 1
    if not garantir_docker() or not baixar_imagens():
        return 1

    tudo_no_ar = subir_containers(reconstruir)
    if com_web:
        tudo_no_ar = subir_front_end() and tudo_no_ar

    resumo_da_situacao()
    if not tudo_no_ar:
        erro("Alguma parte não subiu. O painel abaixo vale para o que está no ar.")
    painel()
    if not venv_pronto:
        erro("O api/.venv não ficou pronto: veja a etapa 'Ambiente virtual (api/.venv)' acima.")
    return 0 if tudo_no_ar and venv_pronto else 1


def comando_status() -> int:
    print(_cor("Pessoal Finance — situação do ambiente local", "1;36"))
    if not docker_responde():
        aviso("O Docker não está respondendo: MongoDB e API aparecem como fora do ar.")
    resumo_da_situacao()
    painel()
    return 0


def comando_down(apagar_dados: bool) -> int:
    print(_cor("Pessoal Finance — derrubando o ambiente local", "1;36"))
    tudo_certo = True
    # Sem o Vite, o túnel não serve para nada; aberto, ele só expõe um erro.
    if ler_estado_tunel():
        titulo("Túnel da Cloudflare")
        tudo_certo = parar_tunel()
    titulo("Front-end (Vite)")
    tudo_certo = parar_front_end() and tudo_certo

    titulo("Containers (MongoDB + API)")
    if not docker_responde():
        ok("Docker parado: não há containers no ar.")
        return 0 if tudo_certo else 1
    comando = ["docker", "compose", "down"]
    if apagar_dados:
        aviso("--apagar-dados: o volume do MongoDB será apagado (usuários e senhas somem de vez).")
        comando.append("-v")
    passo(" ".join(comando))
    if rodar(comando).returncode != 0:
        erro("O 'docker compose down' falhou. Veja a mensagem acima.")
        return 1
    if apagar_dados:
        ok("Containers e dados removidos. A próxima subida recria o administrador inicial.")
    else:
        ok("Containers parados. Os dados do MongoDB continuam no volume.")
    return 0 if tudo_certo else 1


def comando_tunnel_start() -> int:
    print(_cor("Pessoal Finance — acesso externo (túnel da Cloudflare)", "1;36"))
    titulo("Túnel da Cloudflare")
    estado = tunel_aberto()
    if estado:
        ok(f"O túnel já está aberto (PID {estado['pid']}). Nada foi reiniciado.")
        mostrar_tunel(estado["url"])
        return 0

    if not e_deste_projeto(URL_WEB):
        erro(f"A área do cliente não respondeu em {URL_WEB}.")
        erro("Suba o ambiente antes: python subir-app.py up")
        return 1
    if ler_pagina(f"{URL_API}/openapi.json") is None:
        aviso("A API não respondeu: pelo túnel, as telas do livro-caixa vão avisar que o servidor está fora.")

    binario = localizar_cloudflared() or baixar_cloudflared()
    if not binario:
        return 1
    ok(f"cloudflared: {binario}")

    PASTA_ESTADO.mkdir(exist_ok=True)
    # O túnel publica só a porta do Vite. A API chega pelo proxy do Vite, e só
    # nas rotas do cliente (web/vite.config.js).
    destino = f"http://localhost:{PORTA_WEB}"
    comando = [str(binario), "tunnel", "--no-autoupdate", "--url", destino]
    # O cloudflared continua rodando depois que este terminal fecha.
    opcoes: dict = {"stdin": subprocess.DEVNULL, "stderr": subprocess.STDOUT, "cwd": PASTA_ESTADO}
    if platform.system() == "Windows":
        opcoes["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
    else:
        opcoes["start_new_session"] = True
    passo(f"Abrindo o túnel para {destino}...")
    with LOG_TUNEL.open("wb") as log:
        processo = subprocess.Popen(comando, stdout=log, **opcoes)
    # Gravado já, antes do endereço: se algo falhar daqui em diante, o
    # "tunnel stop" ainda acha o processo e fecha o túnel.
    gravar_estado_tunel(processo.pid, None)

    try:
        url = aguardar_url_do_tunel(processo)
    except KeyboardInterrupt:
        # Sem isso, o túnel ficaria aberto sem ninguém saber o endereço.
        encerrar_processo(processo.pid, "cloudflared")
        ESTADO_TUNEL.unlink(missing_ok=True)
        raise
    if not url:
        if processo.poll() is None:
            encerrar_processo(processo.pid, "cloudflared")
            erro(f"A Cloudflare não devolveu o endereço público em {TIMEOUT_URL_TUNEL_S}s.")
        else:
            erro("O cloudflared parou sem devolver o endereço público.")
        ESTADO_TUNEL.unlink(missing_ok=True)
        erro(f"Veja o log: {LOG_TUNEL.relative_to(RAIZ)}")
        aviso("Em rede de empresa, o firewall (ou a política de TI) pode bloquear o túnel.")
        return 1

    gravar_estado_tunel(processo.pid, url)
    ok(f"Túnel aberto (PID {processo.pid}). Log: {LOG_TUNEL.relative_to(RAIZ)}")
    mostrar_tunel(url)
    return 0


def comando_tunnel_stop() -> int:
    print(_cor("Pessoal Finance — acesso externo (túnel da Cloudflare)", "1;36"))
    titulo("Túnel da Cloudflare")
    return 0 if parar_tunel() else 1


def comando_testes() -> int:
    print(_cor("Pessoal Finance — testes automatizados (os mesmos do CI)", "1;36"))
    if not garantir_venv() or not garantir_node_modules():
        return 1
    npm = comando_npm()

    etapas = [
        ("API (pytest)", [str(python_do_venv()), "-m", "pytest", "-v"], PASTA_API),
        ("Front-end: lint (oxlint)", [npm, "run", "lint"], PASTA_WEB),
        ("Front-end: testes (Vitest)", [npm, "test", "--", "--run"], PASTA_WEB),
    ]
    resultados = []
    for nome, comando, pasta in etapas:
        titulo(nome)
        aprovado = rodar(comando, pasta=pasta).returncode == 0
        resultados.append((nome, aprovado))

    linhas = [f"{nome.ljust(30)} {'aprovado' if aprovado else 'REPROVADO'}" for nome, aprovado in resultados]
    todos = all(aprovado for _, aprovado in resultados)
    caixa("RESULTADO DOS TESTES", [linhas], cor="1;32" if todos else "1;31")
    return 0 if todos else 1


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="subir-app.py",
        description=(
            "Pessoal Finance: sobe o ambiente local (configuração, .venv, dependências, "
            "MongoDB + API no Docker, front-end no Vite) e mostra os links importantes."
        ),
    )
    subcomandos = parser.add_subparsers(dest="comando", required=True)
    up = subcomandos.add_parser("up", help="Prepara o ambiente e sobe tudo.")
    up.add_argument(
        "--sem-build",
        action="store_true",
        help="Não reconstrói a imagem da API (sobe mais rápido quando o código da API não mudou).",
    )
    up.add_argument("--sem-web", action="store_true", help="Não sobe o front-end (Vite); só MongoDB e API.")
    subcomandos.add_parser("status", help="Mostra o que está no ar e os links, sem subir nada.")
    subcomandos.add_parser("testes", help="Roda lint e testes da API e do front-end, como o CI.")
    down = subcomandos.add_parser("down", help="Para o Vite e os containers (os dados do banco ficam).")
    down.add_argument("--apagar-dados", action="store_true", help="Também apaga o volume do MongoDB.")
    tunel = subcomandos.add_parser("tunnel", help="Abre ou fecha um endereço público temporário (túnel da Cloudflare).")
    tunel.add_argument("acao", choices=["start", "stop"], help="start abre o túnel; stop fecha.")

    argumentos = parser.parse_args(argv)
    if argumentos.comando == "up":
        return comando_up(reconstruir=not argumentos.sem_build, com_web=not argumentos.sem_web)
    if argumentos.comando == "status":
        return comando_status()
    if argumentos.comando == "testes":
        return comando_testes()
    if argumentos.comando == "down":
        return comando_down(apagar_dados=argumentos.apagar_dados)
    if argumentos.comando == "tunnel":
        return comando_tunnel_start() if argumentos.acao == "start" else comando_tunnel_stop()
    parser.error(f"Comando desconhecido: {argumentos.comando}")
    return 2


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print()
        erro("Interrompido pelo usuário. Rode de novo: o que já foi feito é aproveitado.")
        sys.exit(1)
