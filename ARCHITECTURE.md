# Arquitetura — Pessoal Finance

Fonte única da arquitetura do código: componentes, fluxos de identidade, dados, camadas de segurança,
ambientes e convenções. Como instalar, executar e testar está no [`README.md`](README.md); contrato HTTP,
códigos de resposta e análise de segurança da API, no [`DOCS_API.md`](DOCS_API.md).

---

## 1. Visão geral

```
┌──────────────────────────────────┐      ┌──────────────────────────────────┐
│  web/  — SPA React (OliFine)     │      │  api/painel/ — HTML, CSS e JS    │
│  Área do cliente:                │      │  Back-office: login, listagem,   │
│  / · /cadastro · /login          │      │  cadastro, edição e exclusão     │
│  /principal /lancamentos /contas │      │  de usuários                     │
│  /categorias /metas /relatorios  │      │                                  │
└───────┬──────────────────┬───────┘      └────────────────┬─────────────────┘
        │ SDK Firebase     │ HTTPS + ID token              │ HTTPS + JWT
        │                  └─────────────────┐             │
┌───────▼──────────────────────────┐      ┌──▼─────────────▼─────────────────┐
│  Firebase                        │      │  api/  — REST FastAPI (Python)   │
│  Authentication (e-mail/senha)   │      │  Usuários · JWT · RBAC           │
│  Cloud Firestore (perfil)        │      │  Livro-caixa (/espacos)          │
└──────────────────────────────────┘      │  Relatórios (/relatorios)        │
                                          └────────────────┬─────────────────┘
                                          ┌────────────────▼─────────────────┐
                                          │  MongoDB 7                       │
                                          └──────────────────────────────────┘
```

| Componente | Tecnologia | Responsabilidade |
|---|---|---|
| Área do cliente (`web/`) | React 19, Vite, React Router, Firebase JS SDK | Cadastro, login, perfil, livro-caixa, metas e relatórios do cliente final |
| Painel (`api/painel/`) | HTML, CSS e JS puros, servidos pela API em `/painel/` | Demonstração do back-office: CRUD de usuários com JWT e RBAC |
| API (`api/app/`) | Python 3.13, FastAPI, Pydantic, PyJWT, bcrypt, pymongo | Regras de negócio, autenticação, autorização e persistência |
| Identidade do cliente | Firebase Authentication + Cloud Firestore | Conta do cliente final e documento de perfil (`usuarios/{uid}`) |
| Banco da aplicação | MongoDB 7 | Usuários do back-office e livro-caixa |

### Duas fontes de identidade

O cliente final e o back-office nunca compartilham credencial, por decisão de produto:

| | Cliente final | Back-office |
|---|---|---|
| Quem emite | Firebase Authentication | A própria API (`POST /auth/login`) |
| Token | ID token do Firebase, **RS256**, validado com as chaves públicas do Google (`aud` e `iss` do projeto); o livro-caixa exige `email_verified` | JWT **HS256** assinado com `JWT_SECRET`, 15 minutos, revogado no logout pelo `jti` |
| Onde fica no navegador | `sessionStorage` (sessão por aba: fechar o navegador sai da conta); o logout apaga também os dados do app no `localStorage` | `sessionStorage` do painel |
| O que abre | `/espacos/**` (livro-caixa e relatórios) | `/usuarios/**` |
| Código | [`api/app/firebase.py`](api/app/firebase.py), [`api/app/financeiro/acesso.py`](api/app/financeiro/acesso.py) | [`api/app/tokens.py`](api/app/tokens.py), [`api/app/seguranca.py`](api/app/seguranca.py) |

O algoritmo fixo em cada lado (RS256 para o cliente, HS256 para o back-office) e os emissores diferentes impedem
que um token atravesse para a outra área, e os testes cobrem os dois sentidos.

---

## 2. API (`api/app/`)

Camadas, de fora para dentro. Cada camada só conhece a de baixo:

