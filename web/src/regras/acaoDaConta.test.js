import { describe, expect, it } from 'vitest';
import { lerCodigo, motivoDaFalha, paginaDaAcao, validarSenhaNova } from './acaoDaConta';

describe('lerCodigo', () => {
  it('lê o código do fragmento (e-mails da API)', () => {
    expect(lerCodigo('#oobCode=ABC-123', '')).toBe('ABC-123');
  });

  it('lê o código da consulta (e-mails do Firebase com a URL de ação do Console)', () => {
    expect(lerCodigo('', '?mode=verifyEmail&oobCode=XYZ&apiKey=chave&lang=pt-BR')).toBe('XYZ');
  });

  it('prefere o fragmento quando os dois existem', () => {
    expect(lerCodigo('#oobCode=DO-FRAGMENTO', '?oobCode=DA-CONSULTA')).toBe('DO-FRAGMENTO');
  });

  it('devolve vazio sem código', () => {
    expect(lerCodigo('', '')).toBe('');
    expect(lerCodigo('#outra=coisa', '?mode=verifyEmail')).toBe('');
  });

  it('desfaz a codificação de URL do código', () => {
    expect(lerCodigo('#oobCode=a%2Bb%3D', '')).toBe('a+b=');
  });
});

describe('paginaDaAcao', () => {
  it('manda cada modo do Firebase para a página própria', () => {
    expect(paginaDaAcao('verifyEmail')).toBe('/auth/verificar-email');
    expect(paginaDaAcao('resetPassword')).toBe('/auth/redefinir-senha');
  });

  it('não trata os outros modos nem nomes herdados de objeto', () => {
    expect(paginaDaAcao('recoverEmail')).toBeNull();
    expect(paginaDaAcao('toString')).toBeNull();
    expect(paginaDaAcao(null)).toBeNull();
  });
});

describe('motivoDaFalha', () => {
  it('separa link vencido, inválido e falta de rede', () => {
    expect(motivoDaFalha('auth/expired-action-code')).toBe('vencido');
    expect(motivoDaFalha('auth/invalid-action-code')).toBe('invalido');
    expect(motivoDaFalha('auth/user-disabled')).toBe('invalido');
    expect(motivoDaFalha('auth/network-request-failed')).toBe('sem-rede');
    expect(motivoDaFalha('auth/qualquer-outro')).toBe('desconhecido');
  });
});

describe('validarSenhaNova', () => {
  it('aceita duas senhas iguais com o tamanho mínimo', () => {
    expect(validarSenhaNova({ senha: 'segredo1', repeticao: 'segredo1' })).toEqual({});
  });

  it('pede os dois campos', () => {
    expect(validarSenhaNova({ senha: '', repeticao: '' })).toEqual({
      senha: 'Informe a senha nova.',
      repeticao: 'Repita a senha nova.',
    });
  });

  it('recusa senha curta e repetição diferente', () => {
    const erros = validarSenhaNova({ senha: '123', repeticao: '124' });
    expect(erros.senha).toMatch(/pelo menos 6/);
    expect(erros.repeticao).toBe('As duas senhas não são iguais.');
  });
});
