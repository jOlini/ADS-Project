@echo off
rem Atalho de avaliação da área do cliente (Windows): confere o Node.js,
rem instala as dependências na primeira vez e sobe o app com "npm start".
rem Uso: dois cliques neste arquivo, ou "iniciar.bat" num terminal nesta pasta.
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Pessoal Finance - área do cliente

where node >nul 2>nul
if errorlevel 1 goto sem_node

rem O Vite 8 exige Node.js 20.19+ ou 22.12+.
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=12)||(a===20&&b>=19)?0:1)"
if errorlevel 1 goto node_antigo

rem Sem o .env, o app abre mas mostra "Configuração pendente" no lugar das páginas.
if not exist ".env" (
  echo.
  echo AVISO: arquivo .env não encontrado nesta pasta.
  echo Copie o .env.example para .env e preencha com o app Web do Firebase. Veja o README.md.
  echo.
)

rem node_modules fica fora do zip da entrega: é recriada aqui na primeira execução.
if exist "node_modules\" goto iniciar
echo Instalando as dependências com npm install. Leva de 1 a 3 minutos na primeira vez...
call npm install
if errorlevel 1 goto falha_instalacao

:iniciar
echo.
echo Subindo o app. O navegador abre em http://localhost:5173/ADS-Project/
echo Para parar, feche esta janela ou aperte Ctrl + C.
echo.
call npm start
goto fim

:sem_node
echo Node.js não encontrado. Instale a versão LTS em https://nodejs.org/ e rode este arquivo de novo.
goto fim

:node_antigo
for /f %%v in ('node --version') do echo Node.js %%v é antigo para o Vite 8. Instale a versão LTS em https://nodejs.org/
goto fim

:falha_instalacao
echo Falha no npm install. Confira a conexão com a internet e rode este arquivo de novo.

:fim
pause
