# Pessoal Finance

Plataforma de controle financeiro pessoal. O objetivo do produto é dar a uma pessoa física uma visão
única e confiável do próprio dinheiro, quanto entra, quanto sai, para onde vai e quanto sobra, sem
depender de planilha manual e sem exigir integração com o banco.

Este repositório contém a aplicação completa: a API REST, as interfaces web e a infraestrutura de
build, teste e entrega.

**Publicado:** https://jolini.github.io/ADS-Project/ (área do cliente, com Firebase)

---

## Status

Release em construção: **0.1 - Identidade e acesso**.

| Módulo | Descrição | Estado |
|---|---|---|
| Identidade e acesso | Cadastro, login, perfis de acesso e administração de usuários | Em validação |
| Lançamentos | Receitas e despesas, contas e categorias | Planejado |
| Dashboard | Saldo, totais do mês e comparativo receita × despesa | Planejado |
| Comprovantes | Anexo de arquivo ao lançamento | Planejado |

A release 0.1 entrega a base sobre a qual todo o resto depende: saber quem é o usuário e o que ele
pode fazer. Enquanto ela não estiver fechada, os módulos financeiros não começam.

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
| `OPERADOR` | Consultar usuários e atualizar nome e e-mail |
| `CLIENTE` | Visualizar apenas os próprios dados |

---

## Tecnologias utilizadas

| Camada | Tecnologia |
|---|---|
| API | Python 3.13 · FastAPI · Pydantic · PyJWT (HS256) · bcrypt · Uvicorn |
| Persistência da API | MongoDB 7 (pymongo) |
| Painel administrativo | HTML, CSS e JavaScript puros, servidos pela própria API |
| Área do cliente | React 19 · Vite · React Router · Firebase Authentication · Cloud Firestore |
| Testes | pytest (API) · Vitest (front-end) |
| CI/CD | GitHub Actions · GitHub Pages · alertas no Discord |
| Containers | Docker · Docker Compose |

---

## Estrutura do repositório

```
api/                  API REST (FastAPI)
  app/                código da API (rotas, segurança, regras, persistência)
  painel/             front-end de demonstração da API (HTML, CSS e JS)
  tests/              testes unitários e de rota (pytest)
web/                  área do cliente (React + Firebase)
  src/routes.jsx      arquivo de rotas (React Router)
  src/paginas/        Cadastro, Login e Principal
  firestore.rules     regras de segurança do Firestore
.github/workflows/    ci-tests.yml, cd.yml e alertas.yml
docker-compose.yml    MongoDB + API para rodar localmente
DOCS_API.md           documentação técnica da API
```

---

## Como instalar

**Pré-requisitos**

- **Docker** (Docker Desktop no Windows): sobe MongoDB e API sem instalar Python.
- **Node.js 20+**: para a área do cliente (React).
- **Python 3.13** (opcional): só para rodar a API ou os testes dela fora do Docker.
- **Projeto no Firebase** com Authentication (provedor e-mail/senha) e Cloud Firestore habilitados.

**Configuração**

1. API: copie `api/.env.example` para `api/.env` e troque os valores. Gere o `JWT_SECRET` com
   `python -c "import secrets; print(secrets.token_urlsafe(48))"` e defina `ADMIN_EMAIL` e `ADMIN_SENHA`
   do administrador inicial.
2. Área do cliente: copie `web/.env.example` para `web/.env` e preencha com a configuração do app Web do
   projeto Firebase (Console do Firebase › Configurações do projeto › Seus apps).
3. Firestore: publique as regras de [`web/firestore.rules`](web/firestore.rules) em Firestore Database ›
   Regras (ou `npx firebase-tools deploy --only firestore:rules --project <id>` dentro de `web/`).
4. Dependências do front-end: `cd web` e `npm install`.

Nenhum segredo é versionado: os arquivos `.env` estão no `.gitignore`.

---

## Como executar

**API + MongoDB (Docker Compose):**

