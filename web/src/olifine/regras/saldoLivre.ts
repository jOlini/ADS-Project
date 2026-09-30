// "Quanto está sobrando" no mês, sem interface: o saldo livre projetado até o
// último dia do mês. Testado em saldoLivre.test.ts. Valores em centavos;
// datas em texto ISO (AAAA-MM-DD).
//
//   saldo livre = saldo de hoje + receitas previstas até o fim do mês
//                 − despesas previstas até o fim do mês
//
// O saldo de hoje sozinho engana: ele não sabe do aluguel lançado para o dia
// 30 nem da fatura do cartão. Por isso:
//
// - O saldo das contas na API já inclui o que foi lançado com data futura. O
//   saldo de hoje é esse saldo menos o que vem depois de hoje; o que vem até
//   o fim do mês volta como "a receber" e "a pagar", e o que passa do mês fica
//   de fora (é do mês seguinte).
// - As despesas do mês que já saíram das contas estão dentro do saldo de hoje:
//   somá-las de novo contaria o mesmo gasto duas vezes. "A pagar" é só o que
//   ainda vai sair.
// - O cartão entra pelo que já se deve nas faturas até a atual (fechadas não
//   pagas e a aberta), sem as parcelas das próximas faturas, que são dos
//   meses seguintes. Pagamento de fatura já lançado baixa essa dívida na API;
//   o pagamento com data depois do fim do mês continua a pagar (o dinheiro
//   ainda sai da conta, só que depois).
// - Transferência entre contas próprias não muda o total.

export interface LinhaDaConta {
  data: string;
  // Com sinal: entrada positiva, saída negativa.
  valor: number;
  // 'receita', 'despesa', 'transferencia' ou 'pagamento' (da fatura).
  tipo: string;
}

export interface CartaoDoSaldoLivre {
  // O que se deve no cartão, somando todas as faturas e as parcelas futuras.
  usado_centavos: number;
  // Parcelas que caem depois da fatura atual.
  parcelamentos_futuros_centavos: number;
}

export interface EntradaDoSaldoLivre {
  // Saldo total das contas (sem cartão), como a API devolve.
  saldo: number;
  // Extrato só das contas, com as datas futuras (paraExtrato).
  linhasDasContas: readonly LinhaDaConta[];
  cartoes?: readonly CartaoDoSaldoLivre[];
  // Parte do saldo em contas de investimento: conta no total, mas não é
  // dinheiro para as contas do mês.
  investido?: number;
  hoje: string;
}

// folga: sobra pelo menos 10% do que o mês tem; atencao: sobra pouco, ou só
// sobra usando o investido; negativo: o mês fecha no vermelho.
export type SaudeDoMes = 'folga' | 'atencao' | 'negativo';

export interface SaldoLivre {
  fimDoMes: string;
  saldoDeHoje: number;
  aReceber: number;
  // O que ainda sai das contas até o fim do mês (lançado com data futura).
  aPagarNasContas: number;
  // O que já se deve nas faturas até a atual.
  faturas: number;
  aPagar: number;
  livre: number;
  // O livre sem contar o investido.
  livreSemInvestido: number;
  // Quanto do dinheiro do mês (saldo de hoje + a receber) já tem destino, de
  // 0 a 1. Sem dinheiro no mês, 1.
  comprometido: number;
  saude: SaudeDoMes;
  // Positivo hoje e negativo no fim do mês: a falsa sensação de folga.
  folgaAparente: boolean;
}

// Abaixo desta parte do dinheiro do mês, a sobra é pouca.
export const MARGEM_DE_FOLGA = 0.1;

// Último dia do mês de uma data ISO, sem o fuso mudar o dia.
export function fimDoMes(iso: string): string {
  const [ano = 0, mes = 1] = iso.split('-').map(Number);
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
}

// O que ainda se deve nas faturas até a atual: a dívida do cartão sem as
// parcelas das próximas faturas. Crédito a favor (usado negativo) não vira
// dinheiro nas contas: conta zero.
export function dividaDasFaturas(cartoes: readonly CartaoDoSaldoLivre[]): number {
  return cartoes.reduce(
    (soma, cartao) => soma + Math.max(0, cartao.usado_centavos - Math.max(0, cartao.parcelamentos_futuros_centavos)),
    0,
  );
}

function saudeDoMes(livre: number, livreSemInvestido: number, dinheiroDoMes: number): SaudeDoMes {
  if (livre < 0) {
    return 'negativo';
  }
  if (livreSemInvestido < 0 || livre < Math.max(0, dinheiroDoMes) * MARGEM_DE_FOLGA || livre === 0) {
    return 'atencao';
  }
  return 'folga';
}

