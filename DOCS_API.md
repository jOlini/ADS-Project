# Documentação da API — Pessoal Finance

API REST do Pessoal Finance. Partes 1 a 5: gestão de usuários do back-office, com autenticação por JWT e
controle de acesso por perfil (RBAC). Parte 6: livro-caixa do cliente final (contas, categorias e lançamentos),
acessado com o ID token do Firebase.

| Item | Valor |
|---|---|
| Tecnologia | Python 3.13 · FastAPI · PyJWT (HS256 e RS256) · bcrypt · MongoDB (pymongo) |
| URL base (local) | `http://localhost:8081` |
| Documentação interativa (OpenAPI) | `http://localhost:8081/docs` |
| Painel de demonstração (HTML, CSS e JS) | `http://localhost:8081/painel/` |
| Formato | JSON (`application/json`); erros em Problem Details (`application/problem+json`, RFC 9457) |
| Código | [`api/`](api) |

---

## Parte 1 – Modelagem da API

### Endpoints

| Método | Endpoint | Finalidade | Quem pode | Resposta de sucesso | Erros possíveis |
|---|---|---|---|---|---|
| `POST` | `/auth/login` | Autenticar e-mail e senha e obter o token JWT | Público | `200 OK` | `400`, `401` |
| `GET` | `/usuarios` | Listar todos os usuários | Administrador, Operador | `200 OK` | `401`, `403` |
| `GET` | `/usuarios/{id}` | Consultar um usuário pelo ID | Administrador, Operador; Cliente só o próprio | `200 OK` | `401`, `403`, `404` |
| `POST` | `/usuarios` | Criar usuário (nome, e-mail, senha, perfil) | Administrador | `201 Created` + cabeçalho `Location` | `400`, `401`, `403`, `409` |
| `PUT` | `/usuarios/{id}` | Atualizar nome, e-mail e perfil | Administrador, Operador | `200 OK` | `400`, `401`, `403`, `404`, `409` |
| `DELETE` | `/usuarios/{id}` | Excluir usuário | Administrador | `204 No Content` | `401`, `403`, `404`, `409` |

### Códigos de resposta

| Código | Quando acontece |
|---|---|
| `200 OK` | Consulta, atualização ou login bem-sucedidos |
| `201 Created` | Usuário criado; o cabeçalho `Location` aponta para `/usuarios/{id}` do novo recurso |
| `204 No Content` | Usuário excluído (resposta sem corpo) |
| `400 Bad Request` | JSON malformado, campo inválido ou campo desconhecido; o corpo traz o erro de cada campo em `campos` |
| `401 Unauthorized` | Login recusado, ou token ausente, adulterado, expirado ou de usuário excluído |
| `403 Forbidden` | Token válido, mas o perfil não tem permissão para a operação |
| `404 Not Found` | Usuário ou rota inexistente |
| `409 Conflict` | E-mail já cadastrado, ou operação sobre a própria conta (excluir a si mesmo, mudar o próprio perfil) |

### Exemplos

Login:

```http
POST /auth/login
Content-Type: application/json

{ "email": "admin@pessoalfinance.com", "senha": "••••••••" }
```

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOi...",
  "tipo": "Bearer",
  "expira_em": "2026-09-18T23:43:35Z",
  "usuario": {
    "id": "6aadc5605077ec846d6f5533",
    "nome": "Administrador",
    "email": "admin@pessoalfinance.com",
    "perfil": "ADMINISTRADOR",
    "criado_em": "2026-09-18T23:12:32.551000Z",
    "atualizado_em": "2026-09-18T23:12:32.551000Z"
  }
}
```

Cadastro (com o token no cabeçalho):

```http
POST /usuarios
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{ "nome": "Carla Cliente", "email": "cliente@pessoalfinance.com", "senha": "••••••••", "perfil": "CLIENTE" }
```

```http
HTTP/1.1 201 Created
Location: http://localhost:8081/usuarios/6aadc5715077ec846d6f5535
```

Erro (todos os erros seguem este formato):

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Um ou mais campos são inválidos.",
  "instance": "/usuarios",
  "campos": { "senha": "Use pelo menos 8 caracteres.", "perfil": "Valor inválido. Use ADMINISTRADOR, OPERADOR ou CLIENTE." }
}
```

### Princípios REST aplicados

- **Recurso no plural e sem verbos na URL:** `/usuarios` e `/usuarios/{id}`; a ação vem do método HTTP.
- **Métodos com a semântica do HTTP:** `GET` só lê, `POST` cria, `PUT` substitui a representação editável
  inteira (por isso nome, e-mail e perfil são obrigatórios), `DELETE` remove.
- **Códigos de resposta corretos:** `201` com `Location` na criação, `204` sem corpo na exclusão, `401`
  (quem é você?) separado de `403` (você não pode).
- **Sem estado no servidor (stateless):** nenhuma sessão guardada; cada requisição traz o próprio token.
- **Representação separada da entidade:** a resposta nunca inclui a senha nem o hash dela.

---

## Parte 2 – Segurança com JWT

### Processo de login

1. O cliente envia `POST /auth/login` com `{"email", "senha"}` **no corpo** da requisição, em JSON. Credencial
   nunca vai na URL, que fica gravada em log de servidor e no histórico do navegador. Em produção a API fica
   atrás de HTTPS, que cifra o corpo no caminho.
2. A API normaliza o e-mail (sem espaços, minúsculo) e busca o usuário no MongoDB.
3. A senha informada é comparada com o hash BCrypt guardado (`bcrypt.checkpw`). A senha em texto puro nunca é
   gravada nem comparada diretamente.
4. E-mail inexistente e senha errada recebem **a mesma resposta** (`401`, "E-mail ou senha inválidos.") e
   **gastam o mesmo tempo**: quando o e-mail não existe, a API compara a senha com um hash fictício. Sem isso, o
   tempo de resposta revelaria quais e-mails têm conta (enumeração de usuários).

Código: `autenticar()` em [`api/app/servicos.py`](api/app/servicos.py).

### Geração do token

Com a senha conferida, `gerar_token()` ([`api/app/tokens.py`](api/app/tokens.py)) monta o payload e o assina com
**HS256** (HMAC-SHA256) usando a chave `JWT_SECRET`, que fica só no ambiente do servidor. A API não sobe se a
chave tiver menos de 32 bytes (256 bits), o tamanho mínimo recomendado para o HS256. O token volta na resposta
do login junto com `expira_em` e o resumo do usuário.

