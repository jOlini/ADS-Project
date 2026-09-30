// Testes da aba Pessoal (RH): quem entra na folha, o custo de cada pessoa, o
// resumo, o que falta lançar, a próxima folha e o formulário. Nomes e valores
// fictícios.
import { describe, expect, it } from 'vitest';
import {
  ativoNaCompetencia,
  competenciasParaLancar,
  corpoDaPessoa,
  corpoDoColaborador,
  dataDoPagamento,
  custoMensal,
  folhaClt,
  proximaFolha,
  resumoDaFolha,
  situacaoDaFolha,
  somarCompetencia,
  validarColaborador,
  type Colaborador,
} from './folha';

const CARLA: Colaborador = {
  id: 'c1',
  nome: 'Carla',
  vinculo: 'CLT',
  salario_centavos: 300_000,
  beneficios: [
    { nome: 'VR', valor_centavos: 60_000 },
    { nome: 'VT', valor_centavos: 20_000 },
  ],
  dia_pagamento: 5,
  admissao: '2026-01-10',
  ativo: true,
  competencias_lancadas: ['2026-08'],
};
const DAVI: Colaborador = { ...CARLA, id: 'c2', nome: 'Davi', vinculo: 'PJ', salario_centavos: 500_000, beneficios: [], dia_pagamento: 10, competencias_lancadas: [] };
const ANA: Colaborador = { ...CARLA, id: 'c3', nome: 'Ana', vinculo: 'PRO_LABORE', salario_centavos: 400_000, beneficios: [], dia_pagamento: 31, competencias_lancadas: ['2026-08', '2026-09'] };
const EVA: Colaborador = { ...CARLA, id: 'c4', nome: 'Eva', ativo: false, competencias_lancadas: [] };
const NOVO: Colaborador = { ...CARLA, id: 'c5', nome: 'Fábio', admissao: '2026-10-01', competencias_lancadas: [] };
const TODOS = [CARLA, DAVI, ANA, EVA, NOVO];

describe('quem entra na folha', () => {
  it('ativo e admitido até o fim da competência', () => {
    expect(ativoNaCompetencia(CARLA, '2026-09')).toBe(true);
    expect(ativoNaCompetencia(EVA, '2026-09')).toBe(false);
    expect(ativoNaCompetencia(NOVO, '2026-09')).toBe(false);
    expect(ativoNaCompetencia(NOVO, '2026-10')).toBe(true);
    expect(ativoNaCompetencia({ ativo: true, admissao: null }, '2026-09')).toBe(true);
  });

  it('o custo mensal é o salário mais os benefícios', () => {
    expect(custoMensal(CARLA)).toBe(380_000);
    expect(folhaClt(TODOS, '2026-09')).toBe(300_000);
    expect(somarCompetencia('2026-12', 1)).toBe('2027-01');
  });
});

describe('resumoDaFolha', () => {
  it('soma por vínculo, com as estimativas sobre os salários CLT', () => {
    const resumo = resumoDaFolha(TODOS, '2026-09');
    expect(resumo.pessoas).toBe(3);
    expect(resumo.porVinculo).toEqual({
      CLT: { pessoas: 1, total: 380_000 },
      PJ: { pessoas: 1, total: 500_000 },
      PRO_LABORE: { pessoas: 1, total: 400_000 },
    });
    expect([resumo.salarios, resumo.beneficios, resumo.total]).toEqual([1_200_000, 80_000, 1_280_000]);
    expect([resumo.fgts, resumo.decimoTerceiro, resumo.ferias]).toEqual([24_000, 25_000, 33_333]);
  });
});

