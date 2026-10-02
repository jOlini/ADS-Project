// Testes do racha a receber: o estado de cada parte (a receber, recebido,
// inadimplente pelo prazo ou pela baixa), o resumo por pessoa, os totais e o
// desconto nas despesas de quem lançou.
import { describe, expect, it } from 'vitest';
import {
  aReceberDoLancamento,
  descontarAReceber,
  estadoDaParte,
  partesDoRacha,
  prazoSugerido,
  rachaPorPessoa,
  temRacha,
  totaisDoRacha,
  type LancamentoDividido,
  type ParteDaApi,
} from './aReceber';

const HOJE = '2026-10-15';

const parte = (pessoa: string, valor: number, extras: Partial<ParteDaApi> = {}): ParteDaApi => ({
  pessoa,
  valor_centavos: valor,
  situacao: 'PENDENTE',
  ...extras,
});

const despesa = (id: string, divisao: ParteDaApi[], extras: Partial<LancamentoDividido> = {}): LancamentoDividido => ({
  id,
  tipo: 'DESPESA',
  descricao: `Despesa ${id}`,
  data: '2026-10-01',
  divisao,
  ...extras,
});

describe('estadoDaParte', () => {
  it('pendente dentro do prazo, ou sem prazo, está a receber', () => {
    expect(estadoDaParte(parte('Ana', 100, { vencimento: '2026-10-20' }), HOJE)).toBe('a-receber');
    expect(estadoDaParte(parte('Ana', 100, { vencimento: HOJE }), HOJE)).toBe('a-receber');
    expect(estadoDaParte(parte('Ana', 100), HOJE)).toBe('a-receber');
  });

  it('pendente com o prazo vencido vira inadimplência sozinha', () => {
    expect(estadoDaParte(parte('Ana', 100, { vencimento: '2026-10-14' }), HOJE)).toBe('inadimplente');
  });

  it('a baixa (não pago) é inadimplência; a recebida, nunca', () => {
    expect(estadoDaParte(parte('Ana', 100, { situacao: 'NAO_PAGO' }), HOJE)).toBe('inadimplente');
    expect(estadoDaParte(parte('Ana', 100, { situacao: 'RECEBIDO', vencimento: '2026-01-01' }), HOJE)).toBe('recebido');
  });

  it('a parte da API antiga, sem situação, está a receber', () => {
    expect(estadoDaParte({ pessoa: 'Ana', valor_centavos: 100 }, HOJE)).toBe('a-receber');
  });
});

describe('temRacha', () => {
  it('só a despesa dividida que não é estorno, estornada nem reembolso', () => {
    expect(temRacha(despesa('1', [parte('Ana', 100)]))).toBe(true);
    expect(temRacha(despesa('2', []))).toBe(false);
    expect(temRacha(despesa('3', [parte('Ana', 100)], { tipo: 'RECEITA' }))).toBe(false);
    expect(temRacha(despesa('4', [parte('Ana', 100)], { estornado_por: 'x' }))).toBe(false);
    expect(temRacha(despesa('5', [parte('Ana', 100)], { estorno_de: 'x' }))).toBe(false);
    expect(temRacha(despesa('6', [parte('Ana', 100)], { reembolso_de: 'x' }))).toBe(false);
  });
});

