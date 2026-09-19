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
  'auth/email-already-in-use': 'Este e-mail já está cadastrado. Faça login.',
  'auth/weak-password': 'Senha fraca: use pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com o Firebase. Verifique a internet.',
  'permission-denied': 'O banco de dados recusou a operação (regras do Firestore).',
  unavailable: 'Banco de dados indisponível no momento. Tente de novo.',
};

export const MENSAGEM_ERRO_GENERICO = 'Não foi possível concluir a operação. Tente novamente.';

// Código desconhecido cai na mensagem genérica: o texto técnico do erro
// não vai para a tela.
export function mensagemDeErro(codigo) {
  return MENSAGENS[codigo] ?? MENSAGEM_ERRO_GENERICO;
}
