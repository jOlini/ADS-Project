"""Textos dos e-mails da conta, montados sobre o modelo.html.

Cada função devolve assunto, HTML e texto puro (o texto puro vai junto: é o
que leitores de tela e programas sem HTML mostram, e a falta dele pesa contra
nos filtros de spam). Tudo que vem de fora (link, key) passa por
html.escape antes de entrar no HTML.

Nenhum texto leva dado escolhido por quem pediu o e-mail (nome, mensagem):
qualquer um cria uma conta com o e-mail de outra pessoa, e um campo livre
viraria um jeito de mandar texto de phishing com o remetente da OliFine.
"""

import re
from dataclasses import dataclass
from html import escape
from pathlib import Path
from string import Template

MODELO = Template((Path(__file__).parent / "modelo.html").read_text(encoding="utf-8"))

FONTE = "Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
ESTILO_DO_PARAGRAFO = f"margin:0 0 14px;font-family:{FONTE};font-size:16px;line-height:1.6;color:#1A2430;"
# Letras e números sem os que se confundem ao ditar (I, O, 0, 1), em grupos.
FORMATO_DA_KEY = re.compile(r"^[A-Z]{2,4}(?:-[A-HJ-NP-Z2-9]{4}){3,4}$")


@dataclass(frozen=True)
class Mensagem:
    assunto: str
    html: str
    texto: str


def _paragrafos(*textos: str) -> str:
    return "\n".join(f'            <p class="texto" style="{ESTILO_DO_PARAGRAFO}">{escape(t)}</p>' for t in textos)


def _montar(assunto, previa, titulo, paragrafos, rotulo, link, aviso, conteudo_extra="", texto_extra="") -> Mensagem:
    if not link.startswith(("https://", "http://")):
        raise ValueError("O link do e-mail precisa ser um endereço http(s) completo.")
    conteudo = _paragrafos(*paragrafos) + conteudo_extra
    html = MODELO.substitute(
        titulo=escape(titulo),
        previa=escape(previa),
        conteudo=conteudo,
        rotulo=escape(rotulo),
        link=escape(link, quote=True),
        aviso=escape(aviso),
    )
    texto = "\n\n".join([titulo, *paragrafos, *([texto_extra] if texto_extra else []), f"{rotulo}: {link}", aviso])
    texto += "\n\n--\nE-mail automático da OliFine. A OliFine nunca pede a sua senha por e-mail, mensagem ou telefone.\n"
    return Mensagem(assunto=assunto, html=html, texto=texto)


def mensagem_de_confirmacao(link: str) -> Mensagem:
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
    )


def mensagem_de_nova_senha(link: str) -> Mensagem:
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
    )


def mensagem_da_key(key: str, link: str) -> Mensagem:
    """Entrega de uma key de acesso (libera o primeiro acesso de uma conta)."""
    if not FORMATO_DA_KEY.match(key):
        raise ValueError("Key fora do formato.")
    caixa = (
        f'\n            <p class="caixa" style="margin:22px 0 6px;padding:18px 20px;border:1px solid #CDEBDC;'
        f"border-radius:12px;background:#E2F7ED;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,"
        f'monospace;font-size:22px;line-height:1.2;font-weight:700;letter-spacing:2px;color:#205D44;'
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
        conteudo_extra=caixa,
        texto_extra=f"Sua key: {key}",
    )
