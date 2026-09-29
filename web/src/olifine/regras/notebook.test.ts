// Testes do notebook preso na rolagem: progresso da pista, abertura da tampa
// (só completa antes de a pista acabar) e o ângulo.
import { describe, expect, it } from 'vitest';
import { ABERTO, aberturaDaTampa, anguloDaTampa, FIM_DA_ABERTURA, progressoDaPista, TAMPA_FECHADA } from './notebook';

describe('progressoDaPista', () => {
  it('vai de 0, com a pista chegando ao topo, a 1, no fim da trava', () => {
    // Pista de 2.000 px numa tela de 800: 1.200 px de trava.
    expect(progressoDaPista(300, 2000, 800)).toBe(0);
    expect(progressoDaPista(0, 2000, 800)).toBe(0);
    expect(progressoDaPista(-600, 2000, 800)).toBe(0.5);
    expect(progressoDaPista(-1200, 2000, 800)).toBe(1);
    expect(progressoDaPista(-5000, 2000, 800)).toBe(1);
  });

  it('pista que cabe na tela (sem trava) conta como percorrida', () => {
    expect(progressoDaPista(0, 700, 800)).toBe(1);
    expect(progressoDaPista(0, 800, 800)).toBe(1);
    expect(progressoDaPista(0, Number.NaN, 800)).toBe(1);
  });
});

describe('aberturaDaTampa', () => {
  it('começa fechada e só cresce com a rolagem', () => {
    let anterior = -1;
    for (let passo = 0; passo <= 100; passo += 1) {
      const abertura = aberturaDaTampa(passo / 100);
      expect(abertura).toBeGreaterThanOrEqual(anterior);
      anterior = abertura;
    }
    expect(aberturaDaTampa(0)).toBe(0);
  });

  it('abre por completo antes de a pista acabar: a página só segue com a tampa aberta', () => {
    expect(aberturaDaTampa(FIM_DA_ABERTURA)).toBe(1);
    expect(aberturaDaTampa(1)).toBe(1);
    expect(aberturaDaTampa(FIM_DA_ABERTURA * 0.9)).toBeLessThan(ABERTO);
  });

  it('fica entre 0 e 1 mesmo com progresso fora da faixa', () => {
    expect(aberturaDaTampa(-3)).toBe(0);
    expect(aberturaDaTampa(7)).toBe(1);
  });
});

describe('anguloDaTampa', () => {
  it('fecha quase deitada e abre de pé', () => {
    expect(anguloDaTampa(0)).toBe(TAMPA_FECHADA);
    expect(anguloDaTampa(1)).toBe(0);
    expect(anguloDaTampa(0.5)).toBeCloseTo(TAMPA_FECHADA / 2);
    expect(Object.is(anguloDaTampa(1), -0)).toBe(false);
  });
});
