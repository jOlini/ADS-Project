// Testes do dinheiro que a gestão da empresa lança numa conta.
import { describe, expect, it } from 'vitest';
import { corpoDoMovimento, validarMovimento } from './movimento';

describe('validarMovimento', () => {
  it('pede conta, valor maior que zero e data válida', () => {
    expect(validarMovimento({ conta_id: '', valor: '', data: '2026-02-30' })).toEqual({
      conta_id: 'Escolha a conta de onde o dinheiro sai.',
      valor: 'Informe o valor.',
      data: 'Informe uma data válida.',
    });
    expect(validarMovimento({ conta_id: '', valor: '0,00', data: '2026-09-01' }, { entra: true })).toEqual({
      conta_id: 'Escolha a conta em que o dinheiro entra.',
      valor: 'O valor precisa ser maior que zero.',
    });
    expect(validarMovimento({ conta_id: 'c1', valor: '1.500,00', data: '2026-09-01' })).toEqual({});
    expect(validarMovimento({ conta_id: 'c1', valor: 'abc', data: '2026-09-01' }).valor).toContain('inválido');
    expect(validarMovimento({ conta_id: 'c1', valor: '1', data: '2026-09-01', descricao: 'x'.repeat(121) }).descricao).toBe(
      'Use até 120 caracteres.',
    );
  });
});

describe('corpoDoMovimento', () => {
  it('leva o valor em centavos e a descrição só quando há', () => {
    expect(corpoDoMovimento({ conta_id: 'c1', valor: '1.500,50', data: '2026-09-01', descricao: '  ' })).toEqual({
      conta_id: 'c1',
      valor_centavos: 150_050,
      data: '2026-09-01',
    });
    expect(corpoDoMovimento({ conta_id: 'c1', valor: '10', data: '2026-09-01', descricao: ' Capital inicial ' }).descricao).toBe(
      'Capital inicial',
    );
  });
});
