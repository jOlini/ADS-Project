// Ciclo da fatura do cartão de crédito, sem interface: em que fatura cai uma
// compra feita numa data. É a mesma regra da API (api/app/financeiro/
// cartoes.py, referencia_da_data), para a tela juntar as compras de uma
// fatura sem pedir cada fatura à API. Testado em faturas.test.ts.
//
// A fatura leva o mês do vencimento (a "fatura de outubro" vence em
// outubro). Ela fecha no dia de fechamento do mesmo mês, se ele vem antes do
// vencimento, ou do mês anterior. A compra feita no próprio dia do
// fechamento já vai para a fatura seguinte. Os dias 29 a 31 viram o último
// dia nos meses mais curtos.

export interface CicloDoCartao {
  dia_fechamento: number;
  dia_vencimento: number;
}

// 'AAAA-MM' do vencimento.
export type Referencia = string;

const paraReferencia = (ano: number, mes: number): Referencia => `${ano}-${String(mes).padStart(2, '0')}`;

export function somarMesesNaReferencia(referencia: Referencia, meses: number): Referencia {
  const [ano, mes] = referencia.split('-').map(Number) as [number, number];
  const total = ano * 12 + (mes - 1) + meses;
  return paraReferencia(Math.floor(total / 12), (total % 12) + 1);
}

function diaNoMes(referencia: Referencia, dia: number): string {
  const [ano, mes] = referencia.split('-').map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${referencia}-${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
}

// Dia em que fecha a fatura da referência (AAAA-MM-DD).
export function fechamentoDaFatura(cartao: CicloDoCartao, referencia: Referencia): string {
  const doMes = cartao.dia_fechamento < cartao.dia_vencimento ? referencia : somarMesesNaReferencia(referencia, -1);
  return diaNoMes(doMes, cartao.dia_fechamento);
}

// A fatura (mês do vencimento) em que cai uma compra feita na data ISO.
export function referenciaDaData(cartao: CicloDoCartao, data: string): Referencia {
  const doMesDaData = data.slice(0, 7);
  const referencia = cartao.dia_fechamento < cartao.dia_vencimento ? doMesDaData : somarMesesNaReferencia(doMesDaData, 1);
  return data < fechamentoDaFatura(cartao, referencia) ? referencia : somarMesesNaReferencia(referencia, 1);
}

// O primeiro dia de compras da fatura (o fechamento da anterior): quem
// quer as compras de uma fatura carrega os lançamentos a partir dele.
export function inicioDaFatura(cartao: CicloDoCartao, referencia: Referencia): string {
  return fechamentoDaFatura(cartao, somarMesesNaReferencia(referencia, -1));
}
