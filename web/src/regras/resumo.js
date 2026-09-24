// Contas do resumo do mês, sem interface: somas, agrupamento por dia e
// participação de cada categoria. Funções puras, testadas em resumo.test.js.
//
// Um lançamento é { data: 'AAAA-MM-DD', descricao, categoria, conta, valor },
// com valor em centavos: positivo quando o dinheiro entra na conta, negativo
// quando sai. Dois casos especiais:
// - tipo 'transferencia': dinheiro entre contas próprias. Não entra nas
//   somas nem muda o saldo total, porque não entrou nem saiu.
// - estorno: true: desfaz um lançamento anterior. O estorno de uma despesa
//   (valor positivo) diminui as saídas, em vez de contar como entrada; o de
//   uma receita (valor negativo) diminui as entradas.

export function ehTransferencia(lancamento) {
  return lancamento.tipo === 'transferencia';
}

// { entradas, saidas, sobra }: sobra é entradas menos saídas.
export function somarMes(lancamentos) {
  let entradas = 0;
  let saidas = 0;

  for (const lancamento of lancamentos) {
    if (ehTransferencia(lancamento)) {
      continue;
    }
    if (lancamento.estorno) {
      if (lancamento.valor > 0) {
        saidas -= lancamento.valor;
      } else {
        entradas += lancamento.valor;
      }
    } else if (lancamento.valor > 0) {
      entradas += lancamento.valor;
    } else {
      saidas += -lancamento.valor;
    }
  }

  return { entradas, saidas, sobra: entradas - saidas };
}

// Quanto do que entrou já foi gasto, de 0 a 100. Sem entrada, devolve 0.
export function usoDaRenda({ entradas, saidas }) {
  if (entradas <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((saidas / entradas) * 100)));
}

// Gasto por categoria, da maior para a menor, com a fatia em porcentagem.
// O estorno de uma despesa devolve o valor à categoria dela.
export function gastoPorCategoria(lancamentos) {
  const totais = new Map();

  for (const lancamento of lancamentos) {
    if (ehTransferencia(lancamento)) {
      continue;
    }
    const gasto = lancamento.estorno ? (lancamento.valor > 0 ? -lancamento.valor : 0) : Math.max(0, -lancamento.valor);
    if (gasto !== 0) {
      totais.set(lancamento.categoria, (totais.get(lancamento.categoria) ?? 0) + gasto);
    }
  }

  const positivos = [...totais.entries()].filter(([, valor]) => valor > 0);
  const total = positivos.reduce((soma, [, valor]) => soma + valor, 0);
  return positivos
    .map(([categoria, valor]) => ({
      categoria,
      valor,
      fatia: total > 0 ? Math.round((valor / total) * 100) : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}

// Saldo total antes de um conjunto de lançamentos: o saldo de hoje menos o
// que eles mudaram. Serve para o fim de um mês passado (hoje menos tudo o
// que veio depois dele).
export function saldoAntesDe(lancamentos, saldoAtual) {
  return lancamentos.reduce((saldo, item) => saldo - (ehTransferencia(item) ? 0 : item.valor), saldoAtual);
}

// Filtro do extrato: 'tudo', 'entradas' (valor positivo) ou 'saidas'
// (negativo). Esconde linhas e dias vazios; o saldo do dia continua o do
// extrato inteiro, por isso a tela o tira do cabeçalho com filtro ligado.
export function filtrarDias(dias, filtro) {
  if (filtro === 'tudo') {
    return dias;
  }
  return dias
    .map((dia) => ({
      ...dia,
      lancamentos: dia.lancamentos.filter((item) => (filtro === 'entradas' ? item.valor > 0 : item.valor < 0)),
    }))
    .filter((dia) => dia.lancamentos.length > 0);
}

// Agrupa o extrato por dia, do mais recente para o mais antigo, e calcula o
// saldo total ao fim de cada dia a partir do saldo atual, andando para trás.
// Transferência entre contas próprias não muda o saldo total.
export function agruparPorDia(lancamentos, saldoAtual) {
  const dias = new Map();

  for (const lancamento of [...lancamentos].sort((a, b) => b.data.localeCompare(a.data))) {
    if (!dias.has(lancamento.data)) {
      dias.set(lancamento.data, []);
    }
    dias.get(lancamento.data).push(lancamento);
  }

  let saldo = saldoAtual;
  return [...dias.entries()].map(([data, itens]) => {
    const grupo = { data, saldo, lancamentos: itens };
    saldo -= itens.reduce((soma, item) => soma + (ehTransferencia(item) ? 0 : item.valor), 0);
    return grupo;
  });
}
