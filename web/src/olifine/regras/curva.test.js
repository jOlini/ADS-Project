import { describe, expect, it } from 'vitest';
import { caminhoSuave, valorCurto } from './curva';

describe('caminhoSuave', () => {
  it('começa no primeiro ponto e termina no último', () => {
    const caminho = caminhoSuave([
      { x: 0, y: 10 },
      { x: 10, y: 0 },
      { x: 20, y: 5 },
    ]);
    expect(caminho.startsWith('M0 10')).toBe(true);
    expect(caminho.endsWith('20 5')).toBe(true);
  });

  it('série plana continua plana (sem ondinha inventada)', () => {
    const caminho = caminhoSuave([
      { x: 0, y: 5 },
      { x: 10, y: 5 },
      { x: 20, y: 5 },
    ]);
    expect(caminho).toBe('M0 5C3.33 5 6.67 5 10 5C13.33 5 16.67 5 20 5');
  });

  it('trata um ponto só e nenhum ponto', () => {
    expect(caminhoSuave([{ x: 3, y: 4 }])).toBe('M3 4');
    expect(caminhoSuave([])).toBe('');
  });
});

describe('valorCurto', () => {
  it('abrevia milhar e milhão', () => {
    expect(valorCurto(452000)).toBe('R$ 4,5 mil');
    expect(valorCurto(3527035)).toBe('R$ 35 mil');
    expect(valorCurto(120000000)).toBe('R$ 1,2 mi');
    expect(valorCurto(-250000)).toBe('−R$ 2,5 mil');
    expect(valorCurto(9900)).toBe('R$ 99');
  });
});