HS256 (chave simétrica) basta aqui porque quem emite e quem valida o token é a própria API. Se outro serviço
precisasse validar, o caminho seria RS256 (chave privada assina, chave pública valida).

### Informações armazenadas no token

| Claim | Conteúdo | Para quê |
|---|---|---|
| `sub` | ID do usuário (ObjectId do MongoDB) | Identificar quem faz a requisição |
| `nome` | Nome do usuário | Exibir na interface sem nova consulta |
| `perfil` | `ADMINISTRADOR`, `OPERADOR` ou `CLIENTE` | Interface decidir o que mostrar |
| `iat` | Data de emissão (segundos desde 1970, UTC) | Auditoria e cálculo da validade |
| `exp` | Data de expiração (`iat` + 30 min) | Recusar token vencido |
| `iss` | `pessoal-finance-api` | Recusar token emitido por outro sistema |

Exemplo de payload decodificado:

```json
{
  "iss": "pessoal-finance-api",
  "sub": "6aadc5715077ec846d6f5534",
  "nome": "Olga Operadora",
  "perfil": "OPERADOR",
  "iat": 1789773215,
  "exp": 1789775015
}
```

**O que fica de fora de propósito:** senha, hash e e-mail. O payload de um JWT é só Base64, legível por
qualquer pessoa que tenha o token; a assinatura impede **alteração**, não **leitura**. O painel de demonstração
mostra o payload decodificado justamente para evidenciar isso.

### Validação a cada requisição

Toda rota protegida exige `Authorization: Bearer <token>`. A dependência `usuario_autenticado`
([`api/app/seguranca.py`](api/app/seguranca.py)) recusa com `401`:

- token ausente (responde com `WWW-Authenticate: Bearer`, como pede a RFC 6750);
- assinatura que não confere (token adulterado ou assinado com outra chave);
- algoritmo diferente de HS256: a lista de algoritmos aceitos é fixa, então um token com `"alg": "none"` é
  recusado;
- token vencido (`exp`), de outro emissor (`iss`) ou sem algum claim obrigatório;
- usuário do token que não existe mais no banco.

O perfil usado na autorização é o **atual, lido do banco**, não o gravado no token. Um usuário excluído perde o
acesso na hora, e um rebaixamento de perfil vale já na requisição seguinte.

### Política de expiração: 30 minutos

O token vale **30 minutos** (`JWT_EXPIRATION=30`), sem refresh token: vencido, o usuário faz login de novo.

Justificativa:

- **Privilégio alto:** a API administra contas de usuário. Um token roubado de administrador permite criar e
  excluir contas; quanto menor a validade, menor a janela de uso indevido.
- **JWT não se revoga individualmente:** por ser autocontido, o servidor não "desliga" um token emitido. A
  expiração curta é o limite natural de estrago. (A leitura do perfil no banco a cada requisição cobre exclusão
  e rebaixamento, mas não um token roubado de um usuário que continua ativo.)
- **Equilíbrio com o uso:** 30 minutos cobrem uma sessão típica de administração sem pedir login a toda hora. 24
  horas seriam longas demais para um perfil administrativo; 5 minutos obrigariam login constante sem um fluxo de
  renovação.
- **Proteções complementares:** o painel guarda o token no `sessionStorage` (some ao fechar a aba) e a API envia
  `Content-Security-Policy` e `Cache-Control: no-store`, reduzindo as chances de o token vazar.

---

## Parte 3 – Controle de acesso (RBAC)

### Perfis e permissões

| Operação | Endpoint | Administrador | Operador | Cliente |
|---|---|:---:|:---:|:---:|
| Listar usuários | `GET /usuarios` | ✔ | ✔ | ✘ |
| Consultar um usuário | `GET /usuarios/{id}` | ✔ | ✔ | Só o próprio |
| Criar usuário | `POST /usuarios` | ✔ | ✘ | ✘ |
| Atualizar usuário | `PUT /usuarios/{id}` | ✔ | ✔ (sem mudar perfil) | ✘ |
| Excluir usuário | `DELETE /usuarios/{id}` | ✔ | ✘ | ✘ |

- **Administrador:** acesso total ao cadastro de usuários.
- **Operador:** acesso intermediário: consulta todos e atualiza nome e e-mail.
- **Cliente:** acesso restrito: visualiza apenas os próprios dados.

Regras que dependem do usuário-alvo (aplicadas no serviço):

| Regra | Resposta | Risco que evita |
|---|---|---|
| Operador não altera o perfil de ninguém | `403` | Operador se promover a administrador (escalação de privilégio) |
| Operador não altera dados de um administrador | `403` | Operador trocar o e-mail do administrador e trancá-lo fora |
| Ninguém altera o próprio perfil | `409` | Último administrador se rebaixar e deixar o sistema sem administrador |
| Administrador não exclui a própria conta | `409` | Mesmo motivo |

### Como os endpoints são protegidos

Cada requisição passa por camadas antes de chegar à regra de negócio:

```text
requisição
  │
  ├─ CORSMiddleware ............ navegador de origem fora de CORS_ORIGENS é barrado
  ├─ CabecalhosDeSeguranca ..... middleware que acrescenta CSP, nosniff, X-Frame-Options, no-store
  │
  ├─ usuario_autenticado ....... valida o JWT e carrega o usuário do banco      → falhou: 401
  ├─ exigir_perfis(...) ........ compara o perfil com a tabela de RBAC          → sem permissão: 403
  │  ou equipe_ou_proprio_cadastro (GET /usuarios/{id})
  │
  └─ ServicoUsuarios ........... regras que dependem do usuário-alvo            → 403 / 409
```

No FastAPI, os middlewares de autorização por rota são **dependências** (`Depends`), declaradas em cada
endpoint de [`api/app/rotas.py`](api/app/rotas.py). A rota não executa se a dependência falhar:

```python
somente_administrador = exigir_perfis(Perfil.ADMINISTRADOR)
administrador_ou_operador = exigir_perfis(Perfil.ADMINISTRADOR, Perfil.OPERADOR)

@rotas_usuarios.delete("/{id}", status_code=204)
def excluir_usuario(id: str, solicitante: Usuario = Depends(somente_administrador), ...):
```

A matriz inteira (3 perfis × 5 operações, mais o cliente consultando outro cadastro) é verificada
automaticamente em `test_rbac_aplica_as_permissoes_de_cada_perfil`
([`api/tests/test_api.py`](api/tests/test_api.py)), em toda pull request.

---

## Parte 4 – OAuth 2.0 (explicação teórica)

