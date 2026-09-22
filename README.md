# Pessoal Finance

Plataforma de controle financeiro pessoal: API REST segura, área do cliente em React e a infraestrutura de
build, teste e entrega, num só repositório.

| | |
|---|---|
| **Área do cliente publicada** | https://jolini.github.io/ADS-Project/ |
| **Releases (código para baixar)** | https://github.com/jOlini/ADS-Project/releases |
| **Documentação da API** | [`DOCS_API.md`](DOCS_API.md): endpoints, códigos de resposta, perfis, JWT, OAuth 2.0 e análise de segurança |

**Avaliação rápida da API (só precisa do Docker):** baixe a última Release, copie `api/.env.example` para
`api/.env`, rode `docker compose up --build` e abra http://localhost:8081/painel/. Detalhes em
[Como instalar](#como-instalar), [Como executar](#como-executar) e [Como testar](#como-testar).

---

## Objetivo do projeto

**Objetivo do produto.** Dar a uma pessoa física uma visão única e confiável do próprio dinheiro (quanto entra,
quanto sai, para onde vai e quanto sobra) sem depender de planilha manual e sem exigir integração com o banco.

**Objetivo desta versão (0.1 — Identidade e acesso).** Antes de qualquer lançamento financeiro, o sistema
precisa saber quem é o usuário e o que ele pode fazer. A versão 0.1 entrega essa base:

- uma **API REST segura para gestão de usuários**: cadastrar, consultar, atualizar e excluir, com login que
  gera um **token JWT** e controle de acesso por perfil (**RBAC**) com três perfis: `ADMINISTRADOR`,
  `OPERADOR` e `CLIENTE`;
- um **painel web de demonstração** da API (login, listagem, cadastro, edição, exclusão e as respostas da API
  na tela), feito para que qualquer pessoa veja e teste as regras de autenticação e autorização;
- uma **área do cliente** em React (cadastro, login e página principal) com Firebase Authentication e Cloud
  Firestore, publicada no GitHub Pages;
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

| Módulo | Descrição | Estado |
|---|---|---|
| Identidade e acesso | Cadastro, login, perfis de acesso e administração de usuários | Concluído |
| Núcleo financeiro | Receitas e despesas, contas e categorias | Planejado (0.2) |
| Dashboard | Saldo, totais do mês e comparativo receita × despesa | Planejado (0.3) |
| Comprovantes | Anexo de arquivo ao lançamento | Planejado (0.4) |

---

## Arquitetura

```
┌──────────────────────────────────┐      ┌──────────────────────────────────┐
│  web/  — SPA React               │      │  api/painel/ — HTML, CSS e JS    │
│  Área do cliente:                │      │  Back-office: login, listagem,   │
│  /cadastro · /login · /principal │      │  cadastro, edição e exclusão     │
└────────────────┬─────────────────┘      └────────────────┬─────────────────┘
                 │ SDK Firebase                            │ HTTPS + JSON + JWT
┌────────────────▼─────────────────┐      ┌────────────────▼─────────────────┐
│  Firebase                        │      │  api/  — REST FastAPI (Python)   │
│  Authentication (e-mail/senha)   │      │  CRUD de usuários · JWT · RBAC   │
│  Cloud Firestore                 │      └────────────────┬─────────────────┘
└──────────────────────────────────┘                       │
                                          ┌────────────────▼─────────────────┐
                                          │  MongoDB                         │
                                          └──────────────────────────────────┘
```

**Duas fontes de identidade, por decisão de produto.** O cadastro e o login do cliente final usam
Firebase Authentication, fluxo self-service, sem custo de operação e com recuperação de senha
pronta. O back-office administrativo autentica contra a própria API, que emite um JWT e aplica
controle de acesso por perfil. Separar as duas identidades evita que uma credencial de cliente
alcance a área administrativa.

**Perfis de acesso da API**

| Perfil | Pode |
|---|---|
| `ADMINISTRADOR` | Acesso total: criar, consultar, editar e excluir usuários |
| `OPERADOR` | Consultar usuários e atualizar nome e e-mail (não cria, não exclui, não muda perfil) |
| `CLIENTE` | Visualizar apenas os próprios dados |

---

## Tecnologias utilizadas

| Camada | Tecnologia | Para quê |
|---|---|---|
| API | Python 3.13 · FastAPI · Pydantic · Uvicorn | Endpoints REST, validação da entrada e documentação OpenAPI (Swagger) gerada do código |
| Segurança da API | PyJWT (HS256) · bcrypt | Token de acesso assinado com validade de 30 minutos; senhas guardadas só como hash |
| Persistência da API | MongoDB 7 (pymongo) | Usuários, com índice único no e-mail |
| Painel da API | HTML, CSS e JavaScript puros, servidos pela própria API | Interface de demonstração: login, CRUD e respostas da API na tela |
| Área do cliente | React 19 · Vite · React Router | SPA com as rotas `/cadastro`, `/login` e `/principal` |
| Identidade do cliente | Firebase Authentication (e-mail/senha) · Cloud Firestore | Conta do cliente final e dados do perfil, protegidos por regras do Firestore |
| Interface | CSS próprio, fonte Figtree auto-hospedada (SIL OFL), temas claro e escuro automáticos | Visual "extrato vivo" nas duas interfaces, com toasts e transições que respeitam "reduzir movimento" |
| Testes | pytest · Vitest · oxlint | Testes unitários e de rota da API; regras e serviços do front-end; lint |
| CI/CD | GitHub Actions · GitHub Pages · webhook do Discord | Testes a cada commit de PR, deploy automático e alertas |
| Containers | Docker · Docker Compose | MongoDB + API com um comando; imagem nginx do front-end |

---

## Estrutura do repositório

```
api/                  API REST (FastAPI)
  app/                código da API (rotas, segurança, regras, persistência)
  painel/             front-end de demonstração da API (HTML, CSS e JS)
  tests/              testes unitários e de rota (pytest)
  .env.example        modelo da configuração da API
web/                  área do cliente (React + Firebase)
  src/routes.jsx      arquivo de rotas (React Router)
  src/paginas/        Cadastro, Login e Principal
  firestore.rules     regras de segurança do Firestore
  .env.example        modelo da configuração do Firebase
.github/workflows/    ci-tests.yml, cd.yml e alertas.yml
docker-compose.yml    MongoDB + API para rodar localmente
subir-app.py          sobe tudo com um comando (venv, dependências, Docker, Vite e links)
DOCS_API.md           documentação técnica da API
```

---

## Como instalar

### Pré-requisitos

| Ferramenta | Versão | Precisa para |
|---|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows e macOS) ou Docker Engine com Compose v2 (Linux) | Atual | **API + MongoDB + painel.** É o único requisito para avaliar a API |
| [Python](https://www.python.org/downloads/) | 3.11 ou mais novo | `subir-app.py` e testes da API fora do Docker (opcional) |
| [Node.js](https://nodejs.org/) | 20 ou mais novo | Área do cliente (React) e testes do front-end (opcional) |
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

O administrador inicial (`ADMIN_EMAIL`, padrão `admin@pessoalfinance.com`) é criado na primeira subida, com o
banco vazio. Os valores do modelo funcionam para uma demonstração rápida, mas são públicos: troque antes de
qualquer uso real. O `python subir-app.py up` (próxima seção) faz este passo sozinho, com valores aleatórios.

Nenhum segredo é versionado: os arquivos `.env` estão no `.gitignore`.

### 3. Configurar a área do cliente (opcional)

Só para rodar o React na própria máquina. Para apenas usar a área do cliente, abra a versão publicada.

1. Copie `web/.env.example` para `web/.env` e preencha com a configuração do app Web do projeto Firebase
   (Console do Firebase › Configurações do projeto › Seus apps). O projeto precisa ter Authentication (provedor
   e-mail/senha) e Cloud Firestore habilitados.
2. Publique as regras de [`web/firestore.rules`](web/firestore.rules) em Firestore Database › Regras (ou
   `npx firebase-tools deploy --only firestore:rules --project <id>` dentro de `web/`).
3. Instale as dependências:

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

O script usa só a biblioteca padrão do Python (3.11+) e faz, em ordem: cria o `api/.env` se ele faltar
(com `JWT_SECRET` e `ADMIN_SENHA` aleatórios), instala as dependências da API no `api/.venv` (nunca no
Python da máquina), roda o `npm ci` do front-end quando o `package-lock.json` muda, abre o Docker Desktop se
estiver fechado, sobe MongoDB + API no Docker esperando os healthchecks, sobe o Vite em segundo plano e
imprime os links importantes. Rodar de novo com tudo no ar só confere o estado. Outros comandos:

| Comando | O que faz |
|---|---|
| `python subir-app.py status` | Mostra o que está no ar e os links, sem subir nada |
| `python subir-app.py testes` | Roda o pytest da API, o lint e o Vitest do front-end, como o CI |
| `python subir-app.py down` | Para o Vite e os containers (`--apagar-dados` também apaga o banco) |

### Opção C — API sem Docker

Precisa de um MongoDB local (ex.: `docker run -d --name pessoal-finance-db -p 27017:27017 mongo:7`). Em `api/`:

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows (no Linux e macOS: source .venv/bin/activate)
pip install -r requirements-dev.txt
uvicorn app.main:criar_app --factory --port 8081 --reload
```

### Área do cliente (React)

Com o `web/.env` configurado (passo 3 da instalação):

```bash
cd web
npm run dev
```

Abre em http://localhost:5173/ADS-Project/ com as rotas `/cadastro`, `/login` e `/principal`.

### Front-end em container (nginx)

```bash
docker build --secret id=env,src=web/.env -t pessoal-finance-web web
docker run --rm -p 8080:80 pessoal-finance-web
```

Abre em http://localhost:8080. O `--secret` entrega a configuração do Firebase só durante o build, sem gravá-la
na imagem.

### Variáveis de ambiente

| Variável | Módulo | Descrição |
|---|---|---|
| `MONGODB_URI` | api | String de conexão do MongoDB (no Docker Compose, aponta para o container) |
| `JWT_SECRET` | api | Chave de assinatura do token (mínimo 32 bytes) |
| `JWT_EXPIRATION` | api | Validade do token, em minutos (padrão 30) |
| `CORS_ORIGENS` | api | Origens de navegador autorizadas, separadas por vírgula (padrão: nenhuma) |
| `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA` | api | Administrador criado na primeira subida, com o banco vazio |
| `VITE_FIREBASE_*` | web | Configuração pública do app Web do Firebase |
| `VITE_FIREBASE_EMULADOR` | web | `true` para usar os emuladores locais do Firebase |

---

## Como testar

### 1. Testes automatizados

Tudo de uma vez, como o CI: `python subir-app.py testes`. Separadamente:

**API (pytest):** em `api/`. Não precisa de MongoDB nem de Docker: a suíte usa um repositório em memória.

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows (no Linux e macOS: source .venv/bin/activate)
pip install -r requirements-dev.txt
pytest -v
```

Resultado esperado: `57 passed`.

**Front-end (Vitest, lint e build):** em `web/`.

```bash
npm ci
npm test -- --run
npm run lint
npm run build
```

Resultado esperado: `Test Files 7 passed (7)` e `Tests 46 passed (46)`. Sem o `--run`, o Vitest fica em modo
observador.

| Suíte | Arquivo | O que cobre |
|---|---|---|
| API | `api/tests/test_tokens.py` | JWT: payload, expiração, assinatura adulterada, `alg: none`, emissor |
| API | `api/tests/test_servicos.py` | Regras de negócio: login, e-mail único, senha em hash, escalação de privilégio |
| API | `api/tests/test_api.py` | Respostas HTTP, matriz completa do RBAC, 401/403/404/409 e cabeçalhos de segurança |
| Front-end | `web/src/regras/*.test.js` | Validação do cadastro, mensagens de erro do Firebase, datas, valores em reais e resumo do mês |
| Front-end | `web/src/servicos/contas.test.js` | Cadastro no Firebase com o SDK simulado |
| Front-end | `web/src/componentes/toast/toasts.test.js` | Regras dos avisos na tela |

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
`X-Frame-Options`, `Referrer-Policy` e `Cache-Control: no-store`).

### 4. Teste manual da área do cliente

Na versão publicada (https://jolini.github.io/ADS-Project/) ou local:

1. Em `/cadastro`, crie uma conta com e-mail, senha, nome, sobrenome e data de nascimento.
2. Em `/login`, entre com ela: `/principal` mostra nome, sobrenome e data de nascimento lidos do Firestore.
3. Um e-mail não cadastrado ou senha errada mostram "Usuário não cadastrado ou senha incorreta.".
4. Depois de **Sair**, abrir `/principal` direto volta para o login: a página exige sessão.

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

A documentação completa (endpoints, JWT, RBAC, OAuth 2.0 e análise de segurança) está em
[`DOCS_API.md`](DOCS_API.md). Resumo:

| Método | Endpoint | Finalidade | Quem pode | Resposta |
|---|---|---|---|---|
| `POST` | `/auth/login` | Autenticar e obter o token | Público | `200 OK` |
| `GET` | `/usuarios` | Listar usuários | Administrador, Operador | `200 OK` |
| `GET` | `/usuarios/{id}` | Consultar um usuário | Administrador, Operador; Cliente só o próprio | `200 OK` |
| `POST` | `/usuarios` | Criar usuário | Administrador | `201 Created` |
| `PUT` | `/usuarios/{id}` | Atualizar usuário | Administrador, Operador | `200 OK` |
| `DELETE` | `/usuarios/{id}` | Excluir usuário | Administrador | `204 No Content` |

---

## Roadmap

O objetivo é um sistema financeiro completo para pessoa física e para empresa, sobre a mesma base.

- **0.1** Identidade e acesso — cadastro, login, perfis, administração de usuários (concluída)
- **0.2** Núcleo financeiro — espaços (pessoal e empresa), contas, categorias e lançamentos em partidas dobradas
- **0.3** Dashboard — saldo, totais do mês, receita × despesa, contas a vencer
- **0.4** Comprovantes — anexo de arquivo ao lançamento
- **0.5** Planejamento pessoal — orçamentos por categoria, metas e recorrências
- **0.6** Cartão de crédito — faturas e parcelamentos
- **0.7** Empresa — multiempresa, papéis por empresa, clientes, fornecedores, contas a pagar e a receber
- **0.8** Gestão empresarial — conciliação bancária, DRE gerencial, fluxo de caixa projetado, fechamento de mês
- **0.9** Integrações — importação de NF-e (XML), Pix e boletos via parceiro, exportação para a contabilidade
- **1.0** Produção — LGPD completa, MFA, auditoria, backups e app instalável (PWA)

---

## Licença

MIT. Ver [LICENSE](LICENSE).
