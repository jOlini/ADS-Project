// Testes do Modo Família: quem aparece, de quem é cada lançamento, o filtro,
// o gasto por pessoa, as sugestões do responsável e o cadastro da pessoa.
import { describe, expect, it } from 'vitest';
import type { Espaco, PessoaDaFamilia } from './espacos';
import {
  comAFamilia,
  corDoResponsavel,
  deQuemE,
  familiaAtiva,
  filtrarPorPessoa,
  gastoPorPessoa,
  pessoasDaFamilia,
  proximaCor,
  TITULAR,
  TODOS,
  validarPessoa,
} from './familia';

const BRUNO: PessoaDaFamilia = { id: 'b1', nome: 'Bruno', cor: 'azul' };
const LEO: PessoaDaFamilia = { id: 'l1', nome: 'Léo', cor: 'coral' };
const PESSOAS = [BRUNO, LEO];

const pessoal = (ativa: boolean, plano: Espaco['plano'] = 'FAMILIA'): Espaco => ({
  id: 'p1',
  tipo: 'PF',
  nome: 'Pessoal',
  papel: 'DONO',
  familia: { ativa, pessoas: PESSOAS, maximo_de_pessoas: 5 },
  plano,
});

describe('pessoasDaFamilia e familiaAtiva', () => {
  it('só com o modo ligado e no espaço pessoal', () => {
    expect(pessoasDaFamilia(pessoal(true))).toEqual(PESSOAS);
    expect(pessoasDaFamilia(pessoal(false))).toEqual([]);
    expect(pessoasDaFamilia({ tipo: 'PJ', familia: null })).toEqual([]);
    expect(pessoasDaFamilia(null)).toEqual([]);
    expect(familiaAtiva(pessoal(true))).toBe(true);
    expect(familiaAtiva(pessoal(false))).toBe(false);
  });

  it('no Free (ou sem plano), nada aparece mesmo com o modo ligado', () => {
    expect(pessoasDaFamilia(pessoal(true, 'FREE'))).toEqual([]);
    expect(pessoasDaFamilia(pessoal(true, null))).toEqual([]);
    expect(familiaAtiva(pessoal(true, 'FREE'))).toBe(false);
    expect(familiaAtiva(pessoal(true, 'EMPRESARIAL'))).toBe(true);
  });
});

describe('deQuemE', () => {
  it('sem responsável é do titular; com o nome, da pessoa (sem caixa e acento)', () => {
    expect(deQuemE(null, PESSOAS)).toBe(TITULAR);
    expect(deQuemE('  ', PESSOAS)).toBe(TITULAR);
    expect(deQuemE('leo', PESSOAS)).toBe('l1');
    expect(deQuemE(' BRUNO ', PESSOAS)).toBe('b1');
  });

  it('um responsável de fora da família não é de ninguém dela', () => {
    expect(deQuemE('Carla', PESSOAS)).toBeNull();
  });
});

describe('filtrarPorPessoa', () => {
  const linhas = [
    { id: 1, responsavel: null },
    { id: 2, responsavel: 'Léo' },
    { id: 3, responsavel: 'Carla' },
    { id: 4, responsavel: 'bruno' },
  ];

  it('todos, o titular ou uma pessoa', () => {
    expect(filtrarPorPessoa(linhas, TODOS, PESSOAS).map((linha) => linha.id)).toEqual([1, 2, 3, 4]);
    expect(filtrarPorPessoa(linhas, TITULAR, PESSOAS).map((linha) => linha.id)).toEqual([1]);
    expect(filtrarPorPessoa(linhas, 'l1', PESSOAS).map((linha) => linha.id)).toEqual([2]);
    expect(filtrarPorPessoa(linhas, 'b1', PESSOAS).map((linha) => linha.id)).toEqual([4]);
  });

  it('a cor do responsável, só de quem é da família', () => {
    expect(corDoResponsavel('LEO', PESSOAS)).toBe('coral');
    expect(corDoResponsavel('Carla', PESSOAS)).toBeNull();
    expect(corDoResponsavel(null, PESSOAS)).toBeNull();
  });
});

describe('gastoPorPessoa', () => {
  it('soma as despesas de cada um, com o estorno descontando, do maior para o menor', () => {
    const linhas = [
      { tipo: 'despesa', valor: -10_000, responsavel: null },
      { tipo: 'despesa', valor: -3_000, responsavel: 'Léo' },
      { tipo: 'despesa', valor: -2_000, responsavel: 'leo' },
      // Estorno de uma despesa do Léo: a partida volta com o sinal trocado.
      { tipo: 'despesa', valor: 1_000, responsavel: 'Léo' },
      { tipo: 'despesa', valor: -4_000, responsavel: 'Carla' },
      { tipo: 'receita', valor: 50_000, responsavel: 'Bruno' },
      { tipo: 'transferencia', valor: -9_000, responsavel: null },
    ];

    expect(gastoPorPessoa(linhas, PESSOAS)).toEqual([
      { id: TITULAR, nome: 'Você', cor: null, valor: 10_000, fatia: 56 },
      { id: 'l1', nome: 'Léo', cor: 'coral', valor: 4_000, fatia: 22 },
      { id: 'outros', nome: 'Outros', cor: null, valor: 4_000, fatia: 22 },
    ]);
  });

  it('sem despesas, lista vazia', () => {
    expect(gastoPorPessoa([], PESSOAS)).toEqual([]);
  });
});

describe('comAFamilia', () => {
  it('a família primeiro nas sugestões, sem repetir a mesma pessoa', () => {
    expect(comAFamilia(['carla', 'LEO', 'Davi'], PESSOAS)).toEqual(['Bruno', 'Léo', 'carla', 'Davi']);
    expect(comAFamilia(['Carla'], [])).toEqual(['Carla']);
  });
});

describe('validarPessoa', () => {
  it('pede nome e cor', () => {
    expect(validarPessoa({ nome: '', cor: '' }, PESSOAS)).toEqual({ nome: 'Dê o nome da pessoa.', cor: 'Escolha uma cor.' });
    expect(validarPessoa({ nome: 'Carla', cor: 'rosa' }, PESSOAS)).toEqual({});
  });

  it('recusa nome repetido (sem caixa e acento) e o "você" do titular', () => {
    expect(validarPessoa({ nome: ' LEO ', cor: 'rosa' }, PESSOAS).nome).toBe('Já existe uma pessoa com este nome na família.');
    expect(validarPessoa({ nome: 'Léo', cor: 'rosa' }, PESSOAS, 'l1')).toEqual({});
    expect(validarPessoa({ nome: 'Você', cor: 'rosa' }, PESSOAS).nome).toContain('titular');
    expect(validarPessoa({ nome: 'x'.repeat(61), cor: 'rosa' }, PESSOAS).nome).toBe('Use até 60 caracteres.');
  });

  it('sugere a primeira cor livre', () => {
    expect(proximaCor([])).toBe('azul');
    expect(proximaCor(PESSOAS)).toBe('roxo');
  });
});
