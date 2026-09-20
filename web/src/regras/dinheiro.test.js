// Testes da formatação de dinheiro: função pura, sem navegador.
import { describe, expect, it } from 'vitest';
import { formatarBRL, formatarComSinal } from './dinheiro';

describe('formatarBRL', () => {
  it('usa o padrão brasileiro, com ponto no milhar e vírgula nos centavos', () => {
    expect(formatarBRL(8742.35)).toBe('R$ 8.742,35');
  });

  it('completa as casas decimais', () => {
    expect(formatarBRL(120)).toBe('R$ 120,00');
  });

  it('marca o valor negativo com o sinal de menos antes do símbolo', () => {
    expect(formatarBRL(-214.37)).toBe('− R$ 214,37');
  });

  it('formata zero sem sinal', () => {
    expect(formatarBRL(0)).toBe('R$ 0,00');
  });
});

describe('formatarComSinal', () => {
  it('mostra o mais na entrada', () => {
    expect(formatarComSinal(550)).toBe('+ R$ 550,00');
  });

  it('mostra o menos na saída', () => {
    expect(formatarComSinal(-58.9)).toBe('− R$ 58,90');
  });

  it('não põe sinal em zero', () => {
    expect(formatarComSinal(0)).toBe('R$ 0,00');
  });
});
