import { describe, expect, it } from 'vitest';
import { COR_DA_BARRA, outroTema, temaInicial, temaValido } from './tema';

describe('temaInicial', () => {
  it('usa a escolha salva, mesmo contra o sistema', () => {
    expect(temaInicial('escuro', false)).toBe('escuro');
    expect(temaInicial('claro', true)).toBe('claro');
  });

  it('sem escolha salva, segue o sistema', () => {
    expect(temaInicial(null, true)).toBe('escuro');
    expect(temaInicial(null, false)).toBe('claro');
  });

  it('ignora valor estragado no navegador', () => {
    expect(temaInicial('roxo', true)).toBe('escuro');
    expect(temaInicial('"escuro"', false)).toBe('claro');
  });
});

describe('alternância', () => {
  it('troca de um tema para o outro', () => {
    expect(outroTema('claro')).toBe('escuro');
    expect(outroTema('escuro')).toBe('claro');
  });

  it('só aceita os dois temas e tem a cor da barra de cada um', () => {
    expect(temaValido('claro')).toBe(true);
    expect(temaValido('sistema')).toBe(false);
    expect(Object.keys(COR_DA_BARRA)).toEqual(['claro', 'escuro']);
  });
});
