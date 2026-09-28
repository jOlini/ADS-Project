// Testes da seleção em lote: funções puras, sem navegador.
import { describe, expect, it } from 'vitest';
import { alternar, alternarTodos, marcadosVisiveis, situacaoDaSelecao, textoDaSelecao } from './selecao';

const NA_TELA = ['a', 'b', 'c'];

describe('seleção em lote', () => {
  it('marca e desmarca um item sem mudar o conjunto recebido', () => {
    const marcados = new Set(['a']);
    const depois = alternar(marcados, 'b');

    expect([...depois]).toEqual(['a', 'b']);
    expect([...alternar(depois, 'a')]).toEqual(['b']);
    expect([...marcados]).toEqual(['a']);
  });

  it('só conta o que está na tela', () => {
    expect(marcadosVisiveis(new Set(['a', 'z']), NA_TELA)).toEqual(['a']);
  });

  it('diz se estão todos, alguns ou nenhum marcados', () => {
    expect(situacaoDaSelecao(new Set(), NA_TELA)).toBe('nenhum');
    expect(situacaoDaSelecao(new Set(['b', 'z']), NA_TELA)).toBe('alguns');
    expect(situacaoDaSelecao(new Set(NA_TELA), NA_TELA)).toBe('todos');
  });

  it('"Selecionar todos" marca a tela inteira e, com tudo marcado, desmarca', () => {
    expect([...alternarTodos(new Set(['b']), NA_TELA)]).toEqual(NA_TELA);
    expect(alternarTodos(new Set(NA_TELA), NA_TELA).size).toBe(0);
  });

  it('escreve quantos há e quantos foram marcados', () => {
    const nomes = ['lançamento', 'lançamentos'];

    expect(textoDaSelecao(0, 12, nomes)).toBe('12 lançamentos');
    expect(textoDaSelecao(0, 1, nomes)).toBe('1 lançamento');
    expect(textoDaSelecao(3, 12, nomes)).toBe('3 de 12 selecionados');
    expect(textoDaSelecao(1, 12, nomes)).toBe('1 de 12 selecionado');
  });
});