describe('o que falta lançar', () => {
  it('separa quem já está lançado na competência', () => {
    const agosto = situacaoDaFolha(TODOS, '2026-08');
    expect(agosto.pendentes.map((pessoa) => pessoa.nome)).toEqual(['Davi']);
    const setembro = situacaoDaFolha(TODOS, '2026-09');
    expect(setembro.lancados.map((pessoa) => pessoa.nome)).toEqual(['Ana']);
    expect(setembro.totalPendente).toBe(880_000);
  });

  it('sugere a competência mais antiga com gente pendente', () => {
    expect(competenciasParaLancar(TODOS, '2026-09-29')).toEqual({ opcoes: ['2026-08', '2026-09'], sugerida: '2026-08' });
    expect(competenciasParaLancar([ANA], '2026-09-29').sugerida).toBe('2026-09');
  });

  it('a próxima folha que sai do caixa, no primeiro dia de pagamento', () => {
    expect(proximaFolha(TODOS, '2026-09-29')).toEqual({ competencia: '2026-08', data: '2026-09-10', total: 500_000 });
    expect(proximaFolha([ANA], '2026-09-29')).toBeNull();
    expect(proximaFolha([{ ...ANA, competencias_lancadas: [] }], '2026-09-29')).toEqual({
      competencia: '2026-08',
      data: '2026-09-30',
      total: 400_000,
    });
  });
});

describe('formulário da pessoa', () => {
  const formulario = {
    nome: 'Gil',
    vinculo: 'CLT',
    cargo: ' Vendedor ',
    salario: '2.500,00',
    dia_pagamento: '5',
    admissao: '2026-09-01',
    ativo: true,
    beneficios: [{ nome: 'VR', valor: '400,00' }],
  };

  it('confere nome único, vínculo, salário, dia e benefícios', () => {
    expect(validarColaborador(formulario, TODOS)).toEqual({});
    expect(validarColaborador({ ...formulario, nome: 'CARLA' }, TODOS).nome).toBe('Já existe alguém com este nome na folha.');
    expect(validarColaborador({ ...formulario, nome: 'Carla' }, TODOS, 'c1')).toEqual({});
    expect(
      validarColaborador(
        { ...formulario, vinculo: '', salario: '0', dia_pagamento: '32', admissao: '2026-02-30', beneficios: [{ nome: '', valor: '' }] },
        TODOS,
      ),
    ).toEqual({
      vinculo: 'Escolha o vínculo.',
      salario: 'Use um valor maior que zero, no formato 1.234,56.',
      dia_pagamento: 'Use um dia de 1 a 31.',
      admissao: 'Data inválida.',
      'beneficios.0.nome': 'Dê o nome do benefício.',
      'beneficios.0.valor': 'Valor maior que zero.',
    });
  });

  it('manda os valores em centavos e o cargo vazio como null', () => {
    expect(corpoDoColaborador(formulario)).toEqual({
      nome: 'Gil',
      vinculo: 'CLT',
      salario_centavos: 250_000,
      dia_pagamento: 5,
      cargo: 'Vendedor',
      admissao: '2026-09-01',
      ativo: true,
      beneficios: [{ nome: 'VR', valor_centavos: 40_000 }],
    });
    expect(corpoDoColaborador({ ...formulario, cargo: ' ', admissao: '' })).toMatchObject({ cargo: null, admissao: null });
  });
});

describe('pagamento e corpo da pessoa cadastrada', () => {
  it('o pagamento sai no mês seguinte, com o dia 31 virando o último dia', () => {
    expect(dataDoPagamento('2026-09', 5)).toBe('2026-10-05');
    expect(dataDoPagamento('2026-10', 31)).toBe('2026-11-30');
    expect(dataDoPagamento('2026-12', 10)).toBe('2027-01-10');
  });

  it('monta o corpo do PUT a partir do cadastro, com a mudança pedida', () => {
    expect(corpoDaPessoa(CARLA, { ativo: false })).toEqual({
      nome: 'Carla',
      vinculo: 'CLT',
      salario_centavos: 300_000,
      dia_pagamento: 5,
      cargo: null,
      admissao: '2026-01-10',
      ativo: false,
      beneficios: [
        { nome: 'VR', valor_centavos: 60_000 },
        { nome: 'VT', valor_centavos: 20_000 },
      ],
    });
  });
});
