import { describe, expect, it } from 'vitest';
import { destinosPossiveis, destinoSugerido, textoDosLancamentos, validarDestinos, type CategoriaDaExclusao } from './exclusaoDeCategoria';

const categoria = (id: string, nome: string, tipo: 'DESPESA' | 'RECEITA' = 'DESPESA', ativa = true): CategoriaDaExclusao => ({
  id,
  nome,
  tipo,
  ativa,
});

const TODAS = [
  categoria('lazer', 'Lazer'),
  categoria('mercado', 'Mercado'),
  categoria('outras', 'Outras despesas'),
  categoria('antiga', 'Antiga', 'DESPESA', false),
  categoria('salario', 'Salário', 'RECEITA'),
];

describe('destino dos lançamentos de uma categoria excluída', () => {
  it('só do mesmo tipo, ativas e fora do que está saindo', () => {
    const possiveis = destinosPossiveis(TODAS, TODAS[0]!, new Set(['lazer', 'mercado']));
    expect(possiveis.map((item) => item.id)).toEqual(['outras']);
  });

  it('sugere "Outras despesas" e, sem ela, a primeira possível', () => {
    const lazer = TODAS[0]!;
    expect(destinoSugerido(destinosPossiveis(TODAS, lazer, new Set(['lazer'])), lazer)).toBe('outras');
    const semOutras = TODAS.filter((item) => item.id !== 'outras');
    expect(destinoSugerido(destinosPossiveis(semOutras, lazer, new Set(['lazer'])), lazer)).toBe('mercado');
    expect(destinoSugerido([], lazer)).toBe('');
  });

  it('acusa a categoria em uso sem destino', () => {
    const emUso = [{ categoria: TODAS[0]!, lancamentos: 3 }, { categoria: TODAS[1]!, lancamentos: null }];
    expect(validarDestinos(emUso, { lazer: 'outras' })).toEqual({ mercado: 'Escolha para onde vão os lançamentos.' });
  });

  it('escreve a quantidade de lançamentos', () => {
    expect(textoDosLancamentos(1)).toBe('1 lançamento');
    expect(textoDosLancamentos(12)).toBe('12 lançamentos');
    expect(textoDosLancamentos(null)).toBe('lançamentos');
  });
});
