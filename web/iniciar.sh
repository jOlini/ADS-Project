#!/usr/bin/env bash
# Atalho de avaliação da área do cliente (Linux e macOS): confere o Node.js,
# instala as dependências na primeira vez e sobe o app com "npm start".
# Uso: "bash iniciar.sh" num terminal dentro desta pasta.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Instale a versão LTS em https://nodejs.org/ e rode este script de novo."
  exit 1
fi

# O Vite 8 exige Node.js 20.19+ ou 22.12+.
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)?0:1)"; then
  echo "Node.js $(node --version) é antigo para o Vite 8. Instale a versão LTS em https://nodejs.org/"
  exit 1
fi

# Sem o .env, o app abre mas mostra "Configuração pendente" no lugar das páginas.
if [ ! -f .env ]; then
  echo
  echo "AVISO: arquivo .env não encontrado nesta pasta."
  echo "Copie o .env.example para .env e preencha com o app Web do Firebase. Veja o README.md."
  echo
fi

# node_modules fica fora do zip da entrega: é recriada aqui na primeira execução.
if [ ! -d node_modules ]; then
  echo "Instalando as dependências com npm install. Leva de 1 a 3 minutos na primeira vez..."
  npm install
fi

echo
echo "Subindo o app. O navegador abre em http://localhost:5173/ADS-Project/"
echo "Para parar, aperte Ctrl + C."
echo
npm start
