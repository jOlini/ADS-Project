// Testes das contas do resumo: funções puras, sem Firebase e sem navegador.
import { describe, expect, it } from 'vitest';
import { agruparPorDia, filtrarDias, gastoPorCategoria, saldoAntesDe, somarMes, usoDaRenda } from './resumo';

// Dados fictícios, em centavos: nenhum dado pessoal real entra no repositório público.
const LANCAMENTOS = [
  { data: '2026-09-05', descricao: 'Salário', categoria: 'Salário', valor: 680000 },
  { data: '2026-09-05', descricao: 'Aluguel', categoria: 'Moradia', valor: -185000 },
  { data: '2026-09-10', descricao: 'Para a poupança', categoria: 'Transferência', valor: -50000, tipo: 'transferencia' },
  { data: '2026-09-12', descricao: 'Posto', categoria: 'Transporte', valor: -18000 },
  { data: '2026-09-19', descricao: 'Mercado', categoria: 'Mercado', valor: -22000 },
];

const ESTORNO_DO_POSTO = {
  data: '2026-09-20',
  descricao: 'Estorno: Posto',
  categoria: 'Transporte',
  valor: 18000,
  estorno: true,
};

describe('somarMes', () => {
  it('soma entradas e saídas e devolve a sobra', () => {
    expect(somarMes(LANCAMENTOS)).toEqual({ entradas: 680000, saidas: 225000, sobra: 455000 });
  });

  it('ignora transferência entre contas próprias', () => {
    const soTransferencia = [LANCAMENTOS[2]];

    expect(somarMes(soTransferencia)).toEqual({ entradas: 0, saidas: 0, sobra: 0 });
  });

  it('devolve zeros quando não há lançamento', () => {
    expect(somarMes([])).toEqual({ entradas: 0, saidas: 0, sobra: 0 });
  });

  it('estorno de despesa diminui as saídas em vez de contar como entrada', () => {
    expect(somarMes([...LANCAMENTOS, ESTORNO_DO_POSTO])).toEqual({ entradas: 680000, saidas: 207000, sobra: 473000 });
  });

  it('estorno de receita diminui as entradas', () => {
    const estornoDoSalario = { data: '2026-09-06', categoria: 'Salário', valor: -680000, estorno: true };

    expect(somarMes([LANCAMENTOS[0], estornoDoSalario])).toEqual({ entradas: 0, saidas: 0, sobra: 0 });
  });
});

describe('usoDaRenda', () => {
  it('calcula a porcentagem do que entrou já gasta', () => {
    expect(usoDaRenda({ entradas: 735000, saidas: 491248 })).toBe(67);
  });

  it('não passa de 100 quando gasta mais do que entrou', () => {
    expect(usoDaRenda({ entradas: 100000, saidas: 250000 })).toBe(100);
  });

  it('devolve 0 sem entrada, em vez de dividir por zero', () => {
    expect(usoDaRenda({ entradas: 0, saidas: 30000 })).toBe(0);
  });
});

describe('gastoPorCategoria', () => {
  it('soma por categoria, ordena pela maior e calcula a fatia', () => {
    expect(gastoPorCategoria(LANCAMENTOS)).toEqual([
      { categoria: 'Moradia', valor: 185000, fatia: 82 },
      { categoria: 'Mercado', valor: 22000, fatia: 10 },
      { categoria: 'Transporte', valor: 18000, fatia: 8 },
    ]);
  });

  it('não conta entrada nem transferência', () => {
    expect(gastoPorCategoria([LANCAMENTOS[0], LANCAMENTOS[2]])).toEqual([]);
  });

  it('estorno devolve o valor à categoria e some com ela quando zera', () => {
    const categorias = gastoPorCategoria([...LANCAMENTOS, ESTORNO_DO_POSTO]).map((item) => item.categoria);

    expect(categorias).toEqual(['Moradia', 'Mercado']);
  });
});

describe('agruparPorDia', () => {
  it('agrupa do dia mais recente para o mais antigo', () => {
    const dias = agruparPorDia(LANCAMENTOS, 396812);

    expect(dias.map((dia) => dia.data)).toEqual(['2026-09-19', '2026-09-12', '2026-09-10', '2026-09-05']);
  });

  it('calcula o saldo total do fim de cada dia andando para trás', () => {
    const dias = agruparPorDia(LANCAMENTOS, 100000);

    expect(dias.map((dia) => dia.saldo)).toEqual([100000, 122000, 140000, 140000]);
  });

  it('transferência entre contas próprias não muda o saldo total', () => {
    // 10/09 só tem a transferência: o dia 05/09 fecha com o mesmo total.
    const dias = agruparPorDia([LANCAMENTOS[2], LANCAMENTOS[1]], 100000);

    expect(dias.map((dia) => dia.saldo)).toEqual([100000, 100000]);
  });

  it('mantém juntos os lançamentos do mesmo dia', () => {
    const dias = agruparPorDia(LANCAMENTOS, 0);

    expect(dias.at(-1).lancamentos).toHaveLength(2);
  });
});

describe('filtrarDias', () => {
  const dias = agruparPorDia(LANCAMENTOS, 0);

  it('tudo devolve os dias como estão', () => {
    expect(filtrarDias(dias, 'tudo')).toBe(dias);
  });

  it('entradas deixa só valores positivos e some com os dias vazios', () => {
    const filtrados = filtrarDias(dias, 'entradas');

    expect(filtrados.map((dia) => dia.data)).toEqual(['2026-09-05']);
    expect(filtrados[0].lancamentos.map((item) => item.descricao)).toEqual(['Salário']);
  });

  it('saídas deixa só valores negativos', () => {
    const valores = filtrarDias(dias, 'saidas').flatMap((dia) => dia.lancamentos.map((item) => item.valor));

    expect(valores.every((valor) => valor < 0)).toBe(true);
    expect(valores).toHaveLength(4);
  });
});

describe('saldoAntesDe', () => {
  it('desfaz entradas e saídas, mas não transferências', () => {
    // Hoje 100000; depois do mês vieram +680000, −185000 e uma transferência.
    expect(saldoAntesDe([LANCAMENTOS[0], LANCAMENTOS[1], LANCAMENTOS[2]], 100000)).toBe(-395000);
    expect(saldoAntesDe([], 100000)).toBe(100000);
  });
});