```text
main.py            fábrica criar_app(): middlewares, tratadores de erro, rotas e /painel
  │
  ├─ seguranca.py   CabecalhosDeSeguranca (CSP, nosniff, X-Frame-Options, Permissions-Policy, HSTS em HTTPS)
  ├─ limites.py     LimiteDoCorpo (413) e LimiteDeTentativas do login (429), com o armazenamento das falhas
  │                 atrás do contrato ArmazenamentoDeFalhas (memória hoje; Redis ou MongoDB com réplicas)
  ├─ revogacao.py   tokens do back-office encerrados no logout (jti), no MongoDB com índice TTL
  ├─ documentacao.py  /docs com Swagger UI de versão fixa (SRI) e CSP própria, sem script inline
  ├─ erros.py       tudo sai em Problem Details (RFC 9457), sem stack trace
  │
  ├─ rotas.py / financeiro/rotas*.py      contrato HTTP: método, caminho, corpo e código de resposta
  │     └─ dependências (Depends): usuario_autenticado + exigir_perfis (RBAC) no back-office;
  │        cliente_autenticado + espaco_do_cliente (membro do espaço) no livro-caixa
  ├─ servicos.py / financeiro/servicos.py regras de negócio, sem nada de HTTP
  ├─ financeiro/regras.py, importacao.py, cartoes.py, relatorios.py   funções puras, testadas sem banco
  └─ repositorio.py / financeiro/repositorio.py   MongoDB (Protocol + implementação; os testes usam memória)
```

- **Fábrica e injeção:** `criar_app(config, repositorio, livro_caixa, verificador, revogacao)` recebe as
  dependências; os testes passam repositórios em memória, uma lista de revogação em memória e um verificador com
  chave RSA própria. Nada de estado global.
- **Configuração:** [`config.py`](api/app/config.py) lê o ambiente (`api/.env`). Nenhum segredo tem valor padrão;
  `JWT_SECRET` com menos de 32 bytes derruba a subida.
- **Livro-caixa:** partidas dobradas (a soma das partidas de um lançamento é zero), dinheiro em **centavos
  inteiros**, correção por estorno (histórico fica) ou exclusão (erro de digitação). Cartão de crédito é uma conta
  de dívida com fatura por mês de vencimento. Tudo pertence a um **espaço** (`/espacos/{id}`), e o espaço
  pertence a membros identificados pelo `uid` do Firebase.
- **Importação de extrato (CSV):** leitura em funções puras; cada linha ganha uma chave de idempotência
  (SHA-256 da conta, data, valor, descrição e ocorrência), com índice único no MongoDB.
- **Relatórios:** agregações no MongoDB (`$group` por mês, categoria e conta), com o cartão por competência.

### Dados (MongoDB)

| Coleção | Conteúdo | Índices relevantes |
|---|---|---|
| `usuarios` | Back-office: nome, e-mail, hash BCrypt, perfil | `email` único |
| `tokens_revogados` | `jti` dos tokens do back-office encerrados no logout, com a hora em que venceriam | TTL em `expira_em` (a entrada some sozinha depois do vencimento) |
| `espacos` | Espaço pessoal (PF) de cada `uid`, com os membros | um espaço pessoal por `uid` (único), `membros.uid` |
| `contas` | Contas e cartões (limite, fechamento, vencimento) | `espaco_id` + data de criação |
| `categorias` | Categorias de receita e despesa, com cor | `espaco_id` + tipo + nome |
| `lancamentos` | Lançamento com as partidas embutidas (gravação atômica), divisão entre pessoas, compra parcelada | `espaco_id` + data; `espaco_id` + `chave_importacao` (único); um estorno por lançamento (único) |

Toda consulta do livro-caixa filtra por `espaco_id`, inclusive a busca por id: um id de outro espaço devolve
`404`, igual a um id inexistente (sem revelar que ele existe).

