// Testes do saldo por conta da Visão geral: disponível x investido.
import { describe, expect, it } from 'vitest';
import { liquidezDisponivel, parteInvestida, separarSaldos, sobreOTipo, textoDaFatia, type ContaComSaldo } from './saldos';

const contas: ContaComSaldo[] = [
  { id: 'c', nome: 'Conta corrente', tipo: 'CORRENTE', saldo: 420000 },
  { id: 'p', nome: 'Poupança', tipo: 'POUPANCA', saldo: 1500000 },
  { id: 'w', nome: 'Carteira', tipo: 'CARTEIRA', saldo: 15000 },
  { id: 't', nome: 'Tesouro Selic', tipo: 'INVESTIMENTO', saldo: 2350000 },
  { id: 'x', nome: 'Cartão Verde', tipo: 'CARTAO_CREDITO', saldo: -28469 },
];

describe('liquidezDisponivel', () => {
  it('soma corrente, poupança e carteira, sem o investido e sem o cartão', () => {
    expect(liquidezDisponivel(contas)).toBe(420000 + 1500000 + 15000);
  });

  it('conta no negativo (cheque especial) desconta, e sem contas é zero', () => {
    expect(liquidezDisponivel([{ tipo: 'CORRENTE', saldo: -5000 }, { tipo: 'CARTEIRA', saldo: 2000 }])).toBe(-3000);
    expect(liquidezDisponivel([])).toBe(0);
  });

  it('não é o card de receitas: o que entrou no mês não muda a liquidez de hoje', () => {
    // Só o saldo das contas importa; o investido (uma posição) fica fora.
    expect(liquidezDisponivel([{ tipo: 'INVESTIMENTO', saldo: 999_999 }])).toBe(0);
  });
});

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

describe('cards do saldo por conta', () => {
  it('cada tipo tem ícone e frase de apoio', () => {
    expect(sobreOTipo('CORRENTE')).toEqual({ icone: 'contas', texto: 'Dinheiro do dia a dia' });
    expect(sobreOTipo('INVESTIMENTO').texto).toBe('Aplicado, fora do saldo livre');
    expect(sobreOTipo('DESCONHECIDO' as never)).toEqual(sobreOTipo('CORRENTE'));
  });

  it('diz a parte da conta no grupo, e o negativo à parte', () => {
    expect(textoDaFatia({ fatia: 0.384, saldo: 100 }, 'disponivel')).toBe('38% do disponível');
    expect(textoDaFatia({ fatia: 1, saldo: 100 }, 'investido')).toBe('100% do investido');
    expect(textoDaFatia({ fatia: 0, saldo: -500 }, 'disponivel')).toBe('No negativo (cheque especial)');
  });
});