> Não implementado. Descreve como uma aplicação parceira acessaria esta API com OAuth 2.0.

**Cenário:** um aplicativo de contabilidade parceiro (fictício, "Contábil Parceira") quer ler os dados
cadastrais de um cliente do Pessoal Finance. Sem OAuth, o caminho seria o cliente entregar e-mail e senha ao
parceiro, que passaria a ter acesso total à conta.

### Papéis

| Papel OAuth 2.0 | No contexto do Pessoal Finance |
|---|---|
| Resource Owner (dono do recurso) | O cliente, dono dos próprios dados |
| Client (aplicação cliente) | O app parceiro "Contábil Parceira" |
| Authorization Server | Servidor de autorização do Pessoal Finance (ex.: Keycloak ou um módulo novo da API) que autentica o usuário, pede o consentimento e emite os tokens |
| Resource Server | Esta API (`/usuarios`), que já valida tokens Bearer em toda requisição |

### 1) Concessão de acesso: como o usuário autoriza

Fluxo **Authorization Code com PKCE**, o recomendado para aplicações web e móveis:

1. O parceiro se registra uma vez no servidor de autorização e recebe um `client_id` (e um `client_secret`, se
   tiver back-end), cadastrando a `redirect_uri` e os escopos que pode pedir.
2. O cliente clica em "Conectar ao Pessoal Finance" no app parceiro. O parceiro redireciona o navegador para o
   servidor de autorização:
   `GET /authorize?response_type=code&client_id=contabil-parceira&redirect_uri=https://parceira.example/callback&scope=usuarios:ler&state=<aleatório>&code_challenge=<hash do verifier>&code_challenge_method=S256`
3. O cliente faz login **no Pessoal Finance**, nunca no parceiro, e vê uma tela de consentimento: "Contábil
   Parceira quer **ler seus dados cadastrais**". Ele aceita ou recusa.
4. Aceitando, o servidor de autorização redireciona de volta para a `redirect_uri` com um `code` de uso único e
   curta duração, mais o `state` (que o parceiro confere para barrar CSRF).
5. O parceiro troca o `code` por tokens num canal direto entre servidores (`POST /token`), enviando o
   `code_verifier` do PKCE. O servidor de autorização devolve:
   `{"access_token": "...", "token_type": "Bearer", "expires_in": 900, "refresh_token": "...", "scope": "usuarios:ler"}`

```mermaid
sequenceDiagram
    actor Cliente
    participant Parceiro as App parceiro
    participant AS as Servidor de autorização
    participant API as API Pessoal Finance
    Cliente->>Parceiro: "Conectar ao Pessoal Finance"
    Parceiro->>AS: redireciona para /authorize (client_id, scope, state, PKCE)
    Cliente->>AS: login e consentimento (escopo usuarios:ler)
    AS->>Parceiro: redirect_uri?code=...&state=...
    Parceiro->>AS: POST /token (code + code_verifier)
    AS->>Parceiro: access_token (15 min) + refresh_token
    Parceiro->>API: GET /usuarios/{id} com Authorization: Bearer access_token
    API->>API: valida assinatura, exp, iss, aud e escopo
    API->>Parceiro: 200 OK com os dados permitidos
```

### 2) Utilização de tokens para acessar recursos protegidos

- O parceiro chama a API como qualquer cliente dela: `GET /usuarios/{id}` com
  `Authorization: Bearer <access_token>`, exatamente o mecanismo que a API já usa hoje.
- A API, como Resource Server, valida o token antes de responder: assinatura (com a **chave pública** do
  servidor de autorização, via RS256 e JWKS, já que ela não emite esse token), `exp`, `iss` e `aud`
  (o token precisa ter sido emitido **para** a API Pessoal Finance).
- O **escopo** vira permissão: `usuarios:ler` libera só a leitura dos dados do próprio cliente que consentiu.
  Criar, alterar ou excluir exigiria outros escopos, que o parceiro nem pediu.
- O access token dura pouco (ex.: 15 minutos). Para continuar, o parceiro usa o `refresh_token` no `/token`,
  sem envolver o cliente de novo. O cliente pode revogar o acesso a qualquer momento nas configurações da conta;
  a revogação invalida o refresh token e o parceiro para de conseguir renovar.

### 3) Benefícios

- **Não compartilhamento de senhas:** a senha só é digitada no Pessoal Finance. O parceiro nunca a vê, não a
  armazena e não pode vazá-la. Trocar a senha não quebra a integração.
- **Delegação de permissões:** o cliente concede só o necessário (ler dados cadastrais), não a conta inteira.
  Cada parceiro recebe escopos próprios e o consentimento é explícito.
- **Maior segurança:** tokens de vida curta, com escopo e destinatário (`aud`) limitados e revogáveis. Um
  token vazado de um parceiro dá acesso restrito e temporário, não o controle da conta. O PKCE e o `state`
  impedem que um `code` interceptado seja usado por terceiros.
- **Controle e auditoria:** o Pessoal Finance sabe qual parceiro acessou o quê e quando, e pode desligar um
  parceiro inteiro revogando o `client_id`.

---

## Parte 5 – Análise de segurança

