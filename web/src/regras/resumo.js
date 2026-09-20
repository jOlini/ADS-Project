// Contas do resumo do mês, sem interface: somas, agrupamento por dia e
// participação de cada categoria. Funções puras, testadas em resumo.test.js.
//
// Um lançamento é { data: 'AAAA-MM-DD', descricao, categoria, conta, valor },
// com valor positivo para entrada e negativo para saída. Transferência entre
// contas próprias fica de fora das somas: o dinheiro não entrou nem saiu.

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
    if (lancamento.valor > 0) {
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
  return Math.min(100, Math.round((saidas / entradas) * 100));
}

// Gasto por categoria, da maior para a menor, com a fatia em porcentagem.
export function gastoPorCategoria(lancamentos) {
  const totais = new Map();

  for (const lancamento of lancamentos) {
    if (ehTransferencia(lancamento) || lancamento.valor >= 0) {
      continue;
    }
    totais.set(lancamento.categoria, (totais.get(lancamento.categoria) ?? 0) + -lancamento.valor);
  }

  const total = [...totais.values()].reduce((soma, valor) => soma + valor, 0);
  return [...totais.entries()]
    .map(([categoria, valor]) => ({
      categoria,
      valor,
      fatia: total > 0 ? Math.round((valor / total) * 100) : 0,
    }))
    .sort((a, b) => b.valor - a.valor);
}

// Agrupa o extrato por dia, do mais recente para o mais antigo, e calcula o
// saldo ao fim de cada dia a partir do saldo atual, andando para trás.
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
    saldo -= itens.reduce((soma, item) => soma + item.valor, 0);
    return grupo;
  });
}