describe('partesDoRacha e rachaPorPessoa', () => {
  const lancamentos = [
    despesa('jantar', [parte('Bruno', 6_000, { vencimento: '2026-10-30' }), parte('Carla', 4_000, { vencimento: '2026-10-10' })], {
      data: '2026-10-05',
    }),
    despesa('show', [parte(' bruno ', 2_000, { situacao: 'RECEBIDO', recebido_em: '2026-10-08' })], { data: '2026-10-02' }),
    despesa('estornado', [parte('Bruno', 9_999)], { estornado_por: 'e1' }),
  ];

  it('cada parte com o endereço na API, o estado e os dias de atraso', () => {
    const partes = partesDoRacha(lancamentos, HOJE);

    expect(partes).toHaveLength(3);
    expect(partes[1]).toMatchObject({ lancamentoId: 'jantar', indice: 1, pessoa: 'Carla', estado: 'inadimplente', diasDeAtraso: 5 });
    expect(partes[0]).toMatchObject({ estado: 'a-receber', diasDeAtraso: 0 });
  });

  it('junta a mesma pessoa (caixa e espaços não contam) e põe quem deve mais primeiro', () => {
    const devedores = rachaPorPessoa(partesDoRacha(lancamentos, HOJE));

    expect(devedores.map((devedor) => devedor.pessoa)).toEqual(['Bruno', 'Carla']);
    expect(devedores[0]).toMatchObject({ aReceber: 6_000, recebido: 2_000, inadimplente: 0 });
    expect(devedores[1]).toMatchObject({ aReceber: 0, inadimplente: 4_000 });
    // A receber primeiro, a paga por último.
    expect(devedores[0]?.partes.map((item) => item.estado)).toEqual(['a-receber', 'recebido']);
  });

  it('os totais: a receber (e o que vence no mês), recebido e assumido', () => {
    const totais = totaisDoRacha(partesDoRacha(lancamentos, HOJE), '2026-10-31');

    expect(totais).toEqual({ aReceber: 6_000, aReceberNoMes: 6_000, recebido: 2_000, inadimplente: 4_000 });
  });

  it('a parte a receber sem prazo, ou com prazo no mês seguinte, fica fora do mês', () => {
    const partes = partesDoRacha(
      [despesa('1', [parte('Ana', 1_000), parte('Bia', 2_000, { vencimento: '2026-11-05' }), parte('Cid', 3_000, { vencimento: '2026-10-31' })])],
      HOJE,
    );

    expect(totaisDoRacha(partes, '2026-10-31')).toMatchObject({ aReceber: 6_000, aReceberNoMes: 3_000 });
  });
});

describe('descontarAReceber', () => {
  const original = despesa('jantar', [
    parte('Bruno', 6_000, { vencimento: '2026-10-30' }),
    parte('Carla', 4_000, { vencimento: '2026-10-10' }),
    parte('Davi', 5_000, { situacao: 'RECEBIDO' }),
  ]);
  const linha = { tipo: 'despesa', valor: -20_000, original };

  it('tira da despesa só a parte a receber; a vencida volta a pesar e a recebida já foi pelo reembolso', () => {
    expect(aReceberDoLancamento(original, HOJE)).toBe(6_000);
    expect(descontarAReceber([linha], HOJE)[0]?.valor).toBe(-14_000);
  });

  it('com a baixa de todos, a despesa inteira é de quem lançou', () => {
    const tudoAssumido = despesa('x', [parte('Bruno', 6_000, { situacao: 'NAO_PAGO' })]);

    expect(descontarAReceber([{ tipo: 'despesa', valor: -10_000, original: tudoAssumido }], HOJE)[0]?.valor).toBe(-10_000);
  });

  it('não mexe em receita, transferência nem em linha sem racha, e nunca vira positivo', () => {
    const receita = { tipo: 'receita', valor: 5_000, original };
    const semRacha = { tipo: 'despesa', valor: -1_000, original: despesa('y', []) };
    const tudoDeOutro = { tipo: 'despesa', valor: -6_000, original: despesa('z', [parte('Bruno', 6_000)]) };

    const [r, s, t] = descontarAReceber([receita, semRacha, tudoDeOutro], HOJE);

    expect(r).toBe(receita);
    expect(s).toBe(semRacha);
    expect(t?.valor).toBe(0);
  });
});

describe('prazoSugerido', () => {
  it('30 dias depois da data, virando o mês e o ano', () => {
    expect(prazoSugerido('2026-10-02')).toBe('2026-11-01');
    expect(prazoSugerido('2026-12-15')).toBe('2027-01-14');
  });
});
