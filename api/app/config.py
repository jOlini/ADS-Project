"""Configuração da API, lida das variáveis de ambiente ou do arquivo api/.env.

Nenhum segredo tem valor padrão no código: o repositório é público.
"""

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Configuracoes(BaseSettings):
    # Os nomes batem com as variáveis sem diferenciar maiúsculas:
    # MONGODB_URI -> mongodb_uri, JWT_SECRET -> jwt_secret e assim por diante.
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    mongodb_uri: str = "mongodb://localhost:27017/pessoal-finance"

    # Obrigatório. Sem ele a API não sobe.
    jwt_secret: str

    # Validade do token, em minutos.
    jwt_expiration: int = Field(default=30, gt=0)

    # Origens de navegador autorizadas a chamar a API (separadas por vírgula).
    # Vazio = nenhuma origem externa. O painel é servido pela própria API
    # (mesma origem) e não precisa de CORS.
    cors_origens: str = ""

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

    @property
    def lista_cors(self) -> list[str]:
        return [origem.strip() for origem in self.cors_origens.split(",") if origem.strip()]
