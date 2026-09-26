// Dados de exemplo da OliFine, usados só com "Ver com dados de exemplo" (ou
// ?exemplo) numa versão sem a API, como o GitHub Pages, e na landing page.
// Tudo fictício: estabelecimentos e metas inventados, nenhum dado pessoal
// real, nenhuma marca de verdade. A interface sempre marca como exemplo.
// Valores em centavos, como na API. O mês do exemplo é setembro de 2026.

import { COR_DA_CATEGORIA } from '../../regras/exemplo';

export const HOJE_DE_EXEMPLO = '2026-09-26';

export const CONTAS_DE_EXEMPLO = [
  { nome: 'Conta corrente', saldo: 621240 },
  { nome: 'Poupança', saldo: 2860000 },
  { nome: 'Carteira', saldo: 45795 },
];

export const SALDO_DE_EXEMPLO = CONTAS_DE_EXEMPLO.reduce((soma, conta) => soma + conta.saldo, 0);

const linha = (data, descricao, categoria, valor, extra = {}) => ({
  id: `${data}-${descricao}`,
  data,
  descricao,
  categoria,
  cor: COR_DA_CATEGORIA[categoria] ?? 'neutro',
  conta: 'Conta corrente',
  valor,
  ...extra,
});

export const LANCAMENTOS_DE_EXEMPLO = [
  linha('2026-09-26', 'Supermercado Bom Preço', 'Mercado', -12590),
  linha('2026-09-25', 'Freela: site da padaria', 'Receita extra', 55000),
  linha('2026-09-25', 'Posto Avenida', 'Transporte', -18000),
  linha('2026-09-24', 'Streaming de filmes', 'Lazer', -3990),
  linha('2026-09-22', 'Internet fibra', 'Contas da casa', -11990),
  linha('2026-09-20', 'Farmácia Central', 'Saúde', -5890),
  linha('2026-09-18', 'Restaurante Sabor Caseiro', 'Lazer', -8650),
  linha('2026-09-15', 'Conta de luz', 'Contas da casa', -18742),
  linha('2026-09-12', 'Supermercado Bom Preço', 'Mercado', -38215),
  linha('2026-09-10', 'Transferência para a poupança', 'Transferência', -50000, {
    tipo: 'transferencia',
    conta: 'Corrente → Poupança',
  }),
  linha('2026-09-08', 'Cinema com a família', 'Lazer', -13200),
  linha('2026-09-06', 'Aplicativo de transporte', 'Transporte', -2450),
  linha('2026-09-05', 'Salário', 'Salário', 680000),
  linha('2026-09-05', 'Aluguel de setembro', 'Moradia', -185000),
  linha('2026-09-03', 'Plano de saúde', 'Saúde', -28900),
  linha('2026-09-02', 'Academia do bairro', 'Saúde', -9990),
];

// Saldo no fim de cada mês, de outubro de 2025 a setembro de 2026 (o último
// é o saldo de hoje), e as receitas de cada mês. A despesa sai da conta:
// receita menos o quanto o saldo subiu. Setembro bate com os lançamentos.
const SALDOS = [1420650, 1598200, 1812300, 1705440, 1832760, 2046380, 2210900, 2398420, 2655300, 2893342, 3149642, SALDO_DE_EXEMPLO];
const RECEITAS = [645000, 645000, 1290000, 645000, 645000, 645000, 645000, 645000, 670000, 645000, 645000, 735000];
const SALDO_ANTES_DE_OUTUBRO = 1300000;

export const MESES_DE_EXEMPLO = SALDOS.map((saldo, indice) => {
  const ano = indice < 3 ? 2025 : 2026;
  const mes = String(((indice + 9) % 12) + 1).padStart(2, '0');
  const anterior = indice === 0 ? SALDO_ANTES_DE_OUTUBRO : SALDOS[indice - 1];
  const sobra = saldo - anterior;
  return {
    mes: `${ano}-${mes}`,
    receitas_centavos: RECEITAS[indice],
    despesas_centavos: RECEITAS[indice] - sobra,
    sobra_centavos: sobra,
    saldo_final_centavos: saldo,
  };
});

// Metas de exemplo, com aportes semanais para a sequência de regas aparecer.
function aportesSemanais(id, valores, ultimaData) {
  const [ano, mes, dia] = ultimaData.split('-').map(Number);
  return valores.map((valor, indice) => {
    const data = new Date(Date.UTC(ano, mes - 1, dia - (valores.length - 1 - indice) * 7));
    return { id: `${id}-${indice}`, valor, data: data.toISOString().slice(0, 10) };
  });
}

export const METAS_DE_EXEMPLO = [
  {
    id: 'exemplo-viagem',
    nome: 'Viagem para o Nordeste',
    alvo: 1000000,
    prazo: '2027-07-31',
    criadaEm: '2026-03-02',
    aportes: aportesSemanais('viagem', [150000, 50000, 50000, 60000, 40000, 50000, 50000], '2026-09-24'),
  },
  {
    id: 'exemplo-reserva',
    nome: 'Reserva de emergência',
    alvo: 2000000,
    prazo: null,
    criadaEm: '2026-01-10',
    aportes: aportesSemanais('reserva', [500000, 100000, 100000, 100000], '2026-09-21'),
  },
  {
    id: 'exemplo-notebook',
    nome: 'Notebook novo',
    alvo: 500000,
    prazo: '2026-12-20',
    criadaEm: '2026-07-01',
    aportes: aportesSemanais('notebook', [100000, 60000, 60000], '2026-09-23'),
  },
  {
    id: 'exemplo-curso',
    nome: 'Curso de inglês',
    alvo: 180000,
    prazo: '2026-08-31',
    criadaEm: '2026-02-01',
    aportes: aportesSemanais('curso', [60000, 60000, 60000], '2026-08-25'),
  },
  {
    id: 'exemplo-bicicleta',
    nome: 'Bicicleta',
    alvo: 150000,
    prazo: null,
    criadaEm: '2026-09-20',
    aportes: [],
  },
];
