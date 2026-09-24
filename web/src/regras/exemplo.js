// Dados de exemplo da página principal, usados só quando a pessoa liga
// "Ver com dados de exemplo" numa versão sem a API do livro-caixa (a
// publicada no GitHub Pages). Servem para conhecer a tela antes de lançar.
//
// Tudo aqui é fictício: nomes de estabelecimento inventados, nenhum dado
// pessoal real. A interface sempre marca a tela como exemplo. Valores em
// centavos, como na API.

export const CONTAS_DE_EXEMPLO = [
  { nome: 'Conta corrente', saldo: 396812 },
  { nome: 'Poupança', saldo: 454000 },
  { nome: 'Carteira', saldo: 23423 },
];

export const SALDO_DE_EXEMPLO = CONTAS_DE_EXEMPLO.reduce((soma, conta) => soma + conta.saldo, 0);

export const LANCAMENTOS_DE_EXEMPLO = [
  { data: '2026-09-19', descricao: 'Supermercado Bom Preço', categoria: 'Mercado', conta: 'Conta corrente', valor: -21437 },
  { data: '2026-09-18', descricao: 'Farmácia Central', categoria: 'Saúde', conta: 'Conta corrente', valor: -5890 },
  { data: '2026-09-17', descricao: 'Freela: site da padaria', categoria: 'Receita extra', conta: 'Conta corrente', valor: 55000 },
  { data: '2026-09-15', descricao: 'Conta de luz', categoria: 'Contas da casa', conta: 'Conta corrente', valor: -18742 },
  { data: '2026-09-12', descricao: 'Posto Avenida', categoria: 'Transporte', conta: 'Conta corrente', valor: -18000 },
  { data: '2026-09-10', descricao: 'Transferência para a poupança', categoria: 'Transferência', conta: 'Corrente → Poupança', valor: -50000, tipo: 'transferencia' },
  { data: '2026-09-08', descricao: 'Cinema com a família', categoria: 'Lazer', conta: 'Conta corrente', valor: -13200 },
  { data: '2026-09-05', descricao: 'Salário', categoria: 'Salário', conta: 'Conta corrente', valor: 680000 },
  { data: '2026-09-05', descricao: 'Aluguel de setembro', categoria: 'Moradia', conta: 'Conta corrente', valor: -185000 },
];

export const A_VENCER_DE_EXEMPLO = [
  { data: '2026-09-22', descricao: 'Internet', valor: 11990 },
  { data: '2026-09-26', descricao: 'Plano de saúde', valor: 28900 },
  { data: '2026-09-30', descricao: 'Academia', valor: 9990 },
];

// Uma cor por categoria, para o ponto do extrato e a barra de gastos. A cor
// é enfeite de leitura: o nome da categoria sempre aparece junto.
export const COR_DA_CATEGORIA = {
  Moradia: 'moradia',
  Mercado: 'mercado',
  Transporte: 'transporte',
  'Contas da casa': 'casa',
  Saúde: 'saude',
  Lazer: 'lazer',
  Salário: 'entrada',
  'Receita extra': 'entrada',
  Transferência: 'neutro',
};
