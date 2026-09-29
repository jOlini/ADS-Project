# OliFine

**Finanças que fazem sentido.** OliFine é uma plataforma de controle financeiro pessoal: quanto entra,
quanto sai, para onde vai e quanto sobra, num lugar só, com metas que crescem como árvores. Este repositório
(projeto **Pessoal Finance**) reúne a área do cliente em React, a API REST segura e a infraestrutura de build,
teste e entrega.

| | |
|---|---|
| **Área do cliente publicada** | https://jolini.github.io/ADS-Project/ |
| **Releases (código para baixar)** | https://github.com/jOlini/ADS-Project/releases |
| **Arquitetura** | [`ARCHITECTURE.md`](ARCHITECTURE.md): componentes, identidades, dados, segurança em camadas, ambientes |
| **Documentação da API** | [`DOCS_API.md`](DOCS_API.md): endpoints, códigos de resposta, perfis, JWT, OAuth 2.0 e análise de segurança |
| **Licença** | Proprietária, todos os direitos reservados ([`LICENSE`](LICENSE)) |

**Tudo no ar com um comando:** `python subir-app.py dev` (API, MongoDB e área do cliente com recarga ao salvar)
ou `python subir-app.py prod` (o build otimizado servido pelo nginx, como em produção); sem argumentos, o script
abre um menu. Detalhes em [Como executar](#como-executar).
**Avaliação rápida só da API (precisa só do Docker):** copie `api/.env.example` para `api/.env`, rode
`docker compose up --build` e abra http://localhost:8081/painel/.

---

## Proposta de valor

- **Clareza em vez de planilha.** A Visão geral junta saldo, receitas e despesas do mês comparadas ao anterior,
  evolução do saldo e gasto por categoria. Cada número mostra de onde veio, lançamento por lançamento.
- **Do seu jeito, sem burocracia.** Contas, carteira de cartões de crédito com fatura e parcelas, categorias, racha
  entre pessoas, edição e remoção em lote e importação do extrato do banco em CSV (as colunas de vários bancos
  reconhecidas sozinhas, a categoria sugerida pela descrição e pelo histórico, editável na conferência, sem
  duplicar; na fatura do cartão, a compra "03/12" já gera as parcelas das próximas faturas).
- **Metas que dão vontade de cumprir.** Cada meta é uma árvore: cada aporte rega, ela brota, cresce e, completa,
  dá maçãs. O plano mensal diz quanto guardar para chegar lá no prazo.
- **Privacidade e segurança desde o início.** Conta com e-mail confirmado, sessão que termina ao fechar o
  navegador, dados do app apagados do navegador na saída, mensagens que nunca revelam quem tem cadastro e uma API
  com revogação de token, limites contra abuso e cabeçalhos de segurança.
- **Confortável de usar.** Modo claro e escuro, interface que não quebra com o zoom do navegador (50% a 200%),
  movimento que respeita "reduzir movimento" e ícones próprios.

---

## Objetivo do projeto

**Objetivo do produto.** Dar a uma pessoa física uma visão única e confiável do próprio dinheiro (quanto entra,
quanto sai, para onde vai e quanto sobra) sem depender de planilha manual.

**O que o sistema entrega hoje.** A base de identidade e acesso (0.1) está concluída; o livro-caixa (0.2) e os
relatórios (0.3) estão em construção:

- uma **API REST segura para gestão de usuários**: cadastrar, consultar, atualizar e excluir, com login que
  gera um **token JWT** (15 minutos, revogado no logout), controle de acesso por perfil (**RBAC**) com três
  perfis (`ADMINISTRADOR`, `OPERADOR` e `CLIENTE`) e limite de tentativas contra força bruta, com o aviso de
  quantas restam;
- um **painel web de demonstração** da API (login, listagem, cadastro, edição, exclusão e as respostas da API
  na tela), feito para que qualquer pessoa veja e teste as regras de autenticação e autorização;
- uma **área do cliente** em React, com a identidade visual **OliFine**: página de apresentação com simulador de
  orçamento, cadastro com confirmação do e-mail, login e Visão geral com Firebase Authentication e Cloud
  Firestore, publicada no GitHub Pages; com a API local, ganha lançamentos, contas e cartões de crédito,
  categorias, importação do extrato em CSV, relatórios e **espaços separados** (pessoal, família e empresa, cada
  um com o próprio livro-caixa, trocados no topo da tela); as metas funcionam nos dois casos;
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

| Release | Conteúdo | Estado |
|---|---|---|
| 0.1 — Identidade e acesso | Cadastro, login, perfis de acesso e administração de usuários | Concluída (tags `v0.1.0`, `v0.1.1` e `v0.1.2`) |
| 0.2 — Lançamentos | Receitas, despesas e transferências, contas, cartões de crédito, categorias e importação de extrato (CSV) | Em construção: API e telas prontas |
| 0.3 — Dashboard | Saldo, totais do mês, receita × despesa e gasto por categoria | Em construção: API de relatórios e tela Relatórios prontas |
| 0.4 — Comprovantes | Anexo de arquivo ao lançamento | Planejada |

---

## Arquitetura

Três partes: a **área do cliente** (React, em `web/`), o **painel do back-office** (HTML, CSS e JS, servido pela
API) e a **API REST** (FastAPI + MongoDB, em `api/`).

```
 Navegador ── área do cliente (React, OliFine) ──┬── Firebase Authentication + Cloud Firestore
                                                 └── API REST (/espacos e /conta, ID token do Firebase)
 Navegador ── painel do back-office ───────────────── API REST (/auth, /usuarios, JWT próprio) ── MongoDB 7
 API REST (/conta) ── Firebase (código do link) + provedor de e-mail (Resend ou SMTP) ── caixa de entrada
```

São **duas fontes de identidade**, por decisão de produto: o cliente final entra pelo Firebase Authentication, e a
API aceita o **ID token do Firebase** (com o e-mail confirmado) no livro-caixa; o back-office entra pela própria
API, que emite um **JWT** e aplica o RBAC em `/usuarios`. Um token nunca abre a área do outro.

Os e-mails da conta (confirmação e senha nova) saem da API, com a marca OliFine: ela pede ao Firebase só o código
do link, sem que ele mande nada, e o link leva a páginas do próprio app (`/auth/...`). Sem provedor de e-mail
configurado (como no GitHub Pages), o Firebase manda o e-mail padrão dele, e nada deixa de funcionar.

Diagrama completo, camadas da API e do front-end, modelo de dados, segurança em camadas e ambientes:
[`ARCHITECTURE.md`](ARCHITECTURE.md). Matriz de permissões:
[`DOCS_API.md`, Parte 3](DOCS_API.md#parte-3--controle-de-acesso-rbac).

---

## Tecnologias utilizadas

| Camada | Tecnologia | Para quê |
|---|---|---|
| Área do cliente | React 19 · Vite · React Router · TypeScript (entrando aos poucos) | SPA com a página de apresentação (`/`), `/cadastro`, `/login`, `/principal` e as telas do livro-caixa |
| Identidade do cliente | Firebase Authentication (e-mail/senha, com confirmação do e-mail) · Cloud Firestore | Conta do cliente final e dados do perfil, protegidos por regras do Firestore |
| Interface | CSS próprio com design tokens (`web/src/estilos/tokens.css`), fonte Geist auto-hospedada (SIL OFL) | Identidade OliFine: modo claro e escuro com botão (a escolha fica salva), verdes de croma contido, ícones desenhados no projeto, componentes próprios (seletor, calendário, modal, menu), micro-interações e esqueletos de carga |
| API | Python 3.13 · FastAPI · Pydantic · Uvicorn | Endpoints REST, validação da entrada e documentação OpenAPI (Swagger) gerada do código |
| Segurança da API | PyJWT (HS256 e RS256) · cryptography · bcrypt | Token do back-office de 15 minutos com revogação pelo `jti`; ID token do Firebase conferido com as chaves do Google; senhas só como hash |
| Persistência | MongoDB 7 (pymongo) | Usuários (e-mail único), tokens revogados (TTL) e livro-caixa (lançamento e partidas num só documento, gravação atômica) |
| Painel da API | HTML, CSS e JavaScript puros, servidos pela própria API | Interface de demonstração: login, CRUD e respostas da API na tela |
| Testes | pytest · Vitest · oxlint · tsc | Testes unitários e de rota da API; regras e serviços do front-end; lint; tipos dos módulos em TypeScript |
| CI/CD | GitHub Actions (actions fixadas por SHA) · GitHub Pages · webhook do Discord | Testes a cada commit de PR, deploy automático e alertas |
| Containers e rede | Docker · Docker Compose · Cloudflare Quick Tunnel | MongoDB + API com um comando; imagem nginx do front-end; demonstração externa temporária |

---

## Segurança

### Práticas por camada

| Camada | O que a aplicação faz |
|---|---|
| Conta do cliente | Link de confirmação no cadastro: a área logada (e a API do livro-caixa) só abre com o e-mail confirmado. Login e cadastro nunca revelam quem tem conta: a mesma mensagem para e-mail sem conta e senha errada, e o cadastro com e-mail já usado segue o mesmo caminho de um novo. Depois de cada senha errada, o login diz quantas tentativas restam; na quinta, o acesso com aquele e-mail fica bloqueado por 15 minutos |
| E-mails da conta | Confirmação e senha nova pela API, com o código do link depois do `#` (não chega ao log do servidor) e páginas próprias (`/auth/verificar-email`, `/auth/redefinir-senha`). "Esqueci minha senha" responde igual com e sem conta, e o envio roda depois da resposta (o tempo também não revela). Limites: 1 link por minuto e 5 por hora por conta ou e-mail; `429` com `Retry-After`. Nenhum texto do e-mail vem de quem pediu |
| Configuração de produção | `AMBIENTE=producao` recusa subir com os valores de exemplo, CORS em `http://` ou curinga, MongoDB sem senha e `APP_URL` sem HTTPS, e tira o Swagger e o `/openapi.json` do ar. Segredos lidos de arquivo (`/run/secrets`), fora das variáveis de ambiente |
| Sessão no navegador | Sessão por aba (`sessionStorage`): fechar o navegador sai da conta. O logout apaga do navegador as metas, a contagem de tentativas e a sessão do Firebase; só a preferência de tema fica |
| Login do back-office | Senha só como hash BCrypt; `401` com `tentativas_restantes`; `429` depois de 5 senhas erradas (por e-mail e endereço) ou 20 (por endereço) em 15 minutos; mesmo tempo de resposta com e sem conta |
| Token do back-office | JWT HS256 de 15 minutos com `jti`; `POST /auth/logout` revoga o token na hora (lista no MongoDB com TTL); perfil lido do banco a cada requisição |
| Borda da API | CSP, `X-Frame-Options`, `nosniff`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`, HSTS em HTTPS, `no-store` nos dados; corpo acima de 2 MB → `413`; erros sem stack trace; texto livre limpo (sem tag, fórmula de planilha nem caractere invisível); CSV conferido (planilha, PDF ou binário recusado, célula de até 5 mil caracteres, no máximo 4 importações ao mesmo tempo) |
| Formulários | Máscaras por tipo de dado: valor em reais (letra e símbolo nem entram, pontos de milhar sozinhos, dois decimais), data e texto sem `<` e `>`; a linha da mensagem de erro fica reservada embaixo de cada campo, e o erro não empurra nem desalinha nada |
| Documentação (`/docs`) | Swagger UI de versão fixa com Subresource Integrity e CSP própria, sem script inline; ReDoc desligado |
| Borda do front-end | CSP em `<meta>` no build (script só do próprio site e do login do Google), recusa de moldura (clickjacking); no container, cabeçalhos do nginx |
| Monitoramento | Alertas no Discord em três canais, cada um com o próprio webhook: sistema (erro `500` com a rota e o tipo da exceção, e-mail que não saiu), segurança (login travado por força bruta, rajada de `401` do mesmo endereço, abuso dos e-mails) e telemetria (resumo de uso e cota diária de e-mails). Sem e-mail, token, corpo ou mensagem de exceção; o mesmo alerta sai no máximo a cada 15 minutos, com a contagem das repetições; uma falha do Discord nunca afeta a resposta |
| CI/CD | `permissions` mínimas; actions fixadas pelo SHA do commit; checkout sem guardar o token; alertas do Discord sem menção injetada |

Análise completa, com os riscos residuais: [`DOCS_API.md`, Parte 5](DOCS_API.md#parte-5--análise-de-segurança) e
[`ARCHITECTURE.md`, seção 4](ARCHITECTURE.md#4-segurança-em-camadas).

### Onde fica cada credencial

Nenhum segredo é versionado: o repositório é público.

| Credencial | Onde fica | Regra |
|---|---|---|
| `JWT_SECRET`, `ADMIN_SENHA`, `MONGODB_URI` | Só no `api/.env` (fora do Git) | Chave aleatória de 32 bytes ou mais (a API não sobe com menos); o `subir-app.py dev` gera valores aleatórios. Vazou: troque a chave (todos os tokens caem) e a senha |
| `VITE_FIREBASE_*` | `web/.env` local e secrets do GitHub (build do Pages) | Públicas por natureza (vão para o navegador); quem protege os dados são as regras do Firestore |
| `DISCORD_WEBHOOK` | Só nos secrets do GitHub | Nunca em arquivo, log ou print |
| `DISCORD_WEBHOOK_SISTEMA`, `_SEGURANCA`, `_TELEMETRIA` | `api/.env` local; num servidor, `/run/secrets/discord_webhook_<canal>` | Quem tem o endereço escreve no canal. A API só aceita endereços do Discord e nunca os escreve no log. Vazou: apague o webhook no canal e crie outro |
| Chave da conta de serviço do Firebase | Fora de qualquer repositório, na pasta do usuário (`FIREBASE_CONTA_DE_SERVICO`) | Vale como senha de administrador do projeto Firebase. Para os e-mails, use uma conta de serviço só com o papel "Administrador do Firebase Authentication" |
| `RESEND_API_KEY`, `SMTP_SENHA` | `api/.env` local; num servidor, `/run/secrets/<nome>` | Vazou: revogue a chave no provedor e gere outra |

Antes de cada commit, confira o que vai entrar (`git diff --cached --name-only`) e adicione arquivo por arquivo,
nunca `git add .`: o `.gitignore` barra os `.env`, `*.pem`, `*.key` e as chaves do Firebase, mas a conferência é a
última barreira. Nada de IP real, nome de rede ou endereço de túnel em arquivo versionado: exemplos com
`<SEU_IP_LOCAL>` ou a faixa `192.0.2.0/24`.

### Monitoramento (alertas no Discord)

A API avisa em três canais, cada um com o próprio webhook (detalhes e regras na
[`DOCS_API.md`, Parte 9](DOCS_API.md#parte-9--monitoramento-alertas-e-telemetria)). Para ligar:

1. No servidor do Discord, crie os canais `#alertas-sistema`, `#logs-seguranca` e `#telemetria-custos`. Deixe o de
   segurança privado: ele recebe IPs de quem ataca.
2. Em cada canal: **Editar canal › Integrações › Webhooks › Novo webhook › Copiar URL do webhook**.
3. Cole cada endereço no `api/.env`, em `DISCORD_WEBHOOK_SISTEMA`, `DISCORD_WEBHOOK_SEGURANCA` e
   `DISCORD_WEBHOOK_TELEMETRIA` (canal sem webhook fica desligado).
4. `python subir-app.py alertas` manda uma mensagem de teste para cada canal; `python subir-app.py dev` sobe a API
   com os alertas ligados.

---

## Como instalar

### Pré-requisitos

| Ferramenta | Versão | Precisa para |
|---|---|---|
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows e macOS) ou Docker Engine com Compose v2 (Linux) | Atual | **API + MongoDB + painel.** É o único requisito para avaliar a API |
| [Python](https://www.python.org/downloads/) | 3.11 ou mais novo (3.13 recomendado) | `subir-app.py` e testes da API fora do Docker (o `subir-app.py` instala o 3.13 no Windows se faltar) |
| [Node.js](https://nodejs.org/) | 20.19 ou mais novo | Área do cliente (React) e testes do front-end |
| Projeto no [Firebase](https://console.firebase.google.com/) | — | Rodar a área do cliente localmente (a versão publicada já funciona) |

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

O `python subir-app.py dev` faz este passo sozinho, com valores aleatórios. À mão, na raiz do projeto:

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
banco vazio. Os valores do modelo são públicos: troque antes de qualquer uso real.

### 3. Configurar a área do cliente (opcional)

Só para rodar o React na própria máquina. Para apenas usar a área do cliente, abra a versão publicada.

1. Copie `web/.env.example` para `web/.env` e preencha com a configuração do app Web do projeto Firebase
   (Console do Firebase › Configurações do projeto › Seus apps). O projeto precisa ter Authentication (provedor
   e-mail/senha) e Cloud Firestore habilitados. Sem os e-mails pela API (abaixo), a confirmação e a senha nova
   usam o modelo do Firebase (Authentication › Templates); em "Personalizar URL de ação", o endereço
   `<endereço do app>/auth/acao` leva também esses links às páginas do app. A proteção contra enumeração de e-mail
   fica ligada (padrão em projetos novos).
2. Para as telas do livro-caixa, acrescente `VITE_API_URL=http://localhost:8081` ao `web/.env` e confira, no
   `api/.env`, o `FIREBASE_PROJECT_ID` (o mesmo `VITE_FIREBASE_PROJECT_ID`) e o `CORS_ORIGENS` com
   `http://localhost:5173`. Sem `VITE_API_URL`, o app funciona como a versão publicada.
3. Publique as regras de [`web/firestore.rules`](web/firestore.rules) em Firestore Database › Regras (ou
   `npx firebase-tools deploy --only firestore:rules --project <id>` dentro de `web/`).
4. Instale as dependências: `cd web` e `npm ci`.

**E-mails com a marca OliFine (opcional).** No `api/.env`: `EMAIL_PROVEDOR` (`resend`, `smtp` ou `pasta`),
`EMAIL_REMETENTE`, `APP_URL` (endereço da área do cliente, para onde os links levam) e
`FIREBASE_CONTA_DE_SERVICO` (caminho da chave JSON de uma conta de serviço do projeto, guardada fora do
repositório). Com `EMAIL_PROVEDOR=pasta`, nenhum e-mail sai: cada um vira um `.html` em `api/emails-enviados/`,
para abrir e clicar no link (pelo `python subir-app.py dev`, que monta a pasta no container, ou com a API fora do
Docker, opção C). Para ver os modelos sem configurar nada: `.venv\Scripts\python -m app.emails.previa <pasta>` em
`api/`. O monograma dos e-mails é uma imagem do próprio
app (`<APP_URL>/email/olifine-monograma.png`): com o `APP_URL` num endereço público, ele aparece em qualquer leitor
de e-mail; com as imagens bloqueadas, o quadrado mostra "OF" em texto.

Sem projeto Firebase, dá para usar os emuladores locais: `VITE_FIREBASE_EMULADOR=true` no `web/.env` e
`npx firebase-tools emulators:start --project demo-pessoal-finance` em `web/` (exige Java 11+; o link de
confirmação aparece no log do emulador).

---

## Como executar

### Opção A — tudo com um comando (`subir-app.py`)

```bash
python subir-app.py                # menu com todos os comandos
python subir-app.py dev            # desenvolvimento: API, MongoDB e área do cliente com recarga ao salvar
python subir-app.py dev --sem-web  # só API e MongoDB (dispensa o Node.js)
python subir-app.py prod           # produção local: build otimizado servido pelo nginx, na porta 8080
```

Os dois modos usam a mesma API e o mesmo banco; o que muda é quem serve a área do cliente e quanto o terminal mostra:

| | `dev` | `prod` |
|---|---|---|
| Área do cliente | Vite na porta 5173, com HMR (a tela atualiza ao salvar) | Imagem do [`web/Dockerfile`](web/Dockerfile): build do Vite servido pelo nginx na porta 8080, na raiz |
| API | Lê o código de `api/app` direto da pasta e reinicia sozinha a cada `.py` salvo (`uvicorn --reload`) | Roda como está na imagem, sem recarga |
| Saída | Completa: cada comando (`docker`, `npm`) e a saída dele | Enxuta: uma linha por etapa; a saída de um comando só aparece se ele falhar |
| Precisa de | Python, Node.js e Docker | Só Docker (tudo é construído nos containers) |

O `prod` é o mesmo artefato que vai para um servidor, servido como em produção; as travas de `AMBIENTE=producao`
(HTTPS, banco com senha) valem só no servidor. Trocar de modo encerra o outro: o `prod` para o Vite, e o `dev`
remove o container do nginx. `up` continua valendo e é o mesmo que `dev`.

O script usa só a biblioteca padrão do Python e faz, em ordem: cria o `api/.env` se ele faltar (com `JWT_SECRET`
e `ADMIN_SENHA` aleatórios), copia o `FIREBASE_PROJECT_ID` do `web/.env` quando ele está vazio, confere o `api/.env`
e o `web/.env` (e para antes do Docker quando algo impediria a API de subir ou exporia um segredo), instala as
dependências da API no `api/.venv` (nunca no Python da máquina), roda o `npm ci` do front-end quando o
`package-lock.json` muda, abre o Docker Desktop se estiver fechado, sobe os containers esperando os healthchecks (e
mostra o fim do log de quem não subiu), sobe o Vite em segundo plano (no `dev`) e mostra os endereços, os acessos e
as pendências. Rodar de novo com tudo no ar só confere o estado. Estado, log do Vite e o complemento do compose ficam
em `.subir-app/` (fora do Git). As cores seguem a paleta da OliFine; `NO_COLOR=1` desliga.

O que só existe nesta máquina, ou muda entre os modos, entra pelo `.subir-app/compose.local.yml`, gerado a cada
subida: a chave da conta de serviço dos e-mails vira o Docker secret `/run/secrets/firebase_conta_de_servico` (o
caminho do Windows no `api/.env` não existe dentro do container); com `EMAIL_PROVEDOR=pasta`, os e-mails gravados
aparecem em `api/emails-enviados/`; no `dev`, as pastas `api/app` e `api/painel` entram no container só para
leitura; no `prod`, o serviço `web` recebe o `web/.env` como secret de build (fica fora das camadas da imagem). Um
`docker compose up` direto não faz nada disso: prefira o `subir-app`.

| Comando | O que faz |
|---|---|
| `python subir-app.py dev` | Sobe tudo em modo de desenvolvimento e mostra os endereços (`--sem-build` reaproveita a imagem da API) |
| `python subir-app.py prod` | Sobe tudo em modo de produção local (`--sem-build` reaproveita as imagens) |
| `python subir-app.py status` | Mostra o que está no ar, o modo, os endereços e as pendências de configuração, sem subir nada |
| `python subir-app.py verificar` | Confere tudo e aponta o que falta: `api/.env`, e-mails, alertas, `web/.env`, segredos fora do Git, site publicado com o monograma, DNS do remetente (DKIM, SPF, DMARC), Console do Firebase (URL de ação e domínios autorizados) e webhooks do Discord (existem e aceitam o token, sem mandar mensagem). Só lê; `--sem-rede` fica nas locais |
| `python subir-app.py testes` | Roda o pytest da API e o lint, os tipos (TypeScript), o Vitest e o build do front-end, como o CI |
| `python subir-app.py logs [serviço]` | Acompanha os logs: `api` (padrão), `web` (nginx do `prod`), `mongo`, `vite` ou `todos`. `Ctrl + C` sai e deixa tudo no ar |
| `python subir-app.py alertas` | Manda uma mensagem de teste para cada canal do Discord configurado no `api/.env` |
| `python subir-app.py down` | Para o túnel, o Vite e os containers (`--apagar-dados` também apaga o banco) |
| `python subir-app.py tunnel start` | Abre um endereço público temporário para a área do cliente (ou `npm run tunnel:start` em `web/`) |
| `python subir-app.py tunnel stop` | Fecha esse endereço: o app volta a ser só local (ou `npm run tunnel:stop`) |

O `api/.venv` precisa de Python 3.11+ (o CI e o Docker usam o 3.13), mas o script roda com um Python mais antigo:
ele procura outro Python instalado (no Windows, pelo lançador `py`), instala o 3.13 pelo `winget` só para o
usuário e, se nada disso der certo, explica como atualizar. Um `api/.venv` quebrado é recriado.

#### Rede local

O Vite sobe com `--host 0.0.0.0` (e o nginx do `prod` publica a 8080 em todas as interfaces), e o fim da subida
mostra os endereços no formato do próprio Vite:

```text
➜ Local    http://localhost:5173/ADS-Project/
➜ Network  http://<SEU_IP_LOCAL>:5173/ADS-Project/
➜ Túnel    fechado · python subir-app.py tunnel start
```

No `prod`, os endereços são `http://localhost:8080/` e `http://<SEU_IP_LOCAL>:8080/`. Na mesma rede (Wi-Fi ou
cabo), o endereço Network abre o app no celular ou em outro computador. A página aberta pela rede chama a API no IP
de onde veio, e o script passa essas origens (portas 5173 e 8080) à API pelo `CORS_ORIGENS_REDE`, sem gravar nada
no `api/.env` (o IP muda de rede em rede). Se não abrir, libere o Node.js (ou o Docker, no `prod`) no Firewall do
Windows (rede privada); em rede de empresa, ele pode estar bloqueado.

#### Demonstração externa (Cloudflare Tunnel)

Para mostrar uma funcionalidade a pessoas de fora da rede, sem publicar no GitHub Pages, com o ambiente no ar:

```bash
python subir-app.py tunnel start
python subir-app.py tunnel stop
```

O `start` abre um Quick Tunnel da Cloudflare (sem conta) para o front-end que estiver no ar (o Vite do `dev` ou o
nginx do `prod`) e mostra o endereço, no formato `https://<palavras-aleatorias>.trycloudflare.com/ADS-Project/`
(no `prod`, na raiz). O endereço muda a cada início e deixa de existir no `stop` (o `down` também fecha o túnel).
Usa o `cloudflared` instalado ou baixa o oficial para `.subir-app/`.

- **O que fica público:** só a área do cliente. A API entra pelo proxy do front-end (o do Vite no `dev`, o do nginx
  no `prod`) e só nas rotas do cliente (`/espacos`, que exigem o login do Firebase); o painel, o login do
  back-office e o Swagger continuam só locais.
- **Quem entra:** qualquer pessoa com o endereço chega ao login, e o cadastro está aberto. Mande o endereço só
  para quem vai ver a demonstração e feche o túnel ao terminar.
- **Nada da sua rede aparece:** a pessoa só vê o endereço `trycloudflare.com`. Não publique o IP da máquina, o
  nome da rede ou o endereço de um túnel aberto.
- **Rede de empresa:** o firewall pode bloquear o túnel, e a política de TI pode proibir. Use em rede própria.

### Opção B — Docker Compose (recomendada para avaliar só a API)

Na raiz do projeto, com o Docker aberto e o `api/.env` pronto:

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

Entre no painel com `ADMIN_EMAIL` e `ADMIN_SENHA` do `api/.env`. Para parar: `Ctrl + C` e `docker compose down`.
Os usuários ficam no volume do MongoDB; `docker compose down -v` apaga o banco, e a próxima subida recria só o
administrador.

### Opção C — API sem Docker

Precisa de um MongoDB local (ex.: `docker run -d --name pessoal-finance-db -p 27017:27017 mongo:7`). Em `api/`:

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows (no Linux e macOS: source .venv/bin/activate)
pip install -r requirements-dev.txt
uvicorn app.main:criar_app --factory --port 8081 --reload
```

### Área do cliente (React)

Com o `web/.env` configurado, o atalho faz tudo: no Windows, dois cliques em `web/iniciar.bat`; no Linux e macOS,
`bash web/iniciar.sh`. Pelos comandos: `cd web`, `npm install` e `npm start`. O navegador abre em
http://localhost:5173/ADS-Project/ (`npm run dev` sobe o mesmo servidor sem abrir o navegador). Guia só da área
do cliente: [`web/README.md`](web/README.md).

A raiz (`/`) mostra a página de apresentação, com o simulador "Quanto sobra no seu mês?". A área logada tem a
Visão geral (números do mês, evolução do saldo, despesas por categoria, últimas transações, metas e os dados do
cadastro), a aba Metas (as metas ficam no navegador até a API de metas e saem dele no logout) e, com a API,
Lançamentos, Contas & Cartões, Categorias e Relatórios. O botão de lua ou sol no topo troca o tema.

### Front-end em container (nginx)

```bash
docker build --secret id=env,src=web/.env -t pessoal-finance-web web
docker run --rm -p 8080:80 pessoal-finance-web
```

Abre em http://localhost:8080. O `--secret` entrega a configuração do Firebase só durante o build, sem gravá-la
na imagem. O nginx do container ([`web/nginx.conf`](web/nginx.conf)) manda os cabeçalhos de segurança e esconde a
versão dele. Dentro do Docker Compose (o `python subir-app.py prod` monta assim), ele também repassa
`/api/espacos...` ao serviço `api`, e só essas rotas; num `docker run` sozinho, essas rotas respondem `502` e o
resto funciona normalmente.

### Variáveis de ambiente

| Variável | Módulo | Descrição |
|---|---|---|
| `MONGODB_URI` | api | String de conexão do MongoDB (no Docker Compose, aponta para o container) |
| `JWT_SECRET` | api | Chave de assinatura do token (mínimo 32 bytes) |
| `JWT_EXPIRATION` | api | Validade do token, em minutos (padrão 15) |
| `CORS_ORIGENS` | api | Origens de navegador autorizadas, separadas por vírgula (sem a variável: nenhuma; o `.env.example` libera a área do cliente local, portas 5173 e 8080) |
| `CORS_ORIGENS_REDE` | api | Origens da área do cliente aberta pela rede local, somadas ao `CORS_ORIGENS`. Não vai no `.env`: o `subir-app.py` passa pelo Docker Compose a cada subida |
| `FIREBASE_PROJECT_ID` | api | Projeto Firebase cujos ID tokens abrem o livro-caixa (o mesmo `VITE_FIREBASE_PROJECT_ID`). Vazio: `/espacos` responde `503` |
| `ADMIN_NOME`, `ADMIN_EMAIL`, `ADMIN_SENHA` | api | Administrador criado na primeira subida, com o banco vazio |
| `AMBIENTE` | api | `desenvolvimento` (padrão) ou `producao`: em produção, a API recusa configuração insegura e tira o Swagger do ar |
| `FORWARDED_ALLOW_IPS` | api | Só atrás de um proxy reverso: o IP do proxy, para o limite de tentativas ver o IP real de quem chama |
| `EMAIL_PROVEDOR` | api | E-mails da conta pela API: `resend`, `smtp` ou `pasta` (desenvolvimento). Vazio: `/conta` responde `503` e o Firebase manda |
| `APP_URL` | api | Endereço da área do cliente usado nos links dos e-mails (em produção, `https://`) |
| `EMAIL_REMETENTE`, `EMAIL_RESPONDER_PARA` | api | Remetente (`Nome <endereco>`, com o domínio verificado no provedor) e resposta |
| `FIREBASE_CONTA_DE_SERVICO` | api | Chave JSON da conta de serviço (caminho ou conteúdo), só para gerar os códigos dos links |
| `RESEND_API_KEY` | api | Chave do Resend (`EMAIL_PROVEDOR=resend`) |
| `SMTP_HOST`, `SMTP_PORTA`, `SMTP_USUARIO`, `SMTP_SENHA` | api | Servidor SMTP (`EMAIL_PROVEDOR=smtp`): 465 com SSL ou 587 com STARTTLS |
| `EMAIL_PASTA` | api | Pasta dos e-mails gravados com `EMAIL_PROVEDOR=pasta` (padrão `emails-enviados`) |
| `EMAIL_COTA_DIARIA` | api | Cota diária de e-mails do provedor (padrão 100, a do Resend grátis): a telemetria avisa em 80% e em 100%. `0` desliga o aviso |
| `DISCORD_WEBHOOK_SISTEMA`, `DISCORD_WEBHOOK_SEGURANCA`, `DISCORD_WEBHOOK_TELEMETRIA` | api | Webhook de cada canal de alertas (`#alertas-sistema`, `#logs-seguranca`, `#telemetria-custos`). Vazio: canal desligado. Endereço fora do Discord: a API não sobe |
| `TELEMETRIA_INTERVALO_HORAS` | api | A cada quantas horas o resumo de uso vai para a telemetria (padrão 24) |
| `VITE_FIREBASE_*` | web | Configuração pública do app Web do Firebase |
| `VITE_FIREBASE_EMULADOR` | web | `true` para usar os emuladores locais do Firebase |
| `VITE_API_URL` | web | Endereço da API (ex.: `http://localhost:8081`; `/api` com a API atrás do mesmo domínio). Vazio: telas do livro-caixa desligadas, como no GitHub Pages |
| `VITE_BASE` | web | Caminho onde o build é publicado. Vazio: `/ADS-Project/` (GitHub Pages); `/` num domínio próprio (o Dockerfile já usa `/`). Só no build e no `npm run preview` |

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

Resultado esperado: todos passando, nenhum `failed` (a contagem cresce a cada entrega).

**Front-end (Vitest, lint, tipos e build):** em `web/`.

```bash
npm ci
npm test -- --run
npm run lint
npm run typecheck
npm run build
```

Resultado esperado: todos os arquivos e testes `passed`, e o `typecheck` sem erro. Sem o `--run`, o Vitest fica em
modo observador. O `typecheck` confere os módulos em TypeScript (`.ts`, `.tsx`); os `.js` antigos migram aos
poucos.

| Suíte | Arquivo | O que cobre |
|---|---|---|
| API | `api/tests/test_tokens.py` | JWT: payload, expiração, `jti` único e obrigatório, assinatura adulterada, `alg: none`, emissor |
| API | `api/tests/test_sessao.py` | Logout que revoga o token (e não derruba outra sessão), validade padrão de 15 minutos, tentativas restantes iguais com e sem conta, limitador com outro armazenamento, CSP e SRI do Swagger |
| API | `api/tests/test_servicos.py` | Regras de negócio: login, e-mail único, senha em hash, escalação de privilégio |
| API | `api/tests/test_api.py` | Respostas HTTP, matriz completa do RBAC, 401/403/404/409 e cabeçalhos de segurança |
| API | `api/tests/test_limites.py` | Força bruta no login (`429` por e-mail e por endereço, sem revelar quem tem conta), corpo grande demais (`413`), `500` sem detalhe interno, CSP, `Permissions-Policy` e HSTS só em HTTPS |
| API | `api/tests/test_firebase.py` | ID token do Firebase: assinatura, RS256, `aud`, `iss`, datas, `sub`, `email_verified` (`403` sem ele) e token do back-office recusado |
| API | `api/tests/test_emails.py` e `test_emails_rotas.py` | E-mails da conta: modelos (link e key escapados), Resend, SMTP só com criptografia, pasta, conta de serviço e código do Firebase sem rede, rotas `/conta` com `202` igual com e sem conta, `429`, `503` sem provedor e log sem o endereço |
| API | `api/tests/test_producao.py` | `AMBIENTE=producao`: recusa exemplo, CORS inseguro, MongoDB sem senha e `APP_URL` sem HTTPS; segredos em arquivo; Swagger fora do ar; `/saude` |
| API | `api/tests/test_monitoramento.py` | Alertas no Discord: canal certo, repetição a cada 15 minutos, sem menção, falha do Discord que não afeta a API, força bruta e rajada de `401` sem o e-mail nem o token, `500` sem a mensagem da exceção, e-mail que não saiu, cota de e-mails, resumo por rota e webhook fora do Discord recusado sem aparecer no erro |
| API | `api/tests/test_financeiro_*.py` | Livro-caixa: partidas dobradas, estorno, edição, rotas e isolamento entre clientes, importação de CSV de vários bancos (colunas pelo cabeçalho e pelo conteúdo, arquivo que não é CSV, teto de importações), categoria automática (arquivo, histórico, regras) e edição na conferência, racha, exclusão (uma e em lote), cartão de crédito (fatura, parcelas, pagamento, parcelas geradas da fatura importada), relatórios e espaços de família e empresa (categorias do tipo, livro-caixa separado, renomear, excluir só o vazio, limite por pessoa) |
| API | `api/tests/test_sanitizacao.py` | Texto livre limpo na entrada (XSS, fórmula de planilha, caracteres invisíveis) e operador do MongoDB (`$ne`, `$where`) recusado pelo tipo do campo |
| Front-end | `web/src/regras/tentativas.test.js` | Tentativas de login: contagem por e-mail, bloqueio na quinta, janela de 15 minutos, o que conta como senha errada e a chave sem o e-mail em texto |
| Front-end | `web/src/regras/dadosLocais.test.js` e `servicos/dadosLocais.test.js` | O que o logout apaga do navegador (metas, tentativas, sessão) e o que fica (tema e dados de outros sites) |
| Front-end | `web/src/regras/sessao.test.js` e `servicos/contas.test.js` | Área logada só com sessão e e-mail confirmado; cadastro no Firebase com o link de confirmação, logout e "Já confirmei" com o SDK simulado |
| Front-end | `web/src/regras/acaoDaConta.test.js` e `servicos/emailsDaConta.test.js` | Links dos e-mails: código no fragmento ou na consulta, modo do Firebase para cada página, senha nova repetida, e quando a API manda o e-mail ou o Firebase assume |
| Front-end | `web/src/regras/tema.test.js` | Tema salvo ou do sistema e alternância |
| Front-end | `web/src/regras/mascaras.test.ts` e `sanitizacao.test.ts` | Máscara de valor (milhar, vírgula, dois decimais, sinal, cursor, colar) e de inteiro, teclas barradas por tipo de campo, e a limpeza do texto antes de ir à API |
| Front-end | `web/src/regras/arquivoDoExtrato.test.ts` e `conferenciaDaImportacao.test.ts` | Arquivo do extrato (extensão, tipo, planilha ou PDF renomeado, binário, UTF-8, Windows-1252 e UTF-16) e a edição de descrição e categoria na conferência |
| Front-end | `web/src/regras/*.test.js` | Validação do cadastro e dos formulários do livro-caixa, mensagens de erro (sem revelar quem tem conta), datas, dinheiro em centavos, extrato, resumo por origem (à vista e no crédito), importação, racha, busca, calendário, seletor, cartões, edição, seleção em lote e relatórios |
| Front-end | `web/src/regras/espacos.test.ts` e `servicos/espacoAtivo.test.ts` | Espaços: qual abre, o nome na tela, quem renomeia e exclui, o formulário, a seção depois da troca, as metas de cada espaço e o último espaço guardado no navegador (sai no logout) |
| Front-end | `web/src/servicos/livroCaixa.test.js` e `enderecoDaApi.test.js` | Chamadas à API com o ID token, erros em Problem Details, API fora do ar, token que não renova e endereço pela rede local |
| Front-end | `web/src/olifine/regras/*.test.js` | OliFine: tendência, séries do gráfico de saldo, Visão geral, metas, a árvore que cresce e o simulador de orçamento da landing |
| Front-end | `web/src/componentes/*.test.js` | Error Boundary, avisos (toasts) e todo nome de ícone usado nas telas com desenho na família própria |

Os mesmos testes rodam no GitHub Actions a cada commit de pull request e a cada push na `main`
(ver [CI/CD](#cicd)).

### 2. Teste manual da API pelo painel

Com a API no ar, abra http://localhost:8081/painel/ e entre como administrador. Abra a barra **Modo
demonstração** no fim da página: ela mostra o payload do token JWT e, em **Respostas da API**, cada chamada com
método, caminho, status e corpo. Os botões aparecem para todos os perfis de propósito: quem decide é a API.

Roteiro sugerido (os e-mails são fictícios; as senhas têm de 8 a 64 caracteres):

| # | Perfil logado | Ação no painel | Resposta esperada |
|---|---|---|---|
| 1 | — | Entrar com um e-mail inexistente ou senha errada | `401`, a mesma mensagem "E-mail ou senha inválidos." nos dois casos, com "Restam 4 tentativas antes do bloqueio de 15 minutos." |
| 2 | — | Entrar com o administrador | `200` no `POST /auth/login`; payload do token com `sub`, `nome`, `perfil`, `iat`, `exp` (15 minutos) e `jti` |
| 3 | Administrador | Cadastrar `Operador Demo` (`operador@pessoalfinance.com`, perfil Operador) e `Cliente Demo` (`cliente@pessoalfinance.com`, perfil Cliente) | `201 Created`, sem a senha no corpo |
| 4 | Administrador | **Atualizar lista** | `200` no `GET /usuarios` |
| 5 | Administrador | Clicar no ID de um usuário (copia e preenche **Consultar por ID**) e **Consultar** | `200` no `GET /usuarios/{id}` |
| 6 | Administrador | Consultar o ID `000000000000000000000000` | `404 Not Found` |
| 7 | Administrador | **Editar** um usuário, trocar o nome e salvar | `200` no `PUT /usuarios/{id}` |
| 8 | Administrador | **Excluir** um usuário e confirmar no diálogo | `204 No Content` |
| 9 | Administrador | Cadastrar com e-mail `email-invalido` e senha `123` | `400 Bad Request`, com o erro de cada campo |
| 10 | Administrador | Cadastrar outra conta com `operador@pessoalfinance.com` | `409 Conflict` (e-mail já cadastrado) |
| 11 | Operador | **Sair** e entrar como operador; cadastrar um usuário | `204` no `POST /auth/logout`; lista carrega (`200`); cadastro recusado com `403 Forbidden` |
| 12 | Operador | Editar o Cliente Demo mudando o perfil para Administrador | `403` ("Apenas administradores alteram o perfil de acesso.") |
| 13 | Cliente | Entrar como cliente | O painel mostra só o próprio cadastro (`200` no `GET /usuarios/{id do cliente}`) |
| 14 | Cliente | **Atualizar lista** ou consultar o ID de outro usuário | `403 Forbidden` nos dois casos |
| 15 | — | **Sair** e errar a senha do administrador 5 vezes seguidas; na sexta, use a senha certa | A cada erro, a contagem desce ("Restam 3…", "Resta 1…"); na sexta, `429 Too Many Requests`: "Muitas tentativas de login. Tente de novo em 15 minutos." (vale para aquele e-mail naquele computador; reiniciar a API também zera a contagem) |

### 3. Teste pelo Swagger e pela linha de comando

**Swagger** (http://localhost:8081/docs):

1. Sem token, abra `GET /usuarios` › **Try it out** › **Execute**: resposta `401` com o cabeçalho
   `www-authenticate: Bearer`.
2. Rode `POST /auth/login` com o e-mail e a senha do administrador e copie o valor de `token`.
3. Clique em **Authorize**, cole só o token (o Swagger acrescenta o `Bearer`) e repita o `GET /usuarios`:
   resposta `200`.
4. Rode `POST /auth/logout` (`204`) e repita o `GET /usuarios`: `401`, "Sessão encerrada. Faça login
   novamente.". O token ainda estava no prazo, mas foi revogado.

**Linha de comando** (Linux, macOS ou Git Bash):

```bash
curl -i http://localhost:8081/usuarios
curl -X POST http://localhost:8081/auth/login -H "Content-Type: application/json" -d '{"email":"admin@pessoalfinance.com","senha":"<ADMIN_SENHA>"}'
curl http://localhost:8081/usuarios -H "Authorization: Bearer <token>"
curl -i -X POST http://localhost:8081/auth/logout -H "Authorization: Bearer <token>"
curl -sI http://localhost:8081/docs | grep -i content-security-policy
```

**PowerShell:**

```powershell
$login = Invoke-RestMethod -Method Post http://localhost:8081/auth/login -ContentType "application/json" -Body '{"email":"admin@pessoalfinance.com","senha":"<ADMIN_SENHA>"}'
Invoke-RestMethod http://localhost:8081/usuarios -Headers @{ Authorization = "Bearer $($login.token)" }
Invoke-WebRequest -Method Post http://localhost:8081/auth/logout -Headers @{ Authorization = "Bearer $($login.token)" }
```

O primeiro `curl` (sem token) responde `401`; com o token, a lista vem com `200`; depois do logout, o mesmo token
volta a dar `401`. As respostas de `/auth` e `/usuarios` trazem os cabeçalhos de segurança
(`Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
`Cross-Origin-Opener-Policy` e `Cache-Control: no-store`); o `/docs` traz a CSP própria dele.

Força bruta (Linux, macOS ou Git Bash): a sexta tentativa já responde `429`, com o cabeçalho `Retry-After`; cada
`401` antes dela traz `tentativas_restantes`.

```bash
for i in 1 2 3 4 5 6; do curl -s -X POST http://localhost:8081/auth/login -H "Content-Type: application/json" -d '{"email":"ninguem@exemplo.com","senha":"errada"}'; echo; done
```

### 4. Teste manual da área do cliente

Na versão publicada (https://jolini.github.io/ADS-Project/) ou local:

1. Em `/cadastro`, crie uma conta com um e-mail que você recebe, senha, nome, sobrenome e data de nascimento. O
   app manda o link de confirmação e leva ao login com o aviso "Se o e-mail puder ser usado, enviamos um link…".
   Cadastrar de novo com o mesmo e-mail mostra o mesmo aviso (o app não revela que ele já tem conta).
2. Em `/login`, um e-mail não cadastrado ou senha errada mostram "Usuário não cadastrado ou senha incorreta." e
   quantas tentativas restam; na quinta, o acesso com aquele e-mail fica bloqueado por 15 minutos.
3. Entre com a conta antes de abrir o link: aparece **Confirme o seu e-mail**, com **Reenviar o link** (espera
   de 60 s entre envios). Abra o link e clique em **Já confirmei**: `/principal` mostra nome, sobrenome e data de
   nascimento lidos do Firestore (em "Seus dados", no fim da Visão geral).
4. Em `/login`, **Esqueci minha senha** pede o e-mail e responde igual com e sem conta. O link do e-mail abre
   **Criar senha nova** no próprio app; um link já usado ou vencido mostra **Não deu para usar este link**, com o
   atalho para pedir outro. O link de confirmação abre **E-mail confirmado** (com a API mandando os e-mails, ou
   com a URL de ação do Firebase apontando para `/auth/acao`).
5. Crie uma meta em **Metas** e clique em **Sair**: abrir `/principal` direto volta para o login, e a meta saiu do
   navegador (só a escolha de tema fica).
6. O botão de lua ou sol no topo troca o tema com uma transição suave; recarregue a página e a escolha continua.
   Com o zoom do navegador entre 50% e 200% (`Ctrl` + `-` e `Ctrl` + `+`), nenhuma tela ganha rolagem lateral.
7. Na página de apresentação, mova os controles do simulador: a sobra, a leitura (acima ou abaixo dos 20% de
   referência) e o prazo da reserva mudam na hora. Complete uma meta em **Metas**: as maçãs caem da árvore.

**Livro-caixa (só local, com a API no ar).** Com `VITE_API_URL=http://localhost:8081` no `web/.env`,
`FIREBASE_PROJECT_ID` e `CORS_ORIGENS` no `api/.env`, a API rodando e uma conta com o e-mail confirmado:

1. Em **Contas & Cartões**, pelo botão **Nova conta** (abre um modal), crie "Conta corrente" com saldo de hoje
   `1.000,00` e "Poupança" com `0`. As contas bancárias e a carteira de cartões ficam em seções separadas.
2. Em **Lançamentos**, o extrato ocupa a tela e só a lista rola. Pelo botão **+ Novo lançamento**, lance uma
   receita (`Salário`, `3.000,00`), uma despesa (`Mercado`, `214,37`, meio **Débito**) e uma transferência de
   `500,00` da conta corrente para a poupança. O extrato mostra cada dia com o saldo de todas as contas; a transferência não muda o
   total.
3. Lance uma despesa `Churrasco` de `300,00` e, em **Dividir com pessoas**, adicione Ana, Bruno e Carla com
   `100,00`, `150,00` e `50,00`. Com as partes passando de `300,00`, o formulário não deixa lançar.
4. Na busca do extrato, digite `bruno` ou `300`: ficam só os lançamentos com a pessoa ou o valor.
5. No menu **⋯** da despesa `Mercado`, **Estorne**: entra um lançamento de `+ R$ 214,37` com a data de hoje e o
   original fica marcado como "Estornado". Lance algo errado e, no mesmo menu, **Exclua**: ele some do extrato e
   do saldo. **Editar**, no mesmo menu, corrige descrição, valor, data, categoria e meio. Marque duas linhas pelas
   caixas da esquerda e use **Remover selecionados** (ou **Remover todos**, para tudo o que está na tela): a
   confirmação diz o que sai junto.
6. Na **Visão geral**, as despesas do mês aparecem separadas em à vista e no crédito, e o **+ Novo** do topo
   escolhe entre lançamento, compra no crédito, conta e cartão, cada um no seu modal. Em **Categorias**, crie,
   renomeie, desative ou remova uma categoria (a que já tem lançamentos não sai: o aviso manda desativar).
7. Em **Importar CSV**, escolha um CSV com as colunas Data, Descrição e Valor (exemplo fictício abaixo) e a conta,
   e clique em **Continuar**: as colunas são reconhecidas sozinhas e a conferência já abre, com a categoria de cada
   linha sugerida ("Salário" vai para Salário, "Padaria" para Mercado). Troque a descrição ou a categoria de uma
   linha ali mesmo, **importe** e depois confira o mesmo arquivo de novo: nenhum lançamento é novo, todos aparecem
   como "Já importada". Um PDF ou uma planilha renomeada para `.csv` é recusado antes de sair do navegador.

   ```text
   Data;Descrição;Valor
   01/09/2026;SALDO ANTERIOR;1.000,00
   05/09/2026;Salário;3.000,00
   12/09/2026;Padaria;-12,50
   12/09/2026;Padaria;-12,50
   ```

8. Em **Contas & Cartões**, pelo botão **Novo cartão**, crie "Cartão Roxo" com limite `5.000,00`, fechamento no
   dia 3, vencimento no dia 10 e a cor roxa: ele aparece na carteira desenhado como o plástico. Na tela dele,
   lance `Geladeira` de `3.000,00` em 10x: a primeira parcela entra na fatura atual, as outras em **Parcelamentos
   futuros**. Em **Pagar fatura**, escolha a conta corrente: depois de pagar, o limite volta.
9. **Importar fatura**, na tela do cartão, traz a fatura do banco em CSV: uma linha `LOJA X 01/03` gera as
   parcelas 2 e 3 nas próximas faturas, e a fatura seguinte, com `LOJA X 02/03`, reconhece a parcela que já
   estava lá e não duplica.
10. Em **Relatórios**, veja receitas e despesas por mês e o gasto por categoria em 3, 6 ou 12 meses.

---

## CI/CD

| Workflow | Quando roda | O que faz |
|---|---|---|
| [`ci-tests.yml`](.github/workflows/ci-tests.yml) | A cada commit em pull request e em push na `main` | Lint, tipos (TypeScript), testes (Vitest e pytest) e build; avisa no Discord se passou ou falhou |
| [`cd.yml`](.github/workflows/cd.yml) | Build em PR; deploy só em push na `main` | Publica a área do cliente no GitHub Pages |
| [`alertas.yml`](.github/workflows/alertas.yml) | Push na `main` | Avisa no Discord cada merge |

Pull request com teste vermelho não é mesclada. Cada action fica presa ao SHA do commit, com a versão num
comentário ao lado: uma tag movida no repositório da action não troca o código que roda aqui.

Secrets do repositório: `DISCORD_WEBHOOK` (alertas) e `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
`VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID` e
`VITE_FIREBASE_APP_ID` (build do Pages). Variáveis do repositório (Settings › Secrets and variables › Actions ›
Variables), opcionais: `VITE_BASE` (`/` quando o Pages passar a um domínio próprio) e `VITE_API_URL` (API
hospedada). Vazias, o build é o de hoje: `/ADS-Project/` e sem API.

---

## API

A documentação completa (endpoints, JWT, RBAC, OAuth 2.0, análise de segurança, livro-caixa e relatórios) está em
[`DOCS_API.md`](DOCS_API.md). Resumo:

| Método | Endpoint | Finalidade | Quem pode | Resposta |
|---|---|---|---|---|
| `POST` | `/auth/login` | Autenticar e obter o token | Público | `200 OK` |
| `POST` | `/auth/logout` | Encerrar a sessão (revoga o token) | Qualquer perfil autenticado | `204 No Content` |
| `GET` | `/usuarios` | Listar usuários | Administrador, Operador | `200 OK` |
| `GET` | `/usuarios/{id}` | Consultar um usuário | Administrador, Operador; Cliente só o próprio | `200 OK` |
| `POST` | `/usuarios` | Criar usuário | Administrador | `201 Created` |
| `PUT` | `/usuarios/{id}` | Atualizar usuário | Administrador, Operador | `200 OK` |
| `DELETE` | `/usuarios/{id}` | Excluir usuário | Administrador | `204 No Content` |
| `POST` | `/conta/confirmacao` | Mandar o link de confirmação do e-mail (a única rota que aceita a conta ainda sem confirmação) | Cliente (ID token do Firebase) | `202 Accepted` |
| `POST` | `/conta/nova-senha` | Mandar o link para criar uma senha nova (resposta igual com e sem conta) | Público | `202 Accepted` |
| `GET` | `/saude` | Verificação de funcionamento (healthcheck) | Público | `200 OK` |
| `GET` | `/espacos` | Listar os espaços do cliente (cria o pessoal no primeiro acesso) | Cliente com e-mail confirmado (ID token do Firebase) | `200 OK` |
| `POST` | `/espacos` | Criar um espaço de família ou de empresa, com as categorias do tipo | Cliente com e-mail confirmado | `201 Created` |
| `PATCH`, `DELETE` | `/espacos/{id}` | Renomear; excluir o espaço vazio (o pessoal é fixo) | Quem criou o espaço | `200 OK` / `204 No Content` |
| `GET`, `POST`, `PUT`, `DELETE` | `/espacos/{id}/contas` e `/espacos/{id}/categorias` | Contas (com saldo), cartões de crédito e categorias | Membro do espaço | `200 OK` / `201 Created` / `204 No Content` |
| `GET`, `DELETE` | `/espacos/{id}/cartoes`, `/cartoes/{id}`, `/cartoes/{id}/faturas` e `/faturas/{AAAA-MM}` | Painel do cartão, lista de faturas, extrato e exclusão de uma fatura | Membro do espaço | `200 OK` |
| `POST` | `/espacos/{id}/cartoes/{id}/compras` e `/pagamentos` | Compra no cartão (à vista ou parcelada) e pagamento da fatura | Membro do espaço | `201 Created` |
| `GET`, `POST` | `/espacos/{id}/lancamentos` | Listar e lançar receita, despesa ou transferência | Membro do espaço | `200 OK` / `201 Created` |
| `POST` | `/espacos/{id}/lancamentos/{id}/estorno` | Estornar lançamento | Membro do espaço | `201 Created` |
| `PATCH`, `DELETE` | `/espacos/{id}/lancamentos/{id}` | Editar lançamento; excluir (e o estorno dele) | Membro do espaço | `200 OK` / `204 No Content` |
| `POST` | `/espacos/{id}/lancamentos/exclusao-em-lote` | Excluir vários lançamentos de uma vez | Membro do espaço | `200 OK` |
| `GET` | `/espacos/{id}/pessoas` | Nomes já usados em divisões | Membro do espaço | `200 OK` |
| `POST` | `/espacos/{id}/importacoes` e `/importacoes/estrutura` | Importar extrato em CSV; mostrar o começo do arquivo e as colunas | Membro do espaço | `200 OK` |
| `GET` | `/espacos/{id}/relatorios/mensal`, `/relatorios/categorias` e `/relatorios/cartoes` | Relatórios: receita × despesa e saldo por mês, gasto por categoria e compromisso nos cartões | Membro do espaço | `200 OK` |

---

## Próximas versões

As versões seguintes aparecem na tabela de [Status](#status). O planejamento detalhado do produto é privado.

---

## Licença

**Software proprietário. © 2026 João Pedro Olini. Todos os direitos reservados.**

O repositório é público apenas para a avaliação acadêmica e para a publicação no GitHub Pages. Isso não o torna
código aberto: copiar, modificar, redistribuir, hospedar para terceiros ou usar qualquer parte do projeto em
outro produto exige autorização por escrito do autor. Docentes e avaliadores das disciplinas em que o projeto é
entregue podem baixar, executar e testar a aplicação para avaliação. Condições completas em [LICENSE](LICENSE).
