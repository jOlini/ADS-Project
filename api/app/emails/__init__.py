"""E-mails da conta do cliente final, mandados pela API com a marca OliFine.

Antes, o Firebase mandava a confirmação e a nova senha com o modelo e o
remetente dele (noreply@<projeto>.firebaseapp.com), que caem no spam com
frequência e levam a uma página genérica do Google. Agora:

1. a API pede ao Firebase só o código da ação (links.py, com a conta de
   serviço), sem que ele mande nada;
2. monta o e-mail com o modelo da OliFine (mensagens.py e modelo.html);
3. manda pelo provedor configurado (envio.py): Resend, qualquer SMTP ou, no
   desenvolvimento, arquivos numa pasta;
4. o link leva a uma página da própria área do cliente (/auth/...), que
   aplica o código com o SDK do Firebase no navegador.

Com EMAIL_PROVEDOR vazio, as rotas /conta respondem 503 e a área do cliente
volta a usar o envio do próprio Firebase: nada quebra sem provedor.
"""
