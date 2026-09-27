"""E-mails da conta: modelos, provedores de envio e códigos do Firebase, sem
rede (os provedores e o Google são trocados por dublês)."""

import io
import json
import smtplib
import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from pydantic import ValidationError

from app.config import Configuracoes
from app.emails.correio import CorreioDaConta, criar_correio
from app.emails.envio import (
    Email,
    EnviadorEmPasta,
    EnviadorResend,
    EnviadorSmtp,
    FalhaNoEnvio,
    criar_enviador,
)
from app.emails.links import URL_DO_TOKEN, FalhaNoFirebase, GeradorDeLinks, ler_credencial
from app.emails.mensagens import mensagem_da_key, mensagem_de_confirmacao, mensagem_de_nova_senha
from tests.conftest import PROJETO_DE_TESTE, SEGREDO_DE_TESTE

LINK = "https://app.exemplo.com/auth/verificar-email#oobCode=abc123"


# --- Modelos -------------------------------------------------------------------


@pytest.mark.parametrize(
    "mensagem",
    [mensagem_de_confirmacao(LINK), mensagem_de_nova_senha(LINK), mensagem_da_key("PF-7KQ2-M9XA-C4TD", LINK)],
)
def test_todo_modelo_tem_assunto_html_e_texto_com_o_link(mensagem):
    assert mensagem.assunto
    assert "OliFine" in mensagem.html
    assert f'href="{LINK}"' in mensagem.html
    assert LINK in mensagem.texto
    # Nenhum $campo do modelo.html sobrou sem preencher.
    assert "$" not in mensagem.html
    assert "nunca pede a sua senha" in mensagem.texto


def test_link_com_aspas_nao_escapa_do_atributo():
    mensagem = mensagem_de_nova_senha('https://app.exemplo.com/x"><script>alert(1)</script>')
    assert "<script>" not in mensagem.html
    assert "&quot;&gt;&lt;script&gt;" in mensagem.html


def test_link_precisa_ser_endereco_completo():
    with pytest.raises(ValueError):
        mensagem_de_confirmacao("javascript:alert(1)")


def test_key_aparece_no_html_e_no_texto():
    mensagem = mensagem_da_key("PF-7KQ2-M9XA-C4TD", LINK)
    assert "PF-7KQ2-M9XA-C4TD" in mensagem.html
    assert "Sua key: PF-7KQ2-M9XA-C4TD" in mensagem.texto


@pytest.mark.parametrize("key", ["", "pf-7kq2-m9xa-c4td", "PF-7KQ2-M9XA", "PF-<b>X-M9XA-C4TD", "PF-OOOO-1111-C4TD"])
def test_key_fora_do_formato_e_recusada(key):
    with pytest.raises(ValueError):
        mensagem_da_key(key, LINK)


def test_marca_com_monograma_hospedado_junto_com_o_app_e_slogan():
    # O mesmo modelo serve o GitHub Pages (com caminho) e um domínio próprio.
    for app, oficial in [
        ("https://jolini.github.io/ADS-Project", "jolini.github.io/ADS-Project"),
        ("https://app.exemplo.com/", "app.exemplo.com"),
    ]:
        mensagem = mensagem_de_confirmacao(LINK, app)
        assert f'src="{app.rstrip("/")}/email/olifine-monograma.png"' in mensagem.html
        assert 'alt="OF"' in mensagem.html
        assert "Finanças que fazem sentido" in mensagem.html
        assert f"Endereço oficial: {oficial}" in mensagem.html
        assert f"Endereço oficial: {oficial}\n" in mensagem.texto
        assert "OliFine · Finanças que fazem sentido" in mensagem.texto


def test_sem_endereco_do_app_o_monograma_vira_texto():
    mensagem = mensagem_de_nova_senha(LINK)
    assert "<img" not in mensagem.html
    assert ">OF</td>" in mensagem.html
    assert "Endereço oficial" not in mensagem.html
    assert "Endereço oficial" not in mensagem.texto


def test_endereco_do_app_precisa_ser_http():
    with pytest.raises(ValueError):
        mensagem_de_confirmacao(LINK, "javascript:alert(1)")
    mensagem = mensagem_de_confirmacao(LINK, 'https://app.exemplo.com/"><script>')
    assert "<script>" not in mensagem.html


# --- Provedores de envio -------------------------------------------------------

EMAIL = Email("ana@exemplo.com", mensagem_de_confirmacao(LINK))


class RespostaFalsa(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *erro):
        return False


