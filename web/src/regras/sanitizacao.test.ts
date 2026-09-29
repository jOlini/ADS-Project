// Testes da limpeza do texto livre antes de ir à API.
import { describe, expect, it } from 'vitest';
import { limparCorpo, limparDigitacao, limparTexto } from './sanitizacao';

// Caracteres invisíveis montados pelo código: escritos no arquivo, eles
// seriam justamente o problema que o teste confere.
const INVERTE = String.fromCodePoint(0x202e);
const LARGURA_ZERO = String.fromCodePoint(0x200b);
const NULO = String.fromCodePoint(0);
const IGUAL_LARGO = String.fromCodePoint(0xff1d);

describe('limparTexto', () => {
  it('tira os sinais de tag (XSS)', () => {
    expect(limparTexto('<script>alert(1)</script>Mercado')).toBe('scriptalert(1)/scriptMercado');
    expect(limparTexto('<img src=x onerror=alert(1)>')).toBe('img src=x onerror=alert(1)');
  });

  it('tira o começo de fórmula (CSV injection)', () => {
    expect(limparTexto('=HYPERLINK("http://mal.example")')).toBe('HYPERLINK("http://mal.example")');
    expect(limparTexto('+cmd|/c calc!A1')).toBe('cmd|/c calc!A1');
    expect(limparTexto('-2+3')).toBe('2+3');
    expect(limparTexto('@SUM(A1)')).toBe('SUM(A1)');
    expect(limparTexto(' = =SUM(1)')).toBe('SUM(1)');
    expect(limparTexto(`${IGUAL_LARGO}SUM(1)`)).toBe('SUM(1)');
  });

  it('tira caracteres de controle e invisíveis', () => {
    expect(limparTexto(`Pix${INVERTE}abc`)).toBe('Pixabc');
    expect(limparTexto(`Mer${LARGURA_ZERO}cado`)).toBe('Mercado');
    expect(limparTexto(`Linha${NULO}um\tdois\nfim`)).toBe('Linha um dois fim');
  });

  it('aperta os espaços e mantém acento e pontuação comum', () => {
    expect(limparTexto('  Padaria   São  João  ')).toBe('Padaria São João');
    expect(limparTexto('Uber *Viagem 12/03 - Centro')).toBe('Uber *Viagem 12/03 - Centro');
    expect(limparTexto(null)).toBe('');
  });
});

describe('limparDigitacao', () => {
  it('não mexe nos espaços enquanto a pessoa digita', () => {
    expect(limparDigitacao('Conta ')).toBe('Conta ');
    expect(limparDigitacao('a<b>c')).toBe('abc');
    expect(limparDigitacao(`a${LARGURA_ZERO}b`)).toBe('ab');
  });
});

describe('limparCorpo', () => {
  it('limpa só os campos de texto livre, em qualquer profundidade', () => {
    const corpo = {
      descricao: ' =Almoço <b> ',
      valor_centavos: 1500,
      conta_id: 'abc<1>',
      divisao: [{ pessoa: '@Ana', valor_centavos: 500 }],
      mapeamento: { descricao: 2, data: 0 },
      csv: '=SUM(1);10',
    };
    expect(limparCorpo(corpo)).toEqual({
      descricao: 'Almoço b',
      valor_centavos: 1500,
      conta_id: 'abc<1>',
      divisao: [{ pessoa: 'Ana', valor_centavos: 500 }],
      mapeamento: { descricao: 2, data: 0 },
      csv: '=SUM(1);10',
    });
  });

  it('deixa como está o que não é objeto', () => {
    expect(limparCorpo(undefined)).toBeUndefined();
    expect(limparCorpo('texto')).toBe('texto');
  });
});
