import { describe, expect, it } from 'vitest';
import { somarPorOrigem } from '../../regras/resumo';
import { inicioDaCarga, linhasDoMes, mesAnterior } from './despesasDoMes';

// Cartão que fecha dia 25 e vence dia 5: a fatura de outubro tem as compras
// de 25/08 a 24/09.
const cartoes = [{ id: 'roxo', dia_fechamento: 25, dia_vencimento: 5 }];
const conta = (data: string, valor: number, tipo = valor > 0 ? 'receita' : 'despesa') => ({ data, valor, tipo, noCartao: false, original: { conta_id: 'corrente' } });
const noCartao = (data: string, valor: number) => ({ data, valor, tipo: valor > 0 ? 'receita' : 'despesa', noCartao: true, original: { conta_id: 'roxo' } });

const LINHAS = [
  conta('2026-10-02', -5000), // à vista em outubro
  conta('2026-09-30', -9900), // à vista em setembro: fora de outubro
  conta('2026-10-01', 300000), // salário
  { ...conta('2026-10-05', -47598), tipo: 'pagamento' }, // pagamento da fatura: não conta
  noCartao('2026-08-31', -2889), // compra de agosto, na fatura de outubro
  noCartao('2026-09-24', -9227), // na fatura de outubro
  noCartao('2026-09-25', -1000), // fechou: fatura de novembro
  noCartao('2026-10-01', -3000), // fatura de novembro
  noCartao('2026-09-10', 500), // estorno na fatura de outubro
];

describe('linhas do mês na Visão geral', () => {
  it('junta o à vista do mês com a fatura que vence nele, sem o pagamento', () => {
    const outubro = linhasDoMes(LINHAS, cartoes, '2026-10');
    expect(outubro.map((linha) => [linha.data, linha.valor])).toEqual([
      ['2026-10-02', -5000],
      ['2026-10-01', 300000],
      ['2026-08-31', -2889],
      ['2026-09-24', -9227],
      ['2026-09-10', 500],
    ]);
  });

  it('despesas = à vista + total da fatura do mês (o estorno desconta)', () => {
    const { aVista, noCredito, entradas } = somarPorOrigem(linhasDoMes(LINHAS, cartoes, '2026-10'));
    expect({ aVista, noCredito, entradas }).toEqual({ aVista: 5000, noCredito: 2889 + 9227 - 500, entradas: 300000 });
  });

  it('cartão que não está na lista conta pela data', () => {
    expect(linhasDoMes([noCartao('2026-10-03', -100)], [], '2026-10')).toHaveLength(1);
  });

  it('mês anterior e o começo da carga dos lançamentos', () => {
    expect(mesAnterior('2026-01')).toBe('2025-12');
    expect(inicioDaCarga('2026-10')).toBe('2026-07-01');
    expect(inicioDaCarga('2026-02')).toBe('2025-11-01');
  });
});