| Risco | Como seria explorado | Mitigação implementada | Onde |
|---|---|---|---|
| **Roubo de token JWT** | Token capturado na rede, em log ou por script malicioso é reutilizado | HTTPS em produção; expiração de 30 min; token no `sessionStorage` (some ao fechar a aba); `Content-Security-Policy` e `no-store`; perfil lido do banco a cada requisição | `tokens.py`, `seguranca.py`, `painel.js` |
| **Senhas armazenadas em texto puro** | Vazamento do banco expõe as senhas, reaproveitadas em outros sites | Hash BCrypt com salt aleatório e custo 12; hash nunca sai na resposta; senha fora do token e dos logs | `senhas.py`, `modelos.py` |
| **Acesso indevido a endpoints** | Cliente ou operador chama rota administrativa direto pela API | RBAC por dependência em cada rota; matriz de permissões coberta por teste em toda PR | `seguranca.py`, `rotas.py`, `test_api.py` |
| **Escalação de privilégio** | Operador envia `PUT` mudando o próprio perfil para `ADMINISTRADOR` | Só administrador altera perfil; operador não edita administrador; ninguém muda o próprio perfil | `servicos.py` |
| **Token forjado ou adulterado** | Atacante altera o payload, usa `"alg": "none"` ou força bruta numa chave fraca | Algoritmo fixo em HS256; `JWT_SECRET` com no mínimo 32 bytes, checado na subida; `iss` e `exp` obrigatórios | `tokens.py`, `config.py` |
| **Enumeração de usuários** | Mensagem ou tempo de resposta do login revela quais e-mails têm conta | Mesma mensagem para e-mail inexistente e senha errada; BCrypt roda contra hash fictício quando o e-mail não existe | `servicos.py`, `main.py` |
| **Mass assignment** | Enviar `"senha_hash"` ou `"id"` no JSON para gravar valor escolhido | DTOs de entrada separados da entidade, com `extra="forbid"` (campo desconhecido = `400`) | `modelos.py` |
| **Injeção NoSQL** | Enviar `{"$ne": null}` no lugar de um e-mail para burlar a consulta | Pydantic exige texto nos campos; consultas pymongo montadas com valores tipados; ID validado como ObjectId | `modelos.py`, `repositorio.py` |
| **XSS no painel** | Nome de usuário com `<script>` executa no navegador do administrador e rouba o token | Dados inseridos com `textContent`, nunca `innerHTML`; CSP `default-src 'self'` bloqueia script embutido | `painel.js`, `seguranca.py` |
| **CORS aberto e CSRF** | Site malicioso chama a API usando o navegador da vítima | CORS com lista explícita de origens (vazia por padrão); token no cabeçalho `Authorization`, sem cookie, então não há credencial enviada automaticamente | `main.py`, `config.py` |
| **Vazamento de detalhes em erros** | Stack trace ou mensagem interna revela estrutura do sistema | Erros padronizados em Problem Details, com mensagens próprias em português | `erros.py` |
| **Segredos no repositório** | Chave JWT ou senha publicada no GitHub | `.env` no `.gitignore`; `.env.example` só com valores fictícios; segredos do CI em GitHub Secrets | `.gitignore`, `api/.env.example` |

**Riscos residuais (próximos passos):**

- **Força bruta no login:** ainda sem limite de tentativas. Mitigação prevista: bloqueio temporário por
  e-mail e IP após tentativas seguidas (retornando `429 Too Many Requests`).
- **HTTPS:** em execução local a API usa HTTP. Em produção, fica atrás de um proxy reverso com TLS e HSTS.
- **Revogação imediata de token de usuário ativo:** exigiria lista de tokens revogados (`jti`) ou refresh token
  com rotação.

---

## Parte 6 – Livro-caixa do cliente final

O cliente final (área do cliente em React) registra o próprio dinheiro: contas, cartões de crédito, categorias,
receitas, despesas e transferências. Ele não tem cadastro na API: entra pelo Firebase Authentication e manda o **ID token do
Firebase** no cabeçalho `Authorization: Bearer <token>`. A API valida o token e usa o `uid` como identidade.

Código: [`api/app/financeiro/`](api/app/financeiro) e [`api/app/firebase.py`](api/app/firebase.py).

### Endpoints

Todos exigem o ID token do Firebase. Tudo que é do cliente fica sob um **espaço** (o livro-caixa dele).

| Método | Endpoint | Finalidade | Resposta de sucesso | Erros possíveis |
|---|---|---|---|---|
| `GET` | `/espacos` | Listar meus espaços; no primeiro acesso, cria o espaço pessoal com as categorias iniciais | `200 OK` | `401`, `503` |
| `GET` | `/espacos/{espaco_id}` | Consultar um espaço | `200 OK` | `401`, `404` |
| `GET` | `/espacos/{espaco_id}/contas` | Listar contas com o saldo de cada uma | `200 OK` | `401`, `404` |
| `POST` | `/espacos/{espaco_id}/contas` | Criar conta (nome, tipo, saldo inicial) ou cartão de crédito (tipo `CARTAO_CREDITO`, com limite, fechamento e vencimento) | `201 Created` + `Location` | `400`, `401`, `404` |
| `GET` | `/espacos/{espaco_id}/contas/{conta_id}` | Consultar conta e saldo | `200 OK` | `401`, `404` |
| `PUT` | `/espacos/{espaco_id}/contas/{conta_id}` | Renomear, trocar o tipo, desativar ou reativar; no cartão, também limite e dias da fatura | `200 OK` | `400`, `401`, `404` |
| `GET` | `/espacos/{espaco_id}/cartoes` | Listar cartões com limite total e disponível, fatura atual, a pagar e parcelamentos futuros | `200 OK` | `401`, `404` |
| `GET` | `/espacos/{espaco_id}/cartoes/{cartao_id}` | Consultar o painel de um cartão | `200 OK` | `401`, `404` |
| `GET` | `/espacos/{espaco_id}/cartoes/{cartao_id}/faturas/{AAAA-MM}` | Consultar uma fatura (mês do vencimento): compras, créditos e pagamentos do período | `200 OK` | `400`, `401`, `404` |
| `POST` | `/espacos/{espaco_id}/cartoes/{cartao_id}/compras` | Lançar compra no cartão, à vista ou parcelada (uma despesa por parcela) | `201 Created` (parcelas criadas) | `400`, `401`, `404` |
| `POST` | `/espacos/{espaco_id}/cartoes/{cartao_id}/pagamentos` | Pagar a fatura: sai da conta indicada e libera o limite | `201 Created` + `Location` | `400`, `401`, `404` |
| `GET` | `/espacos/{espaco_id}/categorias` | Listar categorias | `200 OK` | `401`, `404` |
| `POST` | `/espacos/{espaco_id}/categorias` | Criar categoria (nome, tipo, cor) | `201 Created` + `Location` | `400`, `401`, `404` |
| `GET` | `/espacos/{espaco_id}/categorias/{categoria_id}` | Consultar categoria | `200 OK` | `401`, `404` |
| `PUT` | `/espacos/{espaco_id}/categorias/{categoria_id}` | Renomear, recolorir, desativar ou reativar | `200 OK` | `400`, `401`, `404` |
| `GET` | `/espacos/{espaco_id}/lancamentos?de=&ate=&limite=&conta_id=` | Listar lançamentos do mais recente ao mais antigo (período e conta opcionais, até 1000) | `200 OK` | `400`, `401`, `404` |
| `POST` | `/espacos/{espaco_id}/lancamentos` | Lançar receita, despesa ou transferência (com divisão entre pessoas, opcional) | `201 Created` + `Location` | `400`, `401`, `404` |
| `GET` | `/espacos/{espaco_id}/lancamentos/{lancamento_id}` | Consultar lançamento | `200 OK` | `401`, `404` |
| `POST` | `/espacos/{espaco_id}/lancamentos/{lancamento_id}/estorno` | Estornar: cria o lançamento inverso, com a data de hoje (parcela de compra no cartão: `409`) | `201 Created` + `Location` | `401`, `404`, `409` |
| `DELETE` | `/espacos/{espaco_id}/lancamentos/{lancamento_id}` | Excluir: apaga o lançamento de vez (e o estorno dele, se houver; numa parcela, a compra inteira) | `204 No Content` | `401`, `404` |
| `GET` | `/espacos/{espaco_id}/pessoas` | Listar os nomes já usados em divisões (para a tela sugerir) | `200 OK` | `401`, `404` |
| `POST` | `/espacos/{espaco_id}/importacoes/estrutura` | Mostrar o começo do CSV em células e sugerir as colunas (nada é gravado) | `200 OK` | `400`, `401`, `404` |
| `POST` | `/espacos/{espaco_id}/importacoes` | Importar o extrato do banco em CSV, ou só simular (`simular: true`) | `200 OK` (relatório por linha) | `400`, `401`, `404` |