def test_resend_manda_o_json_com_a_chave_no_cabecalho():
    pedidos = []

    def abrir(requisicao, timeout):
        pedidos.append(requisicao)
        return RespostaFalsa(b'{"id": "1"}')

    EnviadorResend("re_chave", "OliFine <nao-responda@exemplo.com>", "contato@exemplo.com", abrir).enviar(EMAIL)

    (pedido,) = pedidos
    assert pedido.full_url == "https://api.resend.com/emails"
    assert pedido.get_method() == "POST"
    assert pedido.get_header("Authorization") == "Bearer re_chave"
    corpo = json.loads(pedido.data)
    assert corpo["to"] == ["ana@exemplo.com"]
    assert corpo["from"] == "OliFine <nao-responda@exemplo.com>"
    assert corpo["reply_to"] == "contato@exemplo.com"
    assert corpo["subject"] == EMAIL.mensagem.assunto
    assert corpo["html"] and corpo["text"]


def test_resend_recusado_vira_falha_sem_a_chave_na_mensagem():
    def abrir(requisicao, timeout):
        raise HTTPError(requisicao.full_url, 403, "Forbidden", {}, io.BytesIO(b'{"message": "re_chave invalid"}'))

    with pytest.raises(FalhaNoEnvio) as falha:
        EnviadorResend("re_chave", "OliFine <a@exemplo.com>", abrir=abrir).enviar(EMAIL)
    assert "403" in str(falha.value)
    assert "re_chave" not in str(falha.value)


def test_resend_fora_do_ar_vira_falha():
    def abrir(requisicao, timeout):
        raise URLError("sem rede")

    with pytest.raises(FalhaNoEnvio):
        EnviadorResend("re_chave", "OliFine <a@exemplo.com>", abrir=abrir).enviar(EMAIL)


class SmtpFalso:
    """Registra o que o EnviadorSmtp pediu ao servidor."""

    conexoes = []

    def __init__(self, host, porta, timeout, context=None):
        self.passos = [("conectar", host, porta, context is not None)]
        SmtpFalso.conexoes.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *erro):
        self.passos.append(("sair",))
        return False

    def starttls(self, context):
        self.passos.append(("starttls",))

    def login(self, usuario, senha):
        self.passos.append(("login", usuario, senha))

    def send_message(self, mensagem):
        self.passos.append(("mandar", mensagem["To"], mensagem["From"], mensagem.get_content_type()))


def test_smtp_na_587_liga_o_starttls_antes_da_senha():
    SmtpFalso.conexoes.clear()
    EnviadorSmtp("smtp.exemplo.com", 587, "usuario", "senha", "OliFine <a@exemplo.com>", smtp=SmtpFalso).enviar(EMAIL)
    (conexao,) = SmtpFalso.conexoes
    nomes = [passo[0] for passo in conexao.passos]
    assert nomes == ["conectar", "starttls", "login", "mandar", "sair"]
    assert conexao.passos[3] == ("mandar", "ana@exemplo.com", "OliFine <a@exemplo.com>", "multipart/alternative")


def test_smtp_na_465_usa_ssl_direto():
    SmtpFalso.conexoes.clear()
    EnviadorSmtp("smtp.exemplo.com", 465, "u", "s", "OliFine <a@exemplo.com>", smtp_ssl=SmtpFalso).enviar(EMAIL)
    (conexao,) = SmtpFalso.conexoes
    assert conexao.passos[0] == ("conectar", "smtp.exemplo.com", 465, True)
    assert ("starttls",) not in conexao.passos


def test_smtp_recusado_vira_falha():
    class SmtpQueRecusa(SmtpFalso):
        def starttls(self, context):
            raise smtplib.SMTPNotSupportedError("STARTTLS não suportado")

    with pytest.raises(FalhaNoEnvio):
        EnviadorSmtp("smtp.exemplo.com", 587, "u", "s", "OliFine <a@exemplo.com>", smtp=SmtpQueRecusa).enviar(EMAIL)


def test_smtp_monta_html_texto_e_message_id_do_dominio():
    mensagem = EnviadorSmtp("h", 587, "", "", "OliFine <nao-responda@olifine.exemplo>", "c@exemplo.com").montar(EMAIL)
    assert mensagem["Reply-To"] == "c@exemplo.com"
    assert mensagem["Message-ID"].endswith("@olifine.exemplo>")
    tipos = [parte.get_content_type() for parte in mensagem.iter_parts()]
    assert tipos == ["text/plain", "text/html"]


def test_pasta_grava_html_e_texto(tmp_path):
    EnviadorEmPasta(tmp_path / "emails").enviar(EMAIL)
    arquivos = sorted(arquivo.suffix for arquivo in (tmp_path / "emails").iterdir())
    assert arquivos == [".html", ".txt"]
    texto = next((tmp_path / "emails").glob("*.txt")).read_text(encoding="utf-8")
    assert "Para: ana@exemplo.com" in texto and LINK in texto


def configuracao(**valores):
    return Configuracoes(_env_file=None, _secrets_dir=None, jwt_secret=SEGREDO_DE_TESTE, **valores)


