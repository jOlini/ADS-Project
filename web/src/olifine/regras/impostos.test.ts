// Testes da aba Impostos: competência e vencimento, faturamento do mês,
// provisão sobre o faturamento, a folha ou o valor fixo, a agenda com a
// situação de cada guia, os alertas do sino e o formulário. Valores fictícios.
import { describe, expect, it } from 'vitest';
import type { LancamentoDaEmpresa } from './empresa';
import {
  agendaDosTributos,
  alertasDosTributos,
  competenciaDoMes,
  corpoDoTributo,
  faturamentoPorMes,
  mesesDaCompetencia,
  situacaoDaGuia,
  SUGESTOES,
  textoDaAliquota,
  textoDaCompetencia,
  validarTributo,
  valorPrevisto,
  vencimentoDe,
  type Tributo,
} from './impostos';

const DAS: Tributo = {
  id: 't1',
  nome: 'DAS',
  tipo: 'DAS',
  base: 'FATURAMENTO',
  aliquota_centesimos: 600,
  valor_fixo_centavos: null,
  dia_vencimento: 20,
  periodicidade: 'MENSAL',
  ativo: true,
  pagamentos: [{ competencia: '2026-07', lancamento_id: 'l1', valor_centavos: 6_000, data: '2026-08-20' }],
};
const IRPJ: Tributo = { ...DAS, id: 't2', nome: 'IRPJ', tipo: 'DARF', aliquota_centesimos: 480, dia_vencimento: 31, periodicidade: 'TRIMESTRAL', pagamentos: [] };
const FGTS: Tributo = { ...DAS, id: 't3', nome: 'FGTS', tipo: 'FGTS', base: 'FOLHA', aliquota_centesimos: 800, pagamentos: [] };
const MEI: Tributo = { ...DAS, id: 't4', nome: 'DAS-MEI', base: 'FIXO', aliquota_centesimos: null, valor_fixo_centavos: 8_105, pagamentos: [] };

function receita(data: string, valor: number, categoria = 'vendas'): LancamentoDaEmpresa {
  return { tipo: 'RECEITA', data, valor_centavos: valor, conta_id: 'caixa', categoria_id: categoria, partidas: [{ conta_id: 'caixa', valor_centavos: valor }] };
}

describe('competências e vencimentos', () => {
  it('a guia vence no mês seguinte, no dia do tributo (31 vira o último dia)', () => {
    expect(vencimentoDe(DAS, '2026-08')).toBe('2026-09-20');
    expect(vencimentoDe(DAS, '2026-12')).toBe('2027-01-20');
    expect(vencimentoDe(IRPJ, '2026-09')).toBe('2026-10-31');
    expect(vencimentoDe({ dia_vencimento: 31 }, '2026-10')).toBe('2026-11-30');
  });

  it('o trimestral tem uma competência por trimestre, pelo último mês', () => {
    expect(competenciaDoMes('2026-08', 'TRIMESTRAL')).toBe('2026-09');
    expect(competenciaDoMes('2026-12', 'TRIMESTRAL')).toBe('2026-12');
    expect(competenciaDoMes('2026-08', 'MENSAL')).toBe('2026-08');
    expect(mesesDaCompetencia('2026-09', 'TRIMESTRAL')).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(textoDaCompetencia('2026-09', 'TRIMESTRAL')).toBe('3º tri/2026');
    expect(textoDaCompetencia('2026-08')).toBe('08/2026');
    expect(textoDaAliquota(288)).toBe('2,88%');
  });
});

describe('provisão', () => {
  const categorias = [
    { id: 'vendas', nome: 'Vendas', tipo: 'RECEITA' },
    { id: 'aportes', nome: 'Aportes dos sócios', tipo: 'RECEITA', funcao: 'APORTE' },
  ];
  const faturamento = faturamentoPorMes(
    [
      receita('2026-07-10', 100_000),
      receita('2026-08-10', 300_000),
      receita('2026-08-15', 200_000),
      // Aporte do sócio não é faturamento.
      receita('2026-08-16', 900_000, 'aportes'),
      receita('2026-09-05', 150_000),
    ],
    categorias,
  );
  const bases = { faturamento, folha: (mes: string) => (mes === '2026-08' ? 400_000 : 300_000) };

  it('soma o faturamento de cada mês, sem o dinheiro dos sócios', () => {
    expect(Object.fromEntries(faturamento)).toEqual({ '2026-07': 100_000, '2026-08': 500_000, '2026-09': 150_000 });
  });

  it('calcula a guia pela alíquota, pela folha ou pelo valor fixo', () => {
    expect(valorPrevisto(DAS, '2026-08', bases)).toBe(30_000);
    expect(valorPrevisto(IRPJ, '2026-09', bases)).toBe(36_000);
    expect(valorPrevisto(FGTS, '2026-08', bases)).toBe(32_000);
    expect(valorPrevisto(MEI, '2026-08', bases)).toBe(8_105);
  });
});

