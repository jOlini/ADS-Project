// Testes do dinheiro em centavos: funções puras, sem navegador.
import { describe, expect, it } from 'vitest';
import { formatarBRL, formatarComSinal, lerValor } from './dinheiro';

describe('formatarBRL', () => {
  it('usa o padrão brasileiro, com ponto no milhar e vírgula nos centavos', () => {
    expect(formatarBRL(874235)).toBe('R$ 8.742,35');
  });

  it('completa as casas decimais', () => {
    expect(formatarBRL(12000)).toBe('R$ 120,00');
  });

  it('marca o valor negativo com o sinal de menos antes do símbolo', () => {
    expect(formatarBRL(-21437)).toBe('− R$ 214,37');
  });

  it('formata zero sem sinal', () => {
    expect(formatarBRL(0)).toBe('R$ 0,00');
  });
});

describe('formatarComSinal', () => {
  it('mostra o mais na entrada', () => {
    expect(formatarComSinal(55000)).toBe('+ R$ 550,00');
  });

  it('mostra o menos na saída', () => {
    expect(formatarComSinal(-5890)).toBe('− R$ 58,90');
  });

  it('não põe sinal em zero', () => {
    expect(formatarComSinal(0)).toBe('R$ 0,00');
  });
});

describe('lerValor', () => {
  it.each([
    ['214,37', 21437],
    ['1.234,56', 123456],
    ['1234,5', 123450],
    ['R$ 80', 8000],
    ['0,29', 29],
    ['10.5', 1050],
    ['1.500', 150000],
    [' 6800 ', 680000],
  ])('entende "%s" como %i centavos', (texto, centavos) => {
    expect(lerValor(texto)).toBe(centavos);
  });

  it.each(['', 'abc', '12,345', '1,2,3', '12.34.5', '1.23,45', ',', '-10'])('recusa "%s"', (texto) => {
    expect(lerValor(texto)).toBeNull();
  });

  it('aceita negativo só quando pedido (saldo inicial de conta no vermelho)', () => {
    expect(lerValor('-150,00', { permitirNegativo: true })).toBe(-15000);
    expect(lerValor('-150,00')).toBeNull();
  });

  it('recusa valor acima de R$ 1 bilhão', () => {
    expect(lerValor('1.000.000.000,00')).toBe(100_000_000_000);
    expect(lerValor('1.000.000.000,01')).toBeNull();
  });
});
