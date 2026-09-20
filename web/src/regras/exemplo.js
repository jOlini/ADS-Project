// Dados de exemplo da página principal, usados só quando a pessoa liga
// "Ver com dados de exemplo". Servem para conhecer a tela antes de existir
// lançamento de verdade (o registro chega na release 0.2).
//
// Tudo aqui é fictício: nomes de estabelecimento inventados, nenhum dado
// pessoal real. A interface sempre marca a tela como exemplo.

export const CONTAS_DE_EXEMPLO = [
  { nome: 'Conta corrente', saldo: 3968.12 },
  { nome: 'Poupança', saldo: 4540.0 },
  { nome: 'Carteira', saldo: 234.23 },
];

export const SALDO_DE_EXEMPLO = CONTAS_DE_EXEMPLO.reduce((soma, conta) => soma + conta.saldo, 0);

export const LANCAMENTOS_DE_EXEMPLO = [
  { data: '2026-09-19', descricao: 'Supermercado Bom Preço', categoria: 'Mercado', conta: 'Conta corrente', valor: -214.37 },
  { data: '2026-09-18', descricao: 'Farmácia Central', categoria: 'Saúde', conta: 'Conta corrente', valor: -58.9 },
  { data: '2026-09-17', descricao: 'Freela: site da padaria', categoria: 'Receita extra', conta: 'Conta corrente', valor: 550.0 },
  { data: '2026-09-15', descricao: 'Conta de luz', categoria: 'Contas da casa', conta: 'Conta corrente', valor: -187.42 },
  { data: '2026-09-12', descricao: 'Posto Avenida', categoria: 'Transporte', conta: 'Conta corrente', valor: -180.0 },
  { data: '2026-09-10', descricao: 'Transferência para a poupança', categoria: 'Transferência', conta: 'Corrente → Poupança', valor: -500.0, tipo: 'transferencia' },
  { data: '2026-09-08', descricao: 'Cinema com a família', categoria: 'Lazer', conta: 'Conta corrente', valor: -132.0 },
  { data: '2026-09-05', descricao: 'Salário', categoria: 'Salário', conta: 'Conta corrente', valor: 6800.0 },
  { data: '2026-09-05', descricao: 'Aluguel de setembro', categoria: 'Moradia', conta: 'Conta corrente', valor: -1850.0 },
];

export const A_VENCER_DE_EXEMPLO = [
  { data: '2026-09-22', descricao: 'Internet', valor: 119.9 },
  { data: '2026-09-26', descricao: 'Plano de saúde', valor: 289.0 },
  { data: '2026-09-30', descricao: 'Academia', valor: 99.9 },
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