def test_criar_enviador_segue_o_provedor(tmp_path):
    base = {"email_remetente": "OliFine <a@exemplo.com>", "firebase_conta_de_servico": "x"}
    assert criar_enviador(configuracao()) is None
    assert isinstance(criar_enviador(configuracao(email_provedor="resend", resend_api_key="re_x", **base)), EnviadorResend)
    assert isinstance(criar_enviador(configuracao(email_provedor="smtp", smtp_host="h", **base)), EnviadorSmtp)
    assert isinstance(criar_enviador(configuracao(email_provedor="pasta", **base)), EnviadorEmPasta)


@pytest.mark.parametrize(
    ("valores", "faltando"),
    [
        ({"email_provedor": "resend", "firebase_conta_de_servico": "x", "resend_api_key": "re"}, "EMAIL_REMETENTE"),
        ({"email_provedor": "resend", "email_remetente": "a@exemplo.com", "resend_api_key": "re"}, "FIREBASE"),
        ({"email_provedor": "resend", "email_remetente": "a@exemplo.com", "firebase_conta_de_servico": "x"}, "RESEND"),
        ({"email_provedor": "smtp", "email_remetente": "a@exemplo.com", "firebase_conta_de_servico": "x"}, "SMTP_HOST"),
    ],
)
def test_provedor_pela_metade_nao_sobe(valores, faltando):
    with pytest.raises(ValidationError, match=faltando):
        configuracao(**valores)


def test_chave_do_provedor_nao_aparece_na_configuracao():
    config = configuracao(
        email_provedor="resend", email_remetente="a@exemplo.com", firebase_conta_de_servico="x", resend_api_key="re_x"
    )
    assert "re_x" not in repr(config)


# --- Códigos do Firebase (conta de serviço) --------------------------------------


@pytest.fixture(scope="module")
def chave_da_conta_de_servico():
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


@pytest.fixture
def json_da_conta_de_servico(chave_da_conta_de_servico):
    pem = chave_da_conta_de_servico.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    ).decode("ascii")
    return json.dumps(
        {
            "type": "service_account",
            "project_id": PROJETO_DE_TESTE,
            "private_key": pem,
            "client_email": f"emails@{PROJETO_DE_TESTE}.iam.gserviceaccount.com",
            "token_uri": URL_DO_TOKEN,
        }
    )


def test_credencial_lida_do_arquivo_e_do_proprio_json(tmp_path, json_da_conta_de_servico):
    arquivo = tmp_path / "conta.json"
    arquivo.write_text(json_da_conta_de_servico, encoding="utf-8")
    for valor in (str(arquivo), json_da_conta_de_servico):
        credencial = ler_credencial(valor)
        assert credencial.projeto == PROJETO_DE_TESTE
        # A chave privada nunca aparece no repr (logs, mensagens de erro).
        assert "PRIVATE KEY" not in repr(credencial)


@pytest.mark.parametrize("valor", ["nao-existe.json", '{"type": "authorized_user"}', "{quebrado"])
def test_credencial_invalida_e_recusada(valor):
    with pytest.raises(ValueError, match="FIREBASE_CONTA_DE_SERVICO"):
        ler_credencial(valor)


class GoogleFalso:
    """Faz o papel do servidor de tokens e do Identity Toolkit."""

    def __init__(self, chave_publica, sem_conta=(), erro=None):
        self.chave_publica = chave_publica
        self.sem_conta = set(sem_conta)
        self.erro = erro
        self.pedidos_de_token = 0
        self.pedidos_de_codigo = []

    def __call__(self, requisicao, timeout):
        if requisicao.full_url == URL_DO_TOKEN:
            self.pedidos_de_token += 1
            campos = parse_qs(requisicao.data.decode("ascii"))
            assert campos["grant_type"] == ["urn:ietf:params:oauth:grant-type:jwt-bearer"]
            # A assinatura é conferida; o horário não, porque um teste adianta o relógio.
            declaracao = jwt.decode(
                campos["assertion"][0],
                self.chave_publica,
                algorithms=["RS256"],
                audience=URL_DO_TOKEN,
                options={"verify_exp": False, "verify_iat": False},
            )
            assert declaracao["iss"].startswith("emails@")
            assert declaracao["exp"] - declaracao["iat"] == 3600
            return RespostaFalsa(b'{"access_token": "token-do-google", "expires_in": 3600}')

        assert requisicao.full_url.endswith(f"/projects/{PROJETO_DE_TESTE}/accounts:sendOobCode")
        assert requisicao.get_header("Authorization") == "Bearer token-do-google"
        corpo = json.loads(requisicao.data)
        self.pedidos_de_codigo.append(corpo)
        if self.erro:
            raise HTTPError(requisicao.full_url, 400, "Bad", {}, io.BytesIO(json.dumps(self.erro).encode()))
        if corpo["email"] in self.sem_conta:
            erro = {"error": {"message": "EMAIL_NOT_FOUND"}}
            raise HTTPError(requisicao.full_url, 400, "Bad", {}, io.BytesIO(json.dumps(erro).encode()))
        # Como o Google: só o link, com o código na consulta.
        return RespostaFalsa(
            json.dumps({"oobLink": f"https://{PROJETO_DE_TESTE}.firebaseapp.com/__/auth/action?mode=x&oobCode=COD-1"}).encode()
        )