Fora do MongoDB: o perfil do cliente fica no Firestore (`usuarios/{uid}`, regras em
[`web/firestore.rules`](web/firestore.rules)); as **metas** ficam no `localStorage` do navegador, por `uid`, até
existir a API de metas, e saem dele no logout (junto com a contagem de tentativas de login).

---

## 3. Área do cliente (`web/src/`)

```text
main.jsx            BrowserRouter, avisos (toasts); recusa desenhar dentro de moldura de outro site no build
routes.jsx          todas as rotas; LimiteDeErro (Error Boundary) em volta de tudo
firebase.js         inicialização do Firebase; sessão por aba (browserSessionPersistence); e-mails em pt-BR
componentes/
  AreaDoCliente     guarda da área logada: sem e-mail confirmado, mostra a ConfirmarEmail; só monta a casca
                    com a sessão, o e-mail e o perfil confirmados
  AlternadorDeTema  botão de modo claro/escuro (topo da área logada, landing e telas de acesso)
  LimiteDeErro      Error Boundary: um erro de render mostra o aviso no lugar da tela, sem derrubar o app
  useCarga          busca assíncrona com erro no estado (nada de promessa solta)
  ...               componentes próprios: seletor, calendário, modal, menu, campos, gráficos
paginas/            Cadastro, Login, ConfirmarEmail, Lançamentos, Contas & Cartões, Cartão, Categorias, Relatórios
olifine/            identidade OliFine: casca, Visão geral (/principal), Metas, landing, regras próprias
regras/             funções puras e testadas: validação, dinheiro, datas, extrato, importação, relatórios
servicos/           contas.js (Firebase: cadastro com link de confirmação, logout que limpa o navegador),
                    livroCaixa.js (API com o ID token), enderecoDaApi.js, dadosLocais.js (o que sai no logout),
                    tentativasDeLogin.js (contagem de senhas erradas), tema.js (data-tema e a escolha salva)
estilos/            design tokens (tokens.css, com o tema escuro em [data-tema='escuro']), componentes,
                    movimento e o CSS de cada tela
public/tema.js      aplica o tema salvo (ou o do sistema) antes da primeira pintura, sem piscar
```

- **Regra de negócio fora da interface:** tudo o que decide (validação, cálculo, texto de erro) mora em
  `regras/` ou `olifine/regras/` e é testado com Vitest sem renderizar componente.
- **Erros:** `servicos/livroCaixa.js` converte toda falha em `ErroDaApi` (status + mensagem própria):
  rede fora, token que não renova, `401`, Problem Details da API. O texto técnico do SDK ou da API nunca vai para
  a tela; código do Firebase desconhecido cai na mensagem genérica (`regras/erros.js`).
- **Endereço da API:** `VITE_API_URL` no build. Aberto pela rede local, a página chama a API no IP de onde veio;
  pelo túnel da Cloudflare, no proxy do Vite, só em `/espacos` (`servicos/enderecoDaApi.js`, `vite.config.js`).
- **Sem API** (GitHub Pages): as telas do livro-caixa ficam desligadas e a Visão geral oferece dados de exemplo.
- **Sessão do cliente:** cadastro manda o link de confirmação; sem ele, a área logada mostra só a tela
  ConfirmarEmail (reenviar com espera de 60 s, "Já confirmei", sair). Login conta as senhas erradas no navegador
  (5 em 15 minutos por e-mail, guardado como resumo FNV-1a, sem o e-mail em texto) e avisa quantas restam; o
  Firebase continua freando do lado dele. Cadastro com e-mail que já tem conta segue o mesmo caminho do novo
  (sem revelar quem tem cadastro). O logout apaga as chaves `olifine:*` do navegador, menos a preferência de tema.
- **Tema e zoom:** tokens de cor trocados por `data-tema` no `<html>`; a transição de cor dura 400 ms e some com
  "reduzir movimento". A coluna de conteúdo da área logada para em 1680 px (zoom de 50% a 80% não estica o extrato);
  de 125% a 200% o layout passa pelas mesmas quebras do celular, sem rolagem lateral.

