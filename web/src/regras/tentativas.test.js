import { describe, expect, it } from 'vitest';
import {
  chaveDoEmail,
  comFalha,
  contaComoTentativa,
  JANELA_EM_MINUTOS,
  MAXIMO_DE_TENTATIVAS,
  situacaoDoLogin,
  textoDasTentativas,
  textoDoBloqueio,
} from './tentativas';

const MINUTO = 60 * 1000;
const INICIO = Date.UTC(2026, 8, 26, 12, 0, 0);

function errar(vezes, { de = INICIO, passo = MINUTO } = {}) {
  let falhas = [];
  for (let vez = 0; vez < vezes; vez += 1) {
    falhas = comFalha(falhas, de + vez * passo);
  }
  return falhas;
}

describe('situacaoDoLogin', () => {
  it('conta as tentativas que restam a cada senha errada', () => {
    const restantes = [1, 2, 3, 4].map((vezes) => situacaoDoLogin(errar(vezes), INICIO + 5 * MINUTO).restantes);

    expect(situacaoDoLogin([], INICIO).restantes).toBe(MAXIMO_DE_TENTATIVAS);
    expect(restantes).toEqual([4, 3, 2, 1]);
  });

  it('bloqueia na quinta senha errada e diz quando libera', () => {
    const situacao = situacaoDoLogin(errar(5), INICIO + 5 * MINUTO);

    expect(situacao.restantes).toBe(0);
    // Libera quando a primeira falha sai da janela de 15 minutos.
    expect(situacao.liberaEm).toBe(INICIO + JANELA_EM_MINUTOS * MINUTO);
  });

  it('libera sozinho quando a janela passa', () => {
    const falhas = errar(5);

    expect(situacaoDoLogin(falhas, INICIO + 15 * MINUTO)).toEqual({ restantes: 1, liberaEm: null });
    expect(situacaoDoLogin(falhas, INICIO + 16 * MINUTO)).toEqual({ restantes: 2, liberaEm: null });
    expect(situacaoDoLogin(falhas, INICIO + 60 * MINUTO)).toEqual({ restantes: 5, liberaEm: null });
  });

  it('ignora lixo gravado no navegador', () => {
    expect(situacaoDoLogin(['x', null, Number.NaN, INICIO + 99 * MINUTO], INICIO).restantes).toBe(5);
    expect(situacaoDoLogin('estragado', INICIO).restantes).toBe(5);
  });
});

describe('o que conta como tentativa', () => {
  it('conta só a credencial recusada, igual para e-mail com e sem conta', () => {
    expect(contaComoTentativa('auth/invalid-credential')).toBe(true);
    expect(contaComoTentativa('auth/user-not-found')).toBe(true);
    expect(contaComoTentativa('auth/wrong-password')).toBe(true);
  });

  it('não gasta tentativa com rede fora ou erro do Firebase', () => {
    expect(contaComoTentativa('auth/network-request-failed')).toBe(false);
    expect(contaComoTentativa('auth/too-many-requests')).toBe(false);
    expect(contaComoTentativa(undefined)).toBe(false);
  });
});

describe('textos', () => {
  it('avisa quantas tentativas restam, no singular e no plural', () => {
    expect(textoDasTentativas(3)).toBe('Restam 3 tentativas antes de o acesso ser bloqueado por 15 minutos.');
    expect(textoDasTentativas(1)).toBe('Resta 1 tentativa antes de o acesso ser bloqueado por 15 minutos.');
    expect(textoDasTentativas(0)).toBe('');
  });

  it('diz em quantos minutos o bloqueio acaba, arredondando para cima', () => {
    expect(textoDoBloqueio(INICIO + 14.2 * MINUTO, INICIO)).toMatch(/bloqueado por 15 minutos\.$/);
    expect(textoDoBloqueio(INICIO + 20 * 1000, INICIO)).toMatch(/bloqueado por 1 minuto\.$/);
  });
});

describe('chaveDoEmail', () => {
  it('é a mesma para o e-mail com maiúsculas e espaços', () => {
    expect(chaveDoEmail(' Ana@Exemplo.com ')).toBe(chaveDoEmail('ana@exemplo.com'));
  });

  it('não guarda o e-mail em texto e separa e-mails diferentes', () => {
    const chave = chaveDoEmail('ana@exemplo.com');

    expect(chave).toMatch(/^[0-9a-f]{8}$/);
    expect(chave).not.toContain('ana');
    expect(chaveDoEmail('bruno@exemplo.com')).not.toBe(chave);
  });
});
