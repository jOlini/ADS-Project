// Números da Visão geral da OliFine, sem interface. Mesmo cálculo para os
// dados da API e para os de exemplo; testado em visao.test.js.
//
// - linhasDasContas: extrato só das contas (compras no crédito ficam na
//   fatura). Dão o saldo de cada dia do gráfico.
// - linhasDoMes: o que conta nos números do mês: compras no cartão na data
//   da parcela, sem o pagamento da fatura (a compra já contou).
// - linhasRecentes: candidatas às "Últimas transações".
// - meses: relatório mensal da API (o último é o mês de hoje) ou null quando
//   ele não veio; sem ele, não há comparação nem a visão por meses.

import { gastoPorCategoria, somarMes } from '../../regras/resumo';
import { serieDiaria, serieDosMeses } from './serie';
import { variacaoPercentual } from './tendencia';

const QUANTAS_RECENTES = 5;

export const FAIXAS = [
  { id: '7d', rotulo: '7 dias' },
  { id: '30d', rotulo: '30 dias' },
  { id: '6m', rotulo: '6 meses' },
  { id: '12m', rotulo: '12 meses' },
];

export function montarVisao({ linhasDasContas, linhasDoMes, linhasRecentes, saldo, meses, hoje }) {
  const totais = somarMes(linhasDoMes);
  const anterior = meses && meses.length >= 2 ? meses[meses.length - 2] : null;
  const corPorCategoria = new Map(linhasDoMes.map((linha) => [linha.categoria, linha.cor ?? 'neutro']));

  return {
    saldo,
    totais,
    variacao: {
      saldo: anterior ? variacaoPercentual(saldo, anterior.saldo_final_centavos) : null,
      receitas: anterior ? variacaoPercentual(totais.entradas, anterior.receitas_centavos) : null,
      despesas: anterior ? variacaoPercentual(totais.saidas, anterior.despesas_centavos) : null,
    },
    categorias: gastoPorCategoria(linhasDoMes).map((item) => ({
      ...item,
      cor: corPorCategoria.get(item.categoria) ?? 'neutro',
    })),
    // Parcelas futuras do cartão já existem na API: "últimas" é até hoje.
    ultimas: linhasRecentes
      .filter((linha) => linha.data <= hoje)
      .sort((a, b) => b.data.localeCompare(a.data))
      .slice(0, QUANTAS_RECENTES),
    series: {
      '7d': serieDiaria(linhasDasContas, saldo, { hoje, dias: 7 }),
      '30d': serieDiaria(linhasDasContas, saldo, { hoje, dias: 30 }),
      '6m': meses ? serieDosMeses(meses.slice(-6)) : null,
      '12m': meses ? serieDosMeses(meses.slice(-12)) : null,
    },
  };
}

// Até 5 fatias na rosca: o resto vira "Outras", para a legenda caber ao lado.
export function fatiasDaRosca(categorias, maximo = 5) {
  if (categorias.length <= maximo) {
    return categorias;
  }
  const principais = categorias.slice(0, maximo - 1);
  const resto = categorias.slice(maximo - 1);
  const valor = resto.reduce((soma, item) => soma + item.valor, 0);
  const fatia = resto.reduce((soma, item) => soma + item.fatia, 0);
  return [...principais, { categoria: 'Outras', valor, fatia, cor: 'neutro', agrupa: resto.length }];
}
