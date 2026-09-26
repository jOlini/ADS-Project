import { describe, expect, it } from 'vitest';
import { leituraDaVariacao, textoDaVariacao, variacaoPercentual } from './tendencia';

describe('variacaoPercentual', () => {
  it('calcula a variação arredondada em relação ao mês anterior', () => {
    expect(variacaoPercentual(636000, 558000)).toBe(14);
    expect(variacaoPercentual(184000, 200000)).toBe(-8);
  });

  it('usa o valor absoluto da base quando ela é negativa', () => {
    // Saldo que saiu de −R$ 100 para R$ 50: melhorou 150%.
    expect(variacaoPercentual(5000, -10000)).toBe(150);
  });

  it('devolve null sem base de comparação', () => {
    expect(variacaoPercentual(1000, 0)).toBeNull();
    expect(variacaoPercentual(1000, undefined)).toBeNull();
  });
});

describe('leituraDaVariacao', () => {
  it('receita e saldo maiores são bons', () => {
    expect(leituraDaVariacao(12)).toBe('bom');
    expect(leituraDaVariacao(-3)).toBe('ruim');
  });

  it('despesa menor é boa', () => {
    expect(leituraDaVariacao(-8, { maiorEhMelhor: false })).toBe('bom');
    expect(leituraDaVariacao(5, { maiorEhMelhor: false })).toBe('ruim');
  });

  it('zero é estável e sem variação não há leitura', () => {
    expect(leituraDaVariacao(0)).toBe('estavel');
    expect(leituraDaVariacao(null)).toBeNull();
  });
});

describe('textoDaVariacao', () => {
  it('escreve o sinal na frente', () => {
    expect(textoDaVariacao(12)).toBe('+12%');
    expect(textoDaVariacao(-8)).toBe('−8%');
    expect(textoDaVariacao(0)).toBe('0%');
  });
});
