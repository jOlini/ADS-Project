// As linhas que contam nos números de um mês da Visão geral (o card Despesas
// e a rosca das Despesas por categoria), sem interface. Testado em
// despesasDoMes.test.ts.
//
// O mês junta duas coisas: o que saiu e entrou nas contas à vista (PIX,
// débito, dinheiro, TED) com data no mês, e a fatura de cada cartão que vence
// no mês, com todas as compras dela, de qualquer data (as do mês passado
// também, porque é neste mês que elas são pagas). O pagamento da fatura não
// conta de novo: as compras dela já estão aí. O estorno no cartão desconta.
//
// Assim, "Despesas" é o que pesa no mês de quem paga as contas: as saídas à
// vista mais o total acumulado das faturas que vencem nele.

import { mudarMes } from '../../regras/livroCaixa';
import { referenciaDaData, type CicloDoCartao } from '../../regras/faturas';

export interface LinhaDoMes {
  data: string;
  tipo: string;
  noCartao?: boolean;
  original?: { conta_id?: string };
}

export type CartaoDoMes = CicloDoCartao & { id: string };

// mes: 'AAAA-MM'.
export function linhasDoMes<T extends LinhaDoMes>(linhas: readonly T[], cartoes: readonly CartaoDoMes[], mes: string): T[] {
  const ciclos = new Map(cartoes.map((cartao) => [cartao.id, cartao]));
  return linhas.filter((linha) => {
    if (linha.tipo === 'pagamento') {
      return false;
    }
    const cartao = linha.noCartao ? ciclos.get(linha.original?.conta_id ?? '') : undefined;
    return cartao ? referenciaDaData(cartao, linha.data) === mes : linha.data.startsWith(`${mes}-`);
  });
}

// O mês anterior, 'AAAA-MM'.
export function mesAnterior(mes: string): string {
  const [ano, numero] = mes.split('-').map(Number) as [number, number];
  const antes = mudarMes({ ano, mes: numero }, -1) as { ano: number; mes: number };
  return `${antes.ano}-${String(antes.mes).padStart(2, '0')}`;
}

// A primeira data a carregar para os números do mês e do anterior: a fatura
// do mês anterior pode ter compras de até três meses atrás (o cartão que
// fecha dia 25 e vence dia 5 leva na fatura de setembro as compras de 25 de
// julho a 24 de agosto). O primeiro dia de três meses antes cobre todos os
// cartões.
export function inicioDaCarga(mes: string): string {
  const [ano, numero] = mes.split('-').map(Number) as [number, number];
  const inicio = mudarMes({ ano, mes: numero }, -3) as { ano: number; mes: number };
  return `${inicio.ano}-${String(inicio.mes).padStart(2, '0')}-01`;
}
