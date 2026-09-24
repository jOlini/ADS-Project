// Testes da decisão da área logada: a barra lateral só pode aparecer com a
// sessão confirmada. Funções puras, sem Firebase e sem navegador.
import { describe, expect, it } from 'vitest';
import { situacaoDaArea } from './sessao';

// Conta fictícia: nenhum dado pessoal real entra no repositório público.
const USUARIO = { uid: 'uid-de-teste', email: 'cliente@exemplo.com' };
const PERFIL_CARREGANDO = { carregando: true, dados: null, erro: '' };
const PERFIL_LIDO = { carregando: false, dados: { nome: 'Ana', sobrenome: 'Souza' }, erro: '' };

describe('situacaoDaArea', () => {
  it('avisa quando o Firebase não está configurado, com ou sem sessão', () => {
    expect(situacaoDaArea({ firebaseConfigurado: false, usuario: null, pessoa: PERFIL_CARREGANDO })).toBe('sem-firebase');
    expect(situacaoDaArea({ firebaseConfigurado: false, usuario: USUARIO, pessoa: PERFIL_LIDO })).toBe('sem-firebase');
  });

  it('espera enquanto o Firebase ainda não disse se há sessão (app recém-aberto)', () => {
    expect(situacaoDaArea({ firebaseConfigurado: true, usuario: undefined, pessoa: PERFIL_CARREGANDO })).toBe('verificando');
  });

  it('espera o perfil do Firestore antes de liberar a área de uma sessão restaurada', () => {
    expect(situacaoDaArea({ firebaseConfigurado: true, usuario: USUARIO, pessoa: PERFIL_CARREGANDO })).toBe('verificando');
  });

  it('manda para o login quando não há sessão', () => {
    expect(situacaoDaArea({ firebaseConfigurado: true, usuario: null, pessoa: PERFIL_CARREGANDO })).toBe('sem-sessao');
  });

  it('libera a área com a sessão confirmada e o perfil lido', () => {
    expect(situacaoDaArea({ firebaseConfigurado: true, usuario: USUARIO, pessoa: PERFIL_LIDO })).toBe('liberada');
  });

  it('libera a área mesmo se a leitura do perfil falhou: a Principal mostra o erro', () => {
    const perfilComErro = { carregando: false, dados: null, erro: 'Banco de dados indisponível no momento. Tente de novo.' };
    expect(situacaoDaArea({ firebaseConfigurado: true, usuario: USUARIO, pessoa: perfilComErro })).toBe('liberada');
  });
});
