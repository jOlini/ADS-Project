# Documentação da API — Pessoal Finance

API REST do Pessoal Finance. Partes 1 a 5: gestão de usuários do back-office, com autenticação por JWT e
controle de acesso por perfil (RBAC). Parte 6: livro-caixa do cliente final (contas, categorias e lançamentos),
acessado com o ID token do Firebase, com o Modo Família do espaço pessoal. Parte 7: relatórios do livro-caixa
(Dashboard). Parte 8: e-mails da conta do cliente (confirmação e senha nova) e o modo de produção. Parte 9:
monitoramento, alertas e telemetria. Parte 10: gestão das empresas do espaço empresarial (custos, sociedade e
aportes, impostos e pessoal).

| Item | Valor |
|---|---|
| Tecnologia | Python 3.13 · FastAPI · PyJWT (HS256 e RS256) · bcrypt · MongoDB (pymongo) |
| URL base (local) | `http://localhost:8081` |
| Documentação interativa (OpenAPI) | `http://localhost:8081/docs` (fora do ar com `AMBIENTE=producao`) |
| Painel de demonstração (HTML, CSS e JS) | `http://localhost:8081/painel/` |
| Formato | JSON (`application/json`); erros em Problem Details (`application/problem+json`, RFC 9457) |
| Código | [`api/`](api) |

---

## Parte 1 – Modelagem da API

### Endpoints

| Método | Endpoint | Finalidade | Quem pode | Resposta de sucesso | Erros possíveis |
|---|---|---|---|---|---|
| `POST` | `/auth/login` | Autenticar e-mail e senha e obter o token JWT | Público | `200 OK` | `400`, `401`, `413`, `429` |
| `POST` | `/auth/logout` | Encerrar a sessão: revoga o token usado na chamada | Qualquer perfil autenticado | `204 No Content` | `401` |
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
| `204 No Content` | Usuário excluído ou sessão encerrada no logout (resposta sem corpo) |
| `400 Bad Request` | JSON malformado, campo inválido ou campo desconhecido; o corpo traz o erro de cada campo em `campos` |
| `401 Unauthorized` | Login recusado (o corpo diz em `tentativas_restantes` quantas senhas erradas ainda cabem antes do `429`), ou token ausente, adulterado, expirado, revogado no logout ou de usuário excluído |
| `403 Forbidden` | Token válido, mas o perfil não tem permissão para a operação |
| `404 Not Found` | Usuário ou rota inexistente |
| `409 Conflict` | E-mail já cadastrado, ou operação sobre a própria conta (excluir a si mesmo, mudar o próprio perfil) |
| `413 Content Too Large` | Corpo da requisição acima de 2 MB, em qualquer rota (recusado antes de ser lido inteiro) |
| `429 Too Many Requests` | Login travado depois de 5 senhas erradas para o mesmo e-mail (ou 20 do mesmo endereço) em 15 minutos; o cabeçalho `Retry-After` diz em quantos segundos tentar de novo |
| `500 Internal Server Error` | Falha não prevista; o corpo traz só "Erro interno do servidor", e o detalhe fica no log do servidor |

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

Login recusado (mesma resposta para e-mail sem conta e para senha errada; a contagem também é igual):

