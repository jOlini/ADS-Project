import { describe, expect, it } from 'vitest';
import { LANCAMENTOS_DE_EXEMPLO, MESES_DE_EXEMPLO, SALDO_DE_EXEMPLO } from '../dados/exemplo';
import { fatiasDaRosca, montarVisao } from './visao';

const HOJE = '2026-09-26';

describe('montarVisao', () => {
  const visao = montarVisao({
    linhasDasContas: LANCAMENTOS_DE_EXEMPLO,
    linhasDoMes: LANCAMENTOS_DE_EXEMPLO,
    linhasRecentes: LANCAMENTOS_DE_EXEMPLO,
    saldo: SALDO_DE_EXEMPLO,
    meses: MESES_DE_EXEMPLO,
    hoje: HOJE,
  });

  it('soma o mês e compara com o mês anterior do relatório', () => {
    expect(visao.totais).toEqual({ entradas: 735000, saidas: 357607, sobra: 377393 });
    expect(visao.variacao).toEqual({ saldo: 12, receitas: 14, despesas: -8 });
  });

  it('o exemplo fecha: o saldo de agosto mais a sobra de setembro dá o saldo de hoje', () => {
    const agosto = MESES_DE_EXEMPLO.at(-2);
    expect(agosto.saldo_final_centavos + visao.totais.sobra).toBe(SALDO_DE_EXEMPLO);
    expect(MESES_DE_EXEMPLO.at(-1).despesas_centavos).toBe(visao.totais.saidas);
  });

  it('leva a cor da categoria para a rosca', () => {
    expect(visao.categorias[0]).toMatchObject({ categoria: 'Moradia', cor: 'moradia' });
  });

  it('lista as últimas até hoje, da mais recente para a mais antiga', () => {
    expect(visao.ultimas).toHaveLength(5);
    expect(visao.ultimas[0].data).toBe('2026-09-26');
  });

  it('monta as séries do gráfico', () => {
    expect(visao.series['7d']).toHaveLength(7);
    expect(visao.series['30d'].at(-1).saldo).toBe(SALDO_DE_EXEMPLO);
    expect(visao.series['12m']).toHaveLength(12);
    expect(visao.series['6m'][0].data).toBe('2026-04');
  });

  it('sem relatório, não compara nem mostra meses', () => {
    const semRelatorio = montarVisao({
      linhasDasContas: [],
      linhasDoMes: [],
      linhasRecentes: [],
      saldo: 1000,
      meses: null,
      hoje: HOJE,
    });
    expect(semRelatorio.variacao).toEqual({ saldo: null, receitas: null, despesas: null });
    expect(semRelatorio.series['12m']).toBeNull();
  });
});

describe('fatiasDaRosca', () => {
  const categoria = (nome, valor, fatia) => ({ categoria: nome, valor, fatia, cor: 'lazer' });

  it('mantém até o máximo de fatias', () => {
    expect(fatiasDaRosca([categoria('A', 10, 50), categoria('B', 10, 50)])).toHaveLength(2);
  });

  it('agrupa o resto em "Outras"', () => {
    const lista = [categoria('A', 50, 50), categoria('B', 20, 20), categoria('C', 20, 20), categoria('D', 10, 10)];
    expect(fatiasDaRosca(lista, 3)).toEqual([
      categoria('A', 50, 50),
      categoria('B', 20, 20),
      { categoria: 'Outras', valor: 30, fatia: 30, cor: 'neutro', agrupa: 2 },
    ]);
  });
});
