#!/usr/bin/env python3
"""
OliFine (projeto Pessoal Finance, ADS-Project) — ambiente local com um comando.

    python subir-app.py                     menu com todos os comandos (no terminal)
    python subir-app.py dev                 desenvolvimento: Vite com HMR, API com recarga, saída completa
    python subir-app.py prod                produção local: build otimizado no nginx, API da imagem, saída enxuta
    python subir-app.py status              o que está no ar, os endereços e o que falta configurar
    python subir-app.py verificar           confere a configuração inteira e aponta o que falta
    python subir-app.py testes              lint, tipos, testes e build da API e do front-end, como o CI
    python subir-app.py logs [serviço]      acompanha os logs (api, web, mongo, vite ou todos)
    python subir-app.py alertas             manda uma mensagem de teste para cada canal do Discord
    python subir-app.py tunnel start|stop   abre ou fecha um endereço público temporário (Cloudflare)
    python subir-app.py down                derruba o ambiente (os dados do banco ficam)

"up" continua valendo e é o mesmo que "dev".

"dev" faz, nesta ordem:
    0. Configuração: cria o api/.env a partir do api/.env.example, com JWT_SECRET
       e ADMIN_SENHA aleatórios, se ele ainda não existir. Copia o projeto
       Firebase do web/.env quando o FIREBASE_PROJECT_ID está vazio. Confere o
       api/.env e o web/.env (as verificações locais do "verificar") e para
       antes do Docker quando algo impediria a API de subir ou exporia um
       segredo.
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
       healthchecks; se a API não subir, mostra o fim do log dela. O que só
       existe nesta máquina entra por um complemento do compose gerado em
       .subir-app/compose.local.yml: a chave da conta de serviço dos e-mails
       vira o segredo /run/secrets/firebase_conta_de_servico (o caminho do
       Windows no api/.env não existe dentro do container), com
       EMAIL_PROVEDOR=pasta os e-mails gravados aparecem em api/emails-enviados
       e, no dev, a API lê o código de api/app direto da pasta e reinicia
       sozinha a cada .py salvo (uvicorn --reload).
    5. Front-end: sobe o Vite (HMR) em segundo plano na porta 5173, aberto para
       a rede local (--host 0.0.0.0): celular e outros computadores da mesma
       rede abrem o app pelo IP desta máquina. Se já estiver no ar, reaproveita.
    6. Painel: endereços Local, Network e do túnel (se aberto), API, login do
       painel administrativo, e-mails, alertas e quantas pendências existem.

"prod" dispensa o .venv e o Node.js: tudo é construído no Docker. Encerra o
Vite do "dev", gera a imagem do web/Dockerfile (build do Vite servido pelo
nginx, com o web/.env como secret de build) na porta 8080 e sobe a API como
está na imagem, sem recarga. A saída dos comandos só aparece quando algo
falha. As travas de AMBIENTE=producao (HTTPS, banco com senha) valem só no
servidor: aqui é o mesmo artefato, servido como em produção.

"verificar" junta as verificações locais às que precisam de internet: o APP_URL
e o monograma dos e-mails publicados, o site do GitHub Pages, o DNS do domínio
do remetente (DKIM, SPF e DMARC, por DNS sobre HTTPS), o Console do Firebase
(URL de ação personalizada e domínios autorizados, lidos com a conta de serviço
pelo api/.venv) e os webhooks do Discord (existem e aceitam o token). Só lê:
nada é alterado nem enviado. Com --sem-rede, fica nas locais.

"tunnel start" abre um Quick Tunnel da Cloudflare (sem conta) para o front-end
que estiver no ar (Vite do dev ou nginx do prod) e mostra o endereço público
temporário (*.trycloudflare.com), que muda a cada início. A API entra pelo
proxy desse front-end, só nas rotas do cliente (web/vite.config.js e
web/nginx.conf). Usa o cloudflared do PATH ou baixa o oficial para
.subir-app/. "tunnel stop" encerra o cloudflared; o "down" também.

Só usa a biblioteca padrão: roda com o Python do sistema, antes do ".venv",
mesmo que ele seja antigo demais para a API (ex.: 3.10).
Idempotente: rodar de novo com tudo no ar apenas confirma o estado e reimprime
o painel. Cores: NO_COLOR=1 desliga.

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
import textwrap
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
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

# Compose: o arquivo do repositório, o override da raiz (se alguém criou um à
# mão, fora do Git) e o complemento que este script gera a cada "dev" ou
# "prod" com o que só existe nesta máquina e o que muda entre os dois modos.
COMPOSE_DO_REPOSITORIO = RAIZ / "docker-compose.yml"
COMPOSE_OVERRIDE_DA_RAIZ = RAIZ / "docker-compose.override.yml"
COMPOSE_LOCAL = PASTA_ESTADO / "compose.local.yml"
# Onde a API do container lê a chave da conta de serviço (Docker secret) e
# grava os e-mails com EMAIL_PROVEDOR=pasta (WORKDIR da imagem + EMAIL_PASTA).
SEGREDO_DA_CONTA_NO_CONTAINER = "/run/secrets/firebase_conta_de_servico"
PASTA_DE_EMAILS_NO_CONTAINER = "/app/emails-enviados"
# Nomes que os serviços do compose ganham na tela.
NOMES_DOS_SERVICOS = {"mongo": "MongoDB", "api": "API", "web": "nginx"}

# Configuração pública do app Web do Firebase (web/.env.example).
CHAVES_FIREBASE_WEB = (
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_STORAGE_BUCKET",
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
    "VITE_FIREBASE_APP_ID",
)
HOSTS_LOCAIS = {"localhost", "127.0.0.1", "::1"}
# Domínios de exemplo dos arquivos .env.example: nenhum provedor manda por eles.
DOMINIOS_DE_EXEMPLO = {"exemplo.com", "example.com", "exemplo.com.br", "localhost"}
# Arquivos de segredo que nunca podem estar versionados (o .env.example pode).
_REGEX_ARQUIVO_DE_SEGREDO = re.compile(
    r"(^|/)(\.env(\.(?!example$)[^/]+)?|[^/]+\.(pem|key)|serviceAccountKey\.json|firebase-adminsdk[^/]*\.json"
    r"|firebase-emails[^/]*\.json)$",
    re.IGNORECASE,
)
# Monograma dos e-mails, publicado com o app (web/public/email).
CAMINHO_DO_MONOGRAMA = "/email/olifine-monograma.png"
# DNS sobre HTTPS da Cloudflare: consulta o DNS público só com a biblioteca padrão.
URL_DNS_SOBRE_HTTPS = "https://cloudflare-dns.com/dns-query?name={nome}&type={tipo}"
TIPOS_DNS = {"TXT": 16, "MX": 15, "CNAME": 5}
TIMEOUT_REDE_S = 15

# Alertas no Discord (api/app/monitoramento.py): variável do api/.env de cada
# canal. O formato é o mesmo que a API exige (api/app/config.py).
CANAIS_DO_DISCORD = {
    "sistema": "DISCORD_WEBHOOK_SISTEMA",
    "seguranca": "DISCORD_WEBHOOK_SEGURANCA",
    "telemetria": "DISCORD_WEBHOOK_TELEMETRIA",
}
_REGEX_WEBHOOK_DO_DISCORD = re.compile(r"^https://(?:(?:ptb|canary)\.)?discord(?:app)?\.com/api/webhooks/\d+/[\w-]+$")
# O Cloudflare do Discord recusa o User-Agent padrão do urllib (erro 1010).
AGENTE_HTTP = "OliFine-subir-app"

PORTA_API = 8081
URL_API = f"http://localhost:{PORTA_API}"
# dev: Vite no caminho do GitHub Pages, como o "npm run dev".
PORTA_WEB = 5173
CAMINHO_WEB = "/ADS-Project/"
URL_WEB = f"http://localhost:{PORTA_WEB}{CAMINHO_WEB}"
# prod: imagem do web/Dockerfile (nginx) na raiz, como num domínio próprio. A
# 8080 já está no CORS_ORIGENS do api/.env.example.
PORTA_PROD = 8080
CAMINHO_PROD = "/"
URL_PROD = f"http://localhost:{PORTA_PROD}{CAMINHO_PROD}"
# O Vite escuta em todas as interfaces: a área do cliente abre pelo IP desta
# máquina em qualquer aparelho da mesma rede.
HOST_DA_REDE = "0.0.0.0"
# Texto do <title> da área do cliente: confirma que a porta é mesmo deste projeto.
# Lido do web/index.html, e não fixo aqui, para acompanhar a troca de marca: com o
# título fixo, a mudança para "OliFine" fez o script derrubar um Vite saudável.
_TITULO = re.search(r"<title>\s*(.*?)\s*</title>", (PASTA_WEB / "index.html").read_text(encoding="utf-8"), re.DOTALL)
MARCA_DO_APP = _TITULO.group(1) if _TITULO else "OliFine"
# Slogan do cabeçalho, lido da mesma constante que o app mostra (Logo.jsx).
_ARQUIVO_DO_LOGO = PASTA_WEB / "src" / "olifine" / "componentes" / "Logo.jsx"
_SLOGAN = re.search(r"SLOGAN\s*=\s*'([^']+)'", _ARQUIVO_DO_LOGO.read_text(encoding="utf-8")) if _ARQUIVO_DO_LOGO.is_file() else None
SLOGAN = _SLOGAN.group(1) if _SLOGAN else "Finanças que fazem sentido"

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
# Saída no terminal: tema OliFine
# =============================================================================
LARGURA = 88
# Largura da coluna do nome de cada etapa ("Configuração", "Containers"...).
ROTULO = 14


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


def _profundidade_de_cor() -> int:
    """24 (cor exata), 256 (paleta aproximada) ou 0 (sem cor: saída em arquivo,
    NO_COLOR ou TERM=dumb)."""
    if not sys.stdout.isatty() or os.getenv("NO_COLOR") or os.getenv("TERM") == "dumb":
        return 0
    # O Windows 10+ (com o modo de terminal virtual ligado acima), o Windows
    # Terminal e o VS Code aceitam 24 bits; nos outros, COLORTERM avisa.
    if platform.system() == "Windows" or os.getenv("COLORTERM", "").lower() in ("truecolor", "24bit"):
        return 24
    return 256


UNICODE_OK = _preparar_saida()
PROFUNDIDADE_DE_COR = _profundidade_de_cor()
# Traço horizontal, barra vertical e cantos/junções das molduras.
TRACO, BARRA = ("─", "│") if UNICODE_OK else ("-", "|")
CANTOS = ("╭", "╮", "╰", "╯", "├", "┤") if UNICODE_OK else ("+",) * 6
PONTO = "·" if UNICODE_OK else "-"
SETA = "➜" if UNICODE_OK else "->"
SIMBOLO = {"ok": "✓", "aviso": "!", "erro": "✗", "espera": "…"} if UNICODE_OK else {"ok": "+", "aviso": "!", "erro": "x", "espera": "~"}

# Paleta da OliFine (DESIGN.md do produto), nos tons que leem bem tanto em
# terminal escuro quanto em claro.
TEMA = {
    "marca": (69, 155, 114),  # growth-green: marca, títulos e etapas certas
    "destaque": (100, 191, 141),  # signal-green: endereços
    "aviso": (200, 135, 47),  # âmbar: pendências e o túnel aberto
    "erro": (210, 85, 77),  # outflow-red, mais claro para o fundo escuro
    "suave": (123, 135, 152),  # slate-muted, mais claro: detalhes e atalhos
    "dev": (173, 209, 127),  # lime-tip: selo do modo dev
    "prod": (227, 187, 95),  # fruit-gold: selo do modo prod (cuidado: é o artefato de produção)
    "tinta": (11, 42, 29),  # cta-ink: texto dos selos
}
ESTADO_PARA_PAPEL = {"ok": "marca", "aviso": "aviso", "erro": "erro", "espera": "suave"}

# Saída completa dos comandos longos (docker, npm, pip): ligada no "dev"; no
# "prod" ela fica guardada e só aparece quando o comando falha.
DETALHADO = True


def _sgr(papel: str, fundo: bool = False) -> str:
    r, g, b = TEMA[papel]
    plano = 48 if fundo else 38
    if PROFUNDIDADE_DE_COR == 24:
        return f"{plano};2;{r};{g};{b}"
    # Cubo de 6x6x6 da paleta de 256 cores.
    return f"{plano};5;{16 + 36 * round(r / 51) + 6 * round(g / 51) + round(b / 51)}"


def pintar(texto: str, papel: str, negrito: bool = False) -> str:
    if not PROFUNDIDADE_DE_COR:
        return texto
    return f"\033[{'1;' if negrito else ''}{_sgr(papel)}m{texto}\033[0m"


def fraco(texto: str) -> str:
    return pintar(texto, "suave")


def selo(texto: str, papel: str) -> str:
    """Texto sobre fundo colorido (o selo do modo: DEV, PROD)."""
    if not PROFUNDIDADE_DE_COR:
        return f"[{texto}]"
    return f"\033[1;{_sgr('tinta')};{_sgr(papel, fundo=True)}m {texto} \033[0m"


def cabecalho(acao: str, modo: str | None = None) -> None:
    """Marca, slogan e o que o comando faz: uma vez, no começo."""
    print()
    print(f"  {pintar('OliFine', 'marca', negrito=True)}  {fraco(SLOGAN)}")
    print(f"  {selo(modo.upper(), modo)}  {acao}" if modo else f"  {acao}")
    print()


def titulo(texto: str, antes: bool = True) -> None:
    """Título de seção; antes=False quando uma linha em branco já o separa."""
    if antes:
        print()
    print(f"  {pintar(texto, 'marca', negrito=True)}")


def etapa(rotulo: str, detalhe: str = "", estado: str = "ok") -> None:
    """Uma linha por etapa: símbolo, nome e o que aconteceu."""
    simbolo = pintar(SIMBOLO[estado], ESTADO_PARA_PAPEL[estado], negrito=True)
    print(f"  {simbolo} {rotulo.ljust(ROTULO)}{detalhe}", file=sys.stderr if estado == "erro" else sys.stdout)


def ok(texto: str) -> None:
    print(f"  {pintar(SIMBOLO['ok'], 'marca', negrito=True)} {texto}")


def aviso(texto: str) -> None:
    print(f"  {pintar(SIMBOLO['aviso'], 'aviso', negrito=True)} {texto}")


def erro(texto: str) -> None:
    print(f"  {pintar(SIMBOLO['erro'], 'erro', negrito=True)} {texto}", file=sys.stderr)


def passo(texto: str) -> None:
    """Detalhe de uma etapa, recuado e em tom mais fraco."""
    print(f"    {fraco(texto)}")


def caixa(titulo_caixa: str, secoes: list[list[str]], papel: str = "marca") -> None:
    """Moldura com título e seções separadas por linha horizontal."""
    superior_esq, superior_dir, inferior_esq, inferior_dir, juncao_esq, juncao_dir = CANTOS
    meio = TRACO * (LARGURA - 2)
    barra = pintar(BARRA, papel)
    print()
    print("  " + pintar(superior_esq + meio + superior_dir, papel))
    print("  " + barra + pintar(f" {titulo_caixa}".ljust(LARGURA - 2), papel, negrito=True) + barra)
    for secao in secoes:
        print("  " + pintar(juncao_esq + meio + juncao_dir, papel))
        for linha in secao:
            print("  " + barra + f" {linha}".ljust(LARGURA - 2) + barra)
    print("  " + pintar(inferior_esq + meio + inferior_dir, papel))
    print()


def fim(inicio: float, sucesso: bool) -> None:
    segundos = round(time.monotonic() - inicio)
    if sucesso:
        ok(pintar(f"Pronto em {segundos} s.", "marca", negrito=True))
    else:
        erro("Alguma parte não subiu: veja as linhas marcadas acima.")
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


def rodar_etapa(comando: list[str], *, pasta: Path = RAIZ) -> subprocess.CompletedProcess:
    """Comando longo de uma etapa (docker, npm, pip). Detalhado: mostra o
    comando e a saída dele. Enxuto: guarda a saída e mostra só o fim, se falhar."""
    if DETALHADO:
        passo("$ " + " ".join(str(parte).replace(f"{RAIZ}{os.sep}", "") for parte in comando))
        return rodar(comando, pasta=pasta)
    resultado = rodar(comando, pasta=pasta, silencioso=True)
    if resultado.returncode != 0:
        for linha in f"{resultado.stdout or ''}\n{resultado.stderr or ''}".strip().splitlines()[-20:]:
            passo(linha)
    return resultado


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


def url_na_rede(porta: int, caminho: str) -> str | None:
    ip = ip_na_rede()
    return f"http://{ip}:{porta}{caminho}" if ip else None


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
        etapa("Configuração", "api/.env.example não encontrado: não há de onde criar o api/.env.", "erro")
        return False
    texto = MODELO_ENV_API.read_text(encoding="utf-8")
    texto = definir_chave(texto, "JWT_SECRET", secrets.token_urlsafe(48))
    texto = definir_chave(texto, "ADMIN_SENHA", secrets.token_urlsafe(12))
    ENV_API.write_text(texto, encoding="utf-8", newline="\n")
    return True


def copiar_projeto_do_firebase() -> str | None:
    """Copia o VITE_FIREBASE_PROJECT_ID do web/.env para o api/.env vazio.

    O livro-caixa só aceita o ID token do projeto Firebase da área do cliente.
    Vazio, a API responde 503 ("Login do cliente indisponível") a todo login;
    diferente do web/.env, responde 401. O api/.env criado antes do web/.env
    (máquina nova) fica vazio: por isso a cópia acontece a cada subida."""
    projeto_api = ler_env(ENV_API).get("FIREBASE_PROJECT_ID", "")
    projeto_web = ler_env(ENV_WEB).get("VITE_FIREBASE_PROJECT_ID", "")
    if projeto_api or not projeto_web:
        return None
    texto = ENV_API.read_text(encoding="utf-8")
    ENV_API.write_text(definir_chave(texto, "FIREBASE_PROJECT_ID", projeto_web), encoding="utf-8", newline="\n")
    return projeto_web


def garantir_configuracao() -> bool:
    criado = False
    if not ENV_API.is_file():
        if not criar_env_da_api():
            return False
        criado = True
    copiado = copiar_projeto_do_firebase()

    # As mesmas verificações locais do "verificar"; aqui só aparece o que
    # falta. Um erro (a API não subiria, ou um segredo iria para o Git) para a
    # subida antes do Docker, em vez de esperar 3 minutos por um healthcheck.
    achados = verificar_configuracao()
    pendencias = [achado for achado in achados if achado["nivel"] != CERTO]
    erros = [achado for achado in pendencias if achado["nivel"] == ERRO]
    detalhe = "api/.env criado com JWT_SECRET e ADMIN_SENHA aleatórios" if criado else "api/.env"
    detalhe += " e web/.env" if ENV_WEB.is_file() else ", sem web/.env"
    if pendencias:
        detalhe += f" {PONTO} {len(pendencias)} pendência(s)"
    etapa("Configuração", detalhe, "erro" if erros else "aviso" if pendencias else "ok")
    if criado:
        passo("Senha do administrador inicial: chave ADMIN_SENHA do api/.env.")
    if copiado:
        passo(f"FIREBASE_PROJECT_ID copiado do web/.env ({copiado}).")
    mostrar_achados(pendencias, so_pendencias=True)
    if erros:
        erro("Corrija o que está marcado e rode de novo. Detalhes: python subir-app.py verificar")
        return False
    return True


# =============================================================================
# Verificações: o que falta configurar
# =============================================================================
# Cada achado tem nível, área, o que foi visto e como resolver. ERRO = a API
# não sobe ou um segredo corre risco (a subida para antes do Docker); AVISO =
# funciona, mas falta algo para o ambiente ficar completo; CERTO = conferido.
ERRO, AVISO, CERTO = "erro", "aviso", "ok"


def _achado(nivel: str, area: str, texto: str, como: str = "") -> dict:
    return {"nivel": nivel, "area": area, "texto": texto, "como": como}


def _dominio_do_remetente(remetente: str) -> str:
    """"OliFine <nao-responda@envio.dominio.com.br>" -> "envio.dominio.com.br"."""
    achado = re.search(r"@([A-Za-z0-9.-]+)", remetente)
    return achado.group(1).lower().rstrip(".") if achado else ""


def verificar_configuracao() -> list[dict]:
    """Verificações locais e rápidas (sem rede): api/.env, e-mails, alertas, web/.env e segredos."""
    env_api = ler_env(ENV_API)
    return [
        *_verificar_api(env_api),
        *_verificar_emails(env_api),
        *_verificar_alertas(env_api),
        *_verificar_web(ler_env(ENV_WEB)),
        *_verificar_segredos(),
    ]


def _verificar_api(env: dict[str, str]) -> list[dict]:
    area = "API (api/.env)"
    if not ENV_API.is_file():
        return [_achado(ERRO, area, "api/.env não existe.", "python subir-app.py dev (cria a partir do api/.env.example)")]
    achados = []
    segredo = env.get("JWT_SECRET", "")
    if len(segredo.encode("utf-8")) < 32:
        achados.append(_achado(ERRO, area, "JWT_SECRET com menos de 32 bytes: a API não sobe.",
                               'Gere outro: python -c "import secrets; print(secrets.token_urlsafe(48))"'))
    elif segredo.startswith("troque-"):
        achados.append(_achado(AVISO, area, "JWT_SECRET ainda é o texto do exemplo.", "Troque por uma chave aleatória."))
    if env.get("ADMIN_SENHA") == "troque-esta-senha":
        achados.append(_achado(AVISO, area, "ADMIN_SENHA ainda é o texto do exemplo.", "Troque antes de gravar evidências."))
    if not env.get("ADMIN_EMAIL"):
        achados.append(_achado(AVISO, area, "ADMIN_EMAIL vazio: com o banco vazio, nenhum administrador é criado."))
    # Produção recusa o MongoDB sem senha do compose e tira o Swagger: o
    # subir-app é o ambiente da máquina de quem desenvolve (até no "prod").
    if env.get("AMBIENTE", "desenvolvimento") == "producao":
        achados.append(_achado(ERRO, area, "AMBIENTE=producao: a API recusa o MongoDB sem senha do compose local.",
                               "AMBIENTE=desenvolvimento no api/.env (produção só no servidor, com /run/secrets)."))
    cota = env.get("EMAIL_COTA_DIARIA", "100")
    if not cota.isdigit():
        achados.append(_achado(ERRO, area, f"EMAIL_COTA_DIARIA={cota} não é um número: a API não sobe.",
                               "Use 100 (Resend grátis) ou 0 (sem aviso de cota)."))
    expiracao = env.get("JWT_EXPIRATION", "15")
    if expiracao.isdigit() and int(expiracao) > 15:
        achados.append(_achado(AVISO, area, f"JWT_EXPIRATION={expiracao}: acima dos 15 minutos do padrão.",
                               "Apague a linha ou use 15."))
    # 5173 é o Vite do "dev"; 8080, o nginx do "prod".
    origens = [origem.strip() for origem in env.get("CORS_ORIGENS", "").split(",") if origem.strip()]
    faltando = [origem for origem in (f"http://localhost:{PORTA_WEB}", f"http://localhost:{PORTA_PROD}") if origem not in origens]
    if faltando:
        achados.append(_achado(AVISO, area, f"CORS_ORIGENS sem {', '.join(faltando)}: a área do cliente dessa porta não "
                               "chama a API.", f"CORS_ORIGENS=http://localhost:{PORTA_WEB},http://localhost:{PORTA_PROD}"))
    projeto_api = env.get("FIREBASE_PROJECT_ID", "")
    projeto_web = ler_env(ENV_WEB).get("VITE_FIREBASE_PROJECT_ID", "")
    if not projeto_api:
        achados.append(_achado(AVISO, area, "FIREBASE_PROJECT_ID vazio: o livro-caixa (/espacos) responde 503.",
                               "Preencha com o VITE_FIREBASE_PROJECT_ID do web/.env."))
    elif projeto_web and projeto_api != projeto_web:
        achados.append(_achado(AVISO, area, f"FIREBASE_PROJECT_ID ({projeto_api}) difere do web/.env ({projeto_web}): "
                               "a API recusa o login do cliente (401).", "Use o mesmo projeto nos dois arquivos."))
    if not achados:
        achados.append(_achado(CERTO, area, "JWT, administrador, CORS e projeto Firebase conferidos."))
    return achados


def _verificar_emails(env: dict[str, str]) -> list[dict]:
    area = "E-mails da conta"
    provedor = env.get("EMAIL_PROVEDOR", "")
    if not provedor:
        return [_achado(AVISO, area, "EMAIL_PROVEDOR vazio: a API não manda e-mail, e o Firebase manda o modelo "
                        "genérico dele.", "README, 'E-mails com a marca OliFine' (Resend, SMTP ou pasta).")]
    if provedor not in ("resend", "smtp", "pasta"):
        return [_achado(ERRO, area, f"EMAIL_PROVEDOR={provedor} não existe: a API não sobe.", "Use resend, smtp ou pasta.")]

    achados = []
    remetente = env.get("EMAIL_REMETENTE", "")
    dominio = _dominio_do_remetente(remetente)
    if not dominio:
        achados.append(_achado(ERRO, area, "EMAIL_REMETENTE sem endereço: a API não sobe.",
                               "EMAIL_REMETENTE=OliFine <nao-responda@seu-dominio>"))
    elif dominio in DOMINIOS_DE_EXEMPLO and provedor != "pasta":
        achados.append(_achado(AVISO, area, f"EMAIL_REMETENTE com domínio de exemplo ({dominio}): o provedor recusa.",
                               "Use o domínio verificado no provedor."))
    if provedor == "resend":
        chave = env.get("RESEND_API_KEY", "")
        if not chave:
            achados.append(_achado(ERRO, area, "RESEND_API_KEY vazia: a API não sobe.", "Chave 'Sending access' do Resend."))
        elif not chave.startswith("re_"):
            achados.append(_achado(AVISO, area, "RESEND_API_KEY não começa com re_: confira se é a chave do Resend."))
    if provedor == "smtp" and not env.get("SMTP_HOST"):
        achados.append(_achado(ERRO, area, "SMTP_HOST vazio: a API não sobe."))

    app_url = env.get("APP_URL") or "http://localhost:5173/ADS-Project"
    endereco = urllib.parse.urlsplit(app_url)
    if endereco.scheme not in ("http", "https"):
        achados.append(_achado(ERRO, area, f"APP_URL não é um endereço http(s): {app_url}"))
    elif endereco.hostname in HOSTS_LOCAIS and provedor != "pasta":
        achados.append(_achado(AVISO, area, f"APP_URL local ({app_url}): os links dos e-mails só abrem nesta máquina e o "
                               "monograma não aparece no Gmail.", "APP_URL=https://jolini.github.io/ADS-Project (ou o domínio próprio)"))

    achados += _verificar_conta_de_servico(env.get("FIREBASE_CONTA_DE_SERVICO", ""), env.get("FIREBASE_PROJECT_ID", ""))
    if not achados:
        achados.append(_achado(CERTO, area, f"Provedor {provedor}, remetente @{dominio}, links para {app_url}."))
    return achados


def arquivo_da_conta_de_servico(valor: str) -> Path | None:
    """Caminho da chave nesta máquina; None quando o valor é o próprio JSON ou um caminho do container."""
    if not valor or valor.lstrip().startswith("{") or valor.startswith("/run/secrets/"):
        return None
    return Path(os.path.expandvars(valor)).expanduser()


def _verificar_conta_de_servico(valor: str, projeto: str) -> list[dict]:
    """A chave que a API usa para pedir ao Firebase o código dos links. O
    conteúdo é lido só para conferir o tipo e o projeto: nada sai na tela."""
    area = "E-mails da conta"
    como = "Guia 2.3: conta de serviço olifine-emails, chave JSON fora do repositório (ex.: %USERPROFILE%\\.olifine\\)."
    if not valor:
        return [_achado(ERRO, area, "FIREBASE_CONTA_DE_SERVICO vazio: a API não sobe com EMAIL_PROVEDOR ligado.", como)]
    if valor.startswith("/run/secrets/"):
        if COMPOSE_OVERRIDE_DA_RAIZ.is_file():
            return []
        return [_achado(ERRO, area, f"FIREBASE_CONTA_DE_SERVICO={valor} sem nada que monte a chave no container.",
                        "Use o caminho do arquivo nesta máquina: o subir-app monta o segredo sozinho.")]
    arquivo = arquivo_da_conta_de_servico(valor)
    texto = valor
    if arquivo is not None:
        if not arquivo.is_file():
            return [_achado(ERRO, area, f"FIREBASE_CONTA_DE_SERVICO aponta para um arquivo que não existe ({arquivo}).", como)]
        if RAIZ in arquivo.resolve().parents:
            return [_achado(ERRO, area, "A chave da conta de serviço está dentro do repositório.",
                            "Mova para fora (ex.: %USERPROFILE%\\.olifine\\) e ajuste o api/.env.")]
        texto = arquivo.read_text(encoding="utf-8", errors="replace")
    try:
        dados = json.loads(texto)
    except json.JSONDecodeError:
        dados = None
    if not isinstance(dados, dict) or dados.get("type") != "service_account" or not dados.get("private_key"):
        return [_achado(ERRO, area, "FIREBASE_CONTA_DE_SERVICO não é a chave JSON de uma conta de serviço.", como)]
    if projeto and dados.get("project_id") != projeto:
        return [_achado(ERRO, area, f"A conta de serviço é do projeto {dados.get('project_id')}, não do {projeto}: "
                        "a API não sobe.", "Crie a chave no mesmo projeto do FIREBASE_PROJECT_ID.")]
    return []


def _verificar_alertas(env: dict[str, str]) -> list[dict]:
    """Os webhooks do Discord (opcionais) no formato que a API aceita. O
    endereço é segredo: nunca aparece na tela, só o canal."""
    area = "Alertas (Discord)"
    como = "Discord > canal > Editar canal > Integrações > Webhooks > Copiar URL do webhook."
    achados = []
    ligados = []
    for canal, variavel in CANAIS_DO_DISCORD.items():
        valor = env.get(variavel, "")
        if not valor:
            continue
        if not _REGEX_WEBHOOK_DO_DISCORD.match(valor):
            achados.append(_achado(ERRO, area, f"{variavel} não é um webhook do Discord: a API não sobe.", como))
        else:
            ligados.append(canal)
    intervalo = env.get("TELEMETRIA_INTERVALO_HORAS", "24")
    if not intervalo.isdigit() or int(intervalo) == 0:
        achados.append(_achado(ERRO, area, f"TELEMETRIA_INTERVALO_HORAS={intervalo}: use um número de horas (ex.: 24)."))
    if not achados:
        texto = f"Canais ligados: {', '.join(ligados)}." if ligados else "Desligados (opcional): DISCORD_WEBHOOK_* vazios."
        achados.append(_achado(CERTO, area, texto))
    return achados


def _verificar_web(env: dict[str, str]) -> list[dict]:
    area = "Área do cliente (web/.env)"
    if not ENV_WEB.is_file():
        return [_achado(AVISO, area, "web/.env não existe: a área do cliente abre com o aviso 'Firebase não configurado'.",
                        "Copie web/.env.example para web/.env e preencha com o app Web do Firebase (README).")]
    achados = []
    if env.get("VITE_FIREBASE_EMULADOR", "").lower() == "true":
        achados.append(_achado(AVISO, area, "VITE_FIREBASE_EMULADOR=true: os emuladores precisam estar no ar (9099 e 8088)."))
    elif faltando := [chave for chave in CHAVES_FIREBASE_WEB if not env.get(chave)]:
        achados.append(_achado(AVISO, area, f"Faltam {', '.join(faltando)}.", "Console do Firebase > Configurações do projeto > Seus apps."))
    api = env.get("VITE_API_URL", "")
    if not api:
        achados.append(_achado(AVISO, area, "VITE_API_URL vazio: telas do livro-caixa desligadas (como no GitHub Pages).",
                               f"VITE_API_URL={URL_API}"))
    else:
        endereco = urllib.parse.urlsplit(api)
        if endereco.hostname in HOSTS_LOCAIS and endereco.port not in (PORTA_API, None):
            achados.append(_achado(AVISO, area, f"VITE_API_URL na porta {endereco.port}; a API do compose fica na {PORTA_API}.",
                                   f"VITE_API_URL={URL_API}"))
    if not achados:
        achados.append(_achado(CERTO, area, "Firebase e endereço da API configurados."))
    return achados


def _verificar_segredos() -> list[dict]:
    """Os .env fora do Git e nenhum arquivo de segredo versionado."""
    area = "Segredos e Git"
    if not shutil.which("git"):
        return [_achado(AVISO, area, "git não encontrado: não deu para conferir o que está versionado.")]
    achados = []
    for arquivo in (ENV_API, ENV_WEB):
        if arquivo.is_file() and rodar(["git", "check-ignore", "-q", str(arquivo)], silencioso=True).returncode != 0:
            achados.append(_achado(ERRO, area, f"{arquivo.relative_to(RAIZ).as_posix()} não está no .gitignore: um "
                                   "'git add' o publicaria.", "Confira o .gitignore da raiz (.env e .env.*)."))
    versionados = rodar(["git", "ls-files"], silencioso=True).stdout.splitlines()
    for nome in versionados:
        if _REGEX_ARQUIVO_DE_SEGREDO.search(nome):
            achados.append(_achado(ERRO, area, f"Arquivo de segredo versionado: {nome}.",
                                   f"git rm --cached {nome}, e troque o segredo (o histórico público guarda o valor)."))
    if not achados:
        achados.append(_achado(CERTO, area, "api/.env e web/.env fora do Git; nenhum arquivo de segredo versionado."))
    return achados


# --- Verificações com rede (só no "verificar") -------------------------------
def _buscar(url: str) -> tuple[int, str, bytes] | None:
    """(status, tipo, começo do corpo) de um endereço público; None sem resposta.
    Resposta de erro HTTP também volta: o 404.html do Pages é o próprio app."""
    try:
        with urllib.request.urlopen(url, timeout=TIMEOUT_REDE_S) as resposta:
            return resposta.status, resposta.headers.get("Content-Type", ""), resposta.read(200_000)
    except urllib.error.HTTPError as falha:
        return falha.code, falha.headers.get("Content-Type", "") if falha.headers else "", falha.read(200_000)
    except (urllib.error.URLError, OSError, ValueError):
        return None


def _dns(nome: str, tipo: str) -> list[str] | None:
    """Respostas do tipo pedido no DNS público (DNS sobre HTTPS); None sem resposta."""
    pedido = urllib.request.Request(
        URL_DNS_SOBRE_HTTPS.format(nome=urllib.parse.quote(nome), tipo=tipo), headers={"Accept": "application/dns-json"}
    )
    try:
        with urllib.request.urlopen(pedido, timeout=TIMEOUT_REDE_S) as resposta:
            dados = json.load(resposta)
    except (urllib.error.URLError, OSError, ValueError):
        return None
    # TXT longo chega em pedaços entre aspas ("v=DKIM1; p=..." "resto").
    return [
        re.sub(r'"\s*"', "", registro.get("data", "")).strip('"')
        for registro in dados.get("Answer", [])
        if registro.get("type") == TIPOS_DNS[tipo]
    ]


def verificar_na_rede() -> list[dict]:
    env = ler_env(ENV_API)
    return [
        *_verificar_publicacao(env),
        *_verificar_dns_do_remetente(env),
        *_verificar_console_do_firebase(env),
        *_verificar_webhooks_do_discord(env),
    ]


def _verificar_publicacao(env: dict[str, str]) -> list[dict]:
    """O site do Pages e o APP_URL no ar, com o monograma dos e-mails."""
    area = "Publicação"
    repositorio = endereco_do_repositorio()
    dono, nome = repositorio.rstrip("/").split("/")[-2:]
    enderecos = [f"https://{dono.lower()}.github.io/{nome}"]
    app_url = (env.get("APP_URL") or "").rstrip("/")
    if app_url.startswith("https://") and app_url not in enderecos:
        enderecos.append(app_url)
    achados = []
    for endereco in enderecos:
        pagina = _buscar(f"{endereco}/")
        if pagina is None:
            achados.append(_achado(AVISO, area, f"{endereco}/ não respondeu (sem internet ou fora do ar)."))
            continue
        if MARCA_DO_APP not in pagina[2].decode("utf-8", "replace"):
            achados.append(_achado(AVISO, area, f"{endereco}/ respondeu {pagina[0]} sem a página do app."))
            continue
        monograma = _buscar(f"{endereco}{CAMINHO_DO_MONOGRAMA}")
        if monograma is None or monograma[0] != 200 or not monograma[1].startswith("image/png"):
            achados.append(_achado(AVISO, area, f"{endereco}{CAMINHO_DO_MONOGRAMA} não está publicado: os e-mails saem "
                                   "com o 'OF' em texto.", "Publique o build atual (merge na main)."))
        else:
            achados.append(_achado(CERTO, area, f"{endereco}/ no ar, com o monograma dos e-mails."))
    return achados


def _verificar_dns_do_remetente(env: dict[str, str]) -> list[dict]:
    """DKIM e SPF do Resend e o DMARC do domínio do remetente."""
    area = "DNS do remetente"
    dominio = _dominio_do_remetente(env.get("EMAIL_REMETENTE", ""))
    provedor = env.get("EMAIL_PROVEDOR", "")
    if provedor not in ("resend", "smtp") or not dominio or dominio in DOMINIOS_DE_EXEMPLO:
        return []
    achados = []
    if provedor == "resend":
        dkim = _dns(f"resend._domainkey.{dominio}", "TXT")
        if dkim is None:
            return [_achado(AVISO, area, "Não deu para consultar o DNS (sem internet?).")]
        if any("p=" in registro for registro in dkim):
            achados.append(_achado(CERTO, area, f"DKIM do Resend publicado (resend._domainkey.{dominio})."))
        else:
            achados.append(_achado(ERRO, area, f"Sem DKIM em resend._domainkey.{dominio}: o Resend não verifica o domínio.",
                                   "Resend > Domains > o domínio > registros DNS (Auto configure no Cloudflare)."))
        spf = _dns(f"send.{dominio}", "TXT") or []
        if any(registro.startswith("v=spf1") for registro in spf):
            achados.append(_achado(CERTO, area, f"SPF do envio publicado (send.{dominio})."))
        else:
            achados.append(_achado(AVISO, area, f"Sem SPF em send.{dominio}.", "Registros do Resend > Enable Sending."))
    # DMARC: no próprio domínio ou no domínio de cima (envio.x.com.br usa o de x.com.br).
    partes = dominio.split(".")
    dmarc = None
    for inicio in range(len(partes) - 1):
        registros = _dns(f"_dmarc.{'.'.join(partes[inicio:])}", "TXT") or []
        if dmarc := next((registro for registro in registros if registro.startswith("v=DMARC1")), None):
            break
    if not dmarc:
        achados.append(_achado(AVISO, area, f"Sem DMARC para {dominio}.", "Cloudflare > Email > DMARC Management."))
    else:
        politica = re.search(r"\bp=(\w+)", dmarc)
        achados.append(_achado(CERTO, area, f"DMARC publicado (p={politica.group(1) if politica else '?'})."))
    return achados


def _verificar_console_do_firebase(env: dict[str, str]) -> list[dict]:
    """URL de ação e domínios autorizados, lidos pela API (app/emails/console.py) com a conta de serviço."""
    area = "Firebase (Console)"
    projeto = env.get("FIREBASE_PROJECT_ID") or ler_env(ENV_WEB).get("VITE_FIREBASE_PROJECT_ID", "")
    console = f"https://console.firebase.google.com/project/{projeto}/authentication/emails" if projeto else "Console do Firebase"
    if not env.get("FIREBASE_CONTA_DE_SERVICO"):
        return [_achado(AVISO, area, "Sem FIREBASE_CONTA_DE_SERVICO: não dá para conferir a URL de ação e os domínios "
                        "autorizados.", console)]
    if not python_do_venv().is_file():
        return [_achado(AVISO, area, "Sem o api/.venv: rode 'python subir-app.py dev' para conferir o Console.")]
    try:
        resultado = subprocess.run(
            [str(python_do_venv()), "-m", "app.emails.console"],
            cwd=PASTA_API, capture_output=True, text=True, timeout=60, stdin=subprocess.DEVNULL,
        )
        dados = json.loads(resultado.stdout.strip().splitlines()[-1])
    except (OSError, subprocess.TimeoutExpired, ValueError, IndexError):
        return [_achado(AVISO, area, "A conferência do Console não respondeu (sem internet?).")]
    if not dados.get("conferido"):
        return [_achado(AVISO, area, f"Não deu para conferir o Console: {dados.get('motivo')}")]
    if not dados.get("problemas"):
        return [_achado(CERTO, area, "URL de ação personalizada e domínios autorizados batem com o APP_URL.")]
    return [_achado(AVISO, area, problema, console) for problema in dados["problemas"]]


def _ler_webhook(url: str) -> int | None:
    """Status do GET no webhook do Discord (200 = existe e o token vale). O GET
    só lê os dados do webhook: nenhuma mensagem é enviada."""
    pedido = urllib.request.Request(url, headers={"User-Agent": AGENTE_HTTP})
    try:
        with urllib.request.urlopen(pedido, timeout=TIMEOUT_REDE_S) as resposta:
            return resposta.status
    except urllib.error.HTTPError as falha:
        return falha.code
    except (urllib.error.URLError, OSError, ValueError):
        return None


def _verificar_webhooks_do_discord(env: dict[str, str]) -> list[dict]:
    area = "Alertas (Discord)"
    achados = []
    for canal, variavel in CANAIS_DO_DISCORD.items():
        valor = env.get(variavel, "")
        if not valor or not _REGEX_WEBHOOK_DO_DISCORD.match(valor):
            continue
        status = _ler_webhook(valor)
        if status == 200:
            achados.append(_achado(CERTO, area, f"Webhook do canal {canal} ativo no Discord."))
        elif status in (401, 403, 404):
            achados.append(_achado(ERRO, area, f"{variavel}: o Discord não reconhece o webhook (apagado ou token errado).",
                                   "Crie outro webhook no canal e troque o valor no api/.env."))
        else:
            achados.append(_achado(AVISO, area, f"Não deu para conferir o webhook do canal {canal} (sem internet?)."))
    return achados


def mostrar_achados(achados: list[dict], so_pendencias: bool = False) -> None:
    """Achados por área. Com so_pendencias (subida e status): só erros e
    avisos, recuados sob a etapa, e o "como resolver" só dos erros."""
    area_atual = None
    for achado in achados:
        nivel = achado["nivel"]
        if so_pendencias and nivel == CERTO:
            continue
        if not so_pendencias and achado["area"] != area_atual:
            area_atual = achado["area"]
            titulo(area_atual)
        recuo = "    " if so_pendencias else "  "
        simbolo = pintar(SIMBOLO[nivel], ESTADO_PARA_PAPEL[nivel], negrito=True)
        texto = f"{achado['area']}: {achado['texto']}" if so_pendencias else achado["texto"]
        print(f"{recuo}{simbolo} {texto}", file=sys.stderr if nivel == ERRO else sys.stdout)
        if achado["como"] and nivel != CERTO and (nivel == ERRO or not so_pendencias):
            print(f"{recuo}  {fraco('como resolver: ' + achado['como'])}")


def caixa_de_pendencias(achados: list[dict]) -> None:
    pendencias = [achado for achado in achados if achado["nivel"] != CERTO]
    if not pendencias:
        caixa("Nada faltando", [["Todas as verificações passaram."]])
        return
    linhas = []
    for achado in pendencias:
        marca = "ERRO " if achado["nivel"] == ERRO else "AVISO"
        texto = f"{marca} {achado['area']}: {achado['texto']}"
        linhas += textwrap.wrap(texto, LARGURA - 4, subsequent_indent="      ", break_long_words=False, break_on_hyphens=False)
    erros = sum(achado["nivel"] == ERRO for achado in pendencias)
    caixa(f"O que falta: {erros} erro(s), {len(pendencias) - erros} aviso(s)", [linhas], papel="erro" if erros else "aviso")


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
    etapa("Python", f"instalando o {texto_versao(PYTHON_RECOMENDADO)} pelo winget ({pacote})…", "espera")
    # Sem aceitar termos em nome do usuário: se o winget pedir, ele responde aqui.
    comando = ["winget", "install", "--id", pacote, "--exact", "--source", "winget", "--scope", "user", "--silent"]
    return rodar(comando).returncode == 0


def explicar_atualizacao_do_python() -> None:
    """Passo a passo para quando o script não consegue um Python novo sozinho."""
    recomendado = texto_versao(PYTHON_RECOMENDADO)
    etapa("Python", f"o api/.venv precisa de Python {texto_versao(PYTHON_MINIMO)}+ (o CI e o Docker usam o "
          f"{recomendado}); nenhum foi encontrado nem instalado.", "erro")
    if platform.system() == "Windows":
        passo(f"1. No PowerShell: winget install --id Python.Python.{recomendado} -e --scope user")
        passo("   Sem winget (ou bloqueado): baixe em https://www.python.org/downloads/ e,")
        passo("   no instalador, marque 'Add python.exe to PATH'. Não precisa de administrador.")
    elif platform.system() == "Darwin":
        passo(f"1. brew install python@{recomendado}   (ou o instalador de https://www.python.org/downloads/)")
    else:
        passo(f"1. sudo apt install python{recomendado} python{recomendado}-venv   "
              "(ou o gerenciador de pacotes da sua distribuição)")
    passo("2. Feche e abra o terminal: o PATH novo só vale em terminal novo.")
    passo("3. Rode de novo: python subir-app.py dev")


def criar_venv(motivo: str | None) -> bool:
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
    acao = f"recriando o api/.venv ({motivo})" if motivo else "criando o api/.venv"
    etapa("Python", f"{acao} com o Python {texto_versao(versao)}…", "espera")
    # --clear: um .venv quebrado ou de Python antigo é esvaziado antes.
    if rodar([*comando, "-m", "venv", "--clear", str(PASTA_VENV)]).returncode != 0:
        etapa("Python", f"não deu para criar o api/.venv com o Python {texto_versao(versao)}.", "erro")
        passo(f"Apague a pasta api/.venv e rode de novo. Persistindo: reinstale o Python {texto_versao(versao)}.")
        return False
    return True


def garantir_venv() -> bool:
    """Cria o api/.venv e instala as dependências quando necessário."""
    # Um .venv copiado de outra máquina, ou cujo Python base foi desinstalado ou
    # atualizado, tem o python.exe mas não roda: é recriado, não reaproveitado.
    versao = versao_do_python([str(python_do_venv())]) if python_do_venv().is_file() else None
    if not versao or versao < PYTHON_MINIMO:
        motivo = None
        if PASTA_VENV.exists():
            if versao:
                motivo = f"Python {texto_versao(versao)}, abaixo do {texto_versao(PYTHON_MINIMO)}"
            else:
                motivo = "o Python dele não roda" if python_do_venv().is_file() else "está incompleto"
        if not criar_venv(motivo):
            return False
        versao = versao_do_python([str(python_do_venv())]) or PYTHON_RECOMENDADO

    impressao = hash_de_arquivos(ARQUIVO_REQUISITOS)
    if MARCA_REQUISITOS.is_file() and MARCA_REQUISITOS.read_text(encoding="utf-8").strip() == impressao:
        etapa("Python", f"api/.venv com Python {texto_versao(versao)}, dependências em dia")
        return True

    etapa("Python", "instalando as dependências no api/.venv (demora na primeira vez)…", "espera")
    if rodar([str(python_do_venv()), "-m", "pip", "install", "--quiet", "--upgrade", "pip"]).returncode != 0:
        aviso("Não deu para atualizar o pip; seguindo com a versão atual.")
    comando = [str(python_do_venv()), "-m", "pip", "install", "--quiet", "-r", str(ARQUIVO_REQUISITOS)]
    if rodar(comando).returncode != 0:
        etapa("Python", "falha ao instalar o api/requirements-dev.txt.", "erro")
        return False
    MARCA_REQUISITOS.write_text(impressao, encoding="utf-8")
    etapa("Python", f"api/.venv com Python {texto_versao(versao)}, dependências instaladas")
    return True


# =============================================================================
# 2. Dependências do front-end (web/node_modules)
# =============================================================================
def comando_npm() -> str | None:
    return shutil.which("npm")


def garantir_node_modules() -> bool:
    node = shutil.which("node")
    npm = comando_npm()
    if not node or not npm:
        etapa("Front-end", f"Node.js não encontrado. Instale o Node.js {NODE_MINIMO}+ (https://nodejs.org).", "erro")
        return False
    versao = rodar([node, "--version"], silencioso=True).stdout.strip()
    if (achado := re.match(r"v(\d+)", versao)) and int(achado.group(1)) < NODE_MINIMO:
        aviso(f"Node.js {versao}: o projeto usa o {NODE_MINIMO}+ (o CI roda com o 20).")

    impressao = hash_de_arquivos(PACKAGE_LOCK)
    instalado = (NODE_MODULES / "vite").is_dir() and MARCA_NODE_MODULES.is_file()
    if instalado and MARCA_NODE_MODULES.read_text(encoding="utf-8").strip() == impressao:
        etapa("Front-end", f"Node.js {versao}, dependências em dia")
        return True

    # O "npm ci" apaga o node_modules; com o Vite rodando, o Windows trava os arquivos.
    parar_front_end(silencioso=True)
    etapa("Front-end", "npm ci (as versões exatas do package-lock.json)…", "espera")
    if rodar_etapa([npm, "ci", "--no-fund", "--no-audit"], pasta=PASTA_WEB).returncode != 0:
        etapa("Front-end", "o 'npm ci' falhou. Com o 'npm run dev' aberto em outro terminal, feche e rode de novo.", "erro")
        return False
    MARCA_NODE_MODULES.write_text(impressao, encoding="utf-8")
    etapa("Front-end", f"Node.js {versao}, dependências instaladas")
    return True


# =============================================================================
# 3. Docker, compose e imagens
# =============================================================================
def docker_responde() -> bool:
    return rodar(["docker", "info"], silencioso=True).returncode == 0


def garantir_docker() -> bool:
    if shutil.which("docker") is None:
        etapa("Docker", "o comando 'docker' não está no PATH. Instale o Docker Desktop.", "erro")
        return False
    if docker_responde():
        return True

    if platform.system() == "Windows" and CAMINHO_DOCKER_DESKTOP.is_file():
        etapa("Docker", "parado; abrindo o Docker Desktop…", "espera")
        subprocess.Popen([str(CAMINHO_DOCKER_DESKTOP)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        limite = time.monotonic() + TIMEOUT_DOCKER_S
        while time.monotonic() < limite:
            time.sleep(INTERVALO_SAUDE_S)
            if docker_responde():
                return True
        etapa("Docker", f"não respondeu em {TIMEOUT_DOCKER_S} s. Abra o Docker Desktop e rode de novo.", "erro")
        return False

    etapa("Docker", "não respondeu. Abra o Docker Desktop e espere ele iniciar.", "erro")
    return False


def arquivos_do_compose() -> list[str]:
    """Os "-f" de todo "docker compose": o arquivo do repositório, o override
    da raiz (quem tiver criado um à mão) e o complemento do modo atual. Todos
    os comandos (up, ps, logs, down) enxergam os mesmos serviços, inclusive o
    "web" que só existe no prod."""
    arquivos = ["-f", str(COMPOSE_DO_REPOSITORIO)]
    if COMPOSE_OVERRIDE_DA_RAIZ.is_file():
        arquivos += ["-f", str(COMPOSE_OVERRIDE_DA_RAIZ)]
    if COMPOSE_LOCAL.is_file():
        arquivos += ["-f", str(COMPOSE_LOCAL)]
    return arquivos


def compose(*argumentos: str) -> list[str]:
    return ["docker", "compose", *arquivos_do_compose(), *argumentos]


def _texto_yaml(valor: str) -> str:
    """Texto entre aspas para o YAML do compose ("$" dobrado: o compose o lê como variável)."""
    return json.dumps(valor.replace("$", "$$"))


def _montagem(origem: Path, destino: str, somente_leitura: bool = False) -> list[str]:
    linhas = ["      - type: bind", f"        source: {_texto_yaml(origem.as_posix())}", f"        target: {destino}"]
    return linhas + (["        read_only: true"] if somente_leitura else [])


def escrever_compose_local(modo: str) -> None:
    """
    Escreve o .subir-app/compose.local.yml do modo, com o que só existe nesta
    máquina e o que muda entre dev e prod.

    - Chave da conta de serviço dos e-mails: o api/.env guarda o caminho do
      Windows, que não existe no container. Ela entra como Docker secret, em
      /run/secrets, e a variável passa a apontar para lá (a variável do
      "environment" vale mais que a do env_file).
    - EMAIL_PROVEDOR=pasta: a pasta dos e-mails do container aparece em
      api/emails-enviados, para abrir e clicar no link.
    - dev: a API roda com --reload e lê api/app e api/painel direto da pasta
      (somente leitura). Salvar um .py reinicia a API em cerca de 1 s, sem
      reconstruir a imagem; o reload do uvicorn confere os arquivos por
      varredura, o que funciona na pasta do Windows montada no Docker.
    - prod: serviço "web", a imagem do web/Dockerfile (build do Vite servido
      pelo nginx) na 8080, na raiz (VITE_BASE=/, como num domínio próprio). O
      web/.env entra como secret de build: fica montado só durante o build e
      não vai para camada nenhuma da imagem.
    """
    env = ler_env(ENV_API)
    ambiente: list[str] = []
    volumes: list[str] = []
    segredos: dict[str, Path] = {}

    arquivo = arquivo_da_conta_de_servico(env.get("FIREBASE_CONTA_DE_SERVICO", ""))
    if arquivo is not None and arquivo.is_file():
        segredos["firebase_conta_de_servico"] = arquivo.resolve()
        ambiente.append(f"      FIREBASE_CONTA_DE_SERVICO: {SEGREDO_DA_CONTA_NO_CONTAINER}")
    if env.get("EMAIL_PROVEDOR") == "pasta":
        pasta = Path(env.get("EMAIL_PASTA") or "emails-enviados")
        pasta = (pasta if pasta.is_absolute() else PASTA_API / pasta).resolve()
        pasta.mkdir(parents=True, exist_ok=True)
        ambiente.append(f"      EMAIL_PASTA: {PASTA_DE_EMAILS_NO_CONTAINER}")
        volumes += _montagem(pasta, PASTA_DE_EMAILS_NO_CONTAINER)

    linhas = [
        f"# Gerado pelo subir-app.py (modo {modo}), com o que só existe nesta máquina.",
        "# Fora do Git (.subir-app/). Não edite: a próxima subida reescreve.",
        "services:",
        "  api:",
    ]
    if modo == "dev":
        linhas.append('    command: ["uvicorn", "app.main:criar_app", "--factory", "--host", "0.0.0.0", '
                      f'"--port", "{PORTA_API}", "--reload", "--reload-dir", "app"]')
        volumes += _montagem(PASTA_API / "app", "/app/app", somente_leitura=True)
        volumes += _montagem(PASTA_API / "painel", "/app/painel", somente_leitura=True)
    if ambiente:
        linhas += ["    environment:", *ambiente]
    if volumes:
        linhas += ["    volumes:", *volumes]
    if "firebase_conta_de_servico" in segredos:
        linhas += ["    secrets:", "      - firebase_conta_de_servico"]

    if modo == "prod":
        linhas += [
            "  web:",
            "    build:",
            f"      context: {_texto_yaml(PASTA_WEB.as_posix())}",
            "      args:",
            "        VITE_BASE: /",
        ]
        if ENV_WEB.is_file():
            segredos["env"] = ENV_WEB.resolve()
            linhas += ["      secrets:", "        - env"]
        linhas += [
            f'    ports: ["{PORTA_PROD}:80"]',
            "    depends_on:",
            "      api:",
            "        condition: service_healthy",
            # 127.0.0.1, e não localhost: o nginx escuta só em IPv4, e o
            # wget do alpine tentaria o ::1 primeiro.
            "    healthcheck:",
            '      test: ["CMD", "wget", "-q", "--spider", "http://127.0.0.1/"]',
            "      interval: 5s",
            "      timeout: 5s",
            "      retries: 12",
        ]

    if segredos:
        linhas.append("secrets:")
        for nome, caminho in segredos.items():
            linhas += [f"  {nome}:", f"    file: {_texto_yaml(caminho.as_posix())}"]
    PASTA_ESTADO.mkdir(exist_ok=True)
    COMPOSE_LOCAL.write_text("\n".join(linhas) + "\n", encoding="utf-8")


def imagens_necessarias() -> list[str]:
    """Imagens do compose e as imagens de base dos Dockerfiles, sem repetição."""
    resultado = rodar(compose("config", "--format", "json"), silencioso=True)
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
    imagens = imagens_necessarias()
    if not imagens:
        etapa("Docker", "não deu para ler o compose ('docker compose config' falhou).", "erro")
        return False

    baixadas = 0
    for imagem in imagens:
        if rodar(["docker", "image", "inspect", imagem], silencioso=True).returncode == 0:
            continue
        for tentativa in range(1, TENTATIVAS_DOWNLOAD + 1):
            etapa("Docker", f"baixando {imagem} (tentativa {tentativa}/{TENTATIVAS_DOWNLOAD})…", "espera")
            if rodar_etapa(["docker", "pull", imagem]).returncode == 0:
                baixadas += 1
                break
            if tentativa < TENTATIVAS_DOWNLOAD:
                passo(f"Nova tentativa em {ESPERA_ENTRE_TENTATIVAS_S} s (as camadas já baixadas são aproveitadas).")
                time.sleep(ESPERA_ENTRE_TENTATIVAS_S)
        else:
            etapa("Docker", f"não deu para baixar {imagem} em {TENTATIVAS_DOWNLOAD} tentativas.", "erro")
            passo("Rode de novo: o download continua de onde parou.")
            return False
    novas = f", {baixadas} baixada(s) agora" if baixadas else ""
    etapa("Docker", f"{len(imagens)} imagens de base na máquina{novas}")
    return True


# =============================================================================
# 4. Containers (MongoDB + API, e o nginx no prod)
# =============================================================================
def estado_dos_servicos() -> list[dict]:
    """Containers do compose (o "docker compose ps" devolve um JSON por linha)."""
    # --no-trunc: o "Command" inteiro, onde o status procura o --reload do dev.
    resultado = rodar(compose("ps", "--all", "--no-trunc", "--format", "json"), silencioso=True)
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


def _no_ar(servico: dict | None) -> bool:
    return bool(servico) and (servico.get("State") or "").lower() == "running"


def servico_no_ar(nome: str) -> bool:
    return any(s.get("Service") == nome and _no_ar(s) for s in estado_dos_servicos())


def subir_containers(reconstruir: bool, modo: str) -> bool:
    # Porta ocupada sem o serviço do compose no ar: outro processo (um
    # uvicorn à mão, um "docker run" do front-end) faria o "up" falhar no meio.
    ocupadas = [(PORTA_API, "api", "um 'uvicorn' rodando à mão?")]
    if modo == "prod":
        ocupadas.append((PORTA_PROD, "web", "um 'docker run' do front-end?"))
    for porta, servico, palpite in ocupadas:
        if porta_em_uso(porta) and not servico_no_ar(servico):
            etapa("Containers", f"a porta {porta} está ocupada por outro programa ({palpite}). Encerre e rode de novo.", "erro")
            return False

    # Aberta pela rede (http://<ip>:5173 ou :8080), a área do cliente chama a
    # API de outra origem: o compose repassa esta variável à API, que a soma
    # ao CORS_ORIGENS. Nada vai para o api/.env: o IP muda de rede em rede.
    ip = ip_na_rede()
    os.environ["CORS_ORIGENS_REDE"] = ",".join(f"http://{ip}:{porta}" for porta in (PORTA_WEB, PORTA_PROD)) if ip else ""

    # --remove-orphans: o "web" do prod sai quando o dev sobe (e vice-versa).
    acao = ["up", "-d", "--remove-orphans", *(["--build"] if reconstruir else [])]
    inicio = time.monotonic()
    if not DETALHADO:
        etapa("Containers", "construindo as imagens e subindo (1 a 3 min na primeira vez)…", "espera")
    if rodar_etapa(compose(*acao)).returncode != 0:
        etapa("Containers", "o 'docker compose up' falhou (mensagem acima).", "erro")
        return False
    return aguardar_saude(inicio, modo)


def aguardar_saude(inicio: float, modo: str) -> bool:
    """Espera todos os serviços do compose ficarem "healthy"."""
    limite = time.monotonic() + TIMEOUT_SAUDE_S
    pendentes: list[str] = []
    servicos: list[dict] = []
    while time.monotonic() < limite:
        servicos = estado_dos_servicos()
        pendentes = [
            f"{s.get('Service', '?')}: {_rotulo_estado(s)}"
            for s in servicos
            if not _no_ar(s) or (s.get("Health") or "healthy").lower() != "healthy"
        ]
        if servicos and not pendentes:
            ordem = list(NOMES_DOS_SERVICOS)
            nomes = sorted((s.get("Service") for s in servicos), key=lambda nome: ordem.index(nome) if nome in ordem else len(ordem))
            nomes = [NOMES_DOS_SERVICOS.get(nome, nome) for nome in nomes]
            recarga = f" {PONTO} API com recarga automática" if modo == "dev" else ""
            etapa("Containers", f"{', '.join(nomes)} saudáveis em {round(time.monotonic() - inicio)} s{recarga}")
            return True
        # Container que parou não volta sozinho (o compose não tem restart):
        # esperar os 3 minutos só adiaria o erro.
        if any((s.get("State") or "").lower() in ("exited", "dead") for s in servicos):
            break
        time.sleep(INTERVALO_SAUDE_S)

    etapa("Containers", f"não subiu: {', '.join(pendentes) or 'containers'}.", "erro")
    com_problema = [s.get("Service") for s in servicos if not _no_ar(s) or (s.get("Health") or "healthy").lower() != "healthy"]
    for servico in [nome for nome in ("api", "web") if nome in com_problema] or ["api"]:
        passo(f"Fim do log do serviço {servico}:")
        log = rodar(compose("logs", "--no-color", "--tail", "15", servico), silencioso=True).stdout
        for linha in log.strip().splitlines()[-15:]:
            passo(f"  {linha}")
    passo("Log completo: python subir-app.py logs")
    return False


# =============================================================================
# 5. Front-end do dev (Vite em segundo plano)
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
    estado = vite_do_script_ativo()
    if estado and e_deste_projeto(URL_WEB):
        if estado.get("rede"):
            etapa("Vite", f"já no ar (PID {estado['pid']}), HMR ligado")
            return True
        # Subido por uma versão anterior do script, só para esta máquina.
        parar_front_end(silencioso=True)
    if porta_em_uso(PORTA_WEB):
        if e_deste_projeto(URL_WEB):
            etapa("Vite", "já no ar fora do subir-app (um 'npm run dev' aberto), HMR ligado")
            if not e_deste_projeto(url_na_rede(PORTA_WEB, CAMINHO_WEB) or ""):
                passo("Esse Vite não atende pela rede local: feche o 'npm run dev' e rode de novo para abrir no celular.")
            return True
        etapa("Vite", f"a porta {PORTA_WEB} está ocupada por outro programa.", "erro")
        return False

    node = shutil.which("node")
    vite = NODE_MODULES / "vite" / "bin" / "vite.js"
    if not node or not vite.is_file():
        etapa("Vite", "não encontrado em web/node_modules. Rode 'python subir-app.py dev' sem '--sem-web'.", "erro")
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
    inicio = time.monotonic()
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
            etapa("Vite", f"no ar em {round(time.monotonic() - inicio)} s (PID {processo.pid}), HMR ligado")
            return True
        if processo.poll() is not None:
            break
        time.sleep(0.5)

    if processo.poll() is None:
        encerrar_processo(processo.pid, "node")
    etapa("Vite", f"não respondeu em {URL_WEB}. Fim de {LOG_WEB.relative_to(RAIZ)}:", "erro")
    for linha in LOG_WEB.read_text(encoding="utf-8", errors="replace").strip().splitlines()[-5:]:
        passo(f"  {linha}")
    return False


def parar_front_end(silencioso: bool = False) -> bool:
    estado = vite_do_script_ativo()
    if not estado:
        ESTADO_WEB.unlink(missing_ok=True)
        if not silencioso:
            if porta_em_uso(PORTA_WEB):
                etapa("Vite", f"um Vite de fora do subir-app segue na porta {PORTA_WEB}: feche o terminal do 'npm run dev'.", "aviso")
            else:
                etapa("Vite", "já estava parado")
        return True
    if not encerrar_processo(estado["pid"], "node"):
        etapa("Vite", f"não deu para encerrar o PID {estado['pid']}. Encerre 'node' no Gerenciador de Tarefas.", "erro")
        return False
    ESTADO_WEB.unlink(missing_ok=True)
    if not silencioso:
        etapa("Vite", f"encerrado (PID {estado['pid']})")
    return True


# =============================================================================
# 6. Situação, endereços e painel
# =============================================================================
def front_no_ar() -> dict | None:
    """O front-end que está respondendo: o nginx do prod ou o Vite do dev."""
    if servico_no_ar("web") and e_deste_projeto(URL_PROD):
        return {"modo": "prod", "porta": PORTA_PROD, "caminho": CAMINHO_PROD, "local": URL_PROD,
                "rede": url_na_rede(PORTA_PROD, CAMINHO_PROD), "descricao": f"nginx na porta {PORTA_PROD} (build otimizado)"}
    if e_deste_projeto(URL_WEB):
        estado = vite_do_script_ativo()
        origem = f"PID {estado['pid']}" if estado else "fora do subir-app"
        return {"modo": "dev", "porta": PORTA_WEB, "caminho": CAMINHO_WEB, "local": URL_WEB,
                "rede": url_na_rede(PORTA_WEB, CAMINHO_WEB), "descricao": f"Vite com HMR ({origem})"}
    return None


def mostrar_enderecos(front: dict | None, dicas: bool = False) -> None:
    """Local, Network e túnel, no formato do próprio Vite."""
    seta = pintar(SETA, "marca", negrito=True)
    if front is None:
        aviso("Front-end fora do ar: python subir-app.py dev (ou prod).")
    else:
        print(f"  {seta} {'Local'.ljust(9)}{pintar(front['local'], 'destaque')}")
        rede = front["rede"]
        if not rede:
            print(f"  {seta} {'Network'.ljust(9)}{fraco('nenhuma rede local encontrada')}")
        elif e_deste_projeto(rede):
            print(f"  {seta} {'Network'.ljust(9)}{pintar(rede, 'destaque')}")
        else:
            print(f"  {seta} {'Network'.ljust(9)}{rede} {fraco('(sem resposta: confira o firewall)')}")
    tunel = tunel_aberto()
    if tunel:
        endereco = f"{tunel['url']}{tunel.get('caminho', CAMINHO_WEB)}"
        print(f"  {pintar(SETA, 'aviso', negrito=True)} {'Túnel'.ljust(9)}{pintar(endereco, 'aviso')} "
              f"{fraco('(público; fechar: tunnel stop)')}")
    else:
        print(f"  {fraco(SETA)} {fraco('Túnel'.ljust(9) + 'fechado ' + PONTO + ' python subir-app.py tunnel start')}")
    if dicas and front and front["rede"]:
        passo("Mesma rede (Wi-Fi ou cabo): abra o Network no celular. Não abriu? Libere no Firewall do Windows (rede privada).")


def descricao_do_firebase() -> str:
    env_web = ler_env(ENV_WEB)
    if env_web.get("VITE_FIREBASE_EMULADOR", "").lower() == "true":
        return "emuladores locais (Auth 9099, Firestore 8088)"
    if env_web.get("VITE_FIREBASE_PROJECT_ID"):
        return f"projeto {env_web['VITE_FIREBASE_PROJECT_ID']}"
    return fraco("não configurado (crie o web/.env a partir do web/.env.example)")


def descricao_dos_emails(env: dict[str, str]) -> str:
    """Como saem os e-mails da conta (provedor, remetente e para onde os links levam)."""
    provedor = env.get("EMAIL_PROVEDOR", "")
    if not provedor:
        return fraco("desligados na API: o Firebase manda o modelo genérico dele")
    if provedor == "pasta":
        return f"gravados em api/emails-enviados {fraco(PONTO + ' links para ' + env.get('APP_URL', '?'))}"
    return f"{provedor}, de {env.get('EMAIL_REMETENTE', '?')} {fraco(PONTO + ' links para ' + env.get('APP_URL', '?'))}"


def descricao_dos_alertas(env: dict[str, str]) -> str:
    ligados = [canal for canal, variavel in CANAIS_DO_DISCORD.items() if env.get(variavel)]
    if not ligados:
        return fraco("desligados (DISCORD_WEBHOOK_* no api/.env)")
    return f"Discord: {', '.join(ligados)}"


def painel(pendencias: int, dicas: bool = False) -> None:
    """Endereços, acessos e atalhos (sem mostrar senha nem segredo)."""
    env = ler_env(ENV_API)
    print()
    mostrar_enderecos(front_no_ar(), dicas=dicas)
    print()
    extras = f"{PONTO} painel /painel/"
    if env.get("AMBIENTE", "desenvolvimento") != "producao":
        extras += f" {PONTO} Swagger /docs"
    linhas = [
        ("API", f"{pintar(URL_API, 'destaque')} {fraco(extras)}"),
        ("Admin", f"{env.get('ADMIN_EMAIL') or '(defina ADMIN_EMAIL no api/.env)'} "
                  f"{fraco(PONTO + ' senha na chave ADMIN_SENHA do api/.env')}"),
        ("Firebase", descricao_do_firebase()),
        ("E-mails", descricao_dos_emails(env)),
        ("Alertas", descricao_dos_alertas(env)),
    ]
    for rotulo, valor in linhas:
        print(f"  {fraco(rotulo.ljust(11))}{valor}")
    if pendencias:
        print()
        aviso(f"{pendencias} pendência(s) de configuração {PONTO} python subir-app.py verificar")
    print()
    atalhos = [("logs", "logs"), ("túnel", "tunnel start"), ("testes", "testes"), ("parar", "down")]
    colunas = [f"{nome.ljust(7)}python subir-app.py {comando}" for nome, comando in atalhos]
    print("  " + fraco(colunas[0].ljust(40) + colunas[1]))
    print("  " + fraco(colunas[2].ljust(40) + colunas[3]))
    print()


def resumo_da_situacao() -> None:
    titulo("Serviços", antes=False)
    servicos = {s.get("Service"): s for s in estado_dos_servicos()}
    for nome, descricao in (("mongo", "MongoDB"), ("api", "API")):
        servico = servicos.get(nome)
        if not servico:
            etapa(descricao, "fora do ar", "aviso")
            continue
        saudavel = _no_ar(servico) and (servico.get("Health") or "").lower() == "healthy"
        recarga = f" {PONTO} recarga automática (dev)" if "--reload" in (servico.get("Command") or "") else ""
        etapa(descricao, f"{_rotulo_estado(servico)}{recarga}", "ok" if saudavel else "aviso")

    # O túnel aparece logo abaixo, nos endereços (em âmbar quando aberto).
    front = front_no_ar()
    if front:
        etapa("Front-end", f"{front['modo']} {PONTO} {front['descricao']}")
    else:
        etapa("Front-end", "fora do ar", "aviso")


def links_da_nuvem() -> None:
    repositorio = endereco_do_repositorio()
    dono, nome = repositorio.rstrip("/").split("/")[-2:]
    projeto_firebase = ler_env(ENV_WEB).get("VITE_FIREBASE_PROJECT_ID")
    titulo("Links", antes=False)
    linhas = [
        ("Publicado", f"https://{dono.lower()}.github.io/{nome}/"),
        ("Repositório", f"{repositorio} {fraco(PONTO + ' /actions ' + PONTO + ' /pulls')}"),
    ]
    if projeto_firebase:
        linhas.append(("Firebase", f"https://console.firebase.google.com/project/{projeto_firebase}"))
    for rotulo, valor in linhas:
        print(f"  {fraco(rotulo.ljust(13))}{valor}")
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
    etapa("cloudflared", f"baixando {arquivo} de github.com/cloudflare/cloudflared…", "espera")
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
        etapa("cloudflared", f"não deu para baixar: {falha}", "erro")
        passo("Instale à mão (Windows: winget install --id Cloudflare.cloudflared; macOS: brew install cloudflared).")
        return None
    if platform.system() != "Windows":
        destino.chmod(0o755)
    return destino


def ler_estado_tunel() -> dict | None:
    try:
        return json.loads(ESTADO_TUNEL.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def gravar_estado_tunel(pid: int, url: str | None, porta: int, caminho: str) -> None:
    ESTADO_TUNEL.write_text(
        json.dumps(
            {"pid": pid, "url": url, "porta": porta, "caminho": caminho, "inicio": datetime.now().isoformat(timespec="seconds")},
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


def mostrar_tunel(endereco: str) -> None:
    caixa(
        "Acesso externo aberto (túnel da Cloudflare)",
        [
            [f"Área do cliente: {endereco}"],
            [
                "Qualquer pessoa com este endereço chega ao login, e o cadastro está aberto.",
                "Mande só para quem vai ver a demonstração. O endereço muda a cada início.",
                "Painel administrativo e Swagger não passam pelo túnel: continuam só locais.",
                "Fechar: python subir-app.py tunnel stop   (ou npm run tunnel:stop em web/)",
            ],
        ],
        papel="aviso",
    )


def parar_tunel() -> bool:
    """Encerra o cloudflared do "tunnel start": o endereço público deixa de existir."""
    estado = ler_estado_tunel()
    if not estado:
        etapa("Túnel", "nenhum aberto: o app já é só local")
        return True
    pid = estado.get("pid")
    if processo_ativo(pid, "cloudflared") and not encerrar_processo(pid, "cloudflared"):
        etapa("Túnel", f"não deu para encerrar o cloudflared (PID {pid}). Encerre-o no Gerenciador de Tarefas.", "erro")
        return False
    ESTADO_TUNEL.unlink(missing_ok=True)
    etapa("Túnel", f"fechado: {estado.get('url') or 'o endereço público'} deixou de funcionar")
    return True


# =============================================================================
# Comandos
# =============================================================================
def _pendencias() -> int:
    return sum(achado["nivel"] != CERTO for achado in verificar_configuracao())


def comando_dev(reconstruir: bool, com_web: bool) -> int:
    global DETALHADO
    DETALHADO = True
    inicio = time.monotonic()
    cabecalho("Vite com HMR, API com recarga automática, saída completa dos comandos", modo="dev")
    if not garantir_configuracao():
        return 1
    # A API em si roda no Docker, então a subida segue sem o .venv. Mas os
    # testes e o editor dependem dele: a falha volta no fim e o código de saída é 1.
    venv_pronto = garantir_venv()
    if com_web and not garantir_node_modules():
        return 1
    if not garantir_docker():
        return 1
    escrever_compose_local("dev")
    if not baixar_imagens():
        return 1

    tudo_no_ar = subir_containers(reconstruir, "dev")
    if com_web:
        tudo_no_ar = subir_front_end() and tudo_no_ar
    painel(_pendencias())
    if not venv_pronto:
        erro("O api/.venv não ficou pronto (etapa Python acima): 'testes' e o editor dependem dele.")
    fim(inicio, tudo_no_ar and venv_pronto)
    return 0 if tudo_no_ar and venv_pronto else 1


def comando_prod(reconstruir: bool) -> int:
    global DETALHADO
    DETALHADO = False
    inicio = time.monotonic()
    cabecalho(f"Build otimizado no nginx (porta {PORTA_PROD}), API da imagem, saída enxuta", modo="prod")
    if not garantir_configuracao() or not garantir_docker():
        return 1
    # Os dois modos na mesma API confundem (qual front testou o quê?): o
    # Vite do dev sai. Um "npm run dev" aberto à mão fica, e o painel mostra o nginx.
    if vite_do_script_ativo() and parar_front_end(silencioso=True):
        etapa("Vite", "do modo dev encerrado (o prod serve o build)")
    escrever_compose_local("prod")
    if not baixar_imagens():
        return 1
    tudo_no_ar = subir_containers(reconstruir, "prod")
    painel(_pendencias())
    fim(inicio, tudo_no_ar)
    return 0 if tudo_no_ar else 1


def comando_status() -> int:
    cabecalho("Situação do ambiente local")
    if not docker_responde():
        aviso("O Docker não está respondendo: MongoDB e API aparecem como fora do ar.")
    resumo_da_situacao()
    pendencias = [achado for achado in verificar_configuracao() if achado["nivel"] != CERTO]
    if pendencias:
        titulo("Pendências (verificação local)")
        mostrar_achados(pendencias, so_pendencias=True)
    painel(len(pendencias), dicas=True)
    links_da_nuvem()
    return 0


def comando_verificar(com_rede: bool) -> int:
    """Todas as verificações, com o que está certo e o que falta; nada é alterado."""
    cabecalho("Verificação da configuração (só leitura)")
    achados = verificar_configuracao()
    if com_rede:
        passo("Consultando a internet: Pages, APP_URL, DNS do remetente, Console do Firebase e Discord…")
        achados += verificar_na_rede()
    else:
        aviso("--sem-rede: Pages, APP_URL, DNS, Console do Firebase e Discord não foram conferidos.")
    mostrar_achados(achados)
    caixa_de_pendencias(achados)
    return 1 if any(achado["nivel"] == ERRO for achado in achados) else 0


def comando_down(apagar_dados: bool) -> int:
    cabecalho("Derrubando o ambiente local")
    tudo_certo = True
    # Sem o front-end, o túnel não serve para nada; aberto, ele só expõe um erro.
    if ler_estado_tunel():
        tudo_certo = parar_tunel()
    tudo_certo = parar_front_end() and tudo_certo

    if not docker_responde():
        etapa("Containers", "Docker parado: não há containers no ar")
        print()
        return 0 if tudo_certo else 1
    comando = compose("down", "--remove-orphans")
    if apagar_dados:
        aviso("--apagar-dados: o volume do MongoDB será apagado (usuários e senhas somem de vez).")
        comando.append("-v")
    if rodar(comando, silencioso=True).returncode != 0:
        etapa("Containers", "o 'docker compose down' falhou. Rode 'docker compose down' para ver a mensagem.", "erro")
        return 1
    if apagar_dados:
        etapa("Containers", "parados e dados removidos (a próxima subida recria o administrador inicial)")
    else:
        etapa("Containers", "parados (os dados do MongoDB continuam no volume)")
    print()
    return 0 if tudo_certo else 1


def comando_tunnel_start() -> int:
    cabecalho("Acesso externo (túnel da Cloudflare)")
    estado = tunel_aberto()
    if estado:
        etapa("Túnel", f"já aberto (PID {estado['pid']}); nada foi reiniciado")
        mostrar_tunel(f"{estado['url']}{estado.get('caminho', CAMINHO_WEB)}")
        return 0

    front = front_no_ar()
    if front is None:
        etapa("Túnel", "nenhum front-end respondeu (nem o Vite do dev, nem o nginx do prod).", "erro")
        passo("Suba o ambiente antes: python subir-app.py dev (ou prod)")
        return 1
    if ler_pagina(f"{URL_API}/saude") is None:
        aviso("A API não respondeu: pelo túnel, as telas do livro-caixa vão avisar que o servidor está fora.")

    binario = localizar_cloudflared() or baixar_cloudflared()
    if not binario:
        return 1

    PASTA_ESTADO.mkdir(exist_ok=True)
    # O túnel publica só a porta do front-end. A API chega pelo proxy dele, e
    # só nas rotas do cliente (web/vite.config.js no dev, web/nginx.conf no prod).
    destino = f"http://localhost:{front['porta']}"
    comando = [str(binario), "tunnel", "--no-autoupdate", "--url", destino]
    # O cloudflared continua rodando depois que este terminal fecha.
    opcoes: dict = {"stdin": subprocess.DEVNULL, "stderr": subprocess.STDOUT, "cwd": PASTA_ESTADO}
    if platform.system() == "Windows":
        opcoes["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.CREATE_NO_WINDOW
    else:
        opcoes["start_new_session"] = True
    etapa("Túnel", f"abrindo para o front-end do {front['modo']} ({destino})…", "espera")
    with LOG_TUNEL.open("wb") as log:
        processo = subprocess.Popen(comando, stdout=log, **opcoes)
    # Gravado já, antes do endereço: se algo falhar daqui em diante, o
    # "tunnel stop" ainda acha o processo e fecha o túnel.
    gravar_estado_tunel(processo.pid, None, front["porta"], front["caminho"])

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
            etapa("Túnel", f"a Cloudflare não devolveu o endereço público em {TIMEOUT_URL_TUNEL_S} s.", "erro")
        else:
            etapa("Túnel", "o cloudflared parou sem devolver o endereço público.", "erro")
        ESTADO_TUNEL.unlink(missing_ok=True)
        passo(f"Log: {LOG_TUNEL.relative_to(RAIZ)}. Em rede de empresa, o firewall pode bloquear o túnel.")
        return 1

    gravar_estado_tunel(processo.pid, url, front["porta"], front["caminho"])
    etapa("Túnel", f"aberto (PID {processo.pid}) {PONTO} log em {LOG_TUNEL.relative_to(RAIZ)}")
    mostrar_tunel(f"{url}{front['caminho']}")
    return 0


def comando_tunnel_stop() -> int:
    cabecalho("Acesso externo (túnel da Cloudflare)")
    resultado = parar_tunel()
    print()
    return 0 if resultado else 1


def comando_testes() -> int:
    cabecalho("Testes automatizados (os mesmos do CI)")
    if not garantir_venv() or not garantir_node_modules():
        return 1
    npm = comando_npm()

    etapas = [
        ("API (pytest)", [str(python_do_venv()), "-m", "pytest", "-q"], PASTA_API),
        ("Front-end: lint (oxlint)", [npm, "run", "lint"], PASTA_WEB),
        # Os módulos em TypeScript (.ts/.tsx) passam pelo tsc, só conferindo.
        ("Front-end: tipos (TypeScript)", [npm, "run", "typecheck"], PASTA_WEB),
        ("Front-end: testes (Vitest)", [npm, "test", "--", "--run"], PASTA_WEB),
        # O CI também gera o build: um import quebrado passa nos testes e só falha aqui.
        ("Front-end: build (Vite)", [npm, "run", "build"], PASTA_WEB),
    ]
    resultados = []
    for nome, comando, pasta in etapas:
        titulo(nome)
        aprovado = rodar(comando, pasta=pasta).returncode == 0
        resultados.append((nome, aprovado))

    linhas = [f"{(SIMBOLO['ok'] if aprovado else SIMBOLO['erro'])} {nome.ljust(30)} {'aprovado' if aprovado else 'REPROVADO'}"
              for nome, aprovado in resultados]
    todos = all(aprovado for _, aprovado in resultados)
    caixa("Resultado dos testes", [linhas], papel="marca" if todos else "erro")
    return 0 if todos else 1


def seguir_arquivo(arquivo: Path, linhas_iniciais: int = 50) -> int:
    """Mostra o fim do arquivo e o que for chegando (como o "tail -f")."""
    with arquivo.open(encoding="utf-8", errors="replace") as leitura:
        print("".join(leitura.readlines()[-linhas_iniciais:]), end="")
        while True:
            linha = leitura.readline()
            if linha:
                print(linha, end="")
            else:
                time.sleep(0.5)


def comando_logs(servico: str) -> int:
    cabecalho(f"Logs: {servico}")
    passo("Ctrl+C sai; os serviços continuam no ar.")
    print()
    try:
        if servico == "vite":
            if not LOG_WEB.is_file():
                etapa("Vite", "sem log: ele sobe com python subir-app.py dev.", "aviso")
                return 1
            return seguir_arquivo(LOG_WEB)
        if not docker_responde():
            etapa("Docker", "não está respondendo: não há logs de container para mostrar.", "erro")
            return 1
        alvo = [] if servico == "todos" else [servico]
        return rodar(compose("logs", "-f", "--tail", "100", *alvo)).returncode
    except KeyboardInterrupt:
        print()
        return 0


def comando_alertas() -> int:
    """Manda uma mensagem de teste para cada canal configurado no api/.env."""
    cabecalho("Teste dos alertas no Discord")
    env = ler_env(ENV_API)
    configurados = {canal: env.get(variavel, "") for canal, variavel in CANAIS_DO_DISCORD.items()}
    if not any(configurados.values()):
        etapa("Alertas", "nenhum webhook no api/.env (DISCORD_WEBHOOK_SISTEMA, _SEGURANCA, _TELEMETRIA).", "aviso")
        passo("Como criar: Discord > canal > Editar canal > Integrações > Webhooks (README, Monitoramento).")
        print()
        return 1
    falhas = 0
    for canal, url in configurados.items():
        variavel = CANAIS_DO_DISCORD[canal]
        if not url:
            etapa(canal, f"desligado ({variavel} vazio)", "aviso")
            continue
        if not _REGEX_WEBHOOK_DO_DISCORD.match(url):
            etapa(canal, f"{variavel} não é um webhook do Discord", "erro")
            falhas += 1
            continue
        mensagem = {
            "username": "OliFine",
            "allowed_mentions": {"parse": []},
            "embeds": [{
                "title": "Teste de alerta",
                "description": f"Canal **{canal}** ligado. Mensagem mandada pelo subir-app, não por um evento real.",
                "color": 0x459B72,
                "footer": {"text": "subir-app · teste"},
                "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            }],
        }
        pedido = urllib.request.Request(
            url, data=json.dumps(mensagem).encode("utf-8"), method="POST",
            headers={"Content-Type": "application/json", "User-Agent": AGENTE_HTTP},
        )
        try:
            with urllib.request.urlopen(pedido, timeout=TIMEOUT_REDE_S):
                pass
            etapa(canal, "mensagem de teste entregue")
        except urllib.error.HTTPError as falha:
            etapa(canal, f"o Discord respondeu {falha.code} (webhook apagado ou token errado?)", "erro")
            falhas += 1
        except (urllib.error.URLError, OSError) as falha:
            etapa(canal, f"sem resposta do Discord ({type(falha).__name__})", "erro")
            falhas += 1
    print()
    return 1 if falhas else 0


# =============================================================================
# Menu e linha de comando
# =============================================================================
MENU = [
    ("dev", "Desenvolvimento: Vite com HMR, API com recarga, saída completa"),
    ("prod", f"Produção local: build otimizado no nginx ({PORTA_PROD}), saída enxuta"),
    ("status", "O que está no ar, endereços e pendências"),
    ("verificar", "Configuração, DNS, Pages, Firebase e Discord (só leitura)"),
    ("testes", "Lint, tipos, testes e build, como o CI"),
    ("logs", "Acompanhar os logs da API (Ctrl+C sai)"),
    ("tunnel start", "Abrir um endereço público temporário"),
    ("tunnel stop", "Fechar o endereço público"),
    ("alertas", "Mensagem de teste em cada canal do Discord"),
    ("down", "Parar tudo (os dados do banco ficam)"),
]


def menu() -> list[str] | None:
    """Menu numerado quando o script roda sem argumentos num terminal."""
    cabecalho("O que você quer fazer?")
    for numero, (comando, descricao) in enumerate(MENU, 1):
        print(f"  {pintar(str(numero).rjust(2), 'destaque', negrito=True)}  {comando.ljust(14)}{fraco(descricao)}")
    print(f"  {fraco(' 0  sair')}")
    try:
        escolha = input(f"\n  {pintar(SETA, 'marca', negrito=True)} ").strip()
    except EOFError:
        return None
    if escolha.isdigit() and 1 <= int(escolha) <= len(MENU):
        return MENU[int(escolha) - 1][0].split()
    if escolha not in ("", "0"):
        aviso(f"Opção {escolha} não existe.")
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="subir-app.py",
        description=(
            "OliFine (Pessoal Finance): sobe o ambiente local em modo dev (Vite com HMR, API com recarga) ou prod "
            "(build otimizado no nginx), confere o que falta configurar e mostra os endereços. Sem argumentos, "
            "abre um menu."
        ),
    )
    subcomandos = parser.add_subparsers(dest="comando")
    dev = subcomandos.add_parser("dev", aliases=["up"], help="Desenvolvimento: Vite com HMR, API com recarga, saída completa.")
    dev.add_argument(
        "--sem-build",
        action="store_true",
        help="Não reconstrói a imagem da API (sobe mais rápido quando as dependências da API não mudaram).",
    )
    dev.add_argument("--sem-web", action="store_true", help="Não sobe o front-end (Vite); só MongoDB e API.")
    prod = subcomandos.add_parser("prod", help=f"Produção local: build otimizado no nginx ({PORTA_PROD}), saída enxuta.")
    prod.add_argument("--sem-build", action="store_true", help="Reaproveita as imagens já construídas.")
    subcomandos.add_parser("status", help="Mostra o que está no ar, os endereços e as pendências, sem subir nada.")
    verificar = subcomandos.add_parser(
        "verificar", help="Confere a configuração (arquivos, DNS, Pages, Firebase, Discord) e aponta o que falta."
    )
    verificar.add_argument("--sem-rede", action="store_true", help="Só as verificações locais, sem internet.")
    subcomandos.add_parser("testes", help="Roda lint, tipos, testes e build da API e do front-end, como o CI.")
    logs = subcomandos.add_parser("logs", help="Acompanha os logs de um serviço (Ctrl+C sai).")
    logs.add_argument("servico", nargs="?", default="api", choices=["api", "web", "mongo", "vite", "todos"],
                      help="api (padrão), web (nginx do prod), mongo, vite (dev) ou todos os containers.")
    subcomandos.add_parser("alertas", help="Manda uma mensagem de teste para cada canal do Discord do api/.env.")
    down = subcomandos.add_parser("down", help="Para o túnel, o Vite e os containers (os dados do banco ficam).")
    down.add_argument("--apagar-dados", action="store_true", help="Também apaga o volume do MongoDB.")
    tunel = subcomandos.add_parser("tunnel", help="Abre ou fecha um endereço público temporário (túnel da Cloudflare).")
    tunel.add_argument("acao", choices=["start", "stop"], help="start abre o túnel; stop fecha.")

    argv = sys.argv[1:] if argv is None else argv
    if not argv:
        if not sys.stdin.isatty():
            parser.print_help()
            return 2
        argv = menu()
        if argv is None:
            return 0
    argumentos = parser.parse_args(argv)
    if argumentos.comando in ("dev", "up"):
        return comando_dev(reconstruir=not argumentos.sem_build, com_web=not argumentos.sem_web)
    if argumentos.comando == "prod":
        return comando_prod(reconstruir=not argumentos.sem_build)
    if argumentos.comando == "status":
        return comando_status()
    if argumentos.comando == "verificar":
        return comando_verificar(com_rede=not argumentos.sem_rede)
    if argumentos.comando == "testes":
        return comando_testes()
    if argumentos.comando == "logs":
        return comando_logs(argumentos.servico)
    if argumentos.comando == "alertas":
        return comando_alertas()
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
        erro("Interrompido. Rode de novo: o que já foi feito é aproveitado.")
        sys.exit(1)
