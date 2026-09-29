// Testes das máscaras: o texto que fica no campo e o cursor depois de cada
// tecla, sem navegador.
import { describe, expect, it } from 'vitest';
import { lerValor } from './dinheiro';
import { mascararInteiro, mascararMoeda, podeDigitar } from './mascaras';

// Digita tecla por tecla no fim do campo, como a pessoa faria.
function digitar(teclas: string, opcoes = {}): string {
  let texto = '';
  for (const tecla of teclas) {
    texto = mascararMoeda(texto + tecla, texto.length + 1, { ...opcoes, teclaDigitada: tecla }).texto;
  }
  return texto;
}

describe('mascararMoeda', () => {
  it('põe os pontos de milhar enquanto a pessoa digita', () => {
    expect(digitar('1')).toBe('1');
    expect(digitar('1234')).toBe('1.234');
    expect(digitar('1234567')).toBe('1.234.567');
    expect(digitar('1234,5')).toBe('1.234,5');
    expect(digitar('1234,56')).toBe('1.234,56');
  });

  it('barra letras, símbolos e o terceiro decimal', () => {
    expect(digitar('12a3')).toBe('123');
    expect(digitar('R$ 50')).toBe('50');
    expect(digitar('10,999')).toBe('10,99');
    expect(digitar('1,2,3')).toBe('1,23');
  });

  it('aceita a tecla "." como vírgula decimal', () => {
    expect(digitar('10.5')).toBe('10,5');
    expect(digitar('.5')).toBe('0,5');
  });

  it('vírgula no campo vazio vira "0,"', () => {
    expect(mascararMoeda(',', 1)).toEqual({ texto: '0,', cursor: 2 });
  });

  it('tira os zeros à esquerda, mas deixa o último', () => {
    expect(digitar('007')).toBe('7');
    expect(digitar('0,50')).toBe('0,50');
    expect(digitar('000')).toBe('0');
  });

  it('para no teto de dez dígitos antes da vírgula (R$ 1 bilhão)', () => {
    expect(digitar('12345678901')).toBe('1.234.567.890');
  });

  it('só aceita o sinal de menos quando pedido', () => {
    expect(digitar('-50')).toBe('50');
    expect(digitar('-50', { permitirNegativo: true })).toBe('-50');
    expect(digitar('-', { permitirNegativo: true })).toBe('-');
    expect(digitar('5-0', { permitirNegativo: true })).toBe('50');
  });

  it('apagar um dígito não transforma o ponto de milhar em decimal', () => {
    // "1.234" com o 4 apagado fica "1.23" no campo: é 123, e não 1,23.
    expect(mascararMoeda('1.23', 4)).toEqual({ texto: '123', cursor: 3 });
  });

  it('lê certo o valor colado de outro lugar', () => {
    expect(mascararMoeda('R$ 1.234,56', undefined, { colado: true }).texto).toBe('1.234,56');
    expect(mascararMoeda('1234.5', undefined, { colado: true }).texto).toBe('1.234,5');
    expect(mascararMoeda('1.500', undefined, { colado: true }).texto).toBe('1.500');
    expect(mascararMoeda('80,00', undefined, { colado: true }).texto).toBe('80,00');
  });

  it('mantém o cursor junto do dígito digitado quando os pontos mudam', () => {
    // "1.234" com o 5 digitado depois do 1: "15.234", cursor depois do 5.
    expect(mascararMoeda('15.234', 2)).toEqual({ texto: '15.234', cursor: 2 });
    // "12.345" com o 9 digitado depois do 2: "129.345", cursor depois do 9.
    expect(mascararMoeda('129.345', 3)).toEqual({ texto: '129.345', cursor: 3 });
    // "1.234" com o 1 apagado: "234", cursor no começo.
    expect(mascararMoeda('.234', 0)).toEqual({ texto: '234', cursor: 0 });
  });

  it('o texto da máscara é o que lerValor entende', () => {
    for (const teclas of ['1234,56', '0,29', '1000000', '99,9']) {
      const texto = digitar(teclas);
      expect(lerValor(texto)).not.toBeNull();
    }
    expect(lerValor(digitar('1234,56'))).toBe(123456);
    expect(lerValor(digitar('-80', { permitirNegativo: true }), { permitirNegativo: true })).toBe(-8000);
  });
});

describe('mascararInteiro', () => {
  it('fica só com os dígitos, sem zero à esquerda e com o limite', () => {
    expect(mascararInteiro('a1b2')).toEqual({ texto: '12', cursor: 2 });
    expect(mascararInteiro('012', 3)).toEqual({ texto: '12', cursor: 2 });
    expect(mascararInteiro('123', 3, { digitos: 2 })).toEqual({ texto: '12', cursor: 2 });
    expect(mascararInteiro('', 0)).toEqual({ texto: '', cursor: 0 });
  });
});

describe('podeDigitar', () => {
  it('barra letra e símbolo nos campos de número', () => {
    expect(podeDigitar('moeda', '5')).toBe(true);
    expect(podeDigitar('moeda', ',')).toBe(true);
    expect(podeDigitar('moeda', 'e')).toBe(false);
    expect(podeDigitar('moeda', '-')).toBe(false);
    expect(podeDigitar('moeda-com-sinal', '-')).toBe(true);
    expect(podeDigitar('inteiro', '.')).toBe(false);
    expect(podeDigitar('data', '/')).toBe(true);
    expect(podeDigitar('data', 'x')).toBe(false);
  });

  it('no texto livre, barra só os sinais de tag', () => {
    expect(podeDigitar('texto', 'Mercado São João')).toBe(true);
    expect(podeDigitar('texto', '<')).toBe(false);
    expect(podeDigitar('texto', '>')).toBe(false);
  });

  it('deixa passar o que não é tecla (apagar, colar)', () => {
    expect(podeDigitar('moeda', null)).toBe(true);
    expect(podeDigitar('inteiro', '')).toBe(true);
  });
});
