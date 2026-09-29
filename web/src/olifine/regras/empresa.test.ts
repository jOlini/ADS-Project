// Testes das visões do espaço de empresa: grupo de cada categoria no DRE, o
// DRE do mês (com estorno e sem transferência) e o fluxo de caixa operacional
// separado dos investimentos. Nomes e valores fictícios.
import { describe, expect, it } from 'vitest';
import {
  fluxoDeCaixa,
  grupoDaCategoria,
  montarDre,
  papelDaConta,
  saldosDaEmpresa,
  ultimosMeses,
  type LancamentoDaEmpresa,
} from './empresa';

const CATEGORIAS = [
  { id: 'vendas', nome: 'Vendas', tipo: 'RECEITA' },
  { id: 'servicos', nome: 'Serviços prestados', tipo: 'RECEITA' },
  { id: 'impostos', nome: 'Impostos', tipo: 'DESPESA' },
  { id: 'fornecedores', nome: 'Fornecedores', tipo: 'DESPESA' },
  { id: 'folha', nome: 'Folha de pagamento', tipo: 'DESPESA' },
  { id: 'aluguel', nome: 'Aluguel e estrutura', tipo: 'DESPESA' },
  { id: 'tarifas', nome: 'Tarifas bancárias', tipo: 'DESPESA' },
];

const CONTAS = [
  { id: 'caixa', tipo: 'CORRENTE', saldo_centavos: 1_000_000 },
  { id: 'gaveta', tipo: 'CARTEIRA', saldo_centavos: 20_000 },
  { id: 'aplicacao', tipo: 'INVESTIMENTO', saldo_centavos: 500_000 },
  { id: 'cartao', tipo: 'CARTAO_CREDITO', saldo_centavos: -80_000 },
];

// Receita ou despesa numa conta: a partida da conta tem o sinal do caixa.
function movimento(tipo: 'RECEITA' | 'DESPESA', data: string, valor: number, categoria: string, conta = 'caixa', estorno = false): LancamentoDaEmpresa {
  const sinal = (tipo === 'RECEITA' ? 1 : -1) * (estorno ? -1 : 1);
  return { tipo, data, valor_centavos: valor, conta_id: conta, categoria_id: categoria, partidas: [{ conta_id: conta, valor_centavos: sinal * valor }] };
}

function transferencia(data: string, valor: number, origem: string, destino: string): LancamentoDaEmpresa {
  return {
    tipo: 'TRANSFERENCIA',
    data,
    valor_centavos: valor,
    conta_id: origem,
    conta_destino_id: destino,
    partidas: [
      { conta_id: origem, valor_centavos: -valor },
      { conta_id: destino, valor_centavos: valor },
    ],
  };
}

describe('grupoDaCategoria', () => {
  it('põe as categorias iniciais da empresa nas linhas certas do DRE', () => {
    const grupo = (id: string) => grupoDaCategoria(CATEGORIAS.find((categoria) => categoria.id === id));
    expect(grupo('vendas')).toBe('RECEITA');
    expect(grupo('servicos')).toBe('RECEITA');
    expect(grupo('impostos')).toBe('DEDUCAO');
    expect(grupo('fornecedores')).toBe('CUSTO');
    expect(grupo('folha')).toBe('DESPESA_OPERACIONAL');
    expect(grupo('aluguel')).toBe('DESPESA_OPERACIONAL');
    expect(grupo('tarifas')).toBe('FINANCEIRO');
  });

  it('reconhece palavras inteiras, sem acento: DAS é imposto, Comidas não', () => {
    expect(grupoDaCategoria({ nome: 'DAS (MEI)', tipo: 'DESPESA' })).toBe('DEDUCAO');
    expect(grupoDaCategoria({ nome: 'Comidas da equipe', tipo: 'DESPESA' })).toBe('DESPESA_OPERACIONAL');
    expect(grupoDaCategoria({ nome: 'Matéria-prima', tipo: 'DESPESA' })).toBe('CUSTO');
    expect(grupoDaCategoria({ nome: 'Rendimentos da aplicação', tipo: 'RECEITA' })).toBe('FINANCEIRO');
  });

  it('receita com nome de imposto continua receita; sem categoria, vale o sinal', () => {
    expect(grupoDaCategoria({ nome: 'Devolução de impostos', tipo: 'RECEITA' })).toBe('RECEITA');
    expect(grupoDaCategoria(undefined, 500)).toBe('RECEITA');
    expect(grupoDaCategoria(undefined, -500)).toBe('DESPESA_OPERACIONAL');
  });
});

