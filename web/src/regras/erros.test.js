import { describe, expect, it } from 'vitest';
import { MENSAGEM_ERRO_GENERICO, MENSAGEM_LOGIN_RECUSADO, mensagemDeErro } from './erros';

describe('mensagemDeErro', () => {
  it('informa na tela que o usuário não está cadastrado quando o login falha', () => {
    expect(MENSAGEM_LOGIN_RECUSADO).toMatch(/não cadastrado/);
    expect(mensagemDeErro('auth/invalid-credential')).toBe(MENSAGEM_LOGIN_RECUSADO);
  });

  it('usa a mesma mensagem para e-mail inexistente e senha errada', () => {
    // Enumeração de usuários: a tela não pode revelar qual dos dois falhou.
    expect(mensagemDeErro('auth/user-not-found')).toBe(mensagemDeErro('auth/wrong-password'));
  });

  it('avisa quando o e-mail do cadastro já tem conta', () => {
    expect(mensagemDeErro('auth/email-already-in-use')).toMatch(/já está cadastrado/);
  });

  it('não mostra o código técnico de um erro desconhecido', () => {
    expect(mensagemDeErro('auth/internal-error')).toBe(MENSAGEM_ERRO_GENERICO);
    expect(mensagemDeErro(undefined)).toBe(MENSAGEM_ERRO_GENERICO);
  });
});
