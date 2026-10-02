// Mesmos casos da API (api/tests/test_financeiro_cartoes.py): a tela e a API
// precisam pôr cada compra na mesma fatura.
import { describe, expect, it } from 'vitest';
import { fechamentoDaFatura, inicioDaFatura, referenciaDaData, somarMesesNaReferencia } from './faturas';

const visa = { dia_fechamento: 3, dia_vencimento: 10 };
// Fecha depois do vencimento: a fatura de outubro fecha em setembro.
const roxo = { dia_fechamento: 25, dia_vencimento: 5 };

describe('ciclo da fatura', () => {
  it('soma meses na referência, virando o ano', () => {
    expect(somarMesesNaReferencia('2026-12', 1)).toBe('2027-01');
    expect(somarMesesNaReferencia('2026-01', -1)).toBe('2025-12');
  });

  it('fecha no mesmo mês ou no anterior, conforme o vencimento', () => {
    expect(fechamentoDaFatura(visa, '2026-10')).toBe('2026-10-03');
    expect(fechamentoDaFatura(roxo, '2026-10')).toBe('2026-09-25');
  });

  it('a compra do dia do fechamento já vai para a fatura seguinte', () => {
    expect(referenciaDaData(visa, '2026-10-02')).toBe('2026-10');
    expect(referenciaDaData(visa, '2026-10-03')).toBe('2026-11');
    expect(referenciaDaData(roxo, '2026-09-24')).toBe('2026-10');
    expect(referenciaDaData(roxo, '2026-09-25')).toBe('2026-11');
    expect(referenciaDaData(roxo, '2026-12-28')).toBe('2027-02');
  });

  it('dia 31 vira o último dia do mês curto', () => {
    const fimDoMes = { dia_fechamento: 31, dia_vencimento: 8 };
    expect(fechamentoDaFatura(fimDoMes, '2026-03')).toBe('2026-02-28');
    expect(referenciaDaData(fimDoMes, '2026-02-27')).toBe('2026-03');
    expect(referenciaDaData(fimDoMes, '2026-02-28')).toBe('2026-04');
  });

  it('a fatura começa no fechamento da anterior', () => {
    expect(inicioDaFatura(visa, '2026-10')).toBe('2026-09-03');
    expect(inicioDaFatura(roxo, '2026-10')).toBe('2026-08-25');
  });
});
