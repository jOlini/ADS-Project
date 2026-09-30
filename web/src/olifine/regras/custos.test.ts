// Testes da aba Custos: classe de cada despesa (escolhida, pela função ou pelo
// nome), margens, lucro, ponto de equilíbrio e a barra de cada R$ 100.
// Nomes e valores fictícios.
import { describe, expect, it } from 'vitest';
import { classeDaCategoria, classeSugerida, faixasDaVenda, montarCustos } from './custos';
import type { LancamentoDaEmpresa } from './empresa';

const CATEGORIAS = [
  { id: 'vendas', nome: 'Vendas', tipo: 'RECEITA' },
  { id: 'aportes', nome: 'Aportes dos sócios', tipo: 'RECEITA', funcao: 'APORTE' },
  { id: 'rendimentos', nome: 'Rendimentos', tipo: 'RECEITA' },
  { id: 'fornecedores', nome: 'Fornecedores', tipo: 'DESPESA', classe_de_custo: 'VARIAVEL' },
  { id: 'impostos', nome: 'Impostos', tipo: 'DESPESA', funcao: 'IMPOSTOS' },
  { id: 'aluguel', nome: 'Aluguel e estrutura', tipo: 'DESPESA' },
  { id: 'folha', nome: 'Folha de pagamento', tipo: 'DESPESA', funcao: 'SALARIOS' },
  { id: 'marketing', nome: 'Marketing', tipo: 'DESPESA' },
  // A pessoa trocou: para ela, o marketing é custo variável (comissão).
  { id: 'comissao', nome: 'Anúncios por venda', tipo: 'DESPESA', classe_de_custo: 'VARIAVEL' },
  { id: 'lucros', nome: 'Distribuição de lucros', tipo: 'DESPESA', funcao: 'DISTRIBUICAO' },
];

function movimento(tipo: 'RECEITA' | 'DESPESA', data: string, valor: number, categoria: string, estorno = false): LancamentoDaEmpresa {
  const sinal = (tipo === 'RECEITA' ? 1 : -1) * (estorno ? -1 : 1);
  return { tipo, data, valor_centavos: valor, conta_id: 'caixa', categoria_id: categoria, partidas: [{ conta_id: 'caixa', valor_centavos: sinal * valor }] };
}

describe('classe de cada despesa', () => {
  it('a escolhida vale; sem ela, a da função; sem função, a do nome', () => {
    expect(classeDaCategoria({ nome: 'Marketing', classe_de_custo: 'FIXO' })).toBe('FIXO');
    expect(classeSugerida({ nome: 'Guias', funcao: 'IMPOSTOS' })).toBe('VARIAVEL');
    expect(classeSugerida({ nome: 'Pró-labore', funcao: 'PRO_LABORE' })).toBe('FIXO');
    expect(classeSugerida({ nome: 'Retirada', funcao: 'DISTRIBUICAO' })).toBe('FORA');
    expect(classeSugerida({ nome: 'Matéria-prima' })).toBe('VARIAVEL');
    expect(classeSugerida({ nome: 'Contabilidade' })).toBe('FIXO');
    expect(classeSugerida({ nome: 'Tarifas bancárias' })).toBe('OPERACIONAL');
    // Palavra inteira: "Vendas" não é "das" (o imposto do MEI).
    expect(classeSugerida({ nome: 'Comissões de vendas' })).toBe('VARIAVEL');
  });

  it('classe desconhecida gravada volta para a sugestão', () => {
    expect(classeDaCategoria({ nome: 'Aluguel', classe_de_custo: 'OUTRA' })).toBe('FIXO');
  });
});