describe('montarDre', () => {
  const setembro = { de: '2026-09-01', ate: '2026-09-30' };
  const lancamentos = [
    movimento('RECEITA', '2026-09-05', 2_000_000, 'vendas'),
    movimento('RECEITA', '2026-09-10', 500_000, 'servicos'),
    movimento('DESPESA', '2026-09-20', 150_000, 'impostos'),
    movimento('DESPESA', '2026-09-08', 800_000, 'fornecedores'),
    // Compra no cartão: entra no mês da compra.
    movimento('DESPESA', '2026-09-12', 100_000, 'fornecedores', 'cartao'),
    movimento('DESPESA', '2026-09-15', 400_000, 'folha'),
    movimento('DESPESA', '2026-09-03', 200_000, 'aluguel'),
    movimento('DESPESA', '2026-09-30', 5_000, 'tarifas'),
    // Estorno de parte do aluguel: desconta do mesmo grupo.
    movimento('DESPESA', '2026-09-04', 50_000, 'aluguel', 'caixa', true),
    // Fora do DRE: pagamento de fatura, aplicação e outro mês.
    transferencia('2026-09-10', 100_000, 'caixa', 'cartao'),
    transferencia('2026-09-11', 300_000, 'caixa', 'aplicacao'),
    movimento('RECEITA', '2026-08-30', 999_999, 'vendas'),
  ];
  const dre = montarDre(lancamentos, CATEGORIAS, setembro);

  it('fecha a conta de cima para baixo', () => {
    expect(dre.receitaBruta).toBe(2_500_000);
    expect(dre.deducoes).toBe(150_000);
    expect(dre.receitaLiquida).toBe(2_350_000);
    expect(dre.custos).toBe(900_000);
    expect(dre.lucroBruto).toBe(1_450_000);
    expect(dre.despesasOperacionais).toBe(550_000);
    expect(dre.resultadoOperacional).toBe(900_000);
    expect(dre.resultadoFinanceiro).toBe(-5_000);
    expect(dre.lucroLiquido).toBe(895_000);
  });

  it('dá as margens sobre a receita bruta e conta só os lançamentos do período', () => {
    expect(dre.margemBruta).toBe(58);
    expect(dre.margemLiquida).toBe(36);
    expect(dre.lancamentos).toBe(9);
  });

  it('abre cada linha nas categorias, da maior para a menor', () => {
    expect(dre.grupos.RECEITA.categorias).toEqual([
      { nome: 'Vendas', valor: 2_000_000 },
      { nome: 'Serviços prestados', valor: 500_000 },
    ]);
    expect(dre.grupos.DESPESA_OPERACIONAL.categorias).toEqual([
      { nome: 'Folha de pagamento', valor: 400_000 },
      { nome: 'Aluguel e estrutura', valor: 150_000 },
    ]);
  });

  it('sem receita, sem margem (a tela não inventa porcentagem)', () => {
    const vazio = montarDre([], CATEGORIAS, setembro);
    expect(vazio.lucroLiquido).toBe(0);
    expect(vazio.margemBruta).toBeNull();
    expect(vazio.margemLiquida).toBeNull();
  });
});

describe('fluxoDeCaixa', () => {
  const lancamentos = [
    movimento('RECEITA', '2026-08-10', 1_000_000, 'vendas'),
    movimento('DESPESA', '2026-08-12', 300_000, 'fornecedores'),
    movimento('RECEITA', '2026-09-05', 2_000_000, 'vendas'),
    movimento('DESPESA', '2026-09-08', 800_000, 'fornecedores', 'gaveta'),
    // A compra no cartão só vira caixa quando a fatura é paga.
    movimento('DESPESA', '2026-09-12', 100_000, 'fornecedores', 'cartao'),
    transferencia('2026-09-20', 100_000, 'caixa', 'cartao'),
    // Entre contas da operação: não muda o caixa.
    transferencia('2026-09-21', 70_000, 'caixa', 'gaveta'),
    // Investimento: aplicação e resgate.
    transferencia('2026-09-22', 500_000, 'caixa', 'aplicacao'),
    transferencia('2026-09-25', 200_000, 'aplicacao', 'caixa'),
    // Rendimento lançado na conta de investimento: não é caixa da operação.
    movimento('RECEITA', '2026-09-28', 3_000, 'vendas', 'aplicacao'),
    // Estorno de uma despesa: desconta das saídas.
    movimento('DESPESA', '2026-09-26', 40_000, 'fornecedores', 'caixa', true),
    // Lançado para depois de hoje: ainda não aconteceu.
    movimento('RECEITA', '2026-09-30', 900_000, 'vendas'),
  ];
  const [agosto, setembro] = fluxoDeCaixa(lancamentos, CONTAS, { meses: ['2026-08', '2026-09'], hoje: '2026-09-29' });

  it('separa as entradas e saídas da operação por mês', () => {
    expect(agosto).toMatchObject({ entradas: 1_000_000, saidas: 300_000, geracao: 700_000, investido: 0, variacaoDoCaixa: 700_000 });
    expect(setembro?.entradas).toBe(2_000_000);
    expect(setembro?.saidas).toBe(800_000 + 100_000 - 40_000);
  });

  it('põe aplicação e resgate em investimentos, fora da operação', () => {
    expect(setembro).toMatchObject({ aplicado: 500_000, resgatado: 200_000, investido: 300_000 });
    expect(setembro?.geracao).toBe(1_140_000);
    expect(setembro?.variacaoDoCaixa).toBe(840_000);
  });

  it('devolve todos os meses pedidos, mesmo sem movimento', () => {
    const meses = fluxoDeCaixa([], CONTAS, { meses: ['2026-07', '2026-08'], hoje: '2026-09-29' });
    expect(meses.map((mes) => [mes.mes, mes.geracao])).toEqual([
      ['2026-07', 0],
      ['2026-08', 0],
    ]);
  });
});

describe('contas da empresa', () => {
  it('dá o papel de cada conta e os saldos de hoje', () => {
    expect(papelDaConta({ tipo: 'POUPANCA' })).toBe('operacional');
    expect(papelDaConta({ tipo: 'INVESTIMENTO' })).toBe('investimento');
    expect(papelDaConta({ tipo: 'CARTAO_CREDITO' })).toBe('cartao');
    expect(papelDaConta(undefined)).toBeNull();
    expect(saldosDaEmpresa(CONTAS)).toEqual({ caixa: 1_020_000, investido: 500_000 });
  });

  it('lista os últimos meses até o de hoje, virando o ano', () => {
    expect(ultimosMeses('2026-02-10', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(ultimosMeses('2026-09-29', 0)).toEqual([]);
  });
});