describe('agenda', () => {
  it('diz a situação de cada guia', () => {
    expect(situacaoDaGuia('2026-08', '2026-09-20', true, '2026-09-29')).toBe('PAGA');
    expect(situacaoDaGuia('2026-08', '2026-09-20', false, '2026-09-29')).toBe('ATRASADA');
    expect(situacaoDaGuia('2026-08', '2026-09-20', false, '2026-09-14')).toBe('VENCE_LOGO');
    expect(situacaoDaGuia('2026-08', '2026-09-20', false, '2026-09-01')).toBe('A_VENCER');
    expect(situacaoDaGuia('2026-09', '2026-10-20', false, '2026-09-29')).toBe('EM_ANDAMENTO');
  });

  it('lista as últimas competências de cada tributo ativo, da mais urgente para a paga', () => {
    const agenda = agendaDosTributos([DAS, { ...FGTS, ativo: false }], '2026-09-29', null);
    expect(agenda.map((guia) => [guia.competencia, guia.situacao, guia.dias])).toEqual([
      ['2026-08', 'ATRASADA', -9],
      ['2026-09', 'EM_ANDAMENTO', 21],
      ['2026-07', 'PAGA', -40],
    ]);
    expect(agenda[2]?.pagamento?.lancamento_id).toBe('l1');
  });

  it('o sino avisa só das atrasadas e das que vencem em até 7 dias', () => {
    const alertas = alertasDosTributos([DAS, IRPJ], '2026-09-15');
    expect(alertas.map((guia) => [guia.tributo.nome, guia.competencia, guia.situacao])).toEqual([
      ['IRPJ', '2026-03', 'ATRASADA'],
      ['IRPJ', '2026-06', 'ATRASADA'],
      ['DAS', '2026-08', 'VENCE_LOGO'],
    ]);
  });
});

describe('formulário do tributo', () => {
  const base = { nome: 'DAS', tipo: 'DAS', base: 'FATURAMENTO', aliquota: '6', valor_fixo: '', dia_vencimento: '20', periodicidade: 'MENSAL', ativo: true };

  it('pede alíquota na base percentual e valor na fixa', () => {
    expect(validarTributo(base)).toEqual({});
    expect(validarTributo({ ...base, aliquota: '' }).aliquota).toContain('alíquota');
    expect(validarTributo({ ...base, aliquota: '101' }).aliquota).toContain('alíquota');
    expect(validarTributo({ ...base, base: 'FIXO' }).valor_fixo).toBe('Informe o valor da guia.');
    expect(validarTributo({ ...base, dia_vencimento: '0', nome: '', tipo: 'X' })).toEqual({
      nome: 'Dê o nome do tributo.',
      tipo: 'Escolha a guia.',
      dia_vencimento: 'Use um dia de 1 a 31.',
    });
  });

  it('manda a alíquota em centésimos de ponto e só o campo da base', () => {
    expect(corpoDoTributo({ ...base, aliquota: '4,8%' })).toMatchObject({ aliquota_centesimos: 480, valor_fixo_centavos: null });
    expect(corpoDoTributo({ ...base, base: 'FIXO', valor_fixo: '81,05' })).toMatchObject({
      aliquota_centesimos: null,
      valor_fixo_centavos: 8_105,
    });
  });

  it('sugere os tributos de cada regime', () => {
    expect(SUGESTOES.SIMPLES?.map((item) => item.nome)).toEqual(['DAS', 'FGTS']);
    expect(SUGESTOES.MEI?.[0]).toMatchObject({ base: 'FIXO', valor_fixo_centavos: null });
    expect(SUGESTOES.PRESUMIDO?.filter((item) => item.periodicidade === 'TRIMESTRAL').map((item) => item.nome)).toEqual([
      'IRPJ',
      'CSLL',
    ]);
  });
});