export function calcularSaldoLivre({
  saldo,
  linhasDasContas,
  cartoes = [],
  investido = 0,
  hoje,
}: EntradaDoSaldoLivre): SaldoLivre {
  const fim = fimDoMes(hoje);
  let depoisDeHoje = 0;
  let aReceber = 0;
  let aPagarNasContas = 0;
  for (const linha of linhasDasContas) {
    if (linha.tipo === 'transferencia' || linha.data <= hoje) {
      continue;
    }
    depoisDeHoje += linha.valor;
    // Até o fim do mês, ou pagamento de fatura marcado para depois: a
    // dívida já saiu do cartão na API, então ela sai das contas aqui.
    if (linha.data <= fim || linha.tipo === 'pagamento') {
      if (linha.valor > 0) {
        aReceber += linha.valor;
      } else {
        aPagarNasContas -= linha.valor;
      }
    }
  }
  const saldoDeHoje = saldo - depoisDeHoje;
  const faturas = dividaDasFaturas(cartoes);
  const aPagar = aPagarNasContas + faturas;
  const livre = saldoDeHoje + aReceber - aPagar;
  const livreSemInvestido = livre - Math.max(0, investido);
  const dinheiroDoMes = saldoDeHoje + aReceber;
  return {
    fimDoMes: fim,
    saldoDeHoje,
    aReceber,
    aPagarNasContas,
    faturas,
    aPagar,
    livre,
    livreSemInvestido,
    comprometido: dinheiroDoMes > 0 ? Math.min(1, Math.max(0, aPagar / dinheiroDoMes)) : 1,
    saude: saudeDoMes(livre, livreSemInvestido, dinheiroDoMes),
    folgaAparente: saldoDeHoje > 0 && livre < 0,
  };
}

// Como o card do saldo livre se apresenta: positivo (verde, seguro para
// gastar), neutro (sobra pouco ou nada) ou negativo (vermelho, vai faltar).
export type EstadoDoSaldoLivre = 'positivo' | 'neutro' | 'negativo';

export interface LeituraDoSaldoLivre {
  estado: EstadoDoSaldoLivre;
  // O selo curto ("Seguro para gastar").
  titulo: string;
  // A frase, sem jargão, com o número que importa e o que fazer.
  texto: string;
}

// A leitura do saldo livre para quem não entende de finanças: o sinal do
// saldo livre (sem o investido) decide a cor, e a frase diz o valor, até
// quando e o que fazer. `ate` é o último dia do mês já escrito ("30/09").
export function leituraDoSaldoLivre(
  resultado: SaldoLivre,
  formatar: (centavos: number) => string,
  ate: string,
): LeituraDoSaldoLivre {
  const livre = resultado.livreSemInvestido;
  if (livre < 0) {
    const faltam = formatar(-livre);
    if (resultado.folgaAparente) {
      return {
        estado: 'negativo',
        titulo: 'Vai faltar dinheiro',
        texto: `Hoje a conta parece boa, mas as contas que vencem até ${ate} são maiores: faltam ${faltam}. Evite gastos novos e veja o que dá para adiar.`,
      };
    }
    if (resultado.livre < 0) {
      return {
        estado: 'negativo',
        titulo: 'Vai faltar dinheiro',
        texto: `As contas até ${ate} são maiores que o dinheiro que você tem: faltam ${faltam}. Evite gastos novos e veja o que dá para adiar ou negociar.`,
      };
    }
    return {
      estado: 'negativo',
      titulo: 'Só fecha usando o investido',
      texto: `O dinheiro do dia a dia não cobre as contas até ${ate}: faltam ${faltam}. Para não mexer no investido, evite gastos novos.`,
    };
  }
  if (livre === 0) {
    return {
      estado: 'neutro',
      titulo: 'Tudo já tem destino',
      texto: `Todo o dinheiro até ${ate} já vai para as contas. Antes de gastar, espere entrar mais dinheiro.`,
    };
  }
  if (resultado.saude !== 'folga') {
    return {
      estado: 'neutro',
      titulo: 'Sobra pouco',
      texto: `Dá para gastar até ${formatar(livre)} até ${ate} sem faltar para as contas, mas a folga é curta. Gaste com calma.`,
    };
  }
  return {
    estado: 'positivo',
    titulo: 'Seguro para gastar',
    texto: `Você pode gastar até ${formatar(livre)} até ${ate} sem faltar dinheiro para as contas previstas.`,
  };
}