---

## 4. Segurança em camadas

| Camada | Controle | Onde |
|---|---|---|
| Borda do front-end | CSP em `<meta>` no build (`script-src 'self' https://apis.google.com`, `object-src 'none'`, `base-uri 'self'`); recusa de moldura (clickjacking) no Pages; no container, `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` e `server_tokens off` | `web/vite.config.js`, `web/src/main.jsx`, `web/nginx.conf` |
| Borda da API | CSP `default-src 'self'` no painel, `X-Frame-Options: DENY`, `nosniff`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, HSTS em HTTPS, `no-store` nos dados; CORS por lista explícita, sem cookie; `/docs` com CSP própria (`default-src 'none'`, script só da API e da versão fixa do Swagger na CDN, com SRI) e ReDoc desligado | `seguranca.py`, `main.py`, `documentacao.py` |
| Abuso | Corpo acima de 2 MB → `413`; 5 senhas erradas por e-mail + endereço (ou 20 por endereço) em 15 min → `429`, e cada `401` diz quantas restam; na área do cliente, a mesma regra no navegador, por e-mail | `limites.py`, `web/src/regras/tentativas.js` |
| Autenticação | JWT HS256 com algoritmo, emissor, expiração (15 min) e `jti` obrigatórios, revogado no logout; ID token RS256 do Firebase com `aud`, `iss`, datas e `email_verified`; mesma resposta e mesmo tempo para e-mail inexistente e senha errada; cadastro com e-mail já usado responde como um novo | `tokens.py`, `revogacao.py`, `firebase.py`, `servicos.py`, `Cadastro.jsx` |
| Sessão no navegador | Sessão por aba; logout apaga metas, tentativas e a sessão do Firebase (menos o tema); área logada só com e-mail confirmado | `servicos/contas.js`, `regras/dadosLocais.js`, `regras/sessao.js` |
| Autorização | RBAC por dependência em cada rota; perfil lido do banco a cada requisição; livro-caixa isolado por espaço (id alheio = `404`) | `seguranca.py`, `financeiro/acesso.py`, repositórios |
| Entrada | Pydantic com `extra="forbid"`, tamanhos e faixas; texto do CSV sem controle e sem começo de fórmula (CSV injection) | `modelos.py`, `financeiro/modelos.py`, `financeiro/importacao.py` |
| Saída | Problem Details com mensagens próprias; `500` genérico; React e `textContent` escapam todo texto (nenhum `innerHTML` nem `dangerouslySetInnerHTML`) | `erros.py`, `painel.js` |
| Dados | Senha só como hash BCrypt (custo 12); valores em centavos inteiros; regras do Firestore com dono, campos fixos, tipos e tamanhos | `senhas.py`, `web/firestore.rules` |
| Segredos | `.env` fora do Git; `JWT_SECRET`, `MONGODB_URI` e o webhook do Discord só no ambiente e nos secrets do GitHub; chave da conta de serviço do Firebase fora de qualquer repositório | `.gitignore`, `api/.env.example`, `web/.env.example` |
| CI/CD | `permissions` mínimas por workflow; actions fixadas pelo SHA do commit (tag movida não troca o código que roda); checkout sem guardar o token (`persist-credentials: false`); valores de PR entram no JSON pelo `jq --arg` e o Discord recebe `allowed_mentions` vazio (sem `@everyone` injetado) | `.github/workflows/` |

Ao mudar o código, mantenha estas regras:

- **Exportar CSV** (quando existir): escapar a célula que começa com `=`, `+`, `-`, `@`, tab ou retorno de carro.
- **Nova rota que devolve dados** entra em `ROTAS_DE_DADOS` (`no-store`) e declara a dependência de acesso.
- **Mais de uma instância da API:** passe ao `LimiteDeTentativas` um `ArmazenamentoDeFalhas` comum (Redis ou
  MongoDB com TTL; receita no docstring de `limites.py`). A revogação de tokens já fica no MongoDB.
