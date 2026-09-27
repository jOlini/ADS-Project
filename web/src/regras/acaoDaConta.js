// Links dos e-mails da conta (confirmar o e-mail, criar senha nova): de onde
// vem o código, para qual página ele vai e o que dizer quando não vale mais.
//
// Os e-mails mandados pela API trazem o código depois do "#"
// (/auth/verificar-email#oobCode=...): o fragmento não sai do navegador, então
// não fica no log do servidor que entrega a página. Os e-mails do próprio
// Firebase, com a "URL de ação personalizada" do Console apontando para
// /auth/acao, trazem na consulta (?mode=verifyEmail&oobCode=...).
import { TAMANHO_MINIMO_SENHA } from './cadastro';

export const PAGINAS_DA_ACAO = {
  verifyEmail: '/auth/verificar-email',
  resetPassword: '/auth/redefinir-senha',
};

// Código do link: primeiro o do fragmento, depois o da consulta. '' = sem código.
export function lerCodigo(fragmento = '', consulta = '') {
  const doFragmento = new URLSearchParams(fragmento.replace(/^#/, '')).get('oobCode');
  const daConsulta = new URLSearchParams(consulta).get('oobCode');
  return (doFragmento || daConsulta || '').trim();
}

// Página que trata o "mode" do Firebase, ou null (modo que o app não trata,
// como recoverEmail e verifyAndChangeEmail).
export function paginaDaAcao(modo) {
  return Object.hasOwn(PAGINAS_DA_ACAO, modo ?? '') ? PAGINAS_DA_ACAO[modo] : null;
}

// Erro do Firebase ao aplicar o código, na linguagem da tela.
export function motivoDaFalha(codigo) {
  if (codigo === 'auth/expired-action-code') {
    return 'vencido';
  }
  if (codigo === 'auth/invalid-action-code' || codigo === 'auth/user-not-found' || codigo === 'auth/user-disabled') {
    return 'invalido';
  }
  if (codigo === 'auth/network-request-failed') {
    return 'sem-rede';
  }
  return 'desconhecido';
}

// Mesmo formato do cadastro: { campo: mensagem } só com os campos inválidos.
export function validarSenhaNova({ senha, repeticao }) {
  const erros = {};
  if (!senha) {
    erros.senha = 'Informe a senha nova.';
  } else if (senha.length < TAMANHO_MINIMO_SENHA) {
    erros.senha = `A senha precisa de pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
  }
  if (!repeticao) {
    erros.repeticao = 'Repita a senha nova.';
  } else if (senha && repeticao !== senha) {
    erros.repeticao = 'As duas senhas não são iguais.';
  }
  return erros;
}