```bash
docker compose up --build
```

- Painel administrativo: http://localhost:8081/painel/
- Documentação interativa (Swagger): http://localhost:8081/docs

**API sem Docker** (com um MongoDB local, ex.: `docker run -d --name pessoal-finance-db -p 27017:27017 mongo:7`):

```bash
cd api
python -m venv .venv
.venv\Scripts\activate            # Windows (no Linux/macOS: source .venv/bin/activate)
pip install -r requirements-dev.txt
uvicorn app.main:criar_app --factory --port 8081 --reload
```

**Área do cliente (React):**

```bash
cd web
npm run dev
```

Abre em http://localhost:5173/ADS-Project/ com as rotas `/cadastro`, `/login` e `/principal`.

Sem projeto Firebase, dá para usar os emuladores locais: `VITE_FIREBASE_EMULADOR=true` no `web/.env` e
`npx firebase-tools emulators:start --project demo-pessoal-finance` em `web/` (exige Java 11+).

**Front-end em container (nginx):**

```bash
docker build --secret id=env,src=web/.env -t pessoal-finance-web web
docker run --rm -p 8080:80 pessoal-finance-web
```

Abre em http://localhost:8080. O `--secret` entrega a configuração do Firebase só durante o build, sem gravá-la
na imagem.

### Variáveis de ambiente

| Variável | Módulo | Descrição |
|---|---|---|
| `MONGODB_URI` | api | String de conexão do MongoDB |
| `JWT_SECRET` | api | Chave de assinatura do token (mínimo 32 bytes) |
| `JWT_EXPIRATION` | api | Validade do token, em minutos (padrão 30) |
| `CORS_ORIGENS` | api | Origens de navegador autorizadas, separadas por vírgula (padrão: nenhuma) |
| `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA` | api | Administrador criado na primeira subida, com o banco vazio |
| `VITE_FIREBASE_*` | web | Configuração pública do app Web do Firebase |
| `VITE_FIREBASE_EMULADOR` | web | `true` para usar os emuladores locais do Firebase |

---

## Como testar

**Testes automatizados:**

```bash
cd api
pytest -v
```

```bash
cd web
npm test -- --run
```

A suíte da API cobre JWT (payload, expiração, assinatura adulterada, `alg: none`), regras de negócio, a matriz
de permissões do RBAC e as respostas HTTP; roda com um repositório em memória, sem MongoDB. A do front-end
cobre a validação do cadastro, as mensagens de erro e o fluxo de cadastro no Firebase (com o SDK simulado).

**Teste manual da API:** siga o roteiro da seção "Como testar" do [`DOCS_API.md`](DOCS_API.md).

**Teste manual da área do cliente:** em `/cadastro`, crie uma conta; em `/login`, entre com ela e confira nome,
sobrenome e data de nascimento em `/principal`. Um e-mail não cadastrado ou senha errada mostram "Usuário não
cadastrado ou senha incorreta.".

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

| Método | Endpoint | Finalidade | Resposta |
|---|---|---|---|
| `POST` | `/auth/login` | Autenticar e obter o token | `200 OK` |
| `GET` | `/usuarios` | Listar usuários | `200 OK` |
| `GET` | `/usuarios/{id}` | Consultar um usuário | `200 OK` |
| `POST` | `/usuarios` | Criar usuário | `201 Created` |
| `PUT` | `/usuarios/{id}` | Atualizar usuário | `200 OK` |
| `DELETE` | `/usuarios/{id}` | Excluir usuário | `204 No Content` |

---

## Roadmap

- **0.1** Identidade e acesso — cadastro, login, perfis, administração de usuários
- **0.2** Lançamentos — receitas, despesas, contas e categorias
- **0.3** Dashboard — saldo, totais do mês, receita × despesa
- **0.4** Comprovantes — anexo de arquivo ao lançamento

---

## Licença

MIT. Ver [LICENSE](LICENSE).
