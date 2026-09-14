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
RUN npm run build -- --base=/

# Execução
# Só os arquivos estáticos e um servidor web. Sem Node, sem npm, sem dependências de desenvolvimento.

FROM nginx:alpine AS producao

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# A imagem base do nginx já sobe o servidor, mas deixei o comando
# explícito. "daemon off" mantém o nginx em primeiro plano: um
# container morre quando o processo principal termina.
CMD ["nginx", "-g", "daemon off;"]
