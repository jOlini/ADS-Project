// Tradução dos códigos de erro do Firebase para mensagens na tela.

// Exigida pelo enunciado de Tecnologias para Desenvolvimento Web: login
// recusado informa que o usuário não está cadastrado. A mesma frase cobre
// senha errada de propósito: dizer só "senha incorreta" confirmaria que o
// e-mail tem conta (enumeração de usuários, Sistemas Web Seguros). Com a
// proteção contra enumeração ligada, o próprio Firebase já devolve o mesmo
// código (auth/invalid-credential) para os dois casos.
export const MENSAGEM_LOGIN_RECUSADO = 'Usuário não cadastrado ou senha incorreta.';

const MENSAGENS = {
  'auth/invalid-credential': MENSAGEM_LOGIN_RECUSADO,
  'auth/user-not-found': MENSAGEM_LOGIN_RECUSADO,
  'auth/wrong-password': MENSAGEM_LOGIN_RECUSADO,
  'auth/invalid-email': 'E-mail inválido.',
  // Sem mensagem própria para 'auth/email-already-in-use': "este e-mail já
  // está cadastrado" revelaria quem tem conta. O cadastro trata esse código
  // como sucesso (mesma tela de "confirme o seu e-mail"); fora dele, cai na
  // mensagem genérica.
  'auth/weak-password': 'Senha fraca: use pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas seguidas. Por segurança, aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com o Firebase. Verifique a internet.',
  // Links dos e-mails (confirmação e senha nova) e limite de pedidos da API.
  'auth/expired-action-code': 'Este link venceu. Peça outro.',
  'auth/invalid-action-code': 'Este link não vale mais: ele já foi usado ou está incompleto.',
  'auth/password-does-not-meet-requirements': 'A senha não atende às regras de segurança. Use uma senha mais forte.',
  'olifine/muitos-pedidos': 'Muitos pedidos seguidos. Aguarde alguns minutos e tente de novo.',
  'permission-denied': 'O banco de dados recusou a operação (regras do Firestore).',
  unavailable: 'Banco de dados indisponível no momento. Tente de novo.',
};

export const MENSAGEM_ERRO_GENERICO = 'Não foi possível concluir a operação. Tente novamente.';

// Código desconhecido cai na mensagem genérica: o texto técnico do erro
// não vai para a tela.
export function mensagemDeErro(codigo) {
  return MENSAGENS[codigo] ?? MENSAGEM_ERRO_GENERICO;
}
