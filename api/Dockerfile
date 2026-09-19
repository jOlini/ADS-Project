# Imagem da API: Python 3.13 slim, só com as dependências de execução.
# Os testes rodam no CI (ci-tests.yml), não dentro da imagem.

FROM python:3.13-slim

# Sem arquivos .pyc no container e log saindo na hora, sem buffer.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Só o requirements.txt primeiro: enquanto as dependências não mudarem, o
# Docker reaproveita esta camada e não reinstala tudo a cada build.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY painel ./painel

# Processo sem privilégio de root: se a aplicação for comprometida, o
# invasor não ganha root dentro do container.
RUN useradd --system --no-create-home api
USER api

EXPOSE 8081

# --factory: criar_app() monta a aplicação lendo a configuração do ambiente.
CMD ["uvicorn", "app.main:criar_app", "--factory", "--host", "0.0.0.0", "--port", "8081"]
