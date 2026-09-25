// Testes da busca rápida do extrato.
import { describe, expect, it } from 'vitest';
import { buscarNoExtrato, combinaComABusca } from './busca';

const CHURRASCO = {
  descricao: 'Churrasco de sábado',
  categoria: 'Lazer',
  conta: 'Conta corrente',
  valor: -30000,
  pessoas: [
    { pessoa: 'Ana', valor: 10000 },
    { pessoa: 'Bruno', valor: 15000 },
  ],
};
const ALUGUEL = { descricao: 'Aluguel', categoria: 'Moradia', conta: 'Conta corrente', valor: -185000, pessoas: [] };
const SALARIO = { descricao: 'Salário', categoria: 'Salário', conta: 'Conta corrente', valor: 680000 };

describe('combinaComABusca', () => {
  it('acha pela descrição sem acento nem caixa', () => {
    expect(combinaComABusca(CHURRASCO, 'SABADO')).toBe(true);
    expect(combinaComABusca(SALARIO, 'salario')).toBe(true);
  });

  it('acha pela pessoa da divisão e junta palavras de campos diferentes', () => {
    expect(combinaComABusca(CHURRASCO, 'bruno')).toBe(true);
    expect(combinaComABusca(CHURRASCO, 'churrasco ana')).toBe(true);
    expect(combinaComABusca(CHURRASCO, 'churrasco carla')).toBe(false);
  });

  it('acha pela categoria e pela conta', () => {
    expect(combinaComABusca(ALUGUEL, 'moradia')).toBe(true);
    expect(combinaComABusca(ALUGUEL, 'corrente')).toBe(true);
  });

  it('acha pelo valor escrito de vários jeitos, sem olhar o sinal', () => {
    expect(combinaComABusca(ALUGUEL, '1.850')).toBe(true);
    expect(combinaComABusca(ALUGUEL, '1850,00')).toBe(true);
    expect(combinaComABusca(ALUGUEL, 'R$ 1.850,00')).toBe(true);
    expect(combinaComABusca(CHURRASCO, '-300')).toBe(true);
    expect(combinaComABusca(CHURRASCO, '301')).toBe(false);
  });

  it('busca vazia deixa tudo', () => {
    expect(combinaComABusca(ALUGUEL, '  ')).toBe(true);
  });
});

describe('buscarNoExtrato', () => {
  const dias = [
    { data: '2026-09-19', saldo: 1, lancamentos: [CHURRASCO] },
    { data: '2026-09-05', saldo: 2, lancamentos: [ALUGUEL, SALARIO] },
  ];

  it('deixa só as linhas que combinam e tira o dia vazio', () => {
    expect(buscarNoExtrato(dias, 'aluguel')).toEqual([{ data: '2026-09-05', saldo: 2, lancamentos: [ALUGUEL] }]);
  });

  it('sem busca, devolve os mesmos dias', () => {
    expect(buscarNoExtrato(dias, '')).toBe(dias);
  });
});
