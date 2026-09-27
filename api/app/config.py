"""Configuração da API, lida das variáveis de ambiente, do arquivo api/.env ou
de arquivos de segredo (/run/secrets).

Nenhum segredo tem valor padrão no código: o repositório é público.
"""

import re
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
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

# Webhook de canal do Discord. Só este formato: um endereço qualquer faria a
# API mandar os alertas (com IPs de quem ataca) para fora do Discord.
WEBHOOK_DO_DISCORD = re.compile(r"^https://(?:(?:ptb|canary)\.)?discord(?:app)?\.com/api/webhooks/\d+/[\w-]+$")


class Configuracoes(BaseSettings):
    # Os nomes batem com as variáveis sem diferenciar maiúsculas:
    # MONGODB_URI -> mongodb_uri, JWT_SECRET -> jwt_secret e assim por diante.
    # Ordem de prioridade: variável de ambiente, api/.env, arquivo de segredo.
    # hide_input_in_errors: o valor recusado não aparece na mensagem de erro
    # da subida (seria o JWT_SECRET curto ou o token de um webhook no log).
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        secrets_dir=PASTA_DE_SEGREDOS if PASTA_DE_SEGREDOS.is_dir() else None,
        hide_input_in_errors=True,
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

    # Endereço público da área do cliente, sem barra no fim. Os links dos
    # e-mails (confirmação, nova senha) levam a páginas dele.
    app_url: str = "http://localhost:5173/ADS-Project"

    # E-mails da conta do cliente (app/emails): "resend", "smtp" ou "pasta"
    # (só desenvolvimento: grava os e-mails em EMAIL_PASTA). Vazio = desligado:
    # as rotas /conta respondem 503 e a área do cliente usa o envio do Firebase.
    email_provedor: Literal["", "resend", "smtp", "pasta"] = ""
    # Quem assina os e-mails, ex.: "OliFine <nao-responda@olifine.com.br>". O
    # domínio precisa estar verificado no provedor (SPF e DKIM no DNS).
    email_remetente: str = ""
    email_responder_para: str = ""
    resend_api_key: SecretStr = SecretStr("")
    smtp_host: str = ""
    smtp_porta: int = Field(default=587, gt=0, lt=65536)
    smtp_usuario: str = ""
    smtp_senha: SecretStr = SecretStr("")
    email_pasta: str = "emails-enviados"
    # Chave da conta de serviço do Firebase (caminho do JSON ou o próprio
    # JSON, quando vem de /run/secrets/firebase_conta_de_servico). Só serve
    # para pedir ao Firebase os códigos dos links. Fica fora do repositório.
    firebase_conta_de_servico: str = ""
    # Cota diária de e-mails do provedor (Resend grátis: 100 por dia). A
    # telemetria avisa em 80% e em 100%. 0 = sem aviso.
    email_cota_diaria: int = Field(default=100, ge=0)

    # Alertas e telemetria no Discord (app/monitoramento.py): um webhook por
    # canal, vazio = canal desligado. São segredos (quem tem o endereço
    # escreve no canal): num servidor, em /run/secrets/discord_webhook_*.
    discord_webhook_sistema: SecretStr = SecretStr("")
    discord_webhook_seguranca: SecretStr = SecretStr("")
    discord_webhook_telemetria: SecretStr = SecretStr("")
    # A cada quantas horas o resumo de uso vai para o canal de telemetria.
    telemetria_intervalo_horas: int = Field(default=24, gt=0)

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

    @field_validator("app_url")
    @classmethod
    def tirar_barra_do_fim(cls, endereco: str) -> str:
        return endereco.strip().rstrip("/")

    @field_validator("discord_webhook_sistema", "discord_webhook_seguranca", "discord_webhook_telemetria")
    @classmethod
    def exigir_webhook_do_discord(cls, webhook: SecretStr) -> SecretStr:
        valor = webhook.get_secret_value().strip()
        if valor and not WEBHOOK_DO_DISCORD.match(valor):
            raise ValueError("Webhook do Discord inválido: use https://discord.com/api/webhooks/<id>/<token>.")
        return SecretStr(valor)

    @model_validator(mode="after")
    def conferir_email(self) -> "Configuracoes":
        """Provedor ligado pela metade (sem remetente, sem chave) derruba a
        subida, em vez de só aparecer no primeiro cadastro sem e-mail."""
        if not self.email_provedor:
            return self
        faltando = []
        if "@" not in self.email_remetente:
            faltando.append("EMAIL_REMETENTE")
        if not self.firebase_conta_de_servico:
            faltando.append("FIREBASE_CONTA_DE_SERVICO")
        if self.email_provedor == "resend" and not self.resend_api_key.get_secret_value():
            faltando.append("RESEND_API_KEY")
        if self.email_provedor == "smtp" and not self.smtp_host:
            faltando.append("SMTP_HOST")
        if faltando:
            raise ValueError(f"EMAIL_PROVEDOR={self.email_provedor} sem " + ", ".join(faltando) + ".")
        return self

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
        # Os links dos e-mails levam o código que confirma a conta ou troca a
        # senha: por http://, qualquer um no caminho da rede o leria.
        if urlsplit(self.app_url).scheme != "https":
            problemas.append("APP_URL precisa ser https://.")
        if self.email_provedor == "pasta":
            problemas.append("EMAIL_PROVEDOR=pasta é só para desenvolvimento.")
        return problemas

    @property
    def lista_cors(self) -> list[str]:
        origens = f"{self.cors_origens},{self.cors_origens_rede}".split(",")
        return list(dict.fromkeys(origem.strip() for origem in origens if origem.strip()))
