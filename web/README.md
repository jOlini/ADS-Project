# Pessoal Finance — Área do cliente (React + Firebase)

Aplicação React com três páginas (Cadastro, Login e Principal), rotas com React Router Dom em arquivo
separado, contas no Firebase Authentication (provedor e-mail/senha) e dados pessoais no Cloud Firestore.
Entrega da **Atividade Somativa 2 de Tecnologias para Desenvolvimento Web**.

Com a API do projeto ligada (`VITE_API_URL` no `.env`), o app ganha também as telas do livro-caixa:
**Lançamentos**, **Contas** e **Categorias**. Sem ela, como na versão publicada, essas telas ficam desligadas
e a Principal mostra os dados de exemplo.

| | |
|---|---|
| **Versão publicada (nuvem)** | https://jolini.github.io/ADS-Project/ |
| **Código no GitHub** | https://github.com/jOlini/ADS-Project/tree/main/web |
| **Arquivo de rotas** | [`src/routes.jsx`](src/routes.jsx) |

---

## Como rodar na sua máquina

**Pré-requisitos:** [Node.js](https://nodejs.org/) **20.19 ou mais novo** (a versão LTS atual serve) e
internet (o app usa o Firebase na nuvem). A pasta `node_modules` não vai no `.zip`: ela é recriada pelo
`npm install` no primeiro passo.

### Opção 1 — atalho (recomendada)

- **Windows:** dois cliques em `iniciar.bat`.
- **Linux e macOS:** num terminal dentro desta pasta, `bash iniciar.sh`.

O atalho confere a versão do Node.js, roda o `npm install` na primeira vez e depois o `npm start`. O
navegador abre sozinho em http://localhost:5173/ADS-Project/.

### Opção 2 — comandos

Num terminal dentro desta pasta (a que tem o `package.json`):

```bash
npm install
npm start
```

Abra http://localhost:5173/ADS-Project/ se o navegador não abrir sozinho. Para parar: `Ctrl + C` no terminal.
Se a porta 5173 estiver ocupada, o Vite usa a próxima livre e mostra o endereço no terminal.

### Configuração do Firebase (`.env`)

- **No `.zip` da entrega**, o `.env` já vem preenchido com a configuração do app Web do projeto Firebase
  `pessoal-finance-jao`. Não é preciso fazer nada.
- **No código baixado do GitHub**, o `.env` não existe (ele fica fora do Git). Copie o `.env.example` para
  `.env` e preencha com o app Web do seu projeto Firebase (Console do Firebase › Configurações do projeto ›
  Seus apps). Sem o `.env`, o app mostra a tela "Configuração pendente".

Esses valores vão para o bundle do navegador, ou seja, são públicos por natureza. Quem protege os dados são
as regras do Firestore ([`firestore.rules`](firestore.rules)).

`VITE_API_URL` é opcional: com o endereço da API (ex.: `http://localhost:8081`, ver o `README.md` da raiz do
repositório), as telas do livro-caixa passam a funcionar com o login do Firebase.

---

## Como testar

1. Em **Criar conta** (`/cadastro`), preencha e-mail, senha (6 ou mais caracteres), nome, sobrenome e data de
   nascimento. O app cria a conta no Firebase Authentication, grava os dados com o UID no Firestore e leva
   para o login.
2. Em **Entrar** (`/login`), use um e-mail não cadastrado ou uma senha errada: aparece
   "Usuário não cadastrado ou senha incorreta.".
3. Entre com a conta criada: a página **Principal** (`/principal`) mostra nome, sobrenome e data de
   nascimento lidos do Firestore.
4. Clique em **Sair** e abra `/principal` direto na barra de endereço: sem sessão, o app volta para o login.

Testes automatizados (Vitest): `npm test -- --run` (resultado esperado: `Tests 95 passed (95)`).

---

## Rotas

Todas as rotas ficam em [`src/routes.jsx`](src/routes.jsx), separadas do resto do app. O `src/main.jsx` só
envolve o app com o `BrowserRouter`.

| Endereço | Página | Acesso |
|---|---|---|
| `/cadastro` | Cadastro (5 campos e o botão Criar conta) | Público |
| `/login` | Login (e-mail, senha e o botão Entrar) | Público |
| `/principal` | Principal (nome, sobrenome e data de nascimento; saldo e extrato com a API) | Só com sessão; sem sessão volta ao login |
| `/lancamentos` | Extrato do mês, novo lançamento e estorno | Só com sessão; precisa da API |
| `/contas` | Contas com saldo, criar e editar | Só com sessão; precisa da API |
| `/categorias` | Categorias de despesa e receita, criar e editar | Só com sessão; precisa da API |
| `/` e qualquer outro | Redireciona para `/login` | — |

## Estrutura

```
src/
  routes.jsx            arquivo de rotas (React Router Dom)
  main.jsx              BrowserRouter e provedor de avisos
  firebase.js           inicialização do Firebase (Authentication e Firestore)
  paginas/              Cadastro, Login, Principal, Lancamentos, Contas e Categorias
  servicos/contas.js    cadastro, login, sessão e leitura dos dados no Firebase
  servicos/livroCaixa.js chamadas à API do livro-caixa com o ID token do Firebase
  regras/               regras puras e testadas (validação, dinheiro em centavos, extrato, datas)
  componentes/          layout, campos, ícones e avisos (toasts)
firestore.rules         regras de segurança do Firestore
iniciar.bat, iniciar.sh atalhos de avaliação
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm start` | Sobe o servidor de desenvolvimento e abre o navegador |
| `npm run dev` | O mesmo, sem abrir o navegador |
| `npm run build` | Gera o build de produção em `dist/` |
| `npm run preview` | Serve o build de `dist/` para conferência |
| `npm test -- --run` | Roda os testes unitários uma vez |
| `npm run lint` | Confere o código com o oxlint |
| `npm run tunnel:start` | Abre um endereço público temporário (Cloudflare) para demonstração; o servidor de desenvolvimento precisa estar no ar |
| `npm run tunnel:stop` | Fecha esse endereço (detalhes no README da raiz) |

## Build e deploy

A cada push na branch `main`, o workflow
[`cd.yml`](https://github.com/jOlini/ADS-Project/blob/main/.github/workflows/cd.yml) do GitHub Actions roda o
`npm ci` e o `npm run build` e publica o `dist/` no GitHub Pages, em https://jolini.github.io/ADS-Project/.

## Licença

Software proprietário, todos os direitos reservados. Docentes e avaliadores das disciplinas podem baixar,
executar e testar para avaliação. Condições completas no `LICENSE` do repositório.
