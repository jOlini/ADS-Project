import { describe, expect, it } from 'vitest';
import { dataExiste, formatarData, hojeIso } from './datas';

describe('formatarData', () => {
  it('converte ISO para o formato brasileiro', () => {
    expect(formatarData('2000-05-10')).toBe('10/05/2000');
  });

  it('devolve texto vazio para valor fora do formato', () => {
    expect(formatarData('10/05/2000')).toBe('');
    expect(formatarData(undefined)).toBe('');
  });
});

describe('dataExiste', () => {
  it('distingue dia real de dia inexistente, inclusive em ano bissexto', () => {
    expect(dataExiste('2024-02-29')).toBe(true);
    expect(dataExiste('2023-02-29')).toBe(false);
    expect(dataExiste('2023-13-01')).toBe(false);
  });
});

describe('hojeIso', () => {
  it('usa a data local com dois dígitos para mês e dia', () => {
    expect(hojeIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