- **Nova action no CI:** entra pelo SHA do commit, com a versão num comentário ao lado.
- **Novo dado no navegador:** chave com o prefixo `olifine:`, para o logout apagá-la.
- **Novo script externo no front-end:** entra na CSP do `vite.config.js` com a justificativa no comentário.

---

## 5. Ambientes e execução

| Ambiente | Como sobe | Observações |
|---|---|---|
| Local completo | `python subir-app.py up` | `api/.env` e `api/.venv` automáticos, MongoDB + API no Docker, Vite em segundo plano, links impressos; acesso pela rede local |
| Só a API | `docker compose up --build` | API em `http://localhost:8081`, painel em `/painel/`, Swagger em `/docs` |
| Demonstração externa | `python subir-app.py tunnel start` | Quick Tunnel da Cloudflare para o Vite; a API passa só em `/espacos`, pelo proxy |
| Container do front-end | `docker build --secret id=env,src=web/.env -t pessoal-finance-web web` | nginx alpine com os cabeçalhos de segurança; build com `--base=/` |
| Publicado | Push na `main` (workflow `cd.yml`) | GitHub Pages em `https://jolini.github.io/ADS-Project/`, sem API |

---

## 6. CI/CD

| Workflow | Gatilho | Etapas |
|---|---|---|
| [`ci-tests.yml`](.github/workflows/ci-tests.yml) | Cada commit de PR e push na `main` | oxlint, Vitest, build; pytest; alerta no Discord com o resultado |
| [`cd.yml`](.github/workflows/cd.yml) | PR (só build) e push na `main` (build + deploy) | Build com os `VITE_FIREBASE_*` dos secrets, `404.html` para as rotas da SPA, deploy no Pages |
| [`alertas.yml`](.github/workflows/alertas.yml) | Push na `main` | Aviso de merge no Discord |

As actions ficam presas ao SHA do commit, com a versão num comentário (`@11d5960… # v4.4.0`). Para atualizar:
`git ls-remote --tags https://github.com/actions/<action> "v4*"` e trocar o SHA e o comentário juntos.

---

## 7. Estrutura do repositório

```
api/                  API REST (FastAPI)
  app/                código da API (rotas, segurança, limites, regras, persistência)
  app/financeiro/     livro-caixa: modelos, regras, importação, cartões, relatórios, rotas e repositório
  painel/             front-end de demonstração da API (HTML, CSS e JS)
  tests/              testes unitários e de rota (pytest, repositórios em memória)
  .env.example        modelo da configuração da API
web/                  área do cliente (React + Firebase)
  src/                ver a seção 3
  firestore.rules     regras de segurança do Firestore
  nginx.conf          servidor do container, com os cabeçalhos de segurança
  .env.example        modelo da configuração do Firebase e da API
  iniciar.bat/.sh     atalhos que instalam as dependências e sobem o app (npm start)
.github/workflows/    ci-tests.yml, cd.yml e alertas.yml
docker-compose.yml    MongoDB + API
subir-app.py          sobe tudo com um comando (venv, dependências, Docker, Vite, links e túnel)
README.md             objetivo, tecnologias, instalação, execução e testes
ARCHITECTURE.md       este documento
DOCS_API.md           documentação técnica da API
```

---

## 8. Convenções

- **Código em português, comentário que explica o porquê** (decisão, segurança, enunciado), não o quê.
- **Funções puras para regra de negócio**, nos dois lados; componentes e rotas só orquestram.
- **Testes de verdade:** o CI reprova com teste vermelho; nada de `--passWithNoTests` nem teste pulado.
- **Repositório público:** nenhum dado pessoal real, IP de rede interna ou endereço de túnel; exemplos com
  `exemplo.com` e a faixa `192.0.2.0/24` (RFC 5737).
- **Commits** no formato `tipo(escopo): descrição` (`.gitmessage`), PR com o modelo de
  `.github/pull_request_template.md` e merge commit.
