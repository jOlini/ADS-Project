// Testes da aba Sociedade & Aportes: percentual, cadastro do sócio, período e
// a apuração de aportes, pró-labore e dividendos. Nomes e valores fictícios.
import { describe, expect, it } from 'vitest';
import type { LancamentoDaEmpresa } from './empresa';
import {
  apurarSociedade,
  lerPercentual,
  periodoDaSociedade,
  textoDoPercentual,
  validarSocio,
  type Socio,
} from './sociedade';

const ANA: Socio = { id: 's1', nome: 'Ana', participacao_centesimos: 6_000 };
const BRUNO: Socio = { id: 's2', nome: 'Bruno', participacao_centesimos: 4_000 };

const CATEGORIAS = [
  { id: 'aportes', nome: 'Capital', tipo: 'RECEITA', funcao: 'APORTE' },
  { id: 'lucros', nome: 'Distribuição de lucros', tipo: 'DESPESA', funcao: 'DISTRIBUICAO' },
  { id: 'prolabore', nome: 'Pró-labore', tipo: 'DESPESA', funcao: 'PRO_LABORE' },
  { id: 'vendas', nome: 'Vendas', tipo: 'RECEITA' },
];

function movimento(categoria: string, data: string, valor: number, responsavel: string | null): LancamentoDaEmpresa {
  const receita = categoria === 'aportes' || categoria === 'vendas';
  return {
    tipo: receita ? 'RECEITA' : 'DESPESA',
    data,
    valor_centavos: valor,
    conta_id: 'caixa',
    categoria_id: categoria,
    responsavel,
    partidas: [{ conta_id: 'caixa', valor_centavos: receita ? valor : -valor }],
  };
}

describe('percentual', () => {
  it('escreve e lê a participação em centésimos de ponto', () => {
    expect(textoDoPercentual(3_333)).toBe('33,33%');
    expect(textoDoPercentual(5_000)).toBe('50%');
    expect(textoDoPercentual(1_050)).toBe('10,5%');
    expect(lerPercentual('33,33')).toBe(3_333);
    expect(lerPercentual('50%')).toBe(5_000);
    expect(lerPercentual('100,01')).toBeNull();
    expect(lerPercentual('abc')).toBeNull();
  });
});

describe('validarSocio', () => {
  it('pede nome único e participação que caiba no quadro', () => {
    expect(validarSocio({ nome: 'Carla', participacao: '0' }, [ANA, BRUNO])).toEqual({});
    expect(validarSocio({ nome: ' ana ', participacao: '10' }, [ANA, BRUNO]).nome).toBe('Já existe alguém com este nome aqui.');
    expect(validarSocio({ nome: 'Carla', participacao: '5' }, [ANA, BRUNO]).participacao).toBe(
      'A soma passaria de 100%. Cabem até 0%.',
    );
    expect(validarSocio({ nome: '', participacao: 'x' }, [])).toEqual({
      nome: 'Dê o nome do sócio.',
      participacao: 'Use um percentual de 0 a 100, como 50 ou 33,33.',
    });
  });

  it('editando, a participação do próprio sócio não conta', () => {
    expect(validarSocio({ nome: 'Ana', participacao: '60' }, [ANA, BRUNO], 's1')).toEqual({});
    expect(validarSocio({ nome: 'Ana', participacao: '61' }, [ANA, BRUNO], 's1').participacao).toContain('Cabem até 60%');
  });
});

describe('periodoDaSociedade', () => {
  it('o mês, o ano ou os 12 meses até hoje', () => {
    expect(periodoDaSociedade('mes', '2026-09-29')).toEqual({ de: '2026-09-01', ate: '2026-09-29' });
    expect(periodoDaSociedade('ano', '2026-09-29')).toEqual({ de: '2026-01-01', ate: '2026-09-29' });
    expect(periodoDaSociedade('12m', '2026-09-29')).toEqual({ de: '2025-10-01', ate: '2026-09-29' });
  });
});

describe('apurarSociedade', () => {
  const lancamentos = [
    movimento('aportes', '2026-03-01', 3_000_000, 'Ana'),
    movimento('aportes', '2026-03-01', 2_000_000, 'bruno'),
    movimento('prolabore', '2026-09-05', 400_000, 'Ana'),
    movimento('lucros', '2026-09-20', 450_000, 'ANA'),
    // Aporte de alguém que não está no quadro: vai para a conferência.
    movimento('aportes', '2026-04-01', 100_000, 'Carla'),
    // Venda com responsável: não é movimento de sócio.
    movimento('vendas', '2026-09-10', 900_000, 'Ana'),
    // Fora do período.
    movimento('lucros', '2025-12-20', 999_000, 'Ana'),
  ];
  const apuracao = apurarSociedade([ANA, BRUNO], lancamentos, CATEGORIAS, { de: '2026-01-01', ate: '2026-09-29' }, 2_000_000);

  it('soma aportes, pró-labore e distribuições de cada sócio pelo responsável', () => {
    expect(apuracao.socios.map((item) => [item.socio.nome, item.aportes, item.proLabore, item.distribuido])).toEqual([
      ['Ana', 3_000_000, 400_000, 450_000],
      ['Bruno', 2_000_000, 0, 0],
    ]);
    expect([apuracao.aportes, apuracao.proLabore, apuracao.distribuido, apuracao.semSocio]).toEqual([
      5_000_000, 400_000, 450_000, 100_000,
    ]);
  });

  it('reparte o lucro pela participação e desconta o que já foi distribuído', () => {
    expect(apuracao.socios.map((item) => [item.direito, item.aDistribuir])).toEqual([
      [1_200_000, 750_000],
      [800_000, 800_000],
    ]);
    expect([apuracao.totalDaParticipacao, apuracao.completa, apuracao.aDistribuir]).toEqual([10_000, true, 1_550_000]);
  });

  it('prejuízo não se distribui', () => {
    const semLucro = apurarSociedade([ANA, BRUNO], [], CATEGORIAS, { de: '2026-01-01', ate: '2026-09-29' }, -50_000);
    expect([semLucro.lucroDistribuivel, semLucro.aDistribuir]).toEqual([0, 0]);
    expect(apurarSociedade([ANA], [], CATEGORIAS, { de: '2026-01-01', ate: '2026-09-29' }, 0).completa).toBe(false);
  });
});