@pytest.fixture
def google(chave_da_conta_de_servico):
    return GoogleFalso(chave_da_conta_de_servico.public_key())


@pytest.fixture
def gerador(json_da_conta_de_servico, google):
    return GeradorDeLinks(ler_credencial(json_da_conta_de_servico), abrir=google)


def test_codigo_pedido_sem_o_firebase_mandar_email(gerador, google):
    assert gerador.codigo("VERIFY_EMAIL", "ana@exemplo.com") == "COD-1"
    assert google.pedidos_de_codigo == [{"requestType": "VERIFY_EMAIL", "email": "ana@exemplo.com", "returnOobLink": True}]


def test_token_de_acesso_e_reaproveitado_ate_vencer(gerador, google):
    gerador.codigo("VERIFY_EMAIL", "ana@exemplo.com")
    gerador.codigo("PASSWORD_RESET", "ana@exemplo.com")
    assert google.pedidos_de_token == 1


def test_token_vencido_e_pedido_de_novo(json_da_conta_de_servico, google):
    agora = [time.time()]
    gerador = GeradorDeLinks(ler_credencial(json_da_conta_de_servico), abrir=google, relogio=lambda: agora[0])
    gerador.codigo("VERIFY_EMAIL", "ana@exemplo.com")
    # Faltando menos de um minuto para vencer, o token é trocado.
    agora[0] += 3600 - 30
    gerador.codigo("VERIFY_EMAIL", "ana@exemplo.com")
    assert google.pedidos_de_token == 2


def test_email_sem_conta_devolve_none(json_da_conta_de_servico, chave_da_conta_de_servico):
    google = GoogleFalso(chave_da_conta_de_servico.public_key(), sem_conta={"ninguem@exemplo.com"})
    gerador = GeradorDeLinks(ler_credencial(json_da_conta_de_servico), abrir=google)
    assert gerador.codigo("PASSWORD_RESET", "ninguem@exemplo.com") is None


def test_outro_erro_do_google_vira_falha_so_com_o_codigo(json_da_conta_de_servico, chave_da_conta_de_servico):
    erro = {"error": {"message": "TOO_MANY_ATTEMPTS_TRY_LATER : ana@exemplo.com"}}
    google = GoogleFalso(chave_da_conta_de_servico.public_key(), erro=erro)
    gerador = GeradorDeLinks(ler_credencial(json_da_conta_de_servico), abrir=google)
    with pytest.raises(FalhaNoFirebase) as falha:
        gerador.codigo("VERIFY_EMAIL", "ana@exemplo.com")
    assert falha.value.codigo == "TOO_MANY_ATTEMPTS_TRY_LATER"
    assert "ana@exemplo.com" not in str(falha.value)


def test_correio_monta_o_link_da_area_do_cliente_com_o_codigo_no_fragmento(gerador, tmp_path):
    correio = CorreioDaConta(EnviadorEmPasta(tmp_path), gerador, "https://app.exemplo.com/")
    correio.confirmar_email("ana@exemplo.com")
    correio.nova_senha("ana@exemplo.com")
    textos = " ".join(arquivo.read_text(encoding="utf-8") for arquivo in tmp_path.glob("*.txt"))
    assert "https://app.exemplo.com/auth/verificar-email#oobCode=COD-1" in textos
    assert "https://app.exemplo.com/auth/redefinir-senha#oobCode=COD-1" in textos
    # O monograma sai do mesmo endereço dos links (APP_URL).
    paginas = " ".join(arquivo.read_text(encoding="utf-8") for arquivo in tmp_path.glob("*.html"))
    assert paginas.count('src="https://app.exemplo.com/email/olifine-monograma.png"') == 2


def test_criar_correio_recusa_conta_de_servico_de_outro_projeto(json_da_conta_de_servico, tmp_path):
    config = configuracao(
        email_provedor="pasta",
        email_remetente="a@exemplo.com",
        email_pasta=str(tmp_path),
        firebase_conta_de_servico=json_da_conta_de_servico,
        firebase_project_id="outro-projeto",
    )
    with pytest.raises(ValueError, match="outro projeto"):
        criar_correio(config)


def test_criar_correio_desligado_sem_provedor():
    assert criar_correio(configuracao()) is None
