import { describe, expect, it } from 'vitest';
import {
  larguraDaBarra,
  nomeDoMes,
  periodoDoFiltro,
  reguaDasColunas,
  rotuloDoMes,
  somarMeses,
  totaisDoPeriodo,
} from './relatorios';

describe('período dos relatórios', () => {
  it('soma e subtrai meses atravessando a virada do ano', () => {
    expect(somarMeses('2026-09', -5)).toBe('2026-04');
    expect(somarMeses('2026-02', -3)).toBe('2025-11');
    expect(somarMeses('2025-12', 1)).toBe('2026-01');
  });

  it('termina no mês de hoje e conta o próprio mês no período', () => {
    expect(periodoDoFiltro('3m', '2026-09-26')).toEqual({ de: '2026-07', ate: '2026-09' });
    expect(periodoDoFiltro('12m', '2026-09-26')).toEqual({ de: '2025-10', ate: '2026-09' });
  });

  it('usa o padrão (6 meses) quando o filtro é desconhecido', () => {
    expect(periodoDoFiltro('ontem', '2026-01-10')).toEqual({ de: '2025-08', ate: '2026-01' });
  });
});

describe('totais do período', () => {
  const meses = [
    { mes: '2026-08', receitas_centavos: 500000, despesas_centavos: 320000 },
    { mes: '2026-09', receitas_centavos: 480000, despesas_centavos: 510000 },
  ];

  it('soma receitas e despesas e calcula a sobra (que pode ser negativa num mês)', () => {
    expect(totaisDoPeriodo(meses)).toEqual({ receitas: 980000, despesas: 830000, sobra: 150000, mediaDeDespesas: 415000 });
  });

  it('período vazio dá zero, sem dividir por zero', () => {
    expect(totaisDoPeriodo([])).toEqual({ receitas: 0, despesas: 0, sobra: 0, mediaDeDespesas: 0 });
  });
});

describe('régua das colunas', () => {
  it('começa no zero e cobre a maior coluna com passos redondos', () => {
    const regua = reguaDasColunas([680000, 355000, 120000]);
    expect(regua.minimo).toBe(0);
    expect(regua.maximo).toBeGreaterThanOrEqual(680000);
    expect(regua.marcas[0]).toBe(0);
    const passos = regua.marcas.slice(1).map((marca, indice) => marca - regua.marcas[indice]);
    expect(new Set(passos).size).toBe(1);
  });

  it('desce abaixo do zero só com valor negativo (mês de mais estorno que gasto)', () => {
    expect(reguaDasColunas([100000, 50000]).minimo).toBe(0);
    const comNegativo = reguaDasColunas([100000, -30000]);
    expect(comNegativo.minimo).toBeLessThanOrEqual(-30000);
    expect(comNegativo.marcas).toContain(0);
  });

  it('sem nenhum valor, desenha uma régua neutra em vez de dividir por zero', () => {
    expect(reguaDasColunas([0, 0])).toEqual({ minimo: 0, maximo: 100000, marcas: [0, 25000, 50000, 75000, 100000] });
  });
});

describe('rótulos e barras', () => {
  it('abrevia o mês e põe o ano na virada e quando pedido', () => {
    expect(rotuloDoMes('2026-09')).toBe('set');
    expect(rotuloDoMes('2026-01')).toBe('jan/26');
    expect(rotuloDoMes('2025-11', { comAno: true })).toBe('nov/25');
  });

  it('escreve o mês por extenso', () => {
    expect(nomeDoMes('2026-09')).toBe('setembro de 2026');
  });

  it('mede a barra contra a maior categoria, com um mínimo visível', () => {
    expect(larguraDaBarra(50000, 200000)).toBe(25);
    expect(larguraDaBarra(200000, 200000)).toBe(100);
    expect(larguraDaBarra(1, 10000000)).toBe(1);
    expect(larguraDaBarra(0, 200000)).toBe(0);
  });
});