describe('montarCustos', () => {
  const lancamentos = [
    movimento('RECEITA', '2026-09-05', 1_000_000, 'vendas'),
    // Dinheiro dos sócios e rendimento: não são venda.
    movimento('RECEITA', '2026-09-06', 500_000, 'aportes'),
    movimento('RECEITA', '2026-09-07', 2_000, 'rendimentos'),
    movimento('DESPESA', '2026-09-08', 300_000, 'fornecedores'),
    movimento('DESPESA', '2026-09-20', 60_000, 'impostos'),
    movimento('DESPESA', '2026-09-10', 200_000, 'aluguel'),
    movimento('DESPESA', '2026-09-05', 150_000, 'folha'),
    movimento('DESPESA', '2026-09-12', 50_000, 'marketing'),
    movimento('DESPESA', '2026-09-13', 40_000, 'comissao'),
    // Estorno de parte dos fornecedores.
    movimento('DESPESA', '2026-09-14', 20_000, 'fornecedores', true),
    movimento('DESPESA', '2026-09-25', 100_000, 'lucros'),
    // Fora do mês.
    movimento('DESPESA', '2026-08-31', 999_000, 'aluguel'),
  ];
  const custos = montarCustos(lancamentos, CATEGORIAS, { de: '2026-09-01', ate: '2026-09-30' });

  it('separa variáveis, fixos, operacionais e o que está fora dos custos', () => {
    expect(custos.receita).toBe(1_000_000);
    expect(custos.grupos.VARIAVEL.total).toBe(280_000 + 60_000 + 40_000);
    expect(custos.grupos.FIXO.total).toBe(350_000);
    expect(custos.grupos.OPERACIONAL.total).toBe(50_000);
    expect(custos.grupos.FORA.total).toBe(100_000);
    expect(custos.grupos.VARIAVEL.categorias.map((item) => [item.nome, item.valor, item.escolhida])).toEqual([
      ['Fornecedores', 280_000, true],
      ['Impostos', 60_000, false],
      ['Anúncios por venda', 40_000, true],
    ]);
  });

  it('calcula as margens, o lucro e o ponto de equilíbrio', () => {
    expect(custos.margemDeContribuicao).toBe(620_000);
    expect(custos.margemDeContribuicaoPct).toBe(62);
    expect(custos.lucro).toBe(220_000);
    expect(custos.margemDeLucroPct).toBe(22);
    // (R$ 3.500 + R$ 500) / 62% de margem = R$ 6.451,61
    expect(custos.pontoDeEquilibrio).toBe(645_161);
    expect(custos.grupos.FIXO.parte).toBe(35);
  });

  it('sem receita, sem porcentagem nem ponto de equilíbrio', () => {
    const vazio = montarCustos([movimento('DESPESA', '2026-09-10', 200_000, 'aluguel')], CATEGORIAS, {
      de: '2026-09-01',
      ate: '2026-09-30',
    });
    expect([vazio.margemDeLucroPct, vazio.pontoDeEquilibrio, vazio.lucro]).toEqual([null, null, -200_000]);
    expect(faixasDaVenda(vazio)).toEqual([]);
  });
});

describe('faixasDaVenda', () => {
  it('reparte cada R$ 100 vendidos em partes inteiras que somam 100', () => {
    const custos = montarCustos(
      [
        movimento('RECEITA', '2026-09-05', 300_000, 'vendas'),
        movimento('DESPESA', '2026-09-08', 100_000, 'fornecedores'),
        movimento('DESPESA', '2026-09-10', 100_000, 'aluguel'),
      ],
      CATEGORIAS,
      { de: '2026-09-01', ate: '2026-09-30' },
    );
    const faixas = faixasDaVenda(custos);
    expect(faixas.map((faixa) => [faixa.classe, faixa.parte])).toEqual([
      ['VARIAVEL', 34],
      ['FIXO', 33],
      ['LUCRO', 33],
    ]);
  });

  it('com prejuízo, a barra fica toda de custos', () => {
    const custos = montarCustos(
      [movimento('RECEITA', '2026-09-05', 100_000, 'vendas'), movimento('DESPESA', '2026-09-10', 300_000, 'aluguel')],
      CATEGORIAS,
      { de: '2026-09-01', ate: '2026-09-30' },
    );
    expect(faixasDaVenda(custos)).toEqual([{ classe: 'FIXO', rotulo: 'Fixos', parte: 100 }]);
  });
});
