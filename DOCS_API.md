# Documentação da API — Pessoal Finance

API REST de gestão de usuários do Pessoal Finance, com autenticação por JWT e controle de acesso por
perfil (RBAC).

| Item | Valor |
|---|---|
| Tecnologia | Python 3.13 · FastAPI · PyJWT · bcrypt · MongoDB (pymongo) |
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
  (a suíte usa um repositório em memória e não precisa de MongoDB). Resultado esperado: `57 passed`. Rodam
  também no GitHub Actions a cada commit de pull request.
