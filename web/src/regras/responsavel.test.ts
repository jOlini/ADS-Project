// Testes das regras do responsável pelo lançamento: o erro do campo, o que
// vai à API, a comparação de nomes e as opções (as pessoas da família).
import { describe, expect, it } from 'vitest';
import type { PessoaDaFamilia } from './espacos';
import { erroDoResponsavel, mesmaPessoa, opcoesDeResponsavel, responsavelParaApi, TAMANHO_DO_RESPONSAVEL } from './responsavel';

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

describe('opcoesDeResponsavel', () => {
  const familia: PessoaDaFamilia[] = [
    { id: 'p1', nome: 'Bruno', cor: 'azul' },
    { id: 'p2', nome: 'Léo', cor: 'coral' },
  ];

  it('oferece você e só as pessoas da família', () => {
    expect(opcoesDeResponsavel(familia).map((opcao) => [opcao.valor, opcao.rotulo])).toEqual([
      ['', 'Você'],
      ['Bruno', 'Bruno'],
      ['Léo', 'Léo'],
    ]);
  });

  it('mantém visível o responsável antigo que não é da família', () => {
    const opcoes = opcoesDeResponsavel(familia, 'Diego');
    expect(opcoes.at(-1)).toEqual({ valor: 'Diego', rotulo: 'Diego', descricao: 'Não está na família' });
    // Da família (escrito de outro jeito), não repete.
    expect(opcoesDeResponsavel(familia, 'leo')).toHaveLength(3);
  });
});