Lançamento não tem `PUT` (`405 Method Not Allowed`): valor, data e conta não se reescrevem. Há dois jeitos de
desfazer, com efeitos diferentes:

| Ação | Quando usar | O que acontece |
|---|---|---|
| **Estornar** (`POST .../estorno`) | O lançamento aconteceu e foi desfeito (compra cancelada, cobrança devolvida) | Entra um lançamento inverso, com a data de hoje. O original continua no extrato, marcado com `estornado_por`: o histórico contábil fica. |
| **Excluir** (`DELETE`) | O lançamento nunca devia ter existido (erro de digitação, lançamento duplicado) | O documento é apagado e some do extrato e do saldo, sem rastro. Se ele tinha estorno, o estorno sai junto (sozinho, mudaria o saldo sem nada para anular). Excluir um estorno devolve o original ao normal, e ele pode ser estornado de novo. |

Na exclusão, o estorno sai antes do original: se a operação parar no meio, sobra o original sem estorno, um
estado válido. Uma linha de extrato importada e depois excluída volta se o mesmo arquivo for importado de novo
(a chave dela sai junto com o lançamento). Conta e categoria não se excluem: desativadas, saem das escolhas de
novos lançamentos e mantêm o histórico.

### Dinheiro em centavos e partidas dobradas

- **Valores sempre em centavos inteiros** (`valor_centavos: 21437` = R$ 214,37), nunca `float`: em ponto
  flutuante, `0.1 + 0.2` não dá `0.3`. A API recusa `214.37`, `"21437"`, `true`, zero e negativos no valor do
  lançamento (`400`, com a mensagem no campo). O teto é R$ 1 bilhão por valor.
- **Partidas dobradas:** todo lançamento tem duas partidas que somam zero. Contas e categorias são os dois lados:

  | Lançamento | Partidas |
  |---|---|
  | Despesa de R$ 50,00 no Mercado | conta corrente `−5000` · categoria Mercado `+5000` |
  | Receita de R$ 6.800,00 de Salário | conta corrente `+680000` · categoria Salário `−680000` |
  | Transferência de R$ 500,00 | conta corrente `−50000` · poupança `+50000` |
  | Estorno da despesa acima | conta corrente `+5000` · categoria Mercado `−5000` |

- **O saldo não é gravado:** é o saldo inicial da conta mais a soma das partidas dela, calculada pelo MongoDB a
  cada consulta. Nenhum saldo fica diferente do histórico que o explica.
- **As partidas são montadas pela API**, a partir de `tipo`, `conta_id`, `categoria_id` e `conta_destino_id`.
  O cliente não as envia (campo desconhecido é `400`), então a soma zero não depende de quem chama. Antes de
  gravar, o serviço confere a soma mais uma vez.
- **Gravação atômica:** cada lançamento é um documento com as partidas embutidas. No MongoDB, gravar um
  documento é atômico: as duas partidas entram juntas ou nenhuma entra.

Exemplo:

```http
POST /espacos/6ab54bfb5b2393fd604e53a0/lancamentos
Authorization: Bearer <ID token do Firebase>
Content-Type: application/json

{ "tipo": "DESPESA", "descricao": "Supermercado Bom Preço", "data": "2026-09-19",
  "valor_centavos": 21437, "conta_id": "6ab54c4ff2c9fd0fd74cd090", "categoria_id": "6ab54c4ff2c9fd0fd74cd085" }
```

```json
{
  "id": "6ab54c50f2c9fd0fd74cd093",
  "tipo": "DESPESA",
  "descricao": "Supermercado Bom Preço",
  "data": "2026-09-19",
  "valor_centavos": 21437,
  "conta_id": "6ab54c4ff2c9fd0fd74cd090",
  "categoria_id": "6ab54c4ff2c9fd0fd74cd085",
  "conta_destino_id": null,
  "partidas": [
    { "conta_id": "6ab54c4ff2c9fd0fd74cd090", "categoria_id": null, "valor_centavos": -21437 },
    { "conta_id": null, "categoria_id": "6ab54c4ff2c9fd0fd74cd085", "valor_centavos": 21437 }
  ],
  "divisao": [],
  "estorno_de": null,
  "estornado_por": null,
  "criado_em": "2026-09-24T16:14:07.635000Z"
}
```

Regras de coerência (resposta `400` com o erro no campo):

| Situação | Campo | Mensagem |
|---|---|---|
| Conta inexistente ou de outro espaço | `conta_id` | Conta não encontrada. |
| Conta desativada | `conta_id` / `conta_destino_id` | Conta desativada: reative-a para lançar nela. |
| Receita ou despesa sem categoria | `categoria_id` | Campo obrigatório. |
| Categoria do tipo errado (receita numa despesa) | `categoria_id` | Use uma categoria de despesa. |
| Transferência sem destino, ou para a mesma conta | `conta_destino_id` | Campo obrigatório. / Escolha uma conta de destino diferente da de origem. |
| Transferência com categoria, ou receita/despesa com destino | `categoria_id` / `conta_destino_id` | Transferência entre contas não tem categoria. / Só transferência tem conta de destino. |
| Período invertido na listagem | `ate` | A data final vem antes da inicial. |

Estorno: `409` para um lançamento já estornado ("Este lançamento já foi estornado.") e para o estorno de um
estorno ("Um estorno não pode ser estornado."). Um índice único no MongoDB garante um estorno por lançamento
mesmo com duas requisições simultâneas; a listagem mostra `estornado_por` no original.

### Cartão de crédito e fatura

