"""Configuração da API, lida das variáveis de ambiente, do arquivo api/.env ou
de arquivos de segredo (/run/secrets).

Nenhum segredo tem valor padrão no código: o repositório é público.
"""

from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Segredos em arquivo (Docker secrets, ou o Secret Manager montado como
# volume): cada um é um arquivo com o nome do campo, como
# /run/secrets/jwt_secret. Assim o segredo não aparece no "docker inspect",
# no /proc/<pid>/environ nem num log que despeje as variáveis de ambiente.
# A pasta só entra na leitura se existir: fora do container ela não existe, e
# o pydantic avisaria a cada subida.
PASTA_DE_SEGREDOS = Path("/run/secrets")

# Valores de exemplo do api/.env.example. Em produção, qualquer um deles ainda
# no lugar derruba a subida: é o .env copiado sem trocar.
SEGREDO_DE_EXEMPLO = "troque-por-uma-chave-aleatoria-de-pelo-menos-32-bytes"
SENHA_DE_EXEMPLO = "troque-esta-senha"


class Configuracoes(BaseSettings):
    # Os nomes batem com as variáveis sem diferenciar maiúsculas:
    # MONGODB_URI -> mongodb_uri, JWT_SECRET -> jwt_secret e assim por diante.
    # Ordem de prioridade: variável de ambiente, api/.env, arquivo de segredo.
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        secrets_dir=PASTA_DE_SEGREDOS if PASTA_DE_SEGREDOS.is_dir() else None,
    )

    # "producao" liga as travas de um endereço público (conferir_producao):
    # a API recusa subir com configuração de desenvolvimento, e o Swagger e o
    # /openapi.json saem do ar (main.py).
    ambiente: Literal["desenvolvimento", "producao"] = "desenvolvimento"

    mongodb_uri: str = "mongodb://localhost:27017/pessoal-finance"

    # Obrigatório. Sem ele a API não sobe.
    jwt_secret: str

    # Validade do token, em minutos. 15 é o tempo máximo que uma cópia vazada
    # de um token não encerrado no logout continua valendo (revogacao.py).
    jwt_expiration: int = Field(default=15, gt=0)

    # Origens de navegador autorizadas a chamar a API (separadas por vírgula).
    # Vazio = nenhuma origem externa. O painel é servido pela própria API
    # (mesma origem) e não precisa de CORS.
    cors_origens: str = ""

    # Origem da área do cliente aberta pela rede local (http://<ip>:5173). Não
    # vai no api/.env: o subir-app.py passa pelo docker compose a cada subida,
    # porque o IP muda de uma rede para outra.
    cors_origens_rede: str = ""

    # Projeto do Firebase cujo ID token abre o livro-caixa do cliente final
    # (o mesmo VITE_FIREBASE_PROJECT_ID do front-end; não é segredo). Vazio =
    # rotas do cliente respondem 503, e o back-office segue funcionando.
    firebase_project_id: str = ""

    # Primeiro administrador, criado só quando o banco está vazio.
    admin_nome: str = "Administrador"
    admin_email: str = ""
    admin_senha: str = ""

    @field_validator("jwt_secret")
    @classmethod
    def exigir_segredo_forte(cls, segredo: str) -> str:
        # O HS256 pede chave de pelo menos 256 bits. Chave curta derruba a API
        # na subida, em vez de emitir tokens fáceis de forjar por força bruta.
        if len(segredo.encode("utf-8")) < 32:
            raise ValueError("JWT_SECRET curto: use pelo menos 32 bytes (256 bits) para o HS256.")
        return segredo

    @model_validator(mode="after")
    def conferir_producao(self) -> "Configuracoes":
        """Em produção, recusa subir com o que só serve na máquina de quem
        desenvolve. Todos os problemas saem numa mensagem só, para a correção
        não virar um vai e volta de subidas."""
        if self.ambiente != "producao":
            return self
        problemas = self.problemas_de_producao()
        if problemas:
            raise ValueError("AMBIENTE=producao com configuração insegura: " + " ".join(problemas))
        return self

    def problemas_de_producao(self) -> list[str]:
        problemas = []
        if self.jwt_secret == SEGREDO_DE_EXEMPLO:
            problemas.append("JWT_SECRET ainda é o valor de exemplo.")
        if self.admin_senha == SENHA_DE_EXEMPLO:
            problemas.append("ADMIN_SENHA ainda é o valor de exemplo.")
        # Um curinga ou uma origem http:// deixaria outro site (ou uma rede
        # Wi-Fi no meio do caminho) chamar a API pelo navegador de quem usa.
        origens = self.lista_cors
        if any(origem == "*" or urlsplit(origem).scheme != "https" for origem in origens):
            problemas.append("CORS_ORIGENS aceita só origens https:// escritas por extenso (sem *).")
        if self.cors_origens_rede:
            problemas.append("CORS_ORIGENS_REDE é da rede local de desenvolvimento; deixe vazio.")
        # Banco sem senha só é aceitável na rede interna da máquina de quem
        # desenvolve. Num servidor, um erro de firewall o deixaria aberto.
        endereco_do_banco = urlsplit(self.mongodb_uri)
        if endereco_do_banco.scheme not in ("mongodb", "mongodb+srv") or not endereco_do_banco.password:
            problemas.append("MONGODB_URI precisa de usuário e senha (mongodb://usuario:senha@host/banco).")
        return problemas

    @property
    def lista_cors(self) -> list[str]:
        origens = f"{self.cors_origens},{self.cors_origens_rede}".split(",")
        return list(dict.fromkeys(origem.strip() for origem in origens if origem.strip()))
