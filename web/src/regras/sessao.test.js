// Testes da decisão da área logada: a barra lateral só pode aparecer com a
// sessão confirmada. Funções puras, sem Firebase e sem navegador.
import { describe, expect, it } from 'vitest';
import { emailConfirmado, situacaoDaArea } from './sessao';

// Conta fictícia: nenhum dado pessoal real entra no repositório público.
const USUARIO = { uid: 'uid-de-teste', email: 'cliente@exemplo.com', emailVerified: true };
const PERFIL_CARREGANDO = { carregando: true, dados: null, erro: '' };
const PERFIL_LIDO = { carregando: false, dados: { nome: 'Ana', sobrenome: 'Souza' }, erro: '' };

describe('situacaoDaArea', () => {
  it('avisa quando o Firebase não está configurado, com ou sem sessão', () => {
    expect(situacaoDaArea({ firebaseConfigurado: false, usuario: null, pessoa: PERFIL_CARREGANDO })).toBe('sem-firebase');
    expect(situacaoDaArea({ firebaseConfigurado: false, usuario: USUARIO, confirmado: true, pessoa: PERFIL_LIDO })).toBe('sem-firebase');
  });

  it('espera enquanto o Firebase ainda não disse se há sessão (app recém-aberto)', () => {
    expect(situacaoDaArea({ firebaseConfigurado: true, usuario: undefined, pessoa: PERFIL_CARREGANDO })).toBe('verificando');
  });

  it('espera o perfil do Firestore antes de liberar a área de uma sessão restaurada', () => {
    expect(situacaoDaArea({ firebaseConfigurado: true, usuario: USUARIO, confirmado: true, pessoa: PERFIL_CARREGANDO })).toBe('verificando');
  });

  it('manda para o login quando não há sessão', () => {
    expect(situacaoDaArea({ firebaseConfigurado: true, usuario: null, pessoa: PERFIL_CARREGANDO })).toBe('sem-sessao');
  });

  it('libera a área com a sessão confirmada e o perfil lido', () => {
    expect(situacaoDaArea({ firebaseConfigurado: true, usuario: USUARIO, confirmado: true, pessoa: PERFIL_LIDO })).toBe('liberada');
  });

  it('libera a área mesmo se a leitura do perfil falhou: a Principal mostra o erro', () => {
    const perfilComErro = { carregando: false, dados: null, erro: 'Banco de dados indisponível no momento. Tente de novo.' };
    expect(situacaoDaArea({ firebaseConfigurado: true, usuario: USUARIO, confirmado: true, pessoa: perfilComErro })).toBe('liberada');
  });

  it('segura a conta sem e-mail confirmado antes de ler o perfil', () => {
    expect(situacaoDaArea({ firebaseConfigurado: true, usuario: USUARIO, confirmado: false, pessoa: PERFIL_CARREGANDO })).toBe(
      'sem-confirmacao',
    );
    expect(situacaoDaArea({ firebaseConfigurado: true, usuario: USUARIO, confirmado: false, pessoa: PERFIL_LIDO })).toBe(
      'sem-confirmacao',
    );
  });
});

describe('emailConfirmado', () => {
  it('só aceita emailVerified igual a true', () => {
    expect(emailConfirmado(USUARIO)).toBe(true);
    expect(emailConfirmado({ ...USUARIO, emailVerified: false })).toBe(false);
    expect(emailConfirmado({ uid: 'uid-de-teste' })).toBe(false);
    expect(emailConfirmado(null)).toBe(false);
  });
});
