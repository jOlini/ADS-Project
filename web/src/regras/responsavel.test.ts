// Testes das regras do responsável pelo lançamento: o erro do campo, o que
// vai à API, a comparação de nomes e os atalhos de pessoas já usadas.
import { describe, expect, it } from 'vitest';
import {
  erroDoResponsavel,
  mesmaPessoa,
  responsavelParaApi,
  sugestoesDeResponsavel,
  TAMANHO_DO_RESPONSAVEL,
} from './responsavel';

describe('erroDoResponsavel', () => {
  it('aceita o campo vazio: o lançamento fica com quem lançou', () => {
    expect(erroDoResponsavel('')).toBe('');
    expect(erroDoResponsavel('   ')).toBe('');
    expect(erroDoResponsavel(undefined)).toBe('');
  });

  it('recusa nome maior que o limite da API', () => {
    expect(erroDoResponsavel('a'.repeat(TAMANHO_DO_RESPONSAVEL))).toBe('');
    expect(erroDoResponsavel('a'.repeat(TAMANHO_DO_RESPONSAVEL + 1))).toMatch(/no máximo 60/);
  });

  it('recusa responsável em transferência entre contas próprias', () => {
    expect(erroDoResponsavel('Bruno', 'TRANSFERENCIA')).toMatch(/Transferência/);
    expect(erroDoResponsavel('', 'TRANSFERENCIA')).toBe('');
  });
});

describe('responsavelParaApi', () => {
  it('manda o nome limpo, ou null quando não há nome', () => {
    expect(responsavelParaApi('  Bruno   Lima ')).toBe('Bruno Lima');
    expect(responsavelParaApi('<Carla>')).toBe('Carla');
    expect(responsavelParaApi('  ')).toBeNull();
    expect(responsavelParaApi(null)).toBeNull();
  });
});

describe('mesmaPessoa', () => {
  it('ignora caixa, acento e espaços', () => {
    expect(mesmaPessoa(' ána ', 'Ana')).toBe(true);
    expect(mesmaPessoa('Ana', 'Bruno')).toBe(false);
  });
});

describe('sugestoesDeResponsavel', () => {
  it('tira a mesma pessoa escrita de outro jeito e respeita o limite', () => {
    const conhecidas = ['Ana', 'ana', 'Bruno', ' Carla ', 'Diego', 'Elisa', 'Fábio', 'Gabi'];

    expect(sugestoesDeResponsavel(conhecidas)).toEqual(['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Fábio']);
    expect(sugestoesDeResponsavel(conhecidas, 2)).toEqual(['Ana', 'Bruno']);
  });

  it('ignora nome vazio', () => {
    expect(sugestoesDeResponsavel(['', '  ', 'Ana'])).toEqual(['Ana']);
  });
});
