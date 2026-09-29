// Testes do saldo por conta da Visão geral: disponível x investido.
import { describe, expect, it } from 'vitest';
import { parteInvestida, separarSaldos, type ContaComSaldo } from './saldos';

const contas: ContaComSaldo[] = [
  { id: 'c', nome: 'Conta corrente', tipo: 'CORRENTE', saldo: 420000 },
  { id: 'p', nome: 'Poupança', tipo: 'POUPANCA', saldo: 1500000 },
  { id: 'w', nome: 'Carteira', tipo: 'CARTEIRA', saldo: 15000 },
  { id: 't', nome: 'Tesouro Selic', tipo: 'INVESTIMENTO', saldo: 2350000 },
  { id: 'x', nome: 'Cartão Verde', tipo: 'CARTAO_CREDITO', saldo: -28469 },
];

describe('separarSaldos', () => {
  it('separa o disponível (corrente, carteira, poupança) do investido, sem o cartão', () => {
    const saldos = separarSaldos(contas);
    expect(saldos.disponivel.total).toBe(1935000);
    expect(saldos.investido.total).toBe(2350000);
    expect(saldos.total).toBe(4285000);
    expect(saldos.disponivel.contas.map((conta) => conta.nome)).toEqual(['Poupança', 'Conta corrente', 'Carteira']);
    expect(saldos.investido.contas.map((conta) => conta.nome)).toEqual(['Tesouro Selic']);
  });

  it('dá a fatia de cada conta no grupo, para a barra', () => {
    const { disponivel } = separarSaldos(contas);
    const soma = disponivel.contas.reduce((total, conta) => total + conta.fatia, 0);
    expect(soma).toBeCloseTo(1, 10);
    expect(disponivel.contas[0]?.fatia).toBeCloseTo(1500000 / 1935000, 10);
  });

  it('saldo negativo (cheque especial) entra no total, mas não na barra', () => {
    const { disponivel } = separarSaldos([
      { nome: 'Conta A', tipo: 'CORRENTE', saldo: -5000 },
      { nome: 'Carteira', tipo: 'CARTEIRA', saldo: 10000 },
    ]);
    expect(disponivel.total).toBe(5000);
    expect(disponivel.contas.find((conta) => conta.nome === 'Conta A')?.fatia).toBe(0);
    expect(disponivel.contas.find((conta) => conta.nome === 'Carteira')?.fatia).toBe(1);
  });

  it('conta desativada e zerada some; com saldo, continua', () => {
    const { disponivel } = separarSaldos([
      { nome: 'Antiga', tipo: 'CORRENTE', saldo: 0, ativa: false },
      { nome: 'Encerrando', tipo: 'CORRENTE', saldo: 1200, ativa: false },
    ]);
    expect(disponivel.contas.map((conta) => conta.nome)).toEqual(['Encerrando']);
  });

  it('sem conta de investimento, o investido fica zerado e vazio', () => {
    const saldos = separarSaldos(contas.filter((conta) => conta.tipo !== 'INVESTIMENTO'));
    expect(saldos.investido).toEqual({ total: 0, contas: [] });
  });
});

describe('parteInvestida', () => {
  it('diz quanto do patrimônio está aplicado', () => {
    expect(parteInvestida(separarSaldos(contas))).toBe(55);
    expect(parteInvestida(separarSaldos([]))).toBeNull();
  });
});
