// Testes das contas do resumo: funções puras, sem Firebase e sem navegador.
import { describe, expect, it } from 'vitest';
import { agruparPorDia, gastoPorCategoria, somarMes, usoDaRenda } from './resumo';

// Dados fictícios: nenhum dado pessoal real entra no repositório público.
const LANCAMENTOS = [
  { data: '2026-09-05', descricao: 'Salário', categoria: 'Salário', valor: 6800 },
  { data: '2026-09-05', descricao: 'Aluguel', categoria: 'Moradia', valor: -1850 },
  { data: '2026-09-10', descricao: 'Para a poupança', categoria: 'Transferência', valor: -500, tipo: 'transferencia' },
  { data: '2026-09-12', descricao: 'Posto', categoria: 'Transporte', valor: -180 },
  { data: '2026-09-19', descricao: 'Mercado', categoria: 'Mercado', valor: -220 },
];

describe('somarMes', () => {
  it('soma entradas e saídas e devolve a sobra', () => {
    expect(somarMes(LANCAMENTOS)).toEqual({ entradas: 6800, saidas: 2250, sobra: 4550 });
  });

  it('ignora transferência entre contas próprias', () => {
    const so_transferencia = [LANCAMENTOS[2]];

    expect(somarMes(so_transferencia)).toEqual({ entradas: 0, saidas: 0, sobra: 0 });
  });

  it('devolve zeros quando não há lançamento', () => {
    expect(somarMes([])).toEqual({ entradas: 0, saidas: 0, sobra: 0 });
  });
});

describe('usoDaRenda', () => {
  it('calcula a porcentagem do que entrou já gasta', () => {
    expect(usoDaRenda({ entradas: 7350, saidas: 4912.48 })).toBe(67);
  });

  it('não passa de 100 quando gasta mais do que entrou', () => {
    expect(usoDaRenda({ entradas: 1000, saidas: 2500 })).toBe(100);
  });

  it('devolve 0 sem entrada, em vez de dividir por zero', () => {
    expect(usoDaRenda({ entradas: 0, saidas: 300 })).toBe(0);
  });
});

describe('gastoPorCategoria', () => {
  it('soma por categoria, ordena pela maior e calcula a fatia', () => {
    expect(gastoPorCategoria(LANCAMENTOS)).toEqual([
      { categoria: 'Moradia', valor: 1850, fatia: 82 },
      { categoria: 'Mercado', valor: 220, fatia: 10 },
      { categoria: 'Transporte', valor: 180, fatia: 8 },
    ]);
  });

  it('não conta entrada nem transferência', () => {
    expect(gastoPorCategoria([LANCAMENTOS[0], LANCAMENTOS[2]])).toEqual([]);
  });
});

describe('agruparPorDia', () => {
  it('agrupa do dia mais recente para o mais antigo', () => {
    const dias = agruparPorDia(LANCAMENTOS, 3968.12);

    expect(dias.map((dia) => dia.data)).toEqual(['2026-09-19', '2026-09-12', '2026-09-10', '2026-09-05']);
  });

  it('calcula o saldo do fim de cada dia andando para trás', () => {
    const dias = agruparPorDia(LANCAMENTOS, 1000);

    expect(dias[0].saldo).toBe(1000);
    expect(dias[1].saldo).toBe(1220);
    expect(dias[2].saldo).toBe(1400);
    expect(dias[3].saldo).toBe(1900);
  });

  it('mantém juntos os lançamentos do mesmo dia', () => {
    const dias = agruparPorDia(LANCAMENTOS, 0);

    expect(dias.at(-1).lancamentos).toHaveLength(2);
  });
});
