# Pessoal Finance

Plataforma de controle financeiro pessoal: API REST segura, área do cliente em React e a infraestrutura de
build, teste e entrega, num só repositório.

| | |
|---|---|
| **Área do cliente publicada** | https://jolini.github.io/ADS-Project/ |
| **Releases (código para baixar)** | https://github.com/jOlini/ADS-Project/releases |
| **Documentação da API** | [`DOCS_API.md`](DOCS_API.md): endpoints, códigos de resposta, perfis, JWT, OAuth 2.0 e análise de segurança |
| **Arquitetura** | [`ARCHITECTURE.md`](ARCHITECTURE.md): componentes, identidades, dados, segurança em camadas, ambientes e estrutura do repositório |
| **Licença** | Proprietária, todos os direitos reservados ([`LICENSE`](LICENSE)) |

**Avaliação rápida da API (só precisa do Docker):** baixe a última Release, copie `api/.env.example` para
`api/.env`, rode `docker compose up --build` e abra http://localhost:8081/painel/. Detalhes em
[Como instalar](#como-instalar), [Como executar](#como-executar) e [Como testar](#como-testar).

---

## Objetivo do projeto

**Objetivo do produto.** Dar a uma pessoa física uma visão única e confiável do próprio dinheiro (quanto entra,
quanto sai, para onde vai e quanto sobra) sem depender de planilha manual e sem exigir integração com o banco.

**O que o sistema entrega hoje.** A base de identidade e acesso (0.1) está concluída; o livro-caixa (0.2) e os
relatórios (0.3) estão em construção:

- uma **API REST segura para gestão de usuários**: cadastrar, consultar, atualizar e excluir, com login que
  gera um **token JWT**, controle de acesso por perfil (**RBAC**) com três perfis (`ADMINISTRADOR`,
  `OPERADOR` e `CLIENTE`) e limite de tentativas contra força bruta;
- um **painel web de demonstração** da API (login, listagem, cadastro, edição, exclusão e as respostas da API
  na tela), feito para que qualquer pessoa veja e teste as regras de autenticação e autorização;
- uma **área do cliente** em React, com a identidade visual **OliFine**: cadastro, login e Visão geral com
  Firebase Authentication e Cloud Firestore, publicada no GitHub Pages; com a API local, ganha lançamentos,
  contas e cartões de crédito, categorias, importação do extrato em CSV, metas e relatórios;
- **testes automatizados** que rodam a cada commit de pull request, com **CI/CD** e alertas no Discord.

**Objetivo acadêmico.** Projeto do curso de Análise e Desenvolvimento de Sistemas, compartilhado entre três
disciplinas. Cada uma avalia uma parte do mesmo sistema:

| Disciplina | O que o projeto entrega | Onde está |
|---|---|---|
| Sistemas Web Seguros | API REST com CRUD de usuários, login com JWT, RBAC, boas práticas de segurança e interface web de demonstração | [`api/`](api), [`api/painel/`](api/painel), [`DOCS_API.md`](DOCS_API.md) |
| Tecnologias para Desenvolvimento Web | SPA React com React Router, cadastro e login no Firebase Authentication, dados no Firestore, build e deploy | [`web/`](web) |
| DevOps | Testes unitários, CI a cada commit de PR, deploy contínuo e alertas no Discord | [`.github/workflows/`](.github/workflows), [`api/tests/`](api/tests), `web/src/**/*.test.js` |

---

## Status

Release **0.1 - Identidade e acesso: concluída** (tag `v0.1.0`; a `v0.1.1` traz a interface final).
Release **0.2 - Lançamentos: em construção** (API do livro-caixa, telas de lançamentos, contas e categorias e
importação do extrato do banco em CSV).

| Módulo | Descrição | Estado |
|---|---|---|
| Identidade e acesso | Cadastro, login, perfis de acesso e administração de usuários | Concluído |
| Núcleo financeiro | Receitas, despesas e transferências, contas, categorias e importação de extrato (CSV) | Em construção (0.2): API e telas prontas |
| Dashboard | Saldo, totais do mês e comparativo receita × despesa | Em construção (0.3): API de relatórios e tela Relatórios (receita × despesa e gasto por categoria) prontas |
| Comprovantes | Anexo de arquivo ao lançamento | Planejado (0.4) |

---

## Arquitetura

Três partes: a **área do cliente** (React, em `web/`), o **painel do back-office** (HTML, CSS e JS, servido pela
API) e a **API REST** (FastAPI + MongoDB, em `api/`). São **duas fontes de identidade**, por decisão de produto:
o cliente final entra pelo Firebase Authentication e a API aceita o **ID token do Firebase** no livro-caixa
(`/espacos`); o back-office entra pela própria API, que emite um **JWT** e aplica o RBAC em `/usuarios`. Um
token nunca abre a área do outro.

Diagrama, camadas da API e do front-end, modelo de dados, segurança em camadas, ambientes e estrutura do
repositório: [`ARCHITECTURE.md`](ARCHITECTURE.md). Perfis de acesso e matriz de permissões:
[`DOCS_API.md`, Parte 3](DOCS_API.md#parte-3--controle-de-acesso-rbac).

---

## Tecnologias utilizadas

| Camada | Tecnologia | Para quê |
|---|---|---|
| API | Python 3.13 · FastAPI · Pydantic · Uvicorn | Endpoints REST, validação da entrada e documentação OpenAPI (Swagger) gerada do código |
| Segurança da API | PyJWT (HS256 e RS256) · cryptography · bcrypt | Token do back-office assinado com validade de 30 minutos; ID token do Firebase conferido com as chaves do Google; senhas guardadas só como hash |
| Persistência da API | MongoDB 7 (pymongo) | Usuários (índice único no e-mail) e livro-caixa (lançamento e partidas num só documento, gravação atômica) |
| Painel da API | HTML, CSS e JavaScript puros, servidos pela própria API | Interface de demonstração: login, CRUD e respostas da API na tela |
| Área do cliente | React 19 · Vite · React Router | SPA com a página de apresentação (`/`), `/cadastro`, `/login`, `/principal` e as telas do livro-caixa |
| Identidade do cliente | Firebase Authentication (e-mail/senha) · Cloud Firestore | Conta do cliente final e dados do perfil, protegidos por regras do Firestore |
| Interface | CSS próprio com design tokens (`web/src/estilos/tokens.css`), fonte Geist auto-hospedada (SIL OFL), temas claro e escuro automáticos | Identidade OliFine na área do cliente: verdes esmeralda e sálvia de croma contido (menos cansaço visual), ícones desenhados no próprio projeto, seletor, calendário, modal e menu próprios, micro-interações e esqueletos de carga que respeitam "reduzir movimento". O painel da API mantém o visual anterior |
| Testes | pytest · Vitest · oxlint | Testes unitários e de rota da API; regras e serviços do front-end; lint |
| CI/CD | GitHub Actions · GitHub Pages · webhook do Discord | Testes a cada commit de PR, deploy automático e alertas |
| Containers | Docker · Docker Compose | MongoDB + API com um comando; imagem nginx do front-end |

---

## Segurança e credenciais

**Onde fica cada credencial.** Nenhum segredo é versionado: o repositório é público.

| Credencial | Onde fica | Regra |
|---|---|---|
| `JWT_SECRET`, `ADMIN_SENHA`, `MONGODB_URI` | Só no `api/.env` (fora do Git) | Chave aleatória de 32 bytes ou mais (a API não sobe com menos); o `subir-app.py up` gera valores aleatórios. Vazou: troque a chave (todos os tokens caem) e a senha |
| `VITE_FIREBASE_*` | `web/.env` local e secrets do GitHub (build do Pages) | Públicas por natureza (vão para o navegador); quem protege os dados são as regras do Firestore |
| `DISCORD_WEBHOOK` | Só nos secrets do GitHub | Nunca em arquivo, log ou print |
| Chave da conta de serviço do Firebase | Fora de qualquer repositório, na pasta do usuário | Vale como senha de administrador do projeto Firebase |
| Sessões | `sessionStorage` do navegador | Área do cliente e painel: fechar a aba (ou o navegador) encerra a sessão |

Antes de cada commit, confira o que vai entrar (`git diff --cached --name-only`) e adicione arquivo por arquivo,
nunca `git add .`: o `.gitignore` barra os `.env`, `*.pem`, `*.key` e as chaves do Firebase, mas a conferência é a
última barreira.

**O que a aplicação faz sozinha:** senha só como hash BCrypt; login travado com `429` depois de 5 senhas erradas
(por e-mail e endereço) em 15 minutos; corpo acima de 2 MB recusado com `413`; cabeçalhos de segurança (CSP,
`X-Frame-Options`, `nosniff`, `Permissions-Policy`, HSTS em HTTPS); CSP em `<meta>` e recusa de moldura
(clickjacking) no build do front-end; importação de CSV sem fórmula de planilha; erros sem stack trace. Análise
completa, com os riscos residuais: [`DOCS_API.md`, Parte 5](DOCS_API.md#parte-5--análise-de-segurança) e
[`ARCHITECTURE.md`, seção 4](ARCHITECTURE.md#4-segurança-em-camadas).

---

## Como instalar

### Pré-requisitos

| Ferramenta | Versão | Precisa para |
|---|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows e macOS) ou Docker Engine com Compose v2 (Linux) | Atual | **API + MongoDB + painel.** É o único requisito para avaliar a API |
| [Python](https://www.python.org/downloads/) | 3.11 ou mais novo (3.13 recomendado) | `subir-app.py` e testes da API fora do Docker (opcional; o `subir-app.py` instala o 3.13 no Windows se faltar) |
| [Node.js](https://nodejs.org/) | 20.19 ou mais novo | Área do cliente (React) e testes do front-end (opcional) |
| Projeto no [Firebase](https://console.firebase.google.com/) | — | Rodar a área do cliente localmente (opcional: a versão publicada já funciona) |

As portas **8081** (API) e **5173** (área do cliente) precisam estar livres.

### 1. Obter o código

- **Pela Release (sem Git):** abra https://github.com/jOlini/ADS-Project/releases/latest, baixe
  **Source code (zip)** em **Assets** e extraia. Entre na pasta extraída (`ADS-Project-<versão>`).
- **Pelo Git:**

  ```bash
  git clone https://github.com/jOlini/ADS-Project.git
  cd ADS-Project
  ```

### 2. Configurar a API (`api/.env`)

Crie o `api/.env` a partir do modelo. Na raiz do projeto:

```powershell
Copy-Item api\.env.example api\.env      # Windows (PowerShell)
```

```bash
cp api/.env.example api/.env             # Linux e macOS
```

Abra o `api/.env` e troque duas linhas:

| Variável | O que colocar |
|---|---|
| `JWT_SECRET` | Chave aleatória com pelo menos 32 caracteres. Gere com `python -c "import secrets; print(secrets.token_urlsafe(48))"`. A API não sobe com chave menor |
| `ADMIN_SENHA` | Senha do administrador inicial, de 8 a 64 caracteres |

Para usar o livro-caixa do cliente (`/espacos`), preencha também `FIREBASE_PROJECT_ID` com o ID do projeto
Firebase da área do cliente. Sem ele, só essas rotas respondem `503`; o painel e `/usuarios` funcionam.

O administrador inicial (`ADMIN_EMAIL`, padrão `admin@pessoalfinance.com`) é criado na primeira subida, com o
banco vazio. Os valores do modelo funcionam para uma demonstração rápida, mas são públicos: troque antes de
qualquer uso real. O `python subir-app.py up` (próxima seção) faz este passo sozinho, com valores aleatórios.

Nenhum segredo é versionado: os arquivos `.env` estão no `.gitignore`.

### 3. Configurar a área do cliente (opcional)

Só para rodar o React na própria máquina. Para apenas usar a área do cliente, abra a versão publicada.

1. Copie `web/.env.example` para `web/.env` e preencha com a configuração do app Web do projeto Firebase
   (Console do Firebase › Configurações do projeto › Seus apps). O projeto precisa ter Authentication (provedor
   e-mail/senha) e Cloud Firestore habilitados.
2. Para as telas do livro-caixa (lançamentos, contas e categorias), acrescente `VITE_API_URL=http://localhost:8081`
   ao `web/.env` e confira, no `api/.env`, o `FIREBASE_PROJECT_ID` (o mesmo `VITE_FIREBASE_PROJECT_ID`) e o
   `CORS_ORIGENS` com `http://localhost:5173`. Sem `VITE_API_URL`, o app funciona como a versão publicada.
3. Publique as regras de [`web/firestore.rules`](web/firestore.rules) em Firestore Database › Regras (ou
   `npx firebase-tools deploy --only firestore:rules --project <id>` dentro de `web/`).
4. Instale as dependências:

   ```bash
   cd web
   npm ci
   ```

Sem projeto Firebase, dá para usar os emuladores locais: `VITE_FIREBASE_EMULADOR=true` no `web/.env` e
`npx firebase-tools emulators:start --project demo-pessoal-finance` em `web/` (exige Java 11+).

---

## Como executar

### Opção A — Docker Compose (recomendada para avaliar a API)

Na raiz do projeto, com o Docker aberto:

```bash
docker compose up --build
```

A primeira subida baixa as imagens e leva alguns minutos. Quando o log mostrar `Uvicorn running on
http://0.0.0.0:8081`, abra:

| O quê | Endereço |
|---|---|
| Painel de demonstração da API | http://localhost:8081/painel/ |
| Documentação interativa (Swagger) | http://localhost:8081/docs |
| Especificação OpenAPI | http://localhost:8081/openapi.json |

Entre no painel com `ADMIN_EMAIL` e `ADMIN_SENHA` do `api/.env`.

Para parar: `Ctrl + C` e `docker compose down`. Os usuários ficam no volume do MongoDB;
`docker compose down -v` apaga o banco, e a próxima subida recria só o administrador.

### Opção B — tudo com um comando (`subir-app.py`)

```bash
python subir-app.py up             # API, MongoDB e área do cliente
python subir-app.py up --sem-web   # só API e MongoDB (dispensa o Node.js)
```

O script usa só a biblioteca padrão do Python e faz, em ordem: cria o `api/.env` se ele faltar
(com `JWT_SECRET` e `ADMIN_SENHA` aleatórios), copia o `FIREBASE_PROJECT_ID` do `web/.env` quando ele está vazio
(sem ele, o login da área do cliente responde "Login do cliente indisponível no momento"), instala as
dependências da API no `api/.venv` (nunca no Python da máquina), roda o `npm ci` do front-end quando o
`package-lock.json` muda, abre o Docker Desktop se estiver fechado, sobe MongoDB + API no Docker esperando
os healthchecks, sobe o Vite em segundo plano e imprime os links importantes. Rodar de novo com tudo no ar
só confere o estado.

**Acesso pela rede local.** O Vite sobe com `--host 0.0.0.0`, e o fim do `up` mostra os endereços no formato do
próprio Vite:

```text
➜  Local:   http://localhost:5173/ADS-Project/
➜  Network: http://<SEU_IP_LOCAL>:5173/ADS-Project/
```

Na mesma rede (Wi-Fi ou cabo), o endereço Network abre o app no celular ou em outro computador. A página
aberta pela rede chama a API no IP de onde veio (e não no `localhost` do `VITE_API_URL`), e o script passa essa
origem à API pelo `CORS_ORIGENS_REDE`, sem gravar nada no `api/.env`, porque o IP muda de rede em rede. Se não
abrir, libere o Node.js no Firewall do Windows (rede privada); em rede de empresa, ele pode estar bloqueado.

O `api/.venv` precisa de Python 3.11+ (o CI e o Docker usam o 3.13), mas o script roda com um Python mais
antigo. Nesse caso ele procura outro Python instalado (no Windows, pelo lançador `py`), instala o 3.13 pelo
`winget` só para o usuário, sem administrador, e, se nada disso der certo, explica como atualizar. Um
`api/.venv` quebrado (copiado de outra máquina ou com o Python base removido) é recriado. Outros comandos:

| Comando | O que faz |
|---|---|
| `python subir-app.py status` | Mostra o que está no ar e os links, sem subir nada |
| `python subir-app.py testes` | Roda o pytest da API, o lint e o Vitest do front-end, como o CI |
| `python subir-app.py down` | Para o túnel, o Vite e os containers (`--apagar-dados` também apaga o banco) |
| `python subir-app.py tunnel start` | Abre um endereço público temporário para a área do cliente (veja abaixo) |
| `python subir-app.py tunnel stop` | Fecha esse endereço: o app volta a ser só local |

**Acesso externo temporário (Cloudflare Tunnel).** Para mostrar uma funcionalidade nova a pessoas de fora da rede,
sem publicar no GitHub Pages, com o ambiente no ar (`python subir-app.py up`):

```bash
python subir-app.py tunnel start   # ou, dentro de web/: npm run tunnel:start
python subir-app.py tunnel stop    # ou, dentro de web/: npm run tunnel:stop
```

O `start` abre um Quick Tunnel da Cloudflare (sem conta) para o Vite e mostra o endereço, no formato
`https://<palavras-aleatorias>.trycloudflare.com/ADS-Project/`. O endereço muda a cada início e deixa de existir no
`stop` (o `down` também fecha o túnel). Usa o `cloudflared` instalado ou baixa o oficial
(`github.com/cloudflare/cloudflared`) para a pasta `.subir-app/`, que fica fora do Git.

- **O que fica público:** só a área do cliente. A API entra pelo proxy do Vite e só nas rotas do cliente (`/espacos`,
  que exigem o login do Firebase); o painel administrativo, o login do back-office e o Swagger continuam só locais.
- **Quem entra:** qualquer pessoa com o endereço chega ao login, e o cadastro está aberto. Mande o endereço só para quem
  vai ver a demonstração e feche o túnel ao terminar.
- **Nada da sua rede aparece:** a pessoa só vê o endereço `trycloudflare.com`. Não publique no repositório, em issue ou
  em print o IP da máquina, o nome da rede ou o endereço de um túnel aberto.
- **Rede de empresa:** o firewall pode bloquear o túnel, e a política de TI pode proibir. Use em rede própria.

### Opção C — API sem Docker

Precisa de um MongoDB local (ex.: `docker run -d --name pessoal-finance-db -p 27017:27017 mongo:7`). Em `api/`:

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows (no Linux e macOS: source .venv/bin/activate)
pip install -r requirements-dev.txt
uvicorn app.main:criar_app --factory --port 8081 --reload
```

### Área do cliente (React)

Com o `web/.env` configurado (passo 3 da instalação), o atalho faz tudo: no Windows, dois cliques em
`web/iniciar.bat`; no Linux e macOS, `bash web/iniciar.sh`. Ele confere o Node.js, roda o `npm install` na
primeira vez e depois o `npm start`. Pelos comandos:

```bash
cd web
npm install
npm start
```

O navegador abre em http://localhost:5173/ADS-Project/ com as rotas `/cadastro`, `/login` e `/principal`
(`npm run dev` sobe o mesmo servidor sem abrir o navegador). Guia só da área do cliente:
[`web/README.md`](web/README.md).

**Identidade OliFine.** A raiz (`/`) mostra a página de apresentação; a área logada tem a Visão geral (números do
mês, evolução do saldo, despesas por categoria, últimas transações, metas e os dados do cadastro), a aba Metas (cada
meta é uma árvore que cresce com os aportes; as metas ficam salvas no navegador até a API de metas) e, com a API, a
tela Relatórios (receitas e despesas por mês e gasto por categoria em 3, 6 ou 12 meses).

### Front-end em container (nginx)

```bash
docker build --secret id=env,src=web/.env -t pessoal-finance-web web
docker run --rm -p 8080:80 pessoal-finance-web
```

Abre em http://localhost:8080. O `--secret` entrega a configuração do Firebase só durante o build, sem gravá-la
na imagem. O nginx do container ([`web/nginx.conf`](web/nginx.conf)) manda os cabeçalhos de segurança
(`frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy` e `Permissions-Policy`) e esconde a
versão dele.

### Variáveis de ambiente

| Variável | Módulo | Descrição |
|---|---|---|
| `MONGODB_URI` | api | String de conexão do MongoDB (no Docker Compose, aponta para o container) |
| `JWT_SECRET` | api | Chave de assinatura do token (mínimo 32 bytes) |
| `JWT_EXPIRATION` | api | Validade do token, em minutos (padrão 30) |
| `CORS_ORIGENS` | api | Origens de navegador autorizadas, separadas por vírgula (sem a variável: nenhuma; o `.env.example` libera a área do cliente local, portas 5173 e 8080) |
| `CORS_ORIGENS_REDE` | api | Origem da área do cliente aberta pela rede local (`http://<ip>:5173`), somada ao `CORS_ORIGENS`. Não vai no `.env`: o `subir-app.py up` passa pelo Docker Compose a cada subida |
| `FIREBASE_PROJECT_ID` | api | Projeto Firebase cujos ID tokens abrem o livro-caixa (o mesmo `VITE_FIREBASE_PROJECT_ID`). Vazio: `/espacos` responde `503` |
| `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA` | api | Administrador criado na primeira subida, com o banco vazio |
| `VITE_FIREBASE_*` | web | Configuração pública do app Web do Firebase |
| `VITE_FIREBASE_EMULADOR` | web | `true` para usar os emuladores locais do Firebase |
| `VITE_API_URL` | web | Endereço da API (ex.: `http://localhost:8081`). Vazio: telas do livro-caixa desligadas, como no GitHub Pages |

---

## Como testar

### 1. Testes automatizados

Tudo de uma vez, como o CI: `python subir-app.py testes`. Separadamente:

**API (pytest):** em `api/`. Não precisa de MongoDB, Docker nem rede: a suíte usa repositórios em memória e
assina os ID tokens do Firebase com uma chave RSA de teste.

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows (no Linux e macOS: source .venv/bin/activate)
pip install -r requirements-dev.txt
pytest -v
```

Resultado esperado: `307 passed`.

**Front-end (Vitest, lint e build):** em `web/`.

```bash
npm ci
npm test -- --run
npm run lint
npm run build
```

Resultado esperado: `Test Files 27 passed (27)` e `Tests 270 passed (270)`. Sem o `--run`, o Vitest fica em modo
observador.

| Suíte | Arquivo | O que cobre |
|---|---|---|
| API | `api/tests/test_tokens.py` | JWT: payload, expiração, assinatura adulterada, `alg: none`, emissor |
| API | `api/tests/test_servicos.py` | Regras de negócio: login, e-mail único, senha em hash, escalação de privilégio |
| API | `api/tests/test_api.py` | Respostas HTTP, matriz completa do RBAC, 401/403/404/409 e cabeçalhos de segurança |
| API | `api/tests/test_limites.py` | Força bruta no login (`429` por e-mail e por endereço, sem revelar quem tem conta), corpo grande demais (`413`, com e sem `Content-Length`), `500` sem detalhe interno, CSP, `Permissions-Policy` e HSTS só em HTTPS |
| API | `api/tests/test_firebase.py` | ID token do Firebase: assinatura, RS256, `aud`, `iss`, datas, `sub`, token do back-office recusado |
| API | `api/tests/test_financeiro_regras.py` | Partidas dobradas (soma zero), estorno, saldo e coerência dos campos do lançamento |
| API | `api/tests/test_financeiro_layouts.py` | Extratos de formatos diferentes (entrada e saída separadas, coluna D/C, fatura de cartão), colunas indicadas pela pessoa e começo do arquivo |
| API | `api/tests/test_financeiro_racha_e_exclusao.py` | Divisão entre pessoas, exclusão (com o estorno junto) e importação com colunas indicadas |
| API | `api/tests/test_financeiro_importacao.py` | Extrato em CSV: formatos de banco, linha ruim com o motivo, chave por linha e importação repetida sem duplicar |
| API | `api/tests/test_financeiro_api.py` | Livro-caixa pelo HTTP: identidades separadas, espaço alheio em 404, saldos, valores em centavos e estorno único |
| API | `api/tests/test_financeiro_cartoes.py` | Cartão de crédito: ciclo da fatura (fechamento, meses curtos, virada do ano), parcelas, painel (limite, fatura atual, a pagar, parcelas futuras), compra, pagamento e fatura em CSV |
| API | `api/tests/test_financeiro_relatorios.py` | Relatórios: período em meses, receita × despesa com o cartão por competência, estorno, saldo no fim do mês, gasto por categoria com a fatia e faturas comprometidas nos cartões |
| Front-end | `web/src/regras/*.test.js` | Validação do cadastro e dos formulários do livro-caixa, mensagens de erro, datas, dinheiro em centavos, extrato e resumo do mês (com estorno e transferência) |
| Front-end | `web/src/servicos/contas.test.js` | Cadastro no Firebase com o SDK simulado |
| Front-end | `web/src/servicos/livroCaixa.test.js` | Chamadas à API com o ID token, erros em Problem Details, API fora do ar e token que não renova |
| Front-end | `web/src/componentes/toast/toasts.test.js` | Regras dos avisos na tela |
| Front-end | `web/src/regras/importacao.test.js` | Importação do extrato: arquivo em UTF-8 ou Windows-1252, categorias sugeridas, colunas do arquivo e resumo do que entrou |
| Front-end | `web/src/regras/divisao.test.js` e `busca.test.js` | Racha (divisão igual no centavo, partes que passam do total) e busca do extrato por descrição, valor ou pessoa |
| Front-end | `web/src/regras/calendario.test.js` e `seletor.test.js` | Calendário (grade do mês, meses e anos, data digitada) e teclado das listas do seletor e do menu |
| Front-end | `web/src/regras/cartoes.test.js` | Cartão na tela: uso e situação do limite, texto das parcelas, compra, pagamento sugerido e faturas a vencer |
| Front-end | `web/src/servicos/enderecoDaApi.test.js` | Endereço da API com o app aberto pela rede local |
| Front-end | `web/src/olifine/regras/*.test.js` | OliFine: variação em relação ao mês anterior, séries e régua do gráfico de saldo, curva sem pico inventado, Visão geral, metas (fases, sequência de semanas, plano mensal, validação) e a árvore que cresce com os aportes |
| Front-end | `web/src/regras/relatorios.test.js` | Relatórios: período terminando no mês de hoje (com a virada do ano), totais e média do período, régua das colunas a partir do zero, rótulos dos meses e barras das categorias |
| Front-end | `web/src/componentes/icones.test.js` | Todo nome de ícone usado nas telas tem desenho na família própria da OliFine |

Os mesmos testes rodam no GitHub Actions a cada commit de pull request e a cada push na `main`
(ver [CI/CD](#cicd)).

### 2. Teste manual da API pelo painel

Com a API no ar, abra http://localhost:8081/painel/ e entre como administrador. Abra a barra **Modo
demonstração** no fim da página: ela mostra o payload do token JWT e, em **Respostas da API**, cada chamada com
método, caminho, status e corpo. Os botões aparecem para todos os perfis de propósito: quem decide é a API.

Roteiro sugerido (os e-mails são fictícios; as senhas têm de 8 a 64 caracteres):

| # | Perfil logado | Ação no painel | Resposta esperada |
|---|---|---|---|
| 1 | — | Entrar com um e-mail inexistente ou senha errada | `401`, a mesma mensagem "E-mail ou senha inválidos." nos dois casos |
| 2 | — | Entrar com o administrador | `200` no `POST /auth/login`; payload do token com `sub`, `nome`, `perfil`, `iat` e `exp` (30 minutos) |
| 3 | Administrador | Cadastrar `Operador Demo` (`operador@pessoalfinance.com`, perfil Operador) e `Cliente Demo` (`cliente@pessoalfinance.com`, perfil Cliente) | `201 Created`, sem a senha no corpo |
| 4 | Administrador | **Atualizar lista** | `200` no `GET /usuarios` |
| 5 | Administrador | Clicar no ID de um usuário (copia e preenche **Consultar por ID**) e **Consultar** | `200` no `GET /usuarios/{id}` |
| 6 | Administrador | Consultar o ID `000000000000000000000000` | `404 Not Found` |
| 7 | Administrador | **Editar** um usuário, trocar o nome e salvar | `200` no `PUT /usuarios/{id}` |
| 8 | Administrador | **Excluir** um usuário e confirmar no diálogo | `204 No Content` |
| 9 | Administrador | Cadastrar com e-mail `email-invalido` e senha `123` | `400 Bad Request`, com o erro de cada campo |
| 10 | Administrador | Cadastrar outra conta com `operador@pessoalfinance.com` | `409 Conflict` (e-mail já cadastrado) |
| 11 | Operador | **Sair** e entrar como operador; cadastrar um usuário | Lista carrega (`200`); cadastro recusado com `403 Forbidden` |
| 12 | Operador | Editar o Cliente Demo mudando o perfil para Administrador | `403` ("Apenas administradores alteram o perfil de acesso.") |
| 13 | Cliente | Entrar como cliente | O painel mostra só o próprio cadastro (`200` no `GET /usuarios/{id do cliente}`) |
| 14 | Cliente | **Atualizar lista** ou consultar o ID de outro usuário | `403 Forbidden` nos dois casos |
| 15 | — | **Sair** e errar a senha do administrador 5 vezes seguidas; na sexta, use a senha certa | `429 Too Many Requests`: "Muitas tentativas de login. Tente de novo em 15 minutos." (a trava vale para aquele e-mail naquele computador; reiniciar a API também zera a contagem) |

### 3. Teste pelo Swagger e pela linha de comando

**Swagger** (http://localhost:8081/docs):

1. Sem token, abra `GET /usuarios` › **Try it out** › **Execute**: resposta `401` com o cabeçalho
   `www-authenticate: Bearer`.
2. Rode `POST /auth/login` com o e-mail e a senha do administrador e copie o valor de `token`.
3. Clique em **Authorize**, cole só o token (o Swagger acrescenta o `Bearer`) e repita o `GET /usuarios`:
   resposta `200`.

**Linha de comando** (Linux, macOS ou Git Bash):

```bash
curl -i http://localhost:8081/usuarios
curl -X POST http://localhost:8081/auth/login -H "Content-Type: application/json" -d '{"email":"admin@pessoalfinance.com","senha":"<ADMIN_SENHA>"}'
curl http://localhost:8081/usuarios -H "Authorization: Bearer <token>"
```

**PowerShell:**

```powershell
$login = Invoke-RestMethod -Method Post http://localhost:8081/auth/login -ContentType "application/json" -Body '{"email":"admin@pessoalfinance.com","senha":"<ADMIN_SENHA>"}'
Invoke-RestMethod http://localhost:8081/usuarios -Headers @{ Authorization = "Bearer $($login.token)" }
```

O primeiro `curl` (sem token) responde `401`; com o token, a lista vem com `200`. As respostas de `/auth` e
`/usuarios` trazem os cabeçalhos de segurança (`Content-Security-Policy`, `X-Content-Type-Options`,
`X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` e
`Cache-Control: no-store`).

Força bruta (Linux, macOS ou Git Bash): a sexta tentativa já responde `429`, com o cabeçalho `Retry-After`.

```bash
for i in 1 2 3 4 5 6; do curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8081/auth/login -H "Content-Type: application/json" -d '{"email":"ninguem@exemplo.com","senha":"errada"}'; done
```

### 4. Teste manual da área do cliente

Na versão publicada (https://jolini.github.io/ADS-Project/) ou local:

1. Em `/cadastro`, crie uma conta com e-mail, senha, nome, sobrenome e data de nascimento.
2. Em `/login`, entre com ela: `/principal` mostra nome, sobrenome e data de nascimento lidos do Firestore (em
   "Seus dados", no fim da Visão geral).
3. Um e-mail não cadastrado ou senha errada mostram "Usuário não cadastrado ou senha incorreta.".
4. Depois de **Sair**, abrir `/principal` direto volta para o login: a página exige sessão.

**Livro-caixa (só local, com a API no ar).** Com `VITE_API_URL=http://localhost:8081` no `web/.env`,
`FIREBASE_PROJECT_ID` e `CORS_ORIGENS` no `api/.env` e a API rodando:

1. Em **Contas & Cartões**, crie "Conta corrente" com saldo de hoje `1.000,00` e "Poupança" com `0`.
2. Em **Lançamentos**, o extrato ocupa a tela e só a lista rola. Pelo botão **+ Novo lançamento**, lance uma
   receita (`Salário`, `3.000,00`), uma despesa (`Mercado`, `214,37`) e uma transferência de `500,00` da conta
   corrente para a poupança. O extrato mostra cada dia com o saldo de todas as contas; a transferência não muda o
   total. A data abre um calendário próprio: clicar no mês ou no ano do topo pula direto para eles.
3. Lance uma despesa `Churrasco` de `300,00` e, em **Dividir com pessoas**, adicione Ana, Bruno e Carla com
   `100,00`, `150,00` e `50,00`. A linha do extrato mostra quem entrou no racha e com quanto. Com as partes
   passando de `300,00`, o formulário não deixa lançar.
4. Na busca do extrato, digite `bruno` ou `300`: ficam só os lançamentos com a pessoa ou o valor, e os totais
   passam a ser os do que está na tela.
5. No menu **⋯** da despesa `Mercado`, **Estorne**: entra um lançamento de `+ R$ 214,37` com a data de hoje, o
   original fica riscado com a etiqueta "Estornado" e as saídas do mês voltam a zero. Estornar some do menu das
   duas linhas: um lançamento só é estornado uma vez. Lance algo errado e, no mesmo menu, **Exclua**: ele some do
   extrato e do saldo, sem deixar registro.
6. O **Resumo** mostra o saldo em contas, as entradas, as saídas e o extrato do mês. Em **Categorias**, crie,
   renomeie ou desative uma categoria: desativada, ela sai do formulário de lançamento.
7. Em **Importar CSV**, escolha um CSV com as colunas Data, Descrição e Valor (exemplo fictício abaixo), a conta
   e as categorias, e clique em **Continuar**: as colunas são reconhecidas e a lista mostra o que entra e as
   linhas com erro (a de saldo não é lançamento). **Importe** e depois confira o mesmo arquivo de novo: nenhum
   lançamento é novo, todos aparecem como "Já importada". Um arquivo sem cabeçalho abre a etapa **Colunas**,
   em que você diz o que é cada coluna.

   ```text
   Data;Descrição;Valor
   01/09/2026;SALDO ANTERIOR;1.000,00
   05/09/2026;Salário;3.000,00
   12/09/2026;Padaria;-12,50
   12/09/2026;Padaria;-12,50
   ```

8. Em **Contas & Cartões**, na aba **Cartão de crédito** do formulário, crie "Cartão Roxo" com limite `5.000,00`,
   fechamento no dia 3 e vencimento no dia 10. Clique no nome dele: a tela do cartão mostra limite total, limite
   disponível, fatura atual e parcelamentos futuros. Em **Nova compra**, lance `Geladeira` de `3.000,00` em 10x:
   a primeira parcela entra na fatura atual, as outras nove em **Parcelamentos futuros**, e o limite disponível
   cai `3.000,00` de uma vez. As setas do mês mostram as próximas faturas, uma parcela em cada.
9. Em **Pagar fatura**, escolha a conta corrente: o valor vem preenchido com o que há a pagar. Depois de pagar, o
   limite volta, e em **Lançamentos** o pagamento aparece como saída da conta; as compras no crédito não
   aparecem lá, só na fatura. **Importar fatura**, na tela do cartão, traz a fatura do banco em CSV direto para o
   cartão.
10. Sem nenhuma conta cadastrada, **Importar CSV** (em Lançamentos) e **Pagar fatura** mostram o aviso com dois
    botões: **Cadastrar conta**, que abre o formulário de conta em Contas & Cartões, e **Cancelar**, que fecha
    sem sair da tela.

---

## CI/CD

| Workflow | Quando roda | O que faz |
|---|---|---|
| [`ci-tests.yml`](.github/workflows/ci-tests.yml) | A cada commit em pull request e em push na `main` | Lint, testes (Vitest e pytest) e build; avisa no Discord se passou ou falhou |
| [`cd.yml`](.github/workflows/cd.yml) | Build em PR; deploy só em push na `main` | Publica a área do cliente no GitHub Pages |
| [`alertas.yml`](.github/workflows/alertas.yml) | Push na `main` | Avisa no Discord cada merge |

Pull request com teste vermelho não é mesclada.

Secrets do repositório: `DISCORD_WEBHOOK` (alertas) e `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` e
`VITE_FIREBASE_APP_ID` (build do Pages).

---

## API

A documentação completa (endpoints, JWT, RBAC, OAuth 2.0, análise de segurança, livro-caixa e relatórios) está em
[`DOCS_API.md`](DOCS_API.md). Resumo:

| Método | Endpoint | Finalidade | Quem pode | Resposta |
|---|---|---|---|---|
| `POST` | `/auth/login` | Autenticar e obter o token | Público | `200 OK` |
| `GET` | `/usuarios` | Listar usuários | Administrador, Operador | `200 OK` |
| `GET` | `/usuarios/{id}` | Consultar um usuário | Administrador, Operador; Cliente só o próprio | `200 OK` |
| `POST` | `/usuarios` | Criar usuário | Administrador | `201 Created` |
| `PUT` | `/usuarios/{id}` | Atualizar usuário | Administrador, Operador | `200 OK` |
| `DELETE` | `/usuarios/{id}` | Excluir usuário | Administrador | `204 No Content` |
| `GET` | `/espacos` | Listar os espaços do cliente (cria o pessoal no primeiro acesso) | Cliente (ID token do Firebase) | `200 OK` |
| `GET`, `POST`, `PUT` | `/espacos/{id}/contas` e `/espacos/{id}/categorias` | Contas (com saldo), cartões de crédito e categorias | Membro do espaço | `200 OK` / `201 Created` |
| `GET` | `/espacos/{id}/cartoes`, `/cartoes/{id}` e `/cartoes/{id}/faturas/{AAAA-MM}` | Painel do cartão e extrato de uma fatura | Membro do espaço | `200 OK` |
| `POST` | `/espacos/{id}/cartoes/{id}/compras` e `/pagamentos` | Compra no cartão (à vista ou parcelada) e pagamento da fatura | Membro do espaço | `201 Created` |
| `GET`, `POST` | `/espacos/{id}/lancamentos` | Listar e lançar receita, despesa ou transferência | Membro do espaço | `200 OK` / `201 Created` |
| `POST` | `/espacos/{id}/lancamentos/{id}/estorno` | Estornar lançamento | Membro do espaço | `201 Created` |
| `DELETE` | `/espacos/{id}/lancamentos/{id}` | Excluir lançamento (e o estorno dele) | Membro do espaço | `204 No Content` |
| `GET` | `/espacos/{id}/pessoas` | Nomes já usados em divisões | Membro do espaço | `200 OK` |
| `POST` | `/espacos/{id}/importacoes` e `/importacoes/estrutura` | Importar extrato em CSV; mostrar o começo do arquivo e as colunas | Membro do espaço | `200 OK` |
| `GET` | `/espacos/{id}/relatorios/mensal`, `/relatorios/categorias` e `/relatorios/cartoes` | Relatórios: receita × despesa e saldo por mês, gasto por categoria e compromisso nos cartões | Membro do espaço | `200 OK` |

---

## Próximas versões

As versões seguintes à 0.1 aparecem na tabela de [Status](#status). O planejamento detalhado do produto é
privado.

---

## Licença

**Software proprietário. © 2026 João Pedro Olini. Todos os direitos reservados.**

O repositório é público apenas para a avaliação acadêmica e para a publicação no GitHub Pages. Isso não o torna
código aberto: copiar, modificar, redistribuir, hospedar para terceiros ou usar qualquer parte do projeto em
outro produto exige autorização por escrito do autor. Docentes e avaliadores das disciplinas em que o projeto é
entregue podem baixar, executar e testar a aplicação para avaliação. Condições completas em [LICENSE](LICENSE).
