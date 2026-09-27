"""Documentação interativa (Swagger UI em /docs) com CSP própria.

O /docs padrão do FastAPI inicia o Swagger UI com um <script> inline e baixa
os arquivos da CDN sem versão fixa (swagger-ui-dist@5). Para abrir, a página
ficava sem Content-Security-Policy nenhuma: um script injetado ali rodaria com
acesso ao token colado em "Authorize". Aqui a página é montada à mão:

- o Swagger UI vem de uma versão fixa no jsDelivr, com Subresource Integrity
  (SRI): se o arquivo da CDN mudar um byte (CDN comprometida, versão
  republicada), o navegador recusa o arquivo;
- a inicialização é um arquivo da própria API (/docs/iniciar.js), então a CSP
  proíbe todo script inline;
- a CSP libera na CDN só o caminho exato daquela versão.

Trocar de versão: mudar VERSAO_DO_SWAGGER e recalcular os dois hashes com
  curl -sL <url do arquivo> | openssl dgst -sha384 -binary | openssl base64 -A
"""

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, Response

VERSAO_DO_SWAGGER = "5.32.15"
CDN_DO_SWAGGER = f"https://cdn.jsdelivr.net/npm/swagger-ui-dist@{VERSAO_DO_SWAGGER}/"
SCRIPT_DO_SWAGGER = f"{CDN_DO_SWAGGER}swagger-ui-bundle.js"
ESTILO_DO_SWAGGER = f"{CDN_DO_SWAGGER}swagger-ui.css"
INTEGRIDADE_DO_SCRIPT = "sha384-m7zaGj7MPzU+G4lz2eyy73GxK9bbRDr9bB2CSdj8wodg2wu/Wnt6wsoLP3JD+RS9"
INTEGRIDADE_DO_ESTILO = "sha384-fgyWYkUAamzuI8mJFu/xpRP0JWCJRwkwUwsYDoOYVHUJ8NQE5cENn8ib3ppwFFSX"

# Nada é liberado por padrão; cada diretiva abre só o que o Swagger usa.
# - script: o arquivo de inicialização (self) e a versão fixa na CDN, sem
#   'unsafe-inline' nem 'unsafe-eval';
# - style: a folha da CDN; os estilos que o Swagger aplica pelo JavaScript
#   (element.style) não passam pela CSP;
# - img: o favicon do painel e os ícones em data: da folha do Swagger;
# - connect: o /openapi.json e o "Try it out", ambos na própria API.
CSP_DA_DOCUMENTACAO = "; ".join(
    [
        "default-src 'none'",
        f"script-src 'self' {CDN_DO_SWAGGER}",
        f"style-src {CDN_DO_SWAGGER}",
        "img-src 'self' data:",
        "connect-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
    ]
)

PAGINA_DA_DOCUMENTACAO = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pessoal Finance API · Swagger</title>
<link rel="icon" type="image/svg+xml" href="/painel/favicon.svg">
<link rel="stylesheet" href="{ESTILO_DO_SWAGGER}" integrity="{INTEGRIDADE_DO_ESTILO}" crossorigin="anonymous">
</head>
<body>
<div id="swagger-ui"></div>
<script src="{SCRIPT_DO_SWAGGER}" integrity="{INTEGRIDADE_DO_SCRIPT}" crossorigin="anonymous"></script>
<script src="/docs/iniciar.js"></script>
</body>
</html>
"""

# Os mesmos parâmetros do /docs padrão do FastAPI, menos o validador externo
# (validator.swagger.io), que a CSP não libera.
SCRIPT_DE_INICIO = """window.ui = SwaggerUIBundle({
  url: '/openapi.json',
  dom_id: '#swagger-ui',
  layout: 'BaseLayout',
  deepLinking: true,
  showExtensions: true,
  showCommonExtensions: true,
  validatorUrl: null,
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
});
"""

rotas_documentacao = APIRouter(include_in_schema=False)


@rotas_documentacao.get("/docs")
def documentacao():
    return HTMLResponse(PAGINA_DA_DOCUMENTACAO, headers={"Content-Security-Policy": CSP_DA_DOCUMENTACAO})


@rotas_documentacao.get("/docs/iniciar.js")
def inicio_da_documentacao():
    return Response(SCRIPT_DE_INICIO, media_type="text/javascript")