O cartão é uma **conta de dívida** (`tipo: "CARTAO_CREDITO"`), no mesmo livro-caixa de partidas dobradas. A
compra no crédito deixa o saldo dele negativo (o que se deve); o pagamento da fatura é uma transferência de uma
conta para o cartão, que devolve o saldo para perto de zero e libera o limite:

| Lançamento | Partidas |
|---|---|
| Compra de R$ 120,00 no cartão (Mercado) | cartão `−12000` · categoria Mercado `+12000` |
| Pagamento de R$ 120,00 da fatura | conta corrente `−12000` · cartão `+12000` |

Criar um cartão:

```http
POST /espacos/<espaco_id>/contas
Content-Type: application/json

{ "nome": "Cartão Roxo", "tipo": "CARTAO_CREDITO", "limite_centavos": 600000,
  "dia_fechamento": 3, "dia_vencimento": 10 }
```

- **Só o cartão** tem `limite_centavos`, `dia_fechamento` e `dia_vencimento` (obrigatórios nele, recusados nas
  outras contas). O cartão começa sem dívida (`saldo_inicial_centavos` diferente de zero é `400`): a dívida nasce
  das compras, cada uma na sua fatura. Conta não vira cartão pelo `PUT`, nem o contrário (os lançamentos mudariam
  de sentido).
- **Ciclo da fatura:** a fatura leva o mês do vencimento (`2026-10` vence em outubro). Ela fecha no dia de
  fechamento do mesmo mês, se ele vem antes do vencimento, ou do mês anterior. A compra feita **no dia do
  fechamento já vai para a fatura seguinte**. Dias 29 a 31 viram o último dia nos meses mais curtos, sem buraco
  entre uma fatura e outra.
- **Compra parcelada** (`POST .../compras` com `parcelas` de 1 a 48): uma despesa por parcela, a primeira na fatura
  da data da compra e cada uma das outras na fatura seguinte; o centavo que sobra da divisão vai para a primeira
  (R$ 10,00 em 3x = 3,34 + 3,33 + 3,33). Todas levam o mesmo `compra_id`, com `parcela` e `parcelas`, e ocupam o
  limite desde já, como no banco. Excluir qualquer parcela exclui a compra inteira; parcela não se estorna
  (`409`). Racha (`divisao`) só na compra à vista.
- **Extratos separados:** a fatura (`GET .../faturas/{AAAA-MM}`) traz as compras, os créditos (estorno,
  reembolso) e os pagamentos do período; `total_centavos` é compras menos créditos, e `pagamentos_centavos` é o
  que entrou no período. O extrato de uma conta (`GET /lancamentos?conta_id=`) traz o pagamento como
  transferência para o cartão; as compras no crédito ficam só na fatura.
- **Importar a fatura em CSV:** `POST /importacoes` com o `conta_id` do cartão. As saídas viram compras na
  fatura e as entradas, créditos.
