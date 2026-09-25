// Testes da navegação pelo teclado nas listas de opções.
import { describe, expect, it } from 'vitest';
import { opcaoPorDigitacao, primeiraHabilitada, proximaHabilitada, ultimaHabilitada } from './seletor';

const OPCOES = [
  { rotulo: 'Escolha a conta', desabilitada: true },
  { rotulo: 'Carteira' },
  { rotulo: 'Conta corrente' },
  { rotulo: 'Cofrinho', desabilitada: true },
  { rotulo: 'Poupança' },
  { rotulo: 'Ações' },
];

describe('proximaHabilitada', () => {
  it('anda uma posição pulando as desabilitadas', () => {
    expect(proximaHabilitada(OPCOES, 2, 1)).toBe(4);
    expect(proximaHabilitada(OPCOES, 4, -1)).toBe(2);
  });

  it('para nas pontas, sem dar a volta', () => {
    expect(proximaHabilitada(OPCOES, 5, 1)).toBe(5);
    expect(proximaHabilitada(OPCOES, 1, -1)).toBe(1);
    expect(proximaHabilitada(OPCOES, 1, -10)).toBe(1);
    expect(proximaHabilitada(OPCOES, 1, 10)).toBe(5);
  });

  it('acha a primeira e a última habilitadas', () => {
    expect(primeiraHabilitada(OPCOES)).toBe(1);
    expect(ultimaHabilitada(OPCOES)).toBe(5);
  });

  it('devolve -1 sem opção possível', () => {
    expect(proximaHabilitada([], -1, 1)).toBe(-1);
    expect(primeiraHabilitada([{ rotulo: 'x', desabilitada: true }])).toBe(-1);
  });
});

describe('opcaoPorDigitacao', () => {
  it('acha pelo começo do rótulo, sem acento nem caixa', () => {
    expect(opcaoPorDigitacao(OPCOES, 'acoe', -1)).toBe(5);
    expect(opcaoPorDigitacao(OPCOES, 'POUP', 0)).toBe(4);
  });

  it('a mesma letra repetida anda entre as opções com aquela inicial', () => {
    expect(opcaoPorDigitacao(OPCOES, 'c', -1)).toBe(1);
    expect(opcaoPorDigitacao(OPCOES, 'cc', 1)).toBe(2);
    // Cofrinho está desabilitado: volta para Carteira.
    expect(opcaoPorDigitacao(OPCOES, 'ccc', 2)).toBe(1);
  });

  it('com várias letras, fica na opção atual se ela ainda casa', () => {
    expect(opcaoPorDigitacao(OPCOES, 'con', 2)).toBe(2);
  });

  it('devolve -1 quando nada casa', () => {
    expect(opcaoPorDigitacao(OPCOES, 'z', 1)).toBe(-1);
    expect(opcaoPorDigitacao(OPCOES, ' ', 1)).toBe(-1);
  });
});
