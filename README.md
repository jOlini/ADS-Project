# Pessoal Finance

Plataforma de controle financeiro pessoal. O objetivo do produto é dar a uma pessoa física uma visão
única e confiável do próprio dinheiro, quanto entra, quanto sai, para onde vai e quanto sobra, sem
depender de planilha manual e sem exigir integração com o banco.

Este repositório contém a aplicação completa: a API REST, a interface web e a infraestrutura de
build, teste e entrega.

---

## Status

Em desenvolvimento ativo. Release em construção: **0.1 - Identidade e acesso**.

| Módulo | Descrição | Estado |
|---|---|---|
| Identidade e acesso | Cadastro, login, perfis de acesso e administração de usuários | Em desenvolvimento |
| Lançamentos | Receitas e despesas, contas e categorias | Planejado |
| Dashboard | Saldo, totais do mês e comparativo receita × despesa | Planejado |
| Comprovantes | Anexo de arquivo ao lançamento | Planejado |

A release 0.1 entrega a base sobre a qual todo o resto depende: saber quem é o usuário e o que ele
pode fazer. Enquanto ela não estiver fechada, os módulos financeiros não começam.

---

## Arquitetura

```
┌───────────────────────────────────────────────┐
│  web/  — SPA React                            │
│  · Área do cliente: cadastro, login, perfil   │
│  · Back-office: gestão de usuários e perfis   │
└───────────────┬───────────────────────────────┘
                │ HTTPS + JSON
┌───────────────▼───────────────────────────────┐
│  api/  — REST Spring Boot                     │
│  · CRUD de usuários                           │
│  · Autenticação JWT                           │
│  · Autorização por perfil (RBAC)              │
└───────────────┬───────────────────────────────┘
                │
        ┌───────▼────────┐    ┌──────────────────┐
        │  MongoDB       │    │ Firebase         │
        │  dados da app  │    │ Auth + Firestore │
        └────────────────┘    └──────────────────┘
```

**Duas fontes de identidade, por decisão de produto.** O cadastro e o login do cliente final usam
Firebase Authentication, fluxo self-service, sem custo de operação e com recuperação de senha
pronta. O back-office administrativo autentica contra a própria API, que emite um JWT e aplica
controle de acesso por perfil. Separar as duas identidades evita que uma credencial de cliente
alcance a área administrativa.

**Perfis de acesso**

| Perfil | Pode |
|---|---|
| `ADMINISTRADOR` | Acesso total: criar, consultar, editar e excluir usuários |
| `OPERADOR` | Consultar usuários e atualizar informações |
| `CLIENTE` | Visualizar e editar apenas os próprios dados |

---

## Stack

| Camada | Tecnologia |
|---|---|
| API | Java 21 · Spring Boot · Spring Security · JWT |
| Persistência | MongoDB |
| Identidade do cliente | Firebase Authentication · Cloud Firestore |
| Web | React · Vite · React Router |
| CI | GitHub Actions |

---

## Estrutura do repositório

```
api/                  API REST (Spring Boot)
web/                  Interface web (React)
.github/workflows/    Pipelines de build e teste
```

---

## Como executar

Os módulos entram em funcionamento conforme a release 0.1 avança; consulte a tabela de status acima antes de esperar que um comando responda.

**Pré-requisitos:** Java 21, Node.js 20+, Docker (para o MongoDB local) e um projeto Firebase com
Authentication (provedor e-mail/senha) e Firestore habilitados.

Banco de dados local:

```bash
docker run -d --name pessoal-finance-db -p 27017:27017 mongo:7
```

API:

```bash
cd api
./mvnw spring-boot:run
```

Interface web:

```bash
cd web
npm install
npm run dev
```

### Variáveis de ambiente

Cada módulo tem seu `.env.example`. Nenhum segredo é versionado.

| Variável | Módulo | Descrição |
|---|---|---|
| `MONGODB_URI` | api | String de conexão do MongoDB |
| `JWT_SECRET` | api | Chave de assinatura do token |
| `JWT_EXPIRATION` | api | Validade do token, em minutos |
| `VITE_API_URL` | web | URL base da API |
| `VITE_FIREBASE_*` | web | Credenciais públicas do projeto Firebase |

---

## Testes

```bash
cd api
./mvnw test
```

A suíte roda automaticamente em toda pull request. Pull request com teste vermelho não é mesclada.

---

## API

A documentação dos endpoints, do fluxo de autenticação e das regras de autorização fica em
[`docs/api`](docs/api). Resumo dos recursos da release 0.1:

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
