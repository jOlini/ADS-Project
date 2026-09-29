// Saldo de cada conta na Visão geral, separado em disponível (o dinheiro para
// usar) e investido (o patrimônio aplicado), sem interface. Testado em
// saldos.test.ts.
//
// Disponível: conta corrente, carteira e poupança (a poupança sai na hora,
// sem prazo nem venda). Investido: a conta do tipo investimento. O cartão de
// crédito é dívida e fica fora dos dois (tem painel próprio).

export type TipoDeConta = 'CORRENTE' | 'POUPANCA' | 'CARTEIRA' | 'INVESTIMENTO' | 'CARTAO_CREDITO';

export const TIPOS_DISPONIVEIS: readonly TipoDeConta[] = ['CORRENTE', 'CARTEIRA', 'POUPANCA'];
export const TIPOS_INVESTIDOS: readonly TipoDeConta[] = ['INVESTIMENTO'];

export interface ContaComSaldo {
  id?: string;
  nome: string;
  tipo: TipoDeConta;
  saldo: number;
  ativa?: boolean;
}

export interface SaldoDaConta extends ContaComSaldo {
  // Parte da conta no total do grupo (0 a 1), para a barra. Saldo negativo
  // (cheque especial) conta como 0 na barra, mas entra no total.
  fatia: number;
}

export interface GrupoDeSaldo {
  total: number;
  contas: SaldoDaConta[];
}

export interface Saldos {
  total: number;
  disponivel: GrupoDeSaldo;
  investido: GrupoDeSaldo;
}

function grupo(contas: ContaComSaldo[]): GrupoDeSaldo {
  const total = contas.reduce((soma, conta) => soma + conta.saldo, 0);
  const positivo = contas.reduce((soma, conta) => soma + Math.max(0, conta.saldo), 0);
  return {
    total,
    contas: [...contas]
      .sort((a, b) => b.saldo - a.saldo || a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((conta) => ({ ...conta, fatia: positivo > 0 ? Math.max(0, conta.saldo) / positivo : 0 })),
  };
}

// Conta desativada e zerada não aparece (não diz nada); desativada com saldo
// aparece, porque o dinheiro ainda está lá.
export function separarSaldos(contas: ContaComSaldo[]): Saldos {
  const visiveis = contas.filter((conta) => conta.ativa !== false || conta.saldo !== 0);
  const disponivel = grupo(visiveis.filter((conta) => TIPOS_DISPONIVEIS.includes(conta.tipo)));
  const investido = grupo(visiveis.filter((conta) => TIPOS_INVESTIDOS.includes(conta.tipo)));
  return { total: disponivel.total + investido.total, disponivel, investido };
}

// Quanto do patrimônio está aplicado (0 a 100, inteiro), ou null sem saldo
// positivo para comparar.
export function parteInvestida({ disponivel, investido }: Saldos): number | null {
  const base = Math.max(0, disponivel.total) + Math.max(0, investido.total);
  return base > 0 ? Math.round((Math.max(0, investido.total) / base) * 100) : null;
}