- **Transferência não sai do cartão:** `400` em `conta_id` ("Cartão de crédito não é origem de transferência.
  Para quitar a fatura, use Pagar fatura."). O pagamento (`POST .../pagamentos`) exige uma conta que não seja
  cartão.

Painel do cartão (`GET /cartoes/{cartao_id}`), todos os valores em centavos:

| Campo | O que é |
|---|---|
| `limite_centavos` | Limite total |
| `usado_centavos` | Dívida de hoje, somando todas as faturas e as parcelas futuras |
| `disponivel_centavos` | Limite menos o usado (negativo acima do limite) |
| `fatura_atual`, `fatura_atual_centavos` | Período da fatura aberta (contém hoje: `inicio`, `fechamento`, `vencimento`) e o valor dela |
| `a_pagar_centavos`, `ultima_fechada` | O que falta pagar das faturas já fechadas, e a última delas (vencimento) |
| `parcelamentos_futuros_centavos` | Compras que caem depois da fatura atual (parcelas das próximas faturas) |

| Situação | Campo | Mensagem |
|---|---|---|
| Cartão sem limite, fechamento ou vencimento | `limite_centavos` / `dia_fechamento` / `dia_vencimento` | Campo obrigatório. |
| Vencimento no mesmo dia do fechamento | `dia_vencimento` | A fatura vence depois de fechar: use um dia diferente do fechamento. |
| Conta comum com dados de cartão | `limite_centavos` (e os dias) | Só cartão de crédito tem limite, fechamento e vencimento. |
| Conta virando cartão, ou cartão virando conta | `tipo` | Conta não vira cartão de crédito, nem cartão vira conta. Crie outro cadastro. |
| Compra em cartão desativado | `cartao` | Cartão desativado: reative-o para lançar compras. |
| Racha numa compra parcelada | `divisao` | A divisão entre pessoas vale só para compra à vista. |
| Pagamento saindo de outro cartão | `conta_id` | O pagamento sai de uma conta, não de um cartão de crédito. |
| Referência da fatura fora de `AAAA-MM` | `referencia` | (validação do formato) |

### Divisão entre pessoas (racha)

Receita e despesa aceitam `divisao`: a lista de quem entra no racha e com quanto. É informação do lançamento:
o saldo da conta muda pelo valor inteiro, e as partidas continuam as mesmas duas.

```json
{ "tipo": "DESPESA", "descricao": "Churrasco", "data": "2026-09-19", "valor_centavos": 30000,
  "conta_id": "<id da conta>", "categoria_id": "<id de Lazer>",
  "divisao": [
    { "pessoa": "Ana", "valor_centavos": 10000 },
    { "pessoa": "Bruno", "valor_centavos": 15000 },
    { "pessoa": "Carla", "valor_centavos": 5000 }
  ] }
```

- Cada pessoa tem o próprio valor (divisão igual ou não); as partes somam **até** o valor do lançamento, e o
  que sobra é a parte de quem lançou.
- Até 20 pessoas, nome de 1 a 60 caracteres, cada nome uma vez só (sem diferença de caixa ou espaços), valor
  inteiro positivo em centavos.
- O estorno leva a divisão junto (o racha também é desfeito). `GET /pessoas` devolve os nomes já usados,
  sem repetição, para a tela sugerir.

| Situação | Campo | Mensagem |
|---|---|---|
| Partes somam mais que o lançamento | `divisao` | As partes somam mais que o valor do lançamento. |
| Mesmo nome duas vezes | `divisao.<n>.pessoa` | Esta pessoa já está na divisão. |
| Divisão numa transferência | `divisao` | Transferência entre contas não se divide entre pessoas. |
| Mais de 20 pessoas | `divisao` | Use no máximo 20 itens. |

### Importação do extrato (CSV)

O cliente manda o **texto** do arquivo exportado pelo banco e diz onde lançar: a conta do extrato, a categoria
das saídas e a das entradas. Cada linha vira uma receita (valor positivo) ou uma despesa (valor negativo), pelo
mesmo caminho de um lançamento digitado (partidas dobradas, centavos, limites de descrição e valor).

- **Formatos reconhecidos sozinhos** (pelo nome das colunas, sem diferença de acento, caixa ou pontuação), com
  até 10 linhas de dados da conta antes do cabeçalho e colunas separadas por `;`, `,`, tabulação ou `|`:

  | Formato | Exemplo de cabeçalho |
  |---|---|
  | Valor com sinal (saída negativa) | `Data;Descrição;Valor` · `Data Lançamento;Histórico;Valor (R$)` · `Data,Valor,Identificador,Descrição` |
  | Colunas separadas de entrada e saída | `Data;Histórico;Crédito (R$);Débito (R$)` · `Data Lançamento,Título,Descrição,Entrada(R$),Saída(R$)` |
  | Valor sem sinal com coluna D/C | `Data Mov.;Histórico;Valor;Deb/Cred` · `"Data","Lançamento","Valor","Tipo Lançamento"` (Entrada/Saída) |
  | Fatura de cartão em inglês (compra positiva) | `date,title,amount`: o sinal é invertido, e a compra vira saída |

  Uma coluna "Tipo" que não diz débito ou crédito (ex.: "Pix", "TED") é ignorada, e o sinal vem do valor. Data
  `DD/MM/AAAA` (também com `-` ou `.` e ano de dois dígitos, lido como 20AA) ou `AAAA-MM-DD`; valor `1.234,56`
  (ou `1234.56`), com `-` antes ou depois do número, ou `D`/`C` depois dele (`80,00 D`). Até 1000 linhas e
  500 mil caracteres por importação.
- **Formato não reconhecido: as colunas indicadas pela pessoa.** `POST /importacoes/estrutura` devolve as
  primeiras 15 linhas do arquivo já separadas em células (com o separador adivinhado, ou o escolhido em
  `delimitador`) e, quando reconhece o formato, o `mapeamento` pronto. Sem `mapeamento`, a tela mostra a amostra
  e a pessoa diz o que é cada coluna; a importação recebe o `mapeamento`:

  | Campo do `mapeamento` | Significado |
  |---|---|
  | `delimitador` | `;`, `,`, `\t` ou `\|` |
  | `cabecalho` | Linha do cabeçalho (1 = primeira); `0` quando o arquivo não tem cabeçalho |
  | `data`, `descricao` | Coluna (a partir de 0), obrigatórias |
  | `valor` **ou** `credito`/`debito` | Uma coluna com o valor, ou as colunas de entrada e de saída (não as duas formas) |
  | `tipo` | Coluna D/C (Débito/Crédito, Entrada/Saída), só junto com `valor` |
  | `categoria` | Coluna com o nome da categoria (opcional) |
  | `inverter_sinal` | `true` para fatura de cartão, em que a compra vem positiva |

  Mapeamento incoerente é `400` com o erro em `mapeamento.<informação>` (ex.: `mapeamento.valor`: "Indique a
  coluna do valor, ou as de entrada e saída.").
- **Coluna de categoria:** a linha vai para a categoria **ativa** do espaço com aquele nome (sem diferença de
  acento ou caixa) e do tipo certo; sem nome conhecido, para a categoria padrão das saídas ou das entradas. A
  resposta traz o `categoria_id` de cada linha.
- **Linha ruim não barra o arquivo:** volta como `INVALIDA`, com o motivo, e as outras entram. Linhas de saldo
  (`SALDO ANTERIOR`, `SALDO DO DIA`) são recusadas: não são lançamentos.
- **Idempotência por linha:** cada linha ganha uma chave SHA-256 da conta, da data, do valor, da descrição
  (sem acento, caixa ou espaços extras) e da ocorrência dela no arquivo (duas compras iguais no mesmo dia são
  duas linhas). A chave é calculada pela API, nunca enviada pelo cliente (campo extra = `400`). Importar o mesmo
  extrato de novo, ou um período maior que cobre o anterior, só traz o que falta: o resto volta como
  `JA_IMPORTADA`. Um **índice único** `(espaco_id, chave_importacao)` no MongoDB garante isso mesmo com duas
  importações simultâneas. Um lançamento importado e depois estornado não volta numa nova importação; um
  importado e depois **excluído** volta (a chave sai junto com ele).
- **Dois passos na tela:** `simular: true` confere o arquivo e responde o que entraria (`NOVA`), sem gravar;
  depois, a mesma chamada sem `simular` grava. Se a importação parar no meio, repeti-la termina o que faltou.

```http
POST /espacos/{espaco_id}/importacoes
Authorization: Bearer <ID token do Firebase>
Content-Type: application/json

{
  "conta_id": "<id da conta>",
  "categoria_despesa_id": "<id de uma categoria de despesa>",
  "categoria_receita_id": "<id de uma categoria de receita>",
  "csv": "Data;Descrição;Valor
05/09/2026;Salário;6.800,00
05/09/2026;Aluguel;-1.850,00
",
  "simular": false
}
```

```json
{
  "simulacao": false,
  "novas": 0,
  "importadas": 2,
  "ja_importadas": 0,
  "invalidas": 0,
  "linhas": [
    { "linha": 2, "situacao": "IMPORTADA", "data": "2026-09-05", "descricao": "Salário",
      "valor_centavos": 680000, "categoria_id": "<Outras receitas>", "lancamento_id": "66f0...", "erro": null },
    { "linha": 3, "situacao": "IMPORTADA", "data": "2026-09-05", "descricao": "Aluguel",
      "valor_centavos": -185000, "categoria_id": "<Outras despesas>", "lancamento_id": "66f1...", "erro": null }
  ]
}
```

Com as colunas indicadas (arquivo sem cabeçalho, separado por `|`, com a coluna D/C e a de categoria):

```http
POST /espacos/{espaco_id}/importacoes/estrutura
Content-Type: application/json

{ "csv": "2026-09-01|Feira de sábado|30,00|D|Mercado\n2026-09-02|Reembolso|30,00|C|Outras receitas\n" }
```

```json
{
  "delimitador": "|",
  "linhas": [
    { "numero": 1, "celulas": ["2026-09-01", "Feira de sábado", "30,00", "D", "Mercado"] },
    { "numero": 2, "celulas": ["2026-09-02", "Reembolso", "30,00", "C", "Outras receitas"] }
  ],
  "mapeamento": null
}
```

```json
{ "conta_id": "<id da conta>", "categoria_despesa_id": "<id>", "categoria_receita_id": "<id>",
  "csv": "<o mesmo texto>", "simular": true,
  "mapeamento": { "delimitador": "|", "cabecalho": 0, "data": 0, "descricao": 1, "valor": 2, "tipo": 3,
                  "categoria": 4, "inverter_sinal": false } }
```

`400` por campo quando o arquivo inteiro não serve (`csv`: colunas não reconhecidas e sem `mapeamento`, sem
lançamentos, mais de 1000 linhas), quando o `mapeamento` é incoerente ou quando o destino não vale (`conta_id`,
`categoria_despesa_id`, `categoria_receita_id`: não encontrada, desativada ou do tipo errado). A conta de outra
pessoa responde "Conta não encontrada.", como no lançamento.

### Validação do ID token do Firebase

A API é *resource server*: não emite esse token, só confere que o Google o emitiu para o projeto configurado em
`FIREBASE_PROJECT_ID`. A dependência `cliente_autenticado`
([`api/app/financeiro/acesso.py`](api/app/financeiro/acesso.py)) recusa com `401`:

- assinatura que não confere com as **chaves públicas do Google** (JWKS, baixadas e guardadas em cache);
- algoritmo diferente de **RS256** (um token HS256 do back-office, ou `"alg": "none"`, é recusado);
- `aud` diferente do projeto, `iss` diferente de `https://securetoken.google.com/<projeto>`;
- token vencido (`exp`), emitido ou autenticado no futuro (`iat`, `auth_time`), com tolerância de 60 segundos
  de diferença entre os relógios (o Docker Desktop costuma atrasar depois que o computador dorme);
- `sub` (o `uid`) ausente, vazio ou com mais de 128 caracteres.

Sem `FIREBASE_PROJECT_ID`, ou sem acesso às chaves do Google, a resposta é `503 Service Unavailable`: a falha é
do servidor, não de quem chamou. O back-office continua funcionando.

**As duas identidades não se misturam:** o JWT do back-office não abre `/espacos` (RS256 exigido) e o ID token
do Firebase não abre `/usuarios` (HS256 exigido). Os dois casos têm teste.

### Isolamento entre clientes

- **Espaço alheio responde `404`, não `403`:** a dependência `espaco_do_cliente` confere se o `uid` é membro
  do espaço da URL. Responder `403` confirmaria a quem testa ids que aquele espaço existe (IDOR). Espaço
  inexistente e espaço de outra pessoa recebem a mesma resposta, "Espaço não encontrado.".
- **Toda consulta ao banco leva o `espaco_id`:** uma conta, categoria ou lançamento de outro espaço não é
  encontrado nem pelo id direto. Uma categoria de outra pessoa num lançamento vira "Categoria não encontrada.".
- **Um espaço pessoal por pessoa:** índice único no MongoDB, mesmo com dois primeiros acessos simultâneos.
- **Respostas sem cache:** `/espacos` recebe `Cache-Control: no-store`, como `/auth` e `/usuarios`.

### Como testar o livro-caixa

- **Testes automatizados:** `api/tests/test_firebase.py` (validação do ID token), `test_financeiro_regras.py`
  (partidas, estorno e coerência), `test_financeiro_api.py` (rotas, isolamento, saldos e estorno),
  `test_financeiro_importacao.py` (leitura do CSV, chave por linha e importação sem duplicar),
  `test_financeiro_layouts.py` (formatos de vários bancos, mapeamento das colunas e começo do arquivo) e
  `test_financeiro_racha_e_exclusao.py` (divisão entre pessoas, exclusão e importação com colunas indicadas) e
  `test_financeiro_cartoes.py` (ciclo da fatura, parcelas, painel do cartão, compra, pagamento e fatura em CSV).
  Os ID tokens de teste são assinados por uma chave RSA gerada na hora, no lugar das chaves do Google.
- **Manual (Swagger):** com `FIREBASE_PROJECT_ID` no `api/.env`, obtenha um ID token de uma conta **de teste**
  da área do cliente pela API REST do Firebase Authentication (`<VITE_FIREBASE_API_KEY>` do `web/.env`):

  ```bash
  curl -s "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<VITE_FIREBASE_API_KEY>" -H "Content-Type: application/json" -d '{"email":"<conta de teste>","password":"<senha>","returnSecureToken":true}'
  ```

  Copie o `idToken` da resposta (vale 1 hora), clique em **Authorize** no Swagger, cole-o em
  **IdTokenFirebase** e chame `GET /espacos`.
- **Pela área do cliente:** com `VITE_API_URL` no `web/.env` e `CORS_ORIGENS` no `api/.env`, as telas
  Lançamentos, Contas & Cartões (com a tela de cada cartão) e Categorias usam estas rotas com o login do Firebase. Roteiro em
  [`README.md`, "Teste manual da área do cliente"](README.md#4-teste-manual-da-área-do-cliente).

---

## Como testar

- **Painel:** `http://localhost:8081/painel/`. Faça login com o administrador inicial (`ADMIN_EMAIL` e
  `ADMIN_SENHA` do `api/.env`), crie um operador e um cliente, saia e entre com cada um. Abra a barra
  **Modo demonstração**, no fim da página: ela mostra o payload do token e, em **Respostas da API**, cada
  chamada com método, caminho, status e corpo. Os botões aparecem para todos os perfis de propósito: tente
  uma ação proibida e veja o `403` no aviso e em "Respostas da API". O roteiro completo, com a resposta
  esperada de cada passo, está na seção "Como testar" do [`README.md`](README.md#como-testar).
- **Swagger:** `http://localhost:8081/docs`. Rode `POST /auth/login`, copie o `token`, clique em
  **Authorize** e cole o token.
- **Linha de comando:**

  ```bash
  curl -X POST http://localhost:8081/auth/login -H "Content-Type: application/json" -d '{"email":"admin@pessoalfinance.com","senha":"<ADMIN_SENHA>"}'
  curl http://localhost:8081/usuarios -H "Authorization: Bearer <token>"
  ```

- **Testes automatizados:** `cd api` e `pytest -v`, com as dependências do `requirements-dev.txt` instaladas
  (a suíte usa repositórios em memória e não precisa de MongoDB nem de rede). Resultado esperado:
  `121 passed`. Rodam também no GitHub Actions a cada commit de pull request.
