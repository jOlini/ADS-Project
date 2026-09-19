# Build
# Node, npm e todas as dependências de desenvolvimento.
# Nada deste estágio vai para a imagem final.

FROM node:20-alpine AS build

WORKDIR /app

# Copia só os manifestos primeiro, antes do código.
COPY package.json package-lock.json ./

# npm ci em vez de npm install: instala exatamente as versões travadas no package-lock.json.
RUN npm ci

COPY . .

# O vite.config.js define base: '/ADS-Project/', que é o caminho do
# GitHub Pages. Dentro do container o nginx serve a partir da raiz,
# então sobrescreve o base aqui. Sem isso o index.html procuraria
# os assets em /ADS-Project/assets/... e a página abriria em branco.
#
# A configuração do Firebase (web/.env) entra como secret de build:
#   docker build --secret id=env,src=web/.env -t pessoal-finance-web web
# O arquivo fica montado só durante este RUN e não é gravado em nenhuma
# camada da imagem (o .dockerignore também barra o .env do contexto).
# Sem o --secret, o build funciona e as páginas avisam que falta o Firebase.
RUN --mount=type=secret,id=env,target=/app/.env npm run build -- --base=/

# Execução
# Só os arquivos estáticos e um servidor web. Sem Node, sem npm, sem dependências de desenvolvimento.

FROM nginx:alpine AS producao

COPY --from=build /app/dist /usr/share/nginx/html

# Fallback de SPA: rotas do React Router (/cadastro, /principal) respondem
# com o index.html em vez de 404 ao recarregar a página.
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# A imagem base do nginx já sobe o servidor, mas deixei o comando
# explícito. "daemon off" mantém o nginx em primeiro plano: um
# container morre quando o processo principal termina.
CMD ["nginx", "-g", "daemon off;"]
