import { describe, expect, it } from 'vitest';
import {
  contraste,
  corDaCategoria,
  corDoPlastico,
  ehCorHex,
  estiloDoPlastico,
  hexParaHsv,
  hexParaRgb,
  hsvParaHex,
  mascararHex,
  normalizarHex,
  textoSobre,
  TEXTO_CLARO,
  TEXTO_ESCURO,
} from './cores';

describe('cores em hexadecimal', () => {
  it('reconhece só o formato exato #rrggbb', () => {
    expect(ehCorHex('#1a2B3c')).toBe(true);
    for (const cor of ['#12345', '1a2b3c', '#ggg000', 'red', '#123456;x', null, 7]) {
      expect(ehCorHex(cor)).toBe(false);
    }
  });

  it('normaliza o que a pessoa digita', () => {
    expect(normalizarHex('1A2B3C')).toBe('#1a2b3c');
    expect(normalizarHex(' #abc ')).toBe('#aabbcc');
    expect(normalizarHex('#12')).toBeNull();
    expect(normalizarHex('')).toBeNull();
  });

  it('deixa no campo só o # e até seis algarismos', () => {
    expect(mascararHex('##1a-2b x3c99')).toBe('#1a2b3c');
    expect(mascararHex('')).toBe('#');
  });

  it('converte entre hexadecimal, RGB e HSV sem perder a cor', () => {
    expect(hexParaRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    for (const cor of ['#000000', '#ffffff', '#2b7857', '#820ad1', '#ff7a00', '#5d676c']) {
      expect(hsvParaHex(hexParaHsv(cor))).toBe(cor);
    }
    expect(hexParaHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hsvParaHex({ h: 120, s: 1, v: 1 })).toBe('#00ff00');
  });

  it('escolhe o texto de maior contraste sobre a cor', () => {
    expect(textoSobre('#0b1f17')).toBe(TEXTO_CLARO);
    expect(textoSobre('#f5f1e6')).toBe(TEXTO_ESCURO);
    expect(contraste('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
});

describe('cor no CSS', () => {
  it('categoria: hexadecimal, paleta ou cinza', () => {
    expect(corDaCategoria('#AA00CC')).toBe('#aa00cc');
    expect(corDaCategoria('lazer')).toBe('var(--cat-lazer)');
    expect(corDaCategoria(undefined)).toBe('var(--cat-neutro)');
    // Texto estranho nunca chega ao CSS.
    expect(corDaCategoria('red;background:url(x)')).toBe('var(--cat-neutro)');
  });

  it('plástico: hexadecimal, paleta ou a cor padrão', () => {
    expect(corDoPlastico('#123456')).toBe('#123456');
    expect(corDoPlastico('roxo')).toBe('var(--cartao-roxo)');
    expect(corDoPlastico(null, 'azul')).toBe('var(--cartao-azul)');
  });

  it('estilo do plástico personalizado leva a cor e o texto legível', () => {
    expect(estiloDoPlastico('vinho')).toEqual({ classe: 'cor-vinho', estilo: undefined });
    expect(estiloDoPlastico(undefined, 'verde')).toEqual({ classe: 'cor-verde', estilo: undefined });
    expect(estiloDoPlastico('#F5F1E6')).toEqual({
      classe: 'cor-personalizada',
      estilo: { '--cor-da-amostra': '#f5f1e6', '--sobre-cartao': TEXTO_ESCURO },
    });
  });
});
