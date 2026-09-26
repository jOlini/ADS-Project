import { describe, expect, it } from 'vitest';
import { reguaDoGrafico, serieDiaria, serieDosMeses, somarDias } from './serie';

describe('somarDias', () => {
  it('atravessa o fim do mês e do ano', () => {
    expect(somarDias('2026-09-30', 1)).toBe('2026-10-01');
    expect(somarDias('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('serieDiaria', () => {
  const linhas = [
    { data: '2026-09-24', valor: -5000 },
    { data: '2026-09-25', valor: 20000 },
    { data: '2026-09-25', valor: -30000, tipo: 'transferencia' },
    { data: '2026-09-28', valor: -1000 },
  ];

  it('anda para trás a partir do saldo atual, um ponto por dia', () => {
    const serie = serieDiaria(linhas, 100000, { hoje: '2026-09-26', dias: 4 });
    expect(serie).toEqual([
      // Fim do dia 23: antes do −50, do +200 e do −10 (a transferência não conta).
      { data: '2026-09-23', saldo: 86000 },
      { data: '2026-09-24', saldo: 81000 },
      { data: '2026-09-25', saldo: 101000 },
      // Hoje: só falta tirar o lançamento com data futura.
      { data: '2026-09-26', saldo: 101000 },
    ]);
  });

  it('sem lançamentos, a linha é o saldo atual', () => {
    expect(serieDiaria([], 5000, { hoje: '2026-09-26', dias: 2 })).toEqual([
      { data: '2026-09-25', saldo: 5000 },
      { data: '2026-09-26', saldo: 5000 },
    ]);
  });
});

describe('serieDosMeses', () => {
  it('usa o saldo final de cada mês do relatório', () => {
    expect(
      serieDosMeses([
        { mes: '2026-08', saldo_final_centavos: 1000 },
        { mes: '2026-09', saldo_final_centavos: 2500 },
      ]),
    ).toEqual([
      { data: '2026-08', saldo: 1000 },
      { data: '2026-09', saldo: 2500 },
    ]);
  });
});

describe('reguaDoGrafico', () => {
  it('cobre os valores com passos redondos e folga em cima e embaixo', () => {
    const regua = reguaDoGrafico([412000, 452000, 438000]);
    expect(regua.minimo).toBeLessThanOrEqual(412000 - 6000);
    expect(regua.maximo).toBeGreaterThanOrEqual(452000 + 6000);
    expect(regua.marcas).toEqual([400000, 420000, 440000, 460000]);
  });

  it('série só positiva não ganha régua negativa', () => {
    expect(reguaDoGrafico([1000, 90000]).minimo).toBe(0);
  });

  it('abre uma folga quando a série é plana', () => {
    const regua = reguaDoGrafico([5000, 5000]);
    expect(regua.minimo).toBeLessThan(5000);
    expect(regua.maximo).toBeGreaterThan(5000);
  });

  it('funciona com valores negativos', () => {
    const regua = reguaDoGrafico([-12000, 3000]);
    expect(regua.minimo).toBeLessThanOrEqual(-12000);
    expect(regua.marcas).toContain(0);
  });

  it('sem valores, devolve uma régua neutra', () => {
    expect(reguaDoGrafico([]).marcas).toHaveLength(5);
  });
});