```json
{
  "type": "about:blank",
  "title": "Unauthorized",
  "status": 401,
  "detail": "E-mail ou senha inválidos.",
  "instance": "/auth/login",
  "tentativas_restantes": 3
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
5. **Limite de tentativas (força bruta):** 5 senhas erradas para o mesmo e-mail, vindas do mesmo endereço, em 15
   minutos, travam esse par com `429 Too Many Requests` e o cabeçalho `Retry-After`; 20 erros do mesmo endereço,
   com qualquer e-mail, travam o endereço. Enquanto dura a trava, nem a senha certa passa (o palpite certo não
   se distingue dos errados). A contagem vale para e-mail existente e inexistente, então o `429` também não
   revela quem tem conta. O e-mail sozinho não trava: senão qualquer pessoa trancaria o administrador de
   propósito. Um login certo zera a contagem do par, não a do endereço.
6. **Aviso das tentativas restantes:** cada `401` do login traz `tentativas_restantes`, o número de senhas
   erradas que ainda cabem antes do `429` (o menor entre o que resta ao par e ao endereço). O painel mostra
   "Restam 3 tentativas antes do bloqueio de 15 minutos.". O número sobe e desce igual com e sem conta: avisa
   quem errou a senha sem revelar se o e-mail existe.

Código: `autenticar()` em [`api/app/servicos.py`](api/app/servicos.py) e `LimiteDeTentativas` em
[`api/app/limites.py`](api/app/limites.py).

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
| `exp` | Data de expiração (`iat` + 15 min) | Recusar token vencido |
| `iss` | `pessoal-finance-api` | Recusar token emitido por outro sistema |
| `jti` | Identificador único do token (32 caracteres hexadecimais) | Revogar este token no logout, sem derrubar as outras sessões |

Exemplo de payload decodificado:

```json
{
  "iss": "pessoal-finance-api",
  "sub": "6aadc5715077ec846d6f5534",
  "nome": "Olga Operadora",
  "perfil": "OPERADOR",
  "iat": 1789773215,
  "exp": 1789774115,
  "jti": "5f0c3b7e9a2d4c61b8e7f1a0d3c9e245"
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
- token vencido (`exp`), de outro emissor (`iss`) ou sem algum claim obrigatório (inclusive o `jti`);
- token revogado no logout (`jti` na lista de revogados), com a mensagem "Sessão encerrada. Faça login
  novamente.";
- usuário do token que não existe mais no banco.

O perfil usado na autorização é o **atual, lido do banco**, não o gravado no token. Um usuário excluído perde o
acesso na hora, e um rebaixamento de perfil vale já na requisição seguinte.

### Política de expiração e revogação: 15 minutos e logout que desliga o token

O token vale **15 minutos** (`JWT_EXPIRATION=15`), sem refresh token: vencido, o usuário faz login de novo. O
**logout revoga** o token na hora (`POST /auth/logout`).

Justificativa:

- **Privilégio alto:** a API administra contas de usuário. Um token roubado de administrador permite criar e
  excluir contas; quanto menor a validade, menor a janela de uso indevido.
- **Revogação no logout:** por ser autocontido, um JWT continuaria valendo até o `exp` mesmo depois de a pessoa
  sair. Por isso cada token leva um `jti`, e o `POST /auth/logout` grava esse `jti` na coleção
  `tokens_revogados` do MongoDB até a hora em que ele venceria (índice TTL: a entrada some sozinha depois). Toda
  requisição confere a lista. Uma cópia vazada (outra aba, print, log) deixa de valer quando a pessoa sai; as
  outras sessões dela continuam. A lista fica no banco, e não na memória, para valer em todas as instâncias da
  API e sobreviver ao reinício ([`api/app/revogacao.py`](api/app/revogacao.py)).
- **Validade curta para o que não foi encerrado:** um token roubado de quem não clicou em Sair vale no máximo
  15 minutos (antes, 30). A leitura do perfil no banco a cada requisição já cobria exclusão e rebaixamento.
- **Equilíbrio com o uso:** 15 minutos cobrem uma tarefa administrativa típica; o painel avisa a validade no
  login. 24 horas seriam longas demais para um perfil administrativo; 5 minutos obrigariam login constante sem um
  fluxo de renovação.
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
  ├─ CabecalhosDeSeguranca ..... acrescenta CSP, nosniff, X-Frame-Options, Permissions-Policy, no-store
  ├─ CORSMiddleware ............ navegador de origem fora de CORS_ORIGENS é barrado
  ├─ LimiteDoCorpo ............. corpo acima de 2 MB                              → 413
  │
  ├─ LimiteDeTentativas ........ só no POST /auth/login: senhas erradas seguidas → 429
  ├─ usuario_autenticado ....... valida o JWT, recusa o revogado no logout e
  │                              carrega o usuário do banco                     → falhou: 401
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
| **Roubo de token JWT** | Token capturado na rede, em log ou por script malicioso é reutilizado | HTTPS em produção; logout que revoga o token pelo `jti` (lista no MongoDB com TTL); expiração de 15 min; token no `sessionStorage` (some ao fechar a aba); `Content-Security-Policy` e `no-store`; perfil lido do banco a cada requisição | `tokens.py`, `revogacao.py`, `seguranca.py`, `painel.js` |
| **Senhas armazenadas em texto puro** | Vazamento do banco expõe as senhas, reaproveitadas em outros sites | Hash BCrypt com salt aleatório e custo 12; hash nunca sai na resposta; senha fora do token e dos logs | `senhas.py`, `modelos.py` |
| **Acesso indevido a endpoints** | Cliente ou operador chama rota administrativa direto pela API | RBAC por dependência em cada rota; matriz de permissões coberta por teste em toda PR | `seguranca.py`, `rotas.py`, `test_api.py` |
| **Escalação de privilégio** | Operador envia `PUT` mudando o próprio perfil para `ADMINISTRADOR` | Só administrador altera perfil; operador não edita administrador; ninguém muda o próprio perfil | `servicos.py` |
| **Token forjado ou adulterado** | Atacante altera o payload, usa `"alg": "none"` ou força bruta numa chave fraca | Algoritmo fixo em HS256; `JWT_SECRET` com no mínimo 32 bytes, checado na subida; `iss` e `exp` obrigatórios | `tokens.py`, `config.py` |
| **Enumeração de usuários** | Mensagem ou tempo de resposta do login revela quais e-mails têm conta | Mesma mensagem para e-mail inexistente e senha errada; BCrypt roda contra hash fictício quando o e-mail não existe | `servicos.py`, `main.py` |
| **Mass assignment** | Enviar `"senha_hash"` ou `"id"` no JSON para gravar valor escolhido | DTOs de entrada separados da entidade, com `extra="forbid"` (campo desconhecido = `400`) | `modelos.py` |
| **Injeção NoSQL** | Enviar `{"$ne": null}` no lugar de um e-mail (ou de um nome) para burlar a consulta | Pydantic exige texto nos campos (objeto no lugar de texto = `400`); consultas pymongo montadas com valores tipados; ID validado como ObjectId; `test_sanitizacao.py` tenta `$ne`, `$where` e `$gt`. Injeção de SQL não se aplica: não há banco SQL | `modelos.py`, `repositorio.py` |
| **XSS armazenado no texto livre** | Nome de conta ou descrição com `<img onerror=...>` gravado e mostrado depois em outra tela (painel, e-mail, relatório) | Todo texto livre (nome, descrição, pessoa do racha, nome do usuário) passa por uma limpeza antes do limite de tamanho: sem `<` e `>`, sem caractere de controle, de largura zero ou que inverte a direção do texto, sem `=`, `+`, `-` e `@` no começo. A tela limpa com a mesma regra antes de enviar e barra `<` e `>` já na digitação | `sanitizacao.py`, `web/src/regras/sanitizacao.ts` |
| **Força bruta no login** | Script testa milhares de senhas no `POST /auth/login`, o único endpoint público | Trava de 15 minutos por e-mail + endereço (5 erros) e por endereço (20 erros), com `429` e `Retry-After`; o `429` e o `tentativas_restantes` do `401` saem iguais para e-mail existente e inexistente | `limites.py`, `rotas.py` |
| **Script injetado na documentação (`/docs`)** | CDN comprometida ou script inline rouba o token colado em "Authorize" | Swagger UI de versão fixa com Subresource Integrity (o navegador recusa arquivo alterado); inicialização num arquivo da própria API; CSP própria sem `unsafe-inline` e com a CDN limitada ao caminho da versão; ReDoc desligado | `documentacao.py` |
| **Conta do cliente com e-mail alheio** | Alguém cria conta no Firebase com o e-mail de outra pessoa e usa o livro-caixa | O livro-caixa exige `email_verified: true` no ID token (`403` sem ele); a área do cliente só abre depois do link de confirmação | `firebase.py`, `financeiro/acesso.py` |
| **Enumeração pelo "Esqueci minha senha"** | Pedir o link para vários e-mails e ver qual resposta (ou qual tempo) muda | `POST /conta/nova-senha` responde `202` com o mesmo corpo com e sem conta; o pedido ao Firebase e o envio rodam depois da resposta, então o tempo também é igual; os limites contam todo pedido, com ou sem conta | `emails/rotas.py` |
| **E-mail bomba e phishing com o remetente da OliFine** | Script pede centenas de links para a caixa de alguém; ou escreve um texto próprio no e-mail | 1 link por minuto e 5 por hora por conta ou e-mail, 10 a cada 15 minutos por endereço (`429` com `Retry-After`); nenhum campo do e-mail vem de quem pediu (sem nome nem mensagem livre); link e key escapados no HTML | `limites.py`, `emails/mensagens.py` |
| **Código do link vazado** | O código de confirmação ou de senha nova fica no log do servidor de páginas ou no `Referer` | O código vai depois do `#` (o fragmento não sai do navegador); a página tira o código do endereço ao abrir; `Referrer-Policy: no-referrer`; em produção, `APP_URL` só com HTTPS | `emails/correio.py`, `web/src/paginas/*` |
| **Configuração de desenvolvimento em produção** | Servidor sobe com o `.env.example` copiado, CORS aberto ou banco sem senha | `AMBIENTE=producao` recusa subir e lista todos os problemas de uma vez; Swagger e `/openapi.json` fora do ar; segredos lidos de `/run/secrets` | `config.py`, `main.py` |
| **Negação de serviço por corpo gigante** | Enviar centenas de MB no login (público) para esgotar a memória | Corpo acima de 2 MB recusado com `413`: pelo `Content-Length` antes de ler, ou contando os bytes no envio em partes | `limites.py` |
| **XSS no painel** | Nome de usuário com `<script>` executa no navegador do administrador e rouba o token | Dados inseridos com `textContent`, nunca `innerHTML`; CSP `default-src 'self'; object-src 'none'; base-uri 'none'` bloqueia script embutido | `painel.js`, `seguranca.py` |
| **Clickjacking e recursos do navegador** | Site embute o painel num `<iframe>` invisível e induz cliques; script injetado usa câmera ou localização | `X-Frame-Options: DENY` e `frame-ancestors 'none'`; `Permissions-Policy` desligando câmera, microfone, localização e pagamento; `Cross-Origin-Opener-Policy: same-origin`; `Strict-Transport-Security` quando a requisição chega por HTTPS | `seguranca.py` |
| **Injeção de fórmula no CSV importado** | Extrato com `=HYPERLINK(...)` ou `=cmd\|...` na descrição vira fórmula ao voltar para uma planilha | Descrição e categoria de cada célula passam pela mesma limpeza do texto livre (sem `=`, `+`, `-` e `@` do começo, também os de largura cheia) antes de gravar | `financeiro/celulas.py`, `sanitizacao.py` |
| **Arquivo malicioso ou pesado na importação** | Planilha, PDF ou binário renomeado para `.csv`; aspas que nunca fecham para o leitor juntar o arquivo inteiro numa célula; muitas importações ao mesmo tempo para ocupar o servidor | A tela confere extensão, tipo e o começo dos bytes antes de enviar; a API recusa assinatura de planilha, PDF, página da web e byte de controle (`400` no campo `csv`), limita a célula a 5 mil caracteres, o texto a 500 mil e as linhas a mil, e aceita no máximo 4 importações ao mesmo tempo (`503` com `Retry-After` para a quinta) | `financeiro/importacao.py`, `financeiro/rotas.py`, `web/src/regras/arquivoDoExtrato.ts` |
| **CORS aberto e CSRF** | Site malicioso chama a API usando o navegador da vítima | CORS com lista explícita de origens (vazia por padrão); token no cabeçalho `Authorization`, sem cookie, então não há credencial enviada automaticamente | `main.py`, `config.py` |
| **Vazamento de detalhes em erros** | Stack trace ou mensagem interna revela estrutura do sistema | Erros padronizados em Problem Details, com mensagens próprias em português; falha não prevista vira `500` genérico, com o detalhe só no log | `erros.py` |
| **Segredos no repositório** | Chave JWT ou senha publicada no GitHub | `.env` no `.gitignore`; `.env.example` só com valores fictícios; segredos do CI em GitHub Secrets | `.gitignore`, `api/.env.example` |

**Riscos residuais (próximos passos):**

- **Limite de tentativas em memória:** vale para uma instância da API (o Docker Compose sobe uma). O
  `LimiteDeTentativas` já recebe o armazenamento por um contrato (`ArmazenamentoDeFalhas`, em
  [`api/app/limites.py`](api/app/limites.py)); com várias réplicas, basta passar uma implementação comum, sem
  mudar a regra. **Redis:** um sorted set por chave, com o instante como score (`ZADD` + `EXPIRE` para
  registrar, `ZREMRANGEBYSCORE` + `ZRANGE` para contar, `DEL` para zerar), numa transação `MULTI`/`EXEC` ou num
  script Lua. **MongoDB:** um documento por falha com índice TTL. Nos dois, o relógio passa a ser `time.time`.
  Atrás de um proxy, todos os clientes chegam com o IP do proxy: a trava por endereço passa a valer para todos
  juntos. Por isso, em produção, `FORWARDED_ALLOW_IPS` recebe o IP do proxy (o Uvicorn só lê o `X-Forwarded-For`
  vindo dele), e a API avisa no log quando falta.
- **HTTPS:** em execução local a API usa HTTP. Em produção, fica atrás de um proxy reverso com TLS; o HSTS já sai
  quando a requisição chega por HTTPS (com o Uvicorn em `--proxy-headers`).
- **"Sair de todos os aparelhos":** o logout revoga só o token usado. Encerrar todas as sessões de uma pessoa
  (ex.: depois de trocar a senha) pediria um marco `tokens_validos_desde` no usuário, conferido contra o `iat`.
- **Conta criada direto no Firebase:** qualquer um cria uma conta no Authentication pela API pública do Google,
  com qualquer e-mail, e pode pedir o link de confirmação para ela. O limite por conta e o texto fixo do e-mail
  reduzem o abuso; bloquear na origem exige as Blocking Functions do Identity Platform.
- **Actions do CI fixadas por SHA:** protege contra tag movida, mas a atualização é manual (o comentário ao lado
  diz a versão). Um robô de atualização (Dependabot) abriria PRs que não recebem os secrets do Discord.

---

## Parte 6 – Livro-caixa do cliente final

O cliente final (área do cliente em React) registra o próprio dinheiro: contas, cartões de crédito, categorias,
receitas, despesas e transferências. Ele não tem cadastro na API: entra pelo Firebase Authentication e manda o **ID token do
Firebase** no cabeçalho `Authorization: Bearer <token>`. A API valida o token e usa o `uid` como identidade.

Código: [`api/app/financeiro/`](api/app/financeiro) e [`api/app/firebase.py`](api/app/firebase.py).

### Endpoints

Todos exigem o ID token do Firebase. Tudo que é do cliente fica sob um **espaço** (um livro-caixa). São dois
tipos, e só dois: o **pessoal** (`PF`), criado no primeiro acesso, com o Modo Família dentro dele, e o
**empresarial**, que reúne as empresas da pessoa (`PJ`), cada empresa um livro-caixa próprio.

| Método | Endpoint | Finalidade | Resposta de sucesso | Erros possíveis |
|---|---|---|---|---|
| `GET` | `/espacos` | Listar meus espaços; no primeiro acesso, cria o espaço pessoal com as categorias iniciais | `200 OK` | `401`, `403` (e-mail não confirmado), `503` |
| `POST` | `/espacos` | Cadastrar uma empresa no espaço empresarial (`tipo: PJ`, `nome`, `cnpj` e `regime` opcionais), com as categorias de empresa | `201 Created` + `Location` | `400`, `401`, `409` (limite de empresas) |
| `GET` | `/espacos/{espaco_id}` | Consultar um espaço | `200 OK` | `401`, `404` |
| `PATCH` | `/espacos/{espaco_id}` | Editar o nome, o CNPJ ou o regime de uma empresa (só os campos enviados) | `200 OK` | `400`, `401`, `403`, `404`, `409` (pessoal) |
| `DELETE` | `/espacos/{espaco_id}` | Excluir uma empresa sem movimento (sem contas nem lançamentos), com as categorias e os cadastros dela | `204 No Content` | `401`, `403`, `404`, `409` (pessoal ou com dados) |
| `GET` | `/espacos/{espaco_id}/contas` | Listar contas com o saldo de cada uma | `200 OK` | `401`, `404` |
| `POST` | `/espacos/{espaco_id}/contas` | Criar conta (nome, tipo, saldo inicial) ou cartão de crédito (tipo `CARTAO_CREDITO`, com limite, fechamento, vencimento e cor) | `201 Created` + `Location` | `400`, `401`, `404` |
| `GET` | `/espacos/{espaco_id}/contas/{conta_id}` | Consultar conta e saldo | `200 OK` | `401`, `404` |
| `PUT` | `/espacos/{espaco_id}/contas/{conta_id}` | Renomear, trocar o tipo, desativar ou reativar; no cartão, também limite, dias da fatura e cor | `200 OK` | `400`, `401`, `404` |
| `DELETE` | `/espacos/{espaco_id}/contas/{conta_id}` | Excluir conta ou cartão com todos os lançamentos dela (`excluidos` na resposta) | `200 OK` | `401`, `404` |
| `GET` | `/espacos/{espaco_id}/cartoes` | Listar cartões com limite total e disponível, fatura atual, a pagar e parcelamentos futuros | `200 OK` | `401`, `404` |
| `GET` | `/espacos/{espaco_id}/cartoes/{cartao_id}` | Consultar o painel de um cartão | `200 OK` | `401`, `404` |
| `GET` | `/espacos/{espaco_id}/cartoes/{cartao_id}/faturas` | Listar as faturas do cartão (as que têm lançamentos e a atual), com total, pagamentos e quantidade | `200 OK` | `401`, `404` |
| `GET` | `/espacos/{espaco_id}/cartoes/{cartao_id}/faturas/{AAAA-MM}` | Consultar uma fatura (mês do vencimento): compras, créditos e pagamentos do período | `200 OK` | `400`, `401`, `404` |
| `DELETE` | `/espacos/{espaco_id}/cartoes/{cartao_id}/faturas/{AAAA-MM}` | Excluir as compras e os créditos da fatura (compra parcelada sai inteira; pagamentos ficam) | `200 OK` | `400`, `401`, `404` |
| `POST` | `/espacos/{espaco_id}/cartoes/{cartao_id}/compras` | Lançar compra no cartão, à vista ou parcelada (uma despesa por parcela) | `201 Created` (parcelas criadas) | `400`, `401`, `404` |
| `POST` | `/espacos/{espaco_id}/cartoes/{cartao_id}/pagamentos` | Pagar a fatura: sai da conta indicada e libera o limite | `201 Created` + `Location` | `400`, `401`, `404` |
| `GET` | `/espacos/{espaco_id}/categorias` | Listar categorias | `200 OK` | `401`, `404` |
| `POST` | `/espacos/{espaco_id}/categorias` | Criar categoria (nome, tipo, cor) | `201 Created` + `Location` | `400`, `401`, `404` |
| `GET` | `/espacos/{espaco_id}/categorias/{categoria_id}` | Consultar categoria | `200 OK` | `401`, `404` |
| `PUT` | `/espacos/{espaco_id}/categorias/{categoria_id}` | Renomear, recolorir, desativar ou reativar | `200 OK` | `400`, `401`, `404` |
| `DELETE` | `/espacos/{espaco_id}/categorias/{categoria_id}` | Excluir categoria sem lançamentos (com lançamentos: `409`, desative) | `204 No Content` | `401`, `404`, `409` |
| `GET` | `/espacos/{espaco_id}/lancamentos?de=&ate=&limite=&conta_id=` | Listar lançamentos do mais recente ao mais antigo (período e conta opcionais, até 1000) | `200 OK` | `400`, `401`, `404` |
| `POST` | `/espacos/{espaco_id}/lancamentos` | Lançar receita, despesa ou transferência à vista nas contas (com meio, responsável e divisão entre pessoas, opcionais) | `201 Created` + `Location` | `400`, `401`, `404` |
| `POST` | `/espacos/{espaco_id}/lancamentos/exclusao-em-lote` | Excluir vários lançamentos de uma vez (`ids`), com as regras da exclusão de um | `200 OK` | `400`, `401`, `404` |
| `GET` | `/espacos/{espaco_id}/lancamentos/{lancamento_id}` | Consultar lançamento | `200 OK` | `401`, `404` |
| `PATCH` | `/espacos/{espaco_id}/lancamentos/{lancamento_id}` | Editar descrição, data, valor, categoria, meio ou responsável (só os campos enviados) | `200 OK` | `400`, `401`, `404` |
| `POST` | `/espacos/{espaco_id}/lancamentos/{lancamento_id}/estorno` | Estornar: cria o lançamento inverso, com a data de hoje (parcela de compra no cartão: `409`) | `201 Created` + `Location` | `401`, `404`, `409` |
| `DELETE` | `/espacos/{espaco_id}/lancamentos/{lancamento_id}` | Excluir: apaga o lançamento de vez (e o estorno dele, se houver; numa parcela, a compra inteira) | `204 No Content` | `401`, `404` |
| `GET` | `/espacos/{espaco_id}/pessoas` | Listar os nomes já usados em divisões e como responsável (para a tela sugerir) | `200 OK` | `401`, `404` |
| `POST` | `/espacos/{espaco_id}/importacoes/estrutura` | Mostrar o começo do CSV em células e sugerir as colunas (nada é gravado) | `200 OK` | `400`, `401`, `404` |
| `POST` | `/espacos/{espaco_id}/importacoes` | Importar o extrato do banco em CSV, ou só simular (`simular: true`) | `200 OK` (relatório por linha) | `400`, `401`, `404` |

Lançamento não tem `PUT` (`405 Method Not Allowed`): a correção é pelo `PATCH` (seção "Edição, exclusão em lote
e remoção de cadastros", abaixo), que muda só os campos enviados. Há dois jeitos de desfazer, com efeitos
diferentes:

| Ação | Quando usar | O que acontece |
|---|---|---|
| **Estornar** (`POST .../estorno`) | O lançamento aconteceu e foi desfeito (compra cancelada, cobrança devolvida) | Entra um lançamento inverso, com a data de hoje. O original continua no extrato, marcado com `estornado_por`: o histórico contábil fica. |
| **Excluir** (`DELETE`) | O lançamento nunca devia ter existido (erro de digitação, lançamento duplicado) | O documento é apagado e some do extrato e do saldo, sem rastro. Se ele tinha estorno, o estorno sai junto (sozinho, mudaria o saldo sem nada para anular). Excluir um estorno devolve o original ao normal, e ele pode ser estornado de novo. |

Na exclusão, o estorno sai antes do original: se a operação parar no meio, sobra o original sem estorno, um
estado válido. Uma linha de extrato importada e depois excluída volta se o mesmo arquivo for importado de novo
(a chave dela sai junto com o lançamento). Desativar uma conta ou categoria tira ela das escolhas de novos
lançamentos e mantém o histórico; excluir é outra coisa (seção seguinte).

### Espaços: pessoal e empresarial

São dois tipos de espaço, e só dois. O **pessoal** (`PF`) é um por pessoa e leva o Modo Família dentro dele (a
família não é um terceiro tipo). O **empresarial** é o conjunto das empresas da pessoa: cada empresa (`PJ`) é um
livro-caixa próprio, porque contas, caixa e DRE de dois CNPJs nunca se misturam. Contas, categorias e lançamentos
de um livro não aparecem no outro, e toda consulta filtra pelo `espaco_id` (espaço de outra pessoa responde `404`,
como se não existisse).

```http
POST /espacos
Authorization: Bearer <ID token do Firebase>
Content-Type: application/json

{ "tipo": "PJ", "nome": "Ateliê da Ana", "cnpj": "11.222.333/0001-81", "regime": "SIMPLES" }
```

```http
HTTP/1.1 201 Created
Location: /espacos/6ab54bfb5b2393fd604e53b1

{ "id": "6ab54bfb5b2393fd604e53b1", "tipo": "PJ", "nome": "Ateliê da Ana", "moeda": "BRL",
  "fuso": "America/Sao_Paulo", "papel": "DONO", "cnpj": "11222333000181", "regime": "SIMPLES", "familia": null }
```

- **Empresa:** nasce com as categorias de um negócio (vendas, serviços prestados, aportes dos sócios, impostos,
  fornecedores, folha, encargos, benefícios, pró-labore, prestadores de serviço, distribuição de lucros...). `PF`
  não entra pelo `POST` (`400` em `tipo`): o pessoal existe desde o primeiro acesso, e o `POST` o cria antes se
  faltar. `FAMILIA` também é `400`: a família é um modo do pessoal (seção seguinte).
- **CNPJ e regime:** opcionais. O CNPJ aceita pontuação e o formato alfanumérico da Receita Federal (12
  caracteres de 0 a 9 ou A a Z e 2 dígitos verificadores); os dígitos são conferidos (`400` com "CNPJ inválido") e
  só os 14 caracteres ficam gravados. O `regime` (`MEI`, `SIMPLES`, `PRESUMIDO`, `REAL`) decide os tributos
  sugeridos na aba Impostos.
- **Nome:** de 1 a 60 caracteres, limpo como os outros textos livres (sem `<`, `>`, fórmula de planilha nem
  caractere invisível).
- **Limite:** 5 empresas por pessoa (`409` com a mensagem). Excluir uma sem movimento libera a vaga.
- **Editar e excluir:** só quem cadastrou (`403` para outro papel) e nunca o pessoal (`409`). O `PATCH` muda só os
  campos enviados (`cnpj: null` tira o CNPJ). A exclusão só aceita a empresa sem contas e sem lançamentos (`409`
  com o motivo): um clique errado não apaga o histórico. As categorias, os sócios, os tributos e as pessoas da
  folha saem junto.
- **Listagem:** `GET /espacos` devolve o pessoal primeiro e as empresas na ordem de cadastro, com o `papel` de
  quem pediu em cada um. O pessoal traz `familia`; a empresa, `cnpj` e `regime`.
- **Espaço de família antigo:** o que foi criado quando a família era um tipo à parte (`FAMILIA`) fica fora da
  lista e responde `404`; o documento continua no banco.

### Modo Família (espaço pessoal)

O titular liga o Modo Família no espaço pessoal e cadastra as pessoas da casa (nome e cor). Elas são perfis
dentro do pessoal, sem login próprio: um lançamento é de uma delas quando o `responsavel` tem o nome dela (sem
diferença de caixa nem de acento); sem responsável, é do titular. Os relatórios filtram por pessoa (Parte 7).

| Método | Endpoint | Finalidade | Resposta de sucesso | Erros possíveis |
|---|---|---|---|---|
| `GET` | `/espacos/{espaco_id}/familia` | Consultar o modo (`ativa`), as pessoas e `maximo_de_pessoas` | `200 OK` | `401`, `404` (empresa) |
| `PUT` | `/espacos/{espaco_id}/familia` | Ligar ou desligar (`ativa`); desligado, as pessoas ficam guardadas | `200 OK` | `400`, `401`, `404` |
| `POST` | `/espacos/{espaco_id}/familia/pessoas` | Incluir pessoa (`nome`, `cor`) | `201 Created` + `Location` | `400`, `401`, `404`, `409` (limite) |
| `PUT` | `/espacos/{espaco_id}/familia/pessoas/{pessoa_id}` | Trocar nome e cor; com o nome novo, os lançamentos dela passam para ele (`lancamentos_renomeados`) | `200 OK` | `400`, `401`, `404` |
| `DELETE` | `/espacos/{espaco_id}/familia/pessoas/{pessoa_id}` | Tirar da família (os lançamentos ficam, com o nome escrito) | `204 No Content` | `401`, `404` |

- **Assinatura:** uma só, a do titular, cobre a casa inteira: o titular e até 5 pessoas (`maximo_de_pessoas`).
  Ninguém da família precisa assinar nem ter conta. A sexta pessoa é `409`.
- **Nome:** único na família (sem caixa e acento; "Léo" e "LEO" são a mesma pessoa) e diferente de "Você" (o
  titular). **Cor:** `menta`, `azul`, `roxo`, `coral`, `ambar`, `rosa`, `turquesa` ou `grafite`.
- **Nome novo em cascata:** o `PUT` troca o nome no `responsavel` e nas partes das divisões de todos os
  lançamentos do espaço (no MongoDB, com a ordenação do português de força 1: sem caixa nem acento).
- **Só no pessoal:** numa empresa, as rotas da família respondem `404`.

### Edição, exclusão em lote e remoção de cadastros

**Editar um lançamento** (`PATCH /lancamentos/{id}`): só os campos enviados mudam, e as partidas são remontadas
com o novo valor e a nova categoria (a soma continua zero). O tipo, a conta e a divisão não mudam: para isso,
exclua e lance de novo.

```http
PATCH /espacos/<espaco_id>/lancamentos/<lancamento_id>
Content-Type: application/json

{ "descricao": "Mercado do bairro", "valor_centavos": 25000, "meio": "DEBITO" }
```

| Lançamento | O que muda |
|---|---|
| Receita e despesa das contas | Descrição, data, valor, categoria (do mesmo tipo), meio (`null` tira o meio) e responsável (`null` devolve a quem lançou) |
| Transferência (e pagamento de fatura) | Descrição, data, valor (as duas contas acompanham) e meio; sem responsável |
| Estorno, ou lançamento estornado | Só descrição, meio e responsável: o estorno espelha o original |
| Parcela de compra no cartão | Descrição, categoria e responsável, na **compra inteira** (todas as parcelas); data e valor não |
| Compra no cartão | Sem meio (ela é o crédito) |

**Excluir em lote** (`POST /lancamentos/exclusao-em-lote` com `{"ids": [...]}`, de 1 a 1000): cada id segue a regra
da exclusão de um (o estorno sai junto; a parcela leva a compra inteira). Id que já saiu no meio do lote (outra
parcela da mesma compra) ou que não é do espaço é ignorado. A resposta conta cada lançamento apagado, parcelas e
estornos inclusive: `{"excluidos": 5}`.

**Excluir conta ou cartão** (`DELETE /contas/{id}`): a conta sai com **todos** os lançamentos que mexem nela,
inclusive transferências e pagamentos de fatura com outras contas, e o saldo das outras muda (excluir um cartão
devolve os pagamentos ao saldo da conta de onde saíram). Os lançamentos saem antes da conta: se a operação parar
no meio, a conta continua lá e excluir de novo termina. Para guardar o histórico, o caminho é desativar.

**Excluir categoria** (`DELETE /categorias/{id}`): só categoria sem lançamentos. Com lançamentos, `409`
(`"Mercado" está em 3 lançamentos. Desative a categoria para tirá-la das opções sem mexer no histórico.`):
apagá-la deixaria o extrato sem o "para onde foi".

| Situação | Campo | Mensagem |
|---|---|---|
| `PATCH` sem nenhum campo | `lancamento` | Informe o que mudar: descrição, data, valor, categoria, meio ou responsável. |
| Valor, data ou categoria de um estornado (ou estorno) | o campo | Lançamento estornado (ou estorno) só muda a descrição, o meio e o responsável: o estorno espelha o original. |
| Valor ou data de uma parcela | o campo | Parcela de compra no cartão não muda data nem valor. Para isso, exclua a compra e lance de novo. |
| Meio numa compra do cartão | `meio` | Compra no cartão não tem meio de pagamento: ela entra na fatura. |
| Responsável numa transferência | `responsavel` | Transferência entre contas próprias não tem responsável. |
| Novo valor abaixo das partes do racha | `valor_centavos` | As partes da divisão somam mais que o novo valor. |

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
  "responsavel": null,
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
  (`409`). Racha (`divisao`) só na compra à vista; o `responsavel` vale para todas as parcelas.
- **Extratos separados:** a fatura (`GET .../faturas/{AAAA-MM}`) traz as compras, os créditos (estorno,
  reembolso) e os pagamentos do período; `total_centavos` é compras menos créditos, e `pagamentos_centavos` é o
  que entrou no período. O extrato de uma conta (`GET /lancamentos?conta_id=`) traz o pagamento como
  transferência para o cartão; as compras no crédito ficam só na fatura.
- **Lançamentos é só à vista:** `POST /lancamentos` com receita ou despesa num cartão é `400` em `conta_id`
  ("Compra no crédito entra na fatura do cartão (Nova compra), não no extrato das contas."). O campo opcional
  `meio` diz como o dinheiro se moveu na conta: `PIX`, `DEBITO`, `DINHEIRO` ou `TRANSFERENCIA` (TED/DOC).
- **Cor do cartão:** `cor` (`grafite`, `azul`, `roxo`, `verde`, `vinho`, `laranja`, `dourado` ou `prata`), só no
  cartão (`400` nas outras contas). Sem cor na criação, `grafite`; sem cor no `PUT`, fica a que estava.
- **Importar a fatura em CSV:** `POST /importacoes` com o `conta_id` do cartão. As saídas viram compras na
  fatura e as entradas, créditos. A compra com a parcela no fim da descrição gera as parcelas vincendas (seção
  "Parcelas na fatura importada", abaixo).
- **Lista de faturas:** `GET .../faturas` devolve cada fatura com `referencia`, período, `situacao`,
  `total_centavos`, `pagamentos_centavos` e `quantidade` (compras e créditos), da mais nova para a mais antiga.
  `DELETE .../faturas/{AAAA-MM}` apaga as compras e os créditos dela; compra parcelada sai inteira, com as
  parcelas das outras faturas, e os pagamentos ficam (saíram de uma conta).
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
| Conta comum com cor | `cor` | Só cartão de crédito tem cor. |
| Receita ou despesa num cartão por `/lancamentos` | `conta_id` | Compra no crédito entra na fatura do cartão (Nova compra), não no extrato das contas. |
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

### Responsável pelo lançamento

Receita, despesa e compra no cartão aceitam `responsavel`: o nome de quem fez o gasto (ou de quem é a receita),
com o valor **inteiro**. Antes, vincular um gasto a alguém pedia uma divisão de uma pessoa só; agora a divisão
fica para o racha de verdade. É informação do lançamento, como o meio: não muda saldo nem partidas.

```json
{ "tipo": "DESPESA", "descricao": "Farmácia", "data": "2026-09-19", "valor_centavos": 8990,
  "conta_id": "<id da conta>", "categoria_id": "<id de Saúde>", "responsavel": "Bruno" }
```

- Nome de 1 a 60 caracteres, com a mesma limpeza do texto livre (sem `<`, `>`, invisíveis nem começo de
  fórmula). Sem o campo (ou `null`), o lançamento é de quem lançou.
- `PATCH` troca o responsável ou, com `null`, devolve o lançamento a quem lançou. Na parcela de uma compra, a
  troca vale para todas as parcelas.
- O estorno leva o responsável junto. `GET /pessoas` passa a devolver também os responsáveis já usados.

| Situação | Campo | Mensagem |
|---|---|---|
| Responsável numa transferência | `responsavel` | Transferência entre contas próprias não tem responsável. |
| Nome vazio (depois da limpeza) ou com mais de 60 caracteres | `responsavel` | (validação do tamanho) |

### Importação do extrato (CSV)

O cliente manda o **texto** do arquivo exportado pelo banco e diz onde lançar: a conta do extrato, a categoria
das saídas e a das entradas. Cada linha vira uma receita (valor positivo) ou uma despesa (valor negativo), pelo
mesmo caminho de um lançamento digitado (partidas dobradas, centavos, limites de descrição e valor).

- **Formatos reconhecidos sozinhos** (pelo nome das colunas, sem diferença de acento, caixa ou pontuação), com
  até 10 linhas de dados da conta antes do cabeçalho e colunas separadas por `;`, `,`, tabulação ou `|`. Os nomes
  seguem o que Nubank, Itaú, Bradesco, Banco do Brasil, Santander, Caixa, Inter, C6, BTG, XP, Sicoob, Sicredi,
  PicPay e Mercado Pago exportam; um nome que só **contém** a palavra também serve ("Valor da transação"), e
  palavras que desqualificam tiram a coluna ("Saldo (R$)" e "Valor (US$)" não são o valor; "Data do balancete"
  só vale sem outra data):

  | Formato | Exemplo de cabeçalho |
  |---|---|
  | Valor com sinal (saída negativa) | `Data;Descrição;Valor` · `Data Lançamento;Histórico;Valor (R$)` · `Data,Valor,Identificador,Descrição` |
  | Colunas separadas de entrada e saída | `Data;Histórico;Crédito (R$);Débito (R$)` · `Data Lançamento,Título,Descrição,Entrada(R$),Saída(R$)` |
  | Valor sem sinal com coluna D/C | `Data Mov.;Histórico;Valor;Deb/Cred` · `"Data","Lançamento","Valor","Tipo Lançamento"` (Entrada/Saída) |
  | Fatura de cartão em inglês (compra positiva) | `date,title,amount`: o sinal é invertido, e a compra vira saída |

  **Sem cabeçalho conhecido, pelo conteúdo:** a coluna em que quase tudo é data é a data; a de números é o valor
  (a que acompanha o valor linha a linha é o saldo e fica de fora); duas colunas de números que se revezam são
  entrada e saída; a de texto mais variado é a descrição. As linhas de dados da conta antes dos lançamentos ficam
  de fora sozinhas.

  Uma coluna "Tipo" que não diz débito ou crédito (ex.: "Pix", "TED") é ignorada, e o sinal vem do valor. Data
  `DD/MM/AAAA` (também com `-` ou `.` e ano de dois dígitos, lido como 20AA) ou `AAAA-MM-DD`; valor `1.234,56`
  (ou `1234.56`), com `-` antes ou depois do número, ou `D`/`C` depois dele (`80,00 D`). Até 1000 linhas e
  500 mil caracteres por importação.
- **Formato não reconhecido: as colunas indicadas pela pessoa.** `POST /importacoes/estrutura` devolve as
  primeiras 15 linhas do arquivo já separadas em células (com o separador adivinhado, ou o escolhido em
  `delimitador`) e, quando reconhece o formato, o `mapeamento` pronto, a `origem` (`CABECALHO` ou `CONTEUDO`) e as
  `duvidas` (informações a conferir: duas colunas "Valor", coluna de data em que quase nada é data, entrada e
  saída sem sinal). Com o mapeamento e sem dúvida, a tela vai direto para a conferência dos lançamentos; com
  dúvida, mostra as colunas preenchidas e marca o que conferir; sem `mapeamento`, a pessoa diz o que é cada
  coluna. A importação recebe o `mapeamento`:

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
- **Categoria automática** ([`categorizacao.py`](api/app/financeiro/categorizacao.py)), sempre uma categoria
  **ativa** do espaço e do tipo da linha, nesta ordem: (1) `ARQUIVO`, a coluna de categoria com o nome de uma
  categoria (sem diferença de acento ou caixa); (2) `HISTORICO`, o mesmo estabelecimento lançado antes quase
  sempre na mesma categoria (`PADARIA DOCE PAO 12/09` e `Padaria Doce Pão` são o mesmo lugar); (3) `REGRA`, uma
  palavra conhecida da descrição (Uber, farmácia, luz, iFood, Netflix, salário) aponta um assunto, e o assunto, a
  categoria da pessoa pelo nome ("Alimentação" ou, sem ela, "Mercado"); a expressão mais longa vence ("Mercado
  Livre" é loja, "Mercado Pago" não diz nada); (4) `PADRAO`, a categoria escolhida para as saídas ou as entradas.
  A resposta traz o `categoria_id` e a `origem_da_categoria` de cada linha.
- **Edição na conferência:** `ajustes` troca a descrição e a categoria de linhas, pelo número da linha
  (`{"12": {"descricao": "Mercadinho do Zé", "categoria_id": "<id>"}}`); a origem passa a `AJUSTE`. A descrição
  editada passa pela mesma limpeza e pelos mesmos limites; a categoria precisa ser ativa e do tipo da linha
  (`400` em `ajustes.<linha>.categoria_id`). A chave da linha continua a do arquivo: a mesma linha, editada ou
  não, não entra duas vezes. Na fatura de um cartão, a parcela continua lida da descrição do arquivo, para a
  fatura seguinte reconhecer as parcelas geradas.
- **Linha ruim não barra o arquivo:** volta como `INVALIDA`, com o motivo, e as outras entram. Linhas de saldo
  (`SALDO ANTERIOR`, `SALDO DO DIA`) são recusadas: não são lançamentos.
- **Injeção de fórmula (CSV injection):** o arquivo vem de fora, então a descrição e a categoria perdem os
  caracteres `=`, `+`, `-` e `@` do começo antes de gravar (`=HYPERLINK("http://...")` vira
  `HYPERLINK("http://...")`); os sinais `<` e `>` e os caracteres invisíveis também saem. Assim o texto nunca vira
  fórmula se voltar a uma planilha. O sinal do valor é lido na coluna do valor e não passa por essa limpeza.
- **Arquivo que não é CSV:** planilha do Excel (`.xlsx`, `.xls`), PDF, `.rtf`, página da web ou arquivo com byte
  de controle é recusado antes de qualquer leitura, com o que fazer ("No banco, exporte o extrato em CSV."). Uma
  célula maior que 5 mil caracteres (aspas que nunca fecham) torna o arquivo inválido, em vez de ir inteira para
  a memória. No máximo 4 importações rodam ao mesmo tempo no servidor; a quinta espera até 5 segundos e, sem
  vaga, recebe `503` com `Retry-After`.
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
  "parcelas_futuras": 0,
  "linhas": [
    { "linha": 2, "situacao": "IMPORTADA", "data": "2026-09-05", "descricao": "Salário",
      "valor_centavos": 680000, "categoria_id": "<Salário>", "lancamento_id": "66f0...", "erro": null,
      "fatura": null, "observacao": null, "origem_da_categoria": "REGRA" },
    { "linha": 3, "situacao": "IMPORTADA", "data": "2026-09-05", "descricao": "Aluguel",
      "valor_centavos": -185000, "categoria_id": "<Moradia>", "lancamento_id": "66f1...", "erro": null,
      "fatura": null, "observacao": null, "origem_da_categoria": "REGRA" }
  ]
}
```

Arquivo sem cabeçalho, separado por `|`: as colunas saem do conteúdo (data, texto, número sem sinal e a coluna
D/C). A de categoria a pessoa indica, se quiser, e a importação recebe o `mapeamento` completo:

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
  "mapeamento": { "delimitador": "|", "cabecalho": 0, "data": 0, "descricao": 1, "valor": 2, "credito": null,
                  "debito": null, "tipo": 3, "categoria": null, "inverter_sinal": false },
  "origem": "CONTEUDO",
  "duvidas": []
}
```

```json
{ "conta_id": "<id da conta>", "categoria_despesa_id": "<id>", "categoria_receita_id": "<id>",
  "csv": "<o mesmo texto>", "simular": true,
  "mapeamento": { "delimitador": "|", "cabecalho": 0, "data": 0, "descricao": 1, "valor": 2, "tipo": 3,
                  "categoria": 4, "inverter_sinal": false } }
```

`400` por campo quando o arquivo inteiro não serve (`csv`: não é CSV, colunas não reconhecidas e sem
`mapeamento`, sem lançamentos, mais de 1000 linhas), quando o `mapeamento` é incoerente, quando um ajuste não
vale (`ajustes.<linha>.categoria_id`) ou quando o destino não vale (`conta_id`,
`categoria_despesa_id`, `categoria_receita_id`: não encontrada, desativada ou do tipo errado). A conta de outra
pessoa responde "Conta não encontrada.", como no lançamento.

### Parcelas na fatura importada

Na fatura de um cartão, a compra com o número da parcela no fim da descrição (`LOJA X 03/12`,
`Loja X - Parcela 3/12`, `Loja (Parcela 3 de 12)`, `LOJA PARC 03/12`) vira a parcela 3 de 12 de uma compra
(`compra_id`, `parcela`, `parcelas`), e as parcelas **vincendas** (4 a 12) entram já nas próximas faturas, com o
mesmo valor e a descrição no mesmo formato (`LOJA X 04/12`), ocupando o limite como a compra lançada pela tela.
As parcelas que já passaram não entram: o dinheiro delas já saiu, em faturas que o livro-caixa não conhece.
Número maior que o total (`15/09`) é data no texto, não parcela; crédito (valor de entrada) nunca gera parcelas.

- **A fatura seguinte não duplica:** a linha `LOJA X 04/12` acha a parcela que já estava lá (mesma descrição sem
  o número, mesmo valor, mesmo total e a fatura certa), volta como `JA_IMPORTADA` com a `observacao` "Parcela 4 de
  12 já estava na fatura, lançada pelo parcelamento." e, na importação de verdade, dá a chave da linha à parcela
  (o mesmo arquivo de novo cai direto na chave). Uma fatura antiga importada depois completa a mesma compra, sem
  gerar de novo o que já existe. A busca usa a descrição do banco guardada em `chave_parcelamento`, então
  renomear a compra não quebra o reconhecimento.
- **A data da parcela conforme o banco:** uns bancos datam a parcela com um dia do período da própria fatura;
  outros repetem a data da compra original em todas as parcelas. A API usa o jeito que junta mais linhas do
  arquivo numa mesma fatura (as compras à vista e as primeiras parcelas não mudam de lugar em nenhum dos dois):
  com a data da compra, a parcela 3 entra duas faturas depois da data escrita.
- **Resposta:** cada linha traz a `fatura` (`AAAA-MM`) em que entra e a `observacao` da parcela; `parcelas_futuras`
  conta as vincendas geradas (na simulação, as que seriam geradas). A tela usa a `fatura` para abrir direto nela.

```json
{ "linha": 2, "situacao": "IMPORTADA", "data": "2026-10-06", "descricao": "LOJA X 01/03",
  "valor_centavos": -9000, "fatura": "2026-11",
  "observacao": "Parcela 1 de 3. As parcelas 2 e 3 entram nas próximas faturas." }
```

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

Token válido de uma conta que **ainda não confirmou o e-mail** (`email_verified` ausente ou diferente de `true`)
responde `403 Forbidden`, "Confirme o seu e-mail pelo link que enviamos para usar o app.". A área do cliente já
segura essa conta na tela de confirmação; a API repete a regra para quem a chama direto, e assim ninguém usa o
livro-caixa com o e-mail de outra pessoa.

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

- **Testes automatizados:** `api/tests/test_firebase.py` (validação do ID token e o `403` sem e-mail confirmado), `test_financeiro_regras.py`
  (partidas, estorno e coerência), `test_financeiro_api.py` (rotas, isolamento, saldos e estorno),
  `test_financeiro_importacao.py` (leitura do CSV, chave por linha e importação sem duplicar),
  `test_financeiro_layouts.py` (formatos de vários bancos, mapeamento das colunas e começo do arquivo),
  `test_financeiro_reconhecimento.py` (cabeçalho de cada banco, colunas pelo conteúdo, arquivo que não é CSV),
  `test_financeiro_categorizacao.py` (categoria pela coluna, pelo histórico e pelas regras, ajustes e o teto de
  importações), `test_sanitizacao.py` (XSS, fórmula, invisíveis e operador do MongoDB) e
  `test_financeiro_racha_e_exclusao.py` (divisão entre pessoas, exclusão e importação com colunas indicadas),
  `test_financeiro_responsavel.py` (responsável no lançamento, na compra parcelada, na edição e no estorno) e
  `test_financeiro_cartoes.py` (ciclo da fatura, parcelas, painel do cartão, compra, pagamento e fatura em CSV).
  Os ID tokens de teste são assinados por uma chave RSA gerada na hora, no lugar das chaves do Google.
- **Manual (Swagger):** com `FIREBASE_PROJECT_ID` no `api/.env`, obtenha um ID token de uma conta **de teste**
  da área do cliente pela API REST do Firebase Authentication (`<VITE_FIREBASE_API_KEY>` do `web/.env`):

  ```bash
  curl -s "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=<VITE_FIREBASE_API_KEY>" -H "Content-Type: application/json" -d '{"email":"<conta de teste>","password":"<senha>","returnSecureToken":true}'
  ```

  Copie o `idToken` da resposta (vale 1 hora), clique em **Authorize** no Swagger, cole-o em
  **IdTokenFirebase** e chame `GET /espacos`. A conta de teste precisa ter o e-mail confirmado; sem isso, a
  resposta é `403`.
- **Pela área do cliente:** com `VITE_API_URL` no `web/.env` e `CORS_ORIGENS` no `api/.env`, as telas
  Lançamentos, Contas & Cartões (com a tela de cada cartão) e Categorias usam estas rotas com o login do Firebase. Roteiro em
  [`README.md`, "Teste manual da área do cliente"](README.md#4-teste-manual-da-área-do-cliente).

---

## Parte 7 – Relatórios do livro-caixa (release 0.3)

Leitura do livro-caixa para o Dashboard: para onde o dinheiro foi, como os meses se comparam e o que já está
comprometido nos cartões. Só consulta (`GET`), com o mesmo ID token do Firebase e a mesma barreira da Parte 6: espaço
de outra pessoa responde `404`.

Código: [`api/app/financeiro/relatorios.py`](api/app/financeiro/relatorios.py) (regras, em funções puras) e
[`api/app/financeiro/rotas_relatorios.py`](api/app/financeiro/rotas_relatorios.py) (endpoints, tag **Relatórios** no
Swagger).

### Endpoints

| Método | Endpoint | Finalidade | Resposta de sucesso | Erros possíveis |
|---|---|---|---|---|
| `GET` | `/espacos/{espaco_id}/relatorios/mensal?de=&ate=&conta_id=&membro=` | Receitas, despesas, sobra e saldo no fim de cada mês do período | `200 OK` | `400`, `401`, `404` |
| `GET` | `/espacos/{espaco_id}/relatorios/categorias?de=&ate=&conta_id=&membro=` | Gasto por categoria no período, do maior para o menor, com a fatia de cada uma | `200 OK` | `400`, `401`, `404` |
| `GET` | `/espacos/{espaco_id}/relatorios/cartoes` | Por cartão: dívida de hoje, o que falta pagar das faturas fechadas e a fatura atual e as seguintes, com as parcelas já lançadas | `200 OK` | `401`, `404` |

- **Período em meses** (`de` e `ate`, formato `AAAA-MM`, os dois inclusive). Sem `ate`, vale o mês de hoje no fuso do
  espaço; sem `de`, os 12 meses que terminam em `ate`. No máximo 120 meses por consulta. Os meses sem lançamento
  aparecem zerados, para o gráfico não pular mês.
- **Filtro por conta** (`conta_id`, opcional): só os lançamentos daquela conta ou cartão. Conta de outro espaço (ou
  inexistente) responde `404` com "Conta não encontrada.".
- **Filtro por pessoa** (`membro`, opcional, Modo Família): o id de uma pessoa da família ou `titular` (os
  lançamentos sem responsável). Receitas, despesas e o gasto por categoria passam a ser só dela; o
  `saldo_final_centavos` continua o das contas, que são da casa. Pessoa desconhecida é `400` em `membro`; numa
  empresa, também.

### Regras dos números

As mesmas do resumo do mês da tela Principal, para os dois lugares mostrarem o mesmo valor:

| Situação | Como conta |
|---|---|
| Compra no cartão de crédito | Despesa no mês de cada parcela (competência), não no mês em que a fatura é paga |
| Pagamento da fatura | Não é despesa (a compra já contou); diminui o saldo em contas |
| Transferência entre contas | Nem receita nem despesa; não muda o saldo em contas |
| Estorno | Reduz o lado do lançamento original, no mês do estorno: o estorno de uma despesa diminui as despesas, não vira receita. O estorno de algo de um mês anterior pode deixar o mês com despesas negativas |
| Saldo inicial da conta | Conta desde o primeiro mês: é o dinheiro que já estava na conta antes do primeiro lançamento |
| Saldo no fim do mês (`saldo_final_centavos`) | Soma das contas no último dia do mês, sem os cartões (dívida) e com as desativadas (o dinheiro delas continua existindo). Com `conta_id`, o saldo daquela conta; no cartão, negativo é o que se deve |
| Gasto por categoria | Só despesas. O estorno devolve o valor à categoria, e a categoria que ficou sem gasto sai da lista |
| Fatia | Porcentagem inteira do total do período, com meio ponto arredondado para cima; a soma das fatias pode dar 99 ou 101 |
| Fatura no compromisso | Compras menos créditos do período da fatura, como em `GET /cartoes/{cartao_id}/faturas/{AAAA-MM}`; o pagamento quita, não muda o valor. Fatura vazia entre duas com parcela aparece zerada |

### Exemplos

Banco com saldo inicial de R$ 1.000,00. Em janeiro, salário de R$ 5.000,00 e mercado de R$ 200,00 no banco e uma
compra de R$ 900,00 em 3x no cartão (15/01). Em fevereiro, R$ 500,00 do banco para a poupança e o pagamento de
R$ 300,00 da fatura:

```http
GET /espacos/<espaco_id>/relatorios/mensal?de=2026-01&ate=2026-02
```

```json
{
  "de": "2026-01",
  "ate": "2026-02",
  "conta_id": null,
  "meses": [
    { "mes": "2026-01", "receitas_centavos": 500000, "despesas_centavos": 50000,
      "sobra_centavos": 450000, "saldo_final_centavos": 580000 },
    { "mes": "2026-02", "receitas_centavos": 0, "despesas_centavos": 30000,
      "sobra_centavos": -30000, "saldo_final_centavos": 550000 }
  ]
}
```

Em cada mês, a parcela do cartão (R$ 300,00) entra nas despesas. O pagamento da fatura só tira R$ 300,00 do saldo, e
a ida para a poupança não muda o total.

```http
GET /espacos/<espaco_id>/relatorios/categorias?de=2026-01&ate=2026-03
```

```json
{
  "de": "2026-01",
  "ate": "2026-03",
  "conta_id": null,
  "total_centavos": 110000,
  "categorias": [
    { "categoria_id": "<id>", "nome": "Lazer", "cor": "lazer", "valor_centavos": 90000, "fatia": 82 },
    { "categoria_id": "<id>", "nome": "Mercado", "cor": "mercado", "valor_centavos": 20000, "fatia": 18 }
  ]
}
```

Uma compra de R$ 900,00 em 3x feita hoje, no cartão que fecha no dia 3 e vence no dia 10:

```http
GET /espacos/<espaco_id>/relatorios/cartoes
```

```json
[
  {
    "cartao_id": "<id>",
    "nome": "Cartão Roxo",
    "ativa": true,
    "limite_centavos": 500000,
    "usado_centavos": 90000,
    "a_pagar_centavos": 0,
    "faturas": [
      { "referencia": "2026-10", "inicio": "2026-09-03", "fechamento": "2026-10-03", "vencimento": "2026-10-10",
        "situacao": "ABERTA", "total_centavos": 30000 },
      { "referencia": "2026-11", "inicio": "2026-10-03", "fechamento": "2026-11-03", "vencimento": "2026-11-10",
        "situacao": "FUTURA", "total_centavos": 30000 },
      { "referencia": "2026-12", "inicio": "2026-11-03", "fechamento": "2026-12-03", "vencimento": "2026-12-10",
        "situacao": "FUTURA", "total_centavos": 30000 }
    ]
  }
]
```

### Como é calculado

- **No banco, não na tela:** as somas saem de uma agregação do MongoDB (`$unwind` das partidas e `$group` por mês,
  tipo do lançamento e categoria), em inteiros de 64 bits, sem trazer os lançamentos para a API. Assim o relatório de
  um ano não esbarra no teto de 1000 lançamentos da listagem, e a regra dos números fica fora do código publicado da
  área do cliente. O filtro usa o índice `espaco_id + data`.
- **Mês pelo texto da data:** a data do lançamento fica gravada como `AAAA-MM-DD`; o mês é o prefixo `AAAA-MM`, sem
  conta de fuso.
- **Saldo no fim do mês:** a soma das partidas das contas de todo o histórico até o último mês pedido, agrupada por
  mês e acumulada a partir do saldo inicial.
- **Compromisso nos cartões:** os lançamentos do cartão da fatura aberta em diante (a mesma leitura do painel do
  cartão), agrupados pela fatura de cada data, com o ciclo de fechamento da Parte 6.

| Situação | Campo | Mensagem |
|---|---|---|
| Mês fora do formato `AAAA-MM` | `de` / `ate` | Mês inválido. Use o formato AAAA-MM. |
| Texto com mais de 7 caracteres | `de` / `ate` | Use no máximo 7 caracteres. |
| Mês final antes do inicial | `ate` | O mês final vem antes do inicial. |
| Mais de 120 meses | `de` | Peça no máximo 120 meses de uma vez. |

### Como testar os relatórios

- **Testes automatizados:** `api/tests/test_financeiro_relatorios.py` (período padrão e inválido, receita × despesa
  com o cartão por competência, pagamento e transferência fora das somas, estorno, saldo no fim do mês com e sem
  filtro de conta, gasto por categoria com a fatia, faturas comprometidas, espaço e conta alheios em `404`).
- **Manual (Swagger):** com o ID token de uma conta de teste (Parte 6, "Como testar o livro-caixa"), abra a tag
  **Relatórios** e chame `GET /espacos/{espaco_id}/relatorios/mensal` sem parâmetros (os últimos 12 meses).

---

## Parte 8 – E-mails da conta e modo de produção

A confirmação do e-mail e a senha nova saem da API, com a marca OliFine, no lugar do e-mail padrão do Firebase
(remetente `noreply@<projeto>.firebaseapp.com`, que cai no spam com frequência, e página genérica do Google). O
Firebase continua dono da conta: a API só pede a ele o **código** do link.

```
Área do cliente ── POST /conta/confirmacao (ID token) ──┐
       ou         ── POST /conta/nova-senha (e-mail) ────┤
                                                         ▼
                        API ── 202 na hora; depois da resposta:
                         1. accounts:sendOobCode (returnOobLink, conta de serviço) ── Firebase devolve o código
                         2. monta o e-mail (modelo OliFine: HTML + texto)
                         3. manda pelo provedor (Resend, SMTP ou pasta)
                                                         ▼
Caixa de entrada ── link <APP_URL>/auth/verificar-email#oobCode=… ── página do app aplica o código (SDK do Firebase)
```

### Endpoints

| Método | Endpoint | Quem pode | Corpo | Resposta |
|---|---|---|---|---|
| `POST` | `/conta/confirmacao` | Cliente com ID token do Firebase, **mesmo sem o e-mail confirmado** (a única rota assim) | — | `202` (conta já confirmada: `202` sem mandar) |
| `POST` | `/conta/nova-senha` | Público | `{"email": "ana@exemplo.com"}` | `202`, igual com e sem conta |
| `GET` | `/saude` | Público | — | `200 {"status": "ok"}` |

Sem `EMAIL_PROVEDOR`, as duas rotas `/conta` respondem `503`; a área do cliente percebe e usa o envio do próprio
Firebase (o mesmo vale para a API fora do ar e para o GitHub Pages, que não tem API). Limites (`429` com
`Retry-After`): confirmação, 1 por minuto e 5 por hora por conta, 20 por hora por endereço; senha nova, 1 por
minuto para o mesmo e-mail do mesmo endereço, 5 por hora por e-mail e 10 a cada 15 minutos por endereço.

### Provedores

| `EMAIL_PROVEDOR` | Como manda | Configuração |
|---|---|---|
| `resend` | API HTTPS do Resend (porta 443) | `RESEND_API_KEY`, domínio do remetente verificado (SPF e DKIM) |
| `smtp` | Qualquer servidor SMTP com senha: SSL na 465, STARTTLS nas outras (nunca texto puro) | `SMTP_HOST`, `SMTP_PORTA`, `SMTP_USUARIO`, `SMTP_SENHA` |
| `pasta` | Não manda: grava `.html` e `.txt` em `EMAIL_PASTA` (desenvolvimento; recusado em produção) | — |

**Modelo:** tabelas com estilo inline (Gmail, Outlook e Apple Mail), faixa `#065F46` com o monograma OF e o slogan
"Finanças que fazem sentido", filete `#16A34A`, botão `#065F46` (com VML para o Outlook do Windows), modo escuro
por `prefers-color-scheme` e texto puro junto. O monograma é o PNG de `web/public/email/` (192 px, 4x), servido
com o app em `<APP_URL>/email/olifine-monograma.png`: SVG não aparece no Gmail nem no Outlook. Com as imagens
bloqueadas, o quadrado mostra "OF" em texto. O rodapé traz o endereço oficial (o `APP_URL` sem `https://`), para
quem recebe conferir o domínio antes de digitar a senha.

Todos precisam de `EMAIL_REMETENTE`, `APP_URL` e `FIREBASE_CONTA_DE_SERVICO` (chave JSON de uma conta de
serviço do mesmo projeto do `FIREBASE_PROJECT_ID`; a API não sobe com projeto diferente). O token de acesso da
conta de serviço é pedido ao Google com um JWT RS256 (OAuth 2.0, RFC 7523), sem SDK a mais, e reaproveitado até
um minuto antes de vencer.

### Páginas da área do cliente

| Página | O que faz |
|---|---|
| `/auth/verificar-email` | Aplica o código (`applyActionCode`) e mostra **E-mail confirmado**; com a conta logada na mesma aba, a área logada abre na hora. Link vencido, usado ou sem rede: mensagem própria e o caminho seguinte |
| `/auth/redefinir-senha` | Confere o código, mostra o e-mail da conta e pede a senha nova duas vezes (`confirmPasswordReset`) |
| `/auth/esqueci-a-senha` | Pede o link; a resposta na tela é a mesma com e sem conta |
| `/auth/acao` | Endereço para a "URL de ação personalizada" do Console do Firebase: leva os links do próprio Firebase à página certa |

### Modo de produção

`AMBIENTE=producao` recusa subir quando encontra: `JWT_SECRET` ou `ADMIN_SENHA` do exemplo; origem de CORS sem
`https://` ou curinga; `CORS_ORIGENS_REDE` preenchido; `MONGODB_URI` sem usuário e senha; `APP_URL` sem
`https://`; `EMAIL_PROVEDOR=pasta`. A mensagem lista todos de uma vez. O `/docs` e o `/openapi.json` saem do ar.

Segredos podem vir de arquivo: um por variável em `/run/secrets`, com o nome em minúsculas
(`/run/secrets/jwt_secret`, `/run/secrets/resend_api_key`, `/run/secrets/firebase_conta_de_servico` com o JSON).
Assim eles não aparecem no `docker inspect` nem em quem liste as variáveis do processo. A ordem de prioridade é:
variável de ambiente, `api/.env`, arquivo.

### Como testar

- **Automatizados:** `api/tests/test_emails.py` (modelos, provedores, código do Firebase com o Google simulado),
  `test_emails_rotas.py` (rotas, limites, resposta igual com e sem conta) e `test_producao.py`.
- **Modelos:** `.venv\Scripts\python -m app.emails.previa <pasta> [endereço do app]` em `api/` grava os três
  modelos (confirmação, senha nova e key de acesso) com dados fictícios. O monograma vem de
  `<endereço do app>/email/olifine-monograma.png` (padrão `http://localhost:5173/ADS-Project`, com o `npm run dev`
  no ar).
- **Fluxo completo sem provedor:** `EMAIL_PROVEDOR=pasta` com o `python subir-app.py dev` (ele monta a pasta no
  container) ou com a API fora do Docker (opção C do README): cada e-mail vira um `.html` em `api/emails-enviados/`;
  abra e clique no link.
- **Console do Firebase:** `.venv\Scripts\python -m app.emails.console` em `api/` lê, com a conta de serviço, a URL
  de ação personalizada e os domínios autorizados e aponta o que não bate com o `APP_URL` (só leitura; o
  `python subir-app.py verificar` usa). A URL de ação só muda pelo Console: a API de administração recusa a troca em
  projeto sem Identity Platform (`EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`).

---

## Parte 9 – Monitoramento, alertas e telemetria

Um ataque que ninguém vê não é contido: registrar e avisar é um controle de segurança (OWASP Top 10, A09 —
*Security Logging and Monitoring Failures*). A API manda alertas para o Discord em três canais, cada um com o
próprio webhook ([`api/app/monitoramento.py`](api/app/monitoramento.py)).

| Canal (variável) | Canal no Discord | O que chega |
|---|---|---|
| Sistema (`DISCORD_WEBHOOK_SISTEMA`) | `#alertas-sistema` | Erro não tratado (`500`): método e rota como modelo (`GET /espacos/{espaco_id}`), tipo da exceção e arquivo e linha do código; e-mail da conta que não saiu (tipo e falha); API no ar (só com `AMBIENTE=producao`) |
| Segurança (`DISCORD_WEBHOOK_SEGURANCA`) | `#logs-seguranca` | Todo `429`: login do back-office travado por força bruta, limite dos e-mails da conta estourado; 10 ou mais `401` do mesmo endereço em 5 minutos (senha, JWT ou ID token do Firebase testados em série). Com o grupo da rota e o IP |
| Telemetria (`DISCORD_WEBHOOK_TELEMETRIA`) | `#telemetria-custos` | Resumo a cada `TELEMETRIA_INTERVALO_HORAS` (padrão 24) e no desligamento: pedidos por grupo de rota, respostas `4xx` e `5xx`, e-mails enviados e com falha; aviso quando os e-mails das últimas 24 horas chegam a 80% e a 100% de `EMAIL_COTA_DIARIA` |

**Regras:**

- **Sem dado pessoal nem segredo:** nenhum e-mail, token, corpo, cabeçalho, mensagem de exceção ou stack trace.
  A rota vai como modelo, nunca com o caminho digitado por quem chamou. O IP vai só para o canal de segurança, onde
  é o dado que permite bloquear quem ataca.
- **A API nunca espera o Discord:** o alerta entra numa fila e sai por uma thread própria. Discord fora do ar,
  webhook apagado ou fila cheia viram uma linha de log (sem o endereço do webhook) e a resposta segue igual.
- **Sem avalanche:** o mesmo alerta (mesma chave: canal, tipo, rota, endereço) sai no máximo uma vez a cada 15
  minutos; o envio seguinte traz a contagem das repetições. Caminhos desconhecidos contam como `outros` na
  telemetria, para um robô que varre endereços não criar uma linha por tentativa.
- **Sem menção injetada:** toda mensagem vai com `allowed_mentions` vazio.
- **Configuração conferida na subida:** webhook fora de `https://discord.com/api/webhooks/...` derruba a API (um
  endereço qualquer receberia os IPs de quem ataca), e o valor recusado não aparece na mensagem de erro. Webhook
  vazio desliga o canal; sem nenhum, nenhuma thread sobe. Num servidor, os webhooks vêm de
  `/run/secrets/discord_webhook_sistema` (e `_seguranca`, `_telemetria`).

**Como testar:**

- **Automatizados:** `api/tests/test_monitoramento.py` (canal certo, repetição, `allowed_mentions`, falha do
  Discord, força bruta, rajada de `401`, `500` sem a mensagem da exceção, e-mail que falha, cota, resumo e
  configuração).
- **De ponta a ponta:** com os três webhooks no `api/.env`, `python subir-app.py alertas` manda uma mensagem de
  teste para cada canal, e `python subir-app.py verificar` confere se cada webhook existe (sem mandar mensagem).
  Depois, com o `python subir-app.py dev` no ar, 6 logins errados seguidos no painel geram o alerta de força bruta
  em `#logs-seguranca`.

---

## Parte 10 – Gestão da empresa (espaço empresarial)

Cada empresa do espaço empresarial ganha quatro abas de gestão na área do cliente (Custos, Sociedade & aportes,
Impostos e Pessoal), sobre o mesmo livro-caixa: tudo o que mexe em dinheiro vira um lançamento comum da empresa,
com partidas dobradas, na categoria da função certa, e o extrato, o saldo, o DRE e o fluxo de caixa enxergam sem
regra nova. As rotas só respondem numa empresa (no pessoal, `404` com "Esta parte é das empresas do espaço
empresarial."), com a mesma barreira da Parte 6.

Código: [`api/app/financeiro/servicos_empresa.py`](api/app/financeiro/servicos_empresa.py),
[`regras_empresa.py`](api/app/financeiro/regras_empresa.py), [`modelos_empresa.py`](api/app/financeiro/modelos_empresa.py)
e [`rotas_empresa.py`](api/app/financeiro/rotas_empresa.py) (tag **Gestão da empresa** no Swagger).

| Método | Endpoint | Finalidade | Resposta de sucesso | Erros possíveis |
|---|---|---|---|---|
| `PUT` | `/espacos/{espaco_id}/custos/classes` | Classe de cada despesa na aba Custos (`{classes: {categoria_id: VARIAVEL \| FIXO \| OPERACIONAL \| FORA \| null}}`); tudo ou nada | `200 OK` (as categorias) | `400`, `401`, `404` |
| `GET`, `POST` | `/espacos/{espaco_id}/socios` | Quadro societário; incluir sócio (`nome`, `participacao_centesimos`) | `200 OK` / `201 Created` | `400`, `401`, `404`, `409` (limite) |
| `PUT`, `DELETE` | `/espacos/{espaco_id}/socios/{socio_id}` | Editar (nome novo em cascata nos lançamentos); tirar do quadro | `200 OK` / `204 No Content` | `400`, `401`, `404` |
| `POST` | `/espacos/{espaco_id}/socios/{socio_id}/movimentos` | Aporte (`APORTE`, entra), distribuição de lucros (`DISTRIBUICAO`) ou pró-labore (`PRO_LABORE`), que saem, na conta indicada | `201 Created` (o lançamento) | `400`, `401`, `404` |
| `GET`, `POST` | `/espacos/{espaco_id}/tributos` | Tributos recorrentes com as competências pagas; cadastrar tributo | `200 OK` / `201 Created` | `400`, `401`, `404`, `409` (limite) |
| `PUT`, `DELETE` | `/espacos/{espaco_id}/tributos/{tributo_id}` | Editar (inclusive desativar); excluir (os pagamentos ficam) | `200 OK` / `204 No Content` | `400`, `401`, `404` |
| `POST` | `/espacos/{espaco_id}/tributos/{tributo_id}/pagamentos` | Pagar a guia de uma competência (`competencia`, `conta_id`, `valor_centavos`, `data`) | `201 Created` (o lançamento) | `400`, `401`, `404`, `409` (já paga) |
| `GET`, `POST` | `/espacos/{espaco_id}/colaboradores` | Pessoas da folha com as competências lançadas; incluir pessoa | `200 OK` / `201 Created` | `400`, `401`, `404`, `409` (limite) |
| `PUT`, `DELETE` | `/espacos/{espaco_id}/colaboradores/{colaborador_id}` | Editar (desativar tira da próxima folha); excluir do cadastro | `200 OK` / `204 No Content` | `400`, `401`, `404` |
| `POST` | `/espacos/{espaco_id}/folha` | Lançar a folha de uma competência (`competencia`, `conta_id`, `data` opcional) | `200 OK` (`lancados`, `ja_lancados`, `total_centavos`) | `400`, `401`, `404` |

- **Porcentagens em centésimos de ponto**, inteiros como o dinheiro: `10000` = 100%, `600` = 6%, `480` = 4,8%.
- **Categorias com função:** as categorias que a gestão usa sozinha levam `funcao` (`APORTE`, `DISTRIBUICAO`,
  `PRO_LABORE`, `SALARIOS`, `BENEFICIOS`, `PRESTADORES`, `ENCARGOS`, `IMPOSTOS`) e são achadas por ela, não pelo
  nome: renomear "Aportes dos sócios" não quebra nada. Empresa cadastrada antes das funções tem a categoria de
  mesmo nome marcada na primeira vez; sem nenhuma das duas (a pessoa excluiu), a categoria nasce de novo.
  `classe_de_custo` e `funcao` aparecem em `GET /categorias` (nulos no pessoal).
- **Custos:** a classe (`VARIAVEL`, `FIXO`, `OPERACIONAL`, `FORA`) fica gravada na categoria; sem ela, a tela
  sugere pelo nome. Margem de contribuição, lucro, margem de lucro e ponto de equilíbrio são conta da tela.
- **Sociedade:** as participações somam até 100% (`400` com quanto ainda cabe). Aporte, pró-labore e distribuição
  levam o sócio como `responsavel` (nas categorias de função `APORTE`, `PRO_LABORE` e `DISTRIBUICAO`); aporte e
  distribuição ficam fora do DRE e dos custos (são dinheiro entre a empresa e os sócios). Os dividendos de cada
  sócio (lucro × participação, menos o distribuído) são conta da tela.
- **Impostos:** base `FATURAMENTO` ou `FOLHA` pede `aliquota_centesimos`; `FIXO`, `valor_fixo_centavos` (os dois
  juntos é `400`). A guia de uma competência vence no mês seguinte, no `dia_vencimento` (31 vira o último dia);
  no `TRIMESTRAL`, a competência é o último mês do trimestre (`2026-09`). Pagar grava uma despesa em "Impostos"
  (ou "Encargos da folha", na base `FOLHA`) com `origem: {tipo: TRIBUTO, id, competencia}`; a mesma competência
  paga de novo é `409` (índice único no MongoDB). Excluir o lançamento no extrato libera a competência. A
  provisão (alíquota sobre o faturamento ou os salários CLT da competência) e a agenda (atrasada, vence em até 7
  dias, a vencer, em curso, paga) são conta da tela; os alertas aparecem no sino.
- **Pessoal (RH):** vínculo `CLT` (salário em "Folha de pagamento"), `PJ` ("Prestadores de serviço") ou
  `PRO_LABORE` ("Pró-labore"), com até 10 benefícios por pessoa. `POST /folha` lança, para cada pessoa ativa e já
  admitida na competência, o salário e os benefícios (em "Benefícios"), com a pessoa como `responsavel` e a
  `origem` `SALARIO` ou `BENEFICIOS`. Sem `data`, cada pessoa no próprio dia de pagamento, no mês seguinte à competência.
  Quem já está lançado é pulado (`ja_lancados`): repetir não duplica, nem com dois cliques ao mesmo tempo.
- **Nome novo em cascata:** editar o nome de um sócio ou de uma pessoa da folha troca o `responsavel` dos
  lançamentos (`lancamentos_renomeados`), como na família.
- **Lançamento com origem:** `GET /lancamentos` traz `origem` (`null` nos outros). A edição não mexe nela.

**Como testar:** `api/tests/test_financeiro_empresa.py` (classes, sócios e movimentos, categorias com função,
tributos e pagamento único por competência, folha sem duplicar, isolamento) e
`api/tests/test_financeiro_familia.py` (Modo Família). Na área do cliente, `python subir-app.py dev`, cadastre uma
empresa no seletor do topo (Empresarial) e percorra as abas de Gestão.

---

## Como testar

- **Painel:** `http://localhost:8081/painel/`. Faça login com o administrador inicial (`ADMIN_EMAIL` e
  `ADMIN_SENHA` do `api/.env`), crie um operador e um cliente, saia e entre com cada um. Abra a barra
  **Modo demonstração**, no fim da página: ela mostra o payload do token e, em **Respostas da API**, cada
  chamada com método, caminho, status e corpo. Os botões aparecem para todos os perfis de propósito: tente
  uma ação proibida e veja o `403` no aviso e em "Respostas da API". O roteiro completo, com a resposta
  esperada de cada passo, está na seção "Como testar" do [`README.md`](README.md#como-testar).
- **Swagger:** `http://localhost:8081/docs`. Rode `POST /auth/login`, copie o `token`, clique em
  **Authorize** e cole o token. Depois rode `POST /auth/logout` (`204`) e repita um `GET /usuarios`: `401`,
  "Sessão encerrada. Faça login novamente.". A página do Swagger sai com a própria CSP
  (`curl -sI http://localhost:8081/docs` mostra o `Content-Security-Policy`).
- **Linha de comando:**

  ```bash
  curl -X POST http://localhost:8081/auth/login -H "Content-Type: application/json" -d '{"email":"admin@pessoalfinance.com","senha":"<ADMIN_SENHA>"}'
  curl http://localhost:8081/usuarios -H "Authorization: Bearer <token>"
  ```

- **Testes automatizados:** `cd api` e `pytest -v`, com as dependências do `requirements-dev.txt` instaladas
  (a suíte usa repositórios em memória e não precisa de MongoDB nem de rede). A contagem esperada e o que cada
  arquivo cobre estão em [Como testar, no README](README.md#1-testes-automatizados). Rodam também no GitHub
  Actions a cada commit de pull request.
