"""Textos dos e-mails da conta, montados sobre o modelo.html.

Cada função devolve assunto, HTML e texto puro (o texto puro vai junto: é o
que leitores de tela e programas sem HTML mostram, e a falta dele pesa contra
nos filtros de spam). Tudo que vem de fora (link, key) passa por
html.escape antes de entrar no HTML.

Nenhum texto leva dado escolhido por quem pediu o e-mail (nome, mensagem):
qualquer um cria uma conta com o e-mail de outra pessoa, e um campo livre
viraria um jeito de mandar texto de phishing com o remetente da OliFine.

app_url é o endereço da área do cliente (APP_URL): de lá vem o monograma, e o
rodapé o mostra como endereço oficial, para quem recebe conferir o domínio
antes de digitar a senha. Vale para o GitHub Pages e para um domínio próprio.
"""

import re
from dataclasses import dataclass
from html import escape
from pathlib import Path
from string import Template

MODELO = Template((Path(__file__).parent / "modelo.html").read_text(encoding="utf-8"))

SLOGAN = "Finanças que fazem sentido"
# Publicado com o front-end (web/public/email): APP_URL + este caminho.
CAMINHO_DO_MONOGRAMA = "/email/olifine-monograma.png"
RODAPE = "E-mail automático da OliFine. A OliFine nunca pede a sua senha por e-mail, mensagem ou telefone."

FONTE = "Geist,'Segoe UI',-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif"
ESTILO_DO_PARAGRAFO = f"margin:0 0 14px;font-family:{FONTE};font-size:16px;line-height:1.6;color:#1A2430;"
ESTILO_DO_QUADRADO = "width:48px;height:48px;border-radius:12px;background:#FFFFFF;vertical-align:middle;"
# Letras e números sem os que se confundem ao ditar (I, O, 0, 1), em grupos.
FORMATO_DA_KEY = re.compile(r"^[A-Z]{2,4}(?:-[A-HJ-NP-Z2-9]{4}){3,4}$")


@dataclass(frozen=True)
class Mensagem:
    assunto: str
    html: str
    texto: str


def _paragrafos(*textos: str) -> str:
    return "\n".join(f'            <p class="texto" style="{ESTILO_DO_PARAGRAFO}">{escape(t)}</p>' for t in textos)


def _marca(app_url: str) -> str:
    """Quadrado branco do monograma, na faixa verde. Sem o endereço do app
    (prévia, teste de envio), o "OF" em texto ocupa o mesmo lugar."""
    if not app_url:
        return (
            f'                <td width="48" height="48" align="center" bgcolor="#FFFFFF" style="{ESTILO_DO_QUADRADO}'
            f'font-family:{FONTE};font-size:18px;font-weight:800;letter-spacing:-0.5px;color:#065F46;">OF</td>'
        )
    imagem = escape(f"{app_url}{CAMINHO_DO_MONOGRAMA}", quote=True)
    # O alt com estilo é o que o Outlook mostra com as imagens bloqueadas.
    return (
        f'                <td width="48" bgcolor="#FFFFFF" style="{ESTILO_DO_QUADRADO}"><img src="{imagem}" width="48" '
        f'height="48" alt="OF" style="display:block;width:48px;height:48px;border:0;border-radius:12px;'
        f'font-family:{FONTE};font-size:18px;line-height:48px;font-weight:800;color:#065F46;text-align:center;"></td>'
    )


def _montar(
    assunto, previa, titulo, paragrafos, rotulo, link, aviso, app_url="", conteudo_extra="", texto_extra=""
) -> Mensagem:
    for endereco in (link, app_url or "https://"):
        if not endereco.startswith(("https://", "http://")):
            raise ValueError("Os endereços do e-mail precisam ser http(s) completos.")
    app_url = app_url.rstrip("/")
    # jolini.github.io/ADS-Project ou app.<domínio>: o endereço sem o https://.
    oficial = app_url.split("://", 1)[1] if app_url else ""
    conteudo = _paragrafos(*paragrafos) + conteudo_extra
    html = MODELO.substitute(
        titulo=escape(titulo),
        previa=escape(previa),
        marca=_marca(app_url),
        conteudo=conteudo,
        rotulo=escape(rotulo),
        link=escape(link, quote=True),
        aviso=escape(aviso),
        endereco_oficial=f"<br>Endereço oficial: {escape(oficial)}" if oficial else "",
    )
    texto = "\n\n".join([titulo, *paragrafos, *([texto_extra] if texto_extra else []), f"{rotulo}: {link}", aviso])
    texto += f"\n\n--\nOliFine · {SLOGAN}\n"
    if oficial:
        texto += f"Endereço oficial: {oficial}\n"
    texto += f"{RODAPE}\n"
    return Mensagem(assunto=assunto, html=html, texto=texto)


def mensagem_de_confirmacao(link: str, app_url: str = "") -> Mensagem:
    """Boas-vindas e confirmação do e-mail (cadastro e "Reenviar o link")."""
    return _montar(
        assunto="Confirme o seu e-mail na OliFine",
        previa="Falta um clique para liberar a sua conta.",
        titulo="Boas-vindas à OliFine",
        paragrafos=[
            "Sua conta foi criada. Para liberar o acesso, confirme que este e-mail é seu.",
            "Depois, entre com seu e-mail e senha e comece pelas suas contas: quanto entra, quanto sai e quanto "
            "sobra, em um lugar só.",
        ],
        rotulo="Confirmar meu e-mail",
        link=link,
        aviso="Não criou uma conta na OliFine? Ignore este e-mail: sem a confirmação, ninguém usa o seu endereço.",
        app_url=app_url,
    )


def mensagem_de_nova_senha(link: str, app_url: str = "") -> Mensagem:
    """Redefinição de senha ("Esqueci minha senha")."""
    return _montar(
        assunto="Redefina a sua senha da OliFine",
        previa="Pedido de senha nova para a sua conta.",
        titulo="Vamos criar uma senha nova",
        paragrafos=[
            "Recebemos um pedido para redefinir a senha da conta ligada a este e-mail.",
            "O link vale por tempo limitado e só uma vez. Se ele vencer, é só pedir outro na tela de entrada.",
        ],
        rotulo="Criar senha nova",
        link=link,
        aviso="Não pediu? Ignore este e-mail: a sua senha atual continua valendo.",
        app_url=app_url,
    )


def mensagem_da_key(key: str, link: str, app_url: str = "") -> Mensagem:
    """Entrega de uma key de acesso (libera o primeiro acesso de uma conta)."""
    if not FORMATO_DA_KEY.match(key):
        raise ValueError("Key fora do formato.")
    caixa = (
        f'\n            <p class="caixa" style="margin:22px 0 6px;padding:18px 20px;border:1px solid #A7F3D0;'
        f"border-radius:12px;background:#ECFDF5;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,"
        f'monospace;font-size:22px;line-height:1.2;font-weight:700;letter-spacing:2px;color:#065F46;'
        f'text-align:center;">{escape(key)}</p>'
    )
    return _montar(
        assunto="Sua key de acesso à OliFine",
        previa="Guarde esta key: ela libera a sua conta.",
        titulo="Sua key de acesso chegou",
        paragrafos=[
            "Use a key abaixo no primeiro acesso para liberar a sua conta. Ela vale para uma conta só.",
        ],
        rotulo="Ativar minha conta",
        link=link,
        aviso="Não esperava esta key? Não a repasse a ninguém; basta ignorar este e-mail.",
        app_url=app_url,
        conteudo_extra=caixa,
        texto_extra=f"Sua key: {key}",
    )
