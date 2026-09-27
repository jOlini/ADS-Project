#!/usr/bin/env python3
"""
OliFine (projeto Pessoal Finance, ADS-Project) — ambiente local com um comando.

    python subir-app.py up                  sobe o ambiente (detalhes abaixo)
    python subir-app.py status              mostra o que está no ar, os links e o que falta configurar
    python subir-app.py verificar           confere a configuração inteira e aponta o que falta
    python subir-app.py testes              roda lint, testes e build da API e do front-end, como o CI
    python subir-app.py down                derruba o ambiente (os dados do banco ficam)
    python subir-app.py tunnel start        abre um endereço público temporário (Cloudflare)
    python subir-app.py tunnel stop         fecha esse endereço (o app volta a ser só local)

"up" faz, nesta ordem:
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
       Windows no api/.env não existe dentro do container) e, com
       EMAIL_PROVEDOR=pasta, os e-mails gravados aparecem em api/emails-enviados.
    5. Front-end: sobe o Vite em segundo plano na porta 5173, aberto para a rede
       local (--host 0.0.0.0): celular e outros computadores da mesma rede
       abrem o app pelo IP desta máquina. Se já estiver no ar, reaproveita.
    6. Painel: imprime os links importantes, os endereços Local e Network (rede
       local), como entrar no painel administrativo, como saem os e-mails da
       conta e quantas pendências de configuração existem.

"verificar" junta as verificações locais às que precisam de internet: o APP_URL
e o monograma dos e-mails publicados, o site do GitHub Pages, o DNS do domínio
do remetente (DKIM, SPF e DMARC, por DNS sobre HTTPS) e o Console do Firebase
(URL de ação personalizada e domínios autorizados, lidos com a conta de serviço
pelo api/.venv). Só lê: nada é alterado. Com --sem-rede, fica nas locais.

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
import textwrap
import time
import urllib.error
import urllib.parse
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

# Compose: o arquivo do repositório, o override da raiz (se alguém criou um à
# mão, fora do Git) e o complemento que este script gera a cada "up" com o que
# só existe nesta máquina (a chave da conta de serviço, a pasta dos e-mails).
COMPOSE_DO_REPOSITORIO = RAIZ / "docker-compose.yml"
COMPOSE_OVERRIDE_DA_RAIZ = RAIZ / "docker-compose.override.yml"
COMPOSE_LOCAL = PASTA_ESTADO / "compose.local.yml"
# Onde a API do container lê a chave da conta de serviço (Docker secret) e
# grava os e-mails com EMAIL_PROVEDOR=pasta (WORKDIR da imagem + EMAIL_PASTA).
SEGREDO_DA_CONTA_NO_CONTAINER = "/run/secrets/firebase_conta_de_servico"
PASTA_DE_EMAILS_NO_CONTAINER = "/app/emails-enviados"

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

    # O livro-caixa só aceita o ID token do projeto Firebase da área do cliente.
    # Vazio, a API responde 503 ("Login do cliente indisponível") a todo login;
    # diferente do web/.env, responde 401. O api/.env criado antes do web/.env
    # (máquina nova) fica vazio: por isso a cópia acontece a cada subida.
    projeto_api = ler_env(ENV_API).get("FIREBASE_PROJECT_ID", "")
    projeto_web = ler_env(ENV_WEB).get("VITE_FIREBASE_PROJECT_ID", "")
    if not projeto_api and projeto_web:
        texto = ENV_API.read_text(encoding="utf-8")
        ENV_API.write_text(definir_chave(texto, "FIREBASE_PROJECT_ID", projeto_web), encoding="utf-8", newline="\n")
        ok(f"FIREBASE_PROJECT_ID copiado do web/.env para o api/.env ({projeto_web}).")
    if ENV_WEB.is_file():
        ok("web/.env encontrado.")

    # As mesmas verificações locais do "verificar"; aqui só aparece o que
    # falta. Um erro (a API não subiria, ou um segredo iria para o Git) para a
    # subida antes do Docker, em vez de esperar 3 minutos por um healthcheck.
    achados = verificar_configuracao()
    mostrar_achados(achados, so_pendencias=True)
    if any(achado["nivel"] == ERRO for achado in achados):
        erro("Corrija o que está marcado como ERRO e rode de novo. Detalhes: python subir-app.py verificar")
        return False
    return True


# =============================================================================
# Verificações: o que falta configurar
# =============================================================================
# Cada achado tem nível, área, o que foi visto e como resolver. ERRO = a API
# não sobe ou um segredo corre risco (o "up" para antes do Docker); AVISO =
# funciona, mas falta algo para o ambiente ficar completo; CERTO = conferido.
ERRO, AVISO, CERTO = "erro", "aviso", "ok"


def _achado(nivel: str, area: str, texto: str, como: str = "") -> dict:
    return {"nivel": nivel, "area": area, "texto": texto, "como": como}


def _dominio_do_remetente(remetente: str) -> str:
    """"OliFine <nao-responda@envio.dominio.com.br>" -> "envio.dominio.com.br"."""
    achado = re.search(r"@([A-Za-z0-9.-]+)", remetente)
    return achado.group(1).lower().rstrip(".") if achado else ""


def verificar_configuracao() -> list[dict]:
    """Verificações locais e rápidas (sem rede): api/.env, e-mails, web/.env e segredos."""
    env_api = ler_env(ENV_API)
    return [
        *_verificar_api(env_api),
        *_verificar_emails(env_api),
        *_verificar_web(ler_env(ENV_WEB)),
        *_verificar_segredos(),
    ]


def _verificar_api(env: dict[str, str]) -> list[dict]:
    area = "API (api/.env)"
    if not ENV_API.is_file():
        return [_achado(ERRO, area, "api/.env não existe.", "python subir-app.py up (cria a partir do api/.env.example)")]
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
    # subir-app é o ambiente de desenvolvimento.
    if env.get("AMBIENTE", "desenvolvimento") == "producao":
        achados.append(_achado(ERRO, area, "AMBIENTE=producao: a API recusa o MongoDB sem senha do compose local.",
                               "AMBIENTE=desenvolvimento no api/.env (produção só no servidor, com /run/secrets)."))
    expiracao = env.get("JWT_EXPIRATION", "15")
    if expiracao.isdigit() and int(expiracao) > 15:
        achados.append(_achado(AVISO, area, f"JWT_EXPIRATION={expiracao}: acima dos 15 minutos do padrão.",
                               "Apague a linha ou use 15."))
    origem_local = f"http://localhost:{PORTA_WEB}"
    origens = [origem.strip() for origem in env.get("CORS_ORIGENS", "").split(",") if origem.strip()]
    if origem_local not in origens:
        achados.append(_achado(AVISO, area, f"CORS_ORIGENS sem {origem_local}: a área do cliente local não chama a API.",
                               f"CORS_ORIGENS={origem_local},http://localhost:8080"))
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
    return [*_verificar_publicacao(env), *_verificar_dns_do_remetente(env), *_verificar_console_do_firebase(env)]


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
        return [_achado(AVISO, area, "Sem o api/.venv: rode 'python subir-app.py up' para conferir o Console.")]
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


def mostrar_achados(achados: list[dict], so_pendencias: bool = False) -> None:
    """Achados por área; com so_pendencias, só erros e avisos (no "up")."""
    area_atual = None
    for achado in achados:
        if so_pendencias and achado["nivel"] == CERTO:
            continue
        if not so_pendencias and achado["area"] != area_atual:
            area_atual = achado["area"]
            titulo(area_atual)
        rotulo = "" if not so_pendencias else f"{achado['area']}: "
        {ERRO: erro, AVISO: aviso, CERTO: ok}[achado["nivel"]](f"{rotulo}{achado['texto']}")
        if achado["como"] and achado["nivel"] != CERTO:
            passo(f"      como resolver: {achado['como']}")


def caixa_de_pendencias(achados: list[dict]) -> None:
    pendencias = [achado for achado in achados if achado["nivel"] != CERTO]
    if not pendencias:
        caixa("NADA FALTANDO", [["Todas as verificações passaram."]], cor="1;32")
        return
    linhas = []
    for achado in pendencias:
        marca = "ERRO " if achado["nivel"] == ERRO else "AVISO"
        texto = f"{marca} {achado['area']}: {achado['texto']}"
        linhas += textwrap.wrap(texto, LARGURA - 4, subsequent_indent="      ", break_long_words=False, break_on_hyphens=False)
    erros = sum(achado["nivel"] == ERRO for achado in pendencias)
    caixa(f"O QUE FALTA ({erros} erro(s), {len(pendencias) - erros} aviso(s))", [linhas],
          cor="1;31" if erros else "1;33")


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


def _texto_yaml(valor: str) -> str:
    """Texto entre aspas para o YAML do compose ("$" dobrado: o compose o lê como variável)."""
    return json.dumps(valor.replace("$", "$$"))


def arquivos_do_compose() -> list[str]:
    """
    Escreve o .subir-app/compose.local.yml com o que só existe nesta máquina e
    devolve os "-f" do docker compose: o arquivo do repositório, o override da
    raiz (quem tiver criado um à mão) e esse complemento.

    - Chave da conta de serviço dos e-mails: o api/.env guarda o caminho do
      Windows, que não existe no container. Ela entra como Docker secret, em
      /run/secrets, e a variável passa a apontar para lá (a variável do
      "environment" vale mais que a do env_file).
    - EMAIL_PROVEDOR=pasta: a pasta dos e-mails do container aparece em
      api/emails-enviados, para abrir e clicar no link.
    """
    env = ler_env(ENV_API)
    ambiente: list[str] = []
    volumes: list[str] = []
    segredo: Path | None = None

    arquivo = arquivo_da_conta_de_servico(env.get("FIREBASE_CONTA_DE_SERVICO", ""))
    if arquivo is not None and arquivo.is_file():
        segredo = arquivo.resolve()
        ambiente.append(f"      FIREBASE_CONTA_DE_SERVICO: {SEGREDO_DA_CONTA_NO_CONTAINER}")
    if env.get("EMAIL_PROVEDOR") == "pasta":
        pasta = Path(env.get("EMAIL_PASTA") or "emails-enviados")
        pasta = (pasta if pasta.is_absolute() else PASTA_API / pasta).resolve()
        pasta.mkdir(parents=True, exist_ok=True)
        ambiente.append(f"      EMAIL_PASTA: {PASTA_DE_EMAILS_NO_CONTAINER}")
        volumes += [
            "      - type: bind",
            f"        source: {_texto_yaml(pasta.as_posix())}",
            f"        target: {PASTA_DE_EMAILS_NO_CONTAINER}",
        ]

    arquivos = ["-f", str(COMPOSE_DO_REPOSITORIO)]
    if COMPOSE_OVERRIDE_DA_RAIZ.is_file():
        arquivos += ["-f", str(COMPOSE_OVERRIDE_DA_RAIZ)]
    if not ambiente and not volumes:
        COMPOSE_LOCAL.unlink(missing_ok=True)
        return arquivos

    linhas = [
        "# Gerado pelo subir-app.py a cada 'up', com o que só existe nesta máquina.",
        "# Fora do Git (.subir-app/). Não edite: a próxima subida reescreve.",
        "services:",
        "  api:",
    ]
    if ambiente:
        linhas += ["    environment:", *ambiente]
    if volumes:
        linhas += ["    volumes:", *volumes]
    if segredo:
        linhas += ["    secrets:", "      - firebase_conta_de_servico",
                   "secrets:", "  firebase_conta_de_servico:", f"    file: {_texto_yaml(segredo.as_posix())}"]
    PASTA_ESTADO.mkdir(exist_ok=True)
    COMPOSE_LOCAL.write_text("\n".join(linhas) + "\n", encoding="utf-8")
    if segredo:
        ok(f"Chave da conta de serviço montada no container em {SEGREDO_DA_CONTA_NO_CONTAINER}.")
    if volumes:
        ok("E-mails gravados pela API (EMAIL_PROVEDOR=pasta) aparecem em api/emails-enviados.")
    return [*arquivos, "-f", str(COMPOSE_LOCAL)]


def subir_containers(reconstruir: bool) -> bool:
    titulo("Containers (MongoDB + API)")
    # Porta 8081 ocupada sem a API do compose no ar: outro processo (ex.: um
    # uvicorn rodando à mão) faria o "docker compose up" falhar no meio.
    if porta_em_uso(PORTA_API) and not api_do_compose_no_ar():
        erro(f"A porta {PORTA_API} está ocupada por outro programa (um 'uvicorn' rodando à mão?).")
        erro("Encerre esse programa e rode de novo.")
        return False

    acao = ["up", "-d", *(["--build"] if reconstruir else [])]
    comando = ["docker", "compose", *arquivos_do_compose(), *acao]
    # Aberta pela rede (http://<ip>:5173), a área do cliente chama a API de
    # outra origem: o compose repassa esta variável à API, que a soma ao
    # CORS_ORIGENS. Nada é gravado no api/.env, porque o IP muda de rede em rede.
    ip = ip_na_rede()
    os.environ["CORS_ORIGENS_REDE"] = f"http://{ip}:{PORTA_WEB}" if ip else ""
    passo(" ".join(["docker", "compose", *acao]))
    if rodar(comando).returncode != 0:
        erro("O 'docker compose up' falhou. Veja a mensagem acima.")
        return False
    return aguardar_saude()


def aguardar_saude() -> bool:
    """Espera todos os serviços do compose ficarem "healthy"."""
    passo("Aguardando os healthchecks (MongoDB responde ao ping, API responde em /saude)...")
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
        # Container que parou não volta sozinho (o compose não tem restart):
        # esperar os 3 minutos só adiaria o erro.
        if any((s.get("State") or "").lower() in ("exited", "dead") for s in servicos):
            break
        time.sleep(INTERVALO_SAUDE_S)
    else:
        erro(f"Tempo esgotado ({TIMEOUT_SAUDE_S}s) esperando: {', '.join(pendentes) or 'containers'}")

    if pendentes:
        erro(f"Não subiu: {', '.join(pendentes)}. Fim do log da API:")
    log = rodar(["docker", "compose", "logs", "--no-color", "--tail", "15", "api"], silencioso=True).stdout
    for linha in log.strip().splitlines()[-15:]:
        erro(f"  {linha}")
    aviso("Log completo: docker compose logs api")
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


def descricao_dos_emails() -> list[str]:
    """Como saem os e-mails da conta (provedor, remetente e para onde os links levam)."""
    env = ler_env(ENV_API)
    provedor = env.get("EMAIL_PROVEDOR", "")
    if not provedor:
        return ["desligados na API: o Firebase manda o modelo genérico dele"]
    if provedor == "pasta":
        return ["gravados em api/emails-enviados (nada sai da máquina)", f"links para {env.get('APP_URL', '?')}"]
    return [f"{provedor}, de {env.get('EMAIL_REMETENTE', '?')}", f"links e monograma de {env.get('APP_URL', '?')}"]


def painel(pendencias: int | None = None) -> None:
    """Links importantes e como entrar no painel administrativo (sem mostrar senhas)."""
    repositorio = endereco_do_repositorio()
    dono, nome = repositorio.rstrip("/").split("/")[-2:]
    projeto_firebase = ler_env(ENV_WEB).get("VITE_FIREBASE_PROJECT_ID")
    env_api = ler_env(ENV_API)
    email_admin = env_api.get("ADMIN_EMAIL") or "(defina ADMIN_EMAIL no api/.env)"

    local = [
        f"{'Área do cliente (React)'.ljust(26)} {URL_WEB}",
        f"{''.ljust(26)} landing {PONTO} cadastro {PONTO} login {PONTO} principal {PONTO} lancamentos",
        f"{''.ljust(26)} contas {PONTO} relatorios {PONTO} metas {PONTO} auth/esqueci-a-senha",
        f"{'Painel administrativo'.ljust(26)} {URL_API}/painel/",
    ]
    # Em produção o Swagger sai do ar (e o subir-app nem sobe: ver verificações).
    if env_api.get("AMBIENTE", "desenvolvimento") != "producao":
        local.append(f"{'Swagger da API'.ljust(26)} {URL_API}/docs")
    emails = descricao_dos_emails()
    local.append(f"{'E-mails da conta'.ljust(26)} {emails[0]}")
    local += [f"{''.ljust(26)} {linha}" for linha in emails[1:]]
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
    caixa("OLIFINE (PESSOAL FINANCE) - AMBIENTE LOCAL", [local, nuvem, acesso])
    enderecos_da_area_do_cliente()
    print("   Logs da API:   docker compose logs -f api")
    print(f"   Logs do Vite:  {LOG_WEB.relative_to(RAIZ)}")
    print("   Verificar:     python subir-app.py verificar   (configuração, DNS, Pages e Console do Firebase)")
    print("   Testes:        python subir-app.py testes")
    print("   Demonstração:  python subir-app.py tunnel start   (fechar: tunnel stop)")
    print("   Parar:         python subir-app.py down")
    if pendencias:
        print()
        aviso(f"{pendencias} pendência(s) de configuração acima. Lista completa: python subir-app.py verificar")
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
    print(_cor("OliFine — subindo o ambiente local", "1;36"))
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
    painel(pendencias=sum(achado["nivel"] != CERTO for achado in verificar_configuracao()))
    if not venv_pronto:
        erro("O api/.venv não ficou pronto: veja a etapa 'Ambiente virtual (api/.venv)' acima.")
    return 0 if tudo_no_ar and venv_pronto else 1


def comando_status() -> int:
    print(_cor("OliFine — situação do ambiente local", "1;36"))
    if not docker_responde():
        aviso("O Docker não está respondendo: MongoDB e API aparecem como fora do ar.")
    resumo_da_situacao()
    achados = verificar_configuracao()
    pendencias = [achado for achado in achados if achado["nivel"] != CERTO]
    if pendencias:
        titulo("Pendências de configuração (verificação local)")
        mostrar_achados(pendencias, so_pendencias=True)
    painel(pendencias=len(pendencias))
    return 0


def comando_verificar(com_rede: bool) -> int:
    """Todas as verificações, com o que está certo e o que falta; nada é alterado."""
    print(_cor("OliFine — verificação da configuração (só leitura)", "1;36"))
    achados = verificar_configuracao()
    if com_rede:
        passo("Consultando a internet (Pages, APP_URL, DNS do remetente e Console do Firebase)...")
        achados += verificar_na_rede()
    else:
        aviso("--sem-rede: Pages, APP_URL, DNS e Console do Firebase não foram conferidos.")
    mostrar_achados(achados)
    caixa_de_pendencias(achados)
    return 1 if any(achado["nivel"] == ERRO for achado in achados) else 0


def comando_down(apagar_dados: bool) -> int:
    print(_cor("OliFine — derrubando o ambiente local", "1;36"))
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
    print(_cor("OliFine — acesso externo (túnel da Cloudflare)", "1;36"))
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
    if ler_pagina(f"{URL_API}/saude") is None:
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
    print(_cor("OliFine — acesso externo (túnel da Cloudflare)", "1;36"))
    titulo("Túnel da Cloudflare")
    return 0 if parar_tunel() else 1


def comando_testes() -> int:
    print(_cor("OliFine — testes automatizados (os mesmos do CI)", "1;36"))
    if not garantir_venv() or not garantir_node_modules():
        return 1
    npm = comando_npm()

    etapas = [
        ("API (pytest)", [str(python_do_venv()), "-m", "pytest", "-v"], PASTA_API),
        ("Front-end: lint (oxlint)", [npm, "run", "lint"], PASTA_WEB),
        ("Front-end: testes (Vitest)", [npm, "test", "--", "--run"], PASTA_WEB),
        # O CI também gera o build: um import quebrado passa nos testes e só falha aqui.
        ("Front-end: build (Vite)", [npm, "run", "build"], PASTA_WEB),
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
            "OliFine (Pessoal Finance): sobe o ambiente local (configuração, .venv, dependências, "
            "MongoDB + API no Docker, front-end no Vite), confere o que falta configurar e mostra os links."
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
    subcomandos.add_parser("status", help="Mostra o que está no ar, os links e as pendências, sem subir nada.")
    verificar = subcomandos.add_parser(
        "verificar", help="Confere a configuração (arquivos, DNS, Pages, Console do Firebase) e aponta o que falta."
    )
    verificar.add_argument("--sem-rede", action="store_true", help="Só as verificações locais, sem internet.")
    subcomandos.add_parser("testes", help="Roda lint, testes e build da API e do front-end, como o CI.")
    down = subcomandos.add_parser("down", help="Para o Vite e os containers (os dados do banco ficam).")
    down.add_argument("--apagar-dados", action="store_true", help="Também apaga o volume do MongoDB.")
    tunel = subcomandos.add_parser("tunnel", help="Abre ou fecha um endereço público temporário (túnel da Cloudflare).")
    tunel.add_argument("acao", choices=["start", "stop"], help="start abre o túnel; stop fecha.")

    argumentos = parser.parse_args(argv)
    if argumentos.comando == "up":
        return comando_up(reconstruir=not argumentos.sem_build, com_web=not argumentos.sem_web)
    if argumentos.comando == "status":
        return comando_status()
    if argumentos.comando == "verificar":
        return comando_verificar(com_rede=not argumentos.sem_rede)
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
