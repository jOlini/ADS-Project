// Comparação com o mês anterior, para os selos de tendência dos números da
// Visão geral ("+12%"). Funções puras, testadas em tendencia.test.js.

// Variação inteira em porcentagem. Sem base de comparação (mês anterior
// zerado ou valor faltando), devolve null: a tela não inventa um número.
export function variacaoPercentual(atual, anterior) {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior) || anterior === 0) {
    return null;
  }
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 100);
}

// Se a variação é boa ou ruim depende do número: receita e saldo maiores são
// bons; despesa maior é ruim. A cor do selo segue esta leitura, e não o sinal.
export function leituraDaVariacao(variacao, { maiorEhMelhor = true } = {}) {
  if (variacao === null || variacao === undefined) {
    return null;
  }
  if (variacao === 0) {
    return 'estavel';
  }
  return variacao > 0 === maiorEhMelhor ? 'bom' : 'ruim';
}

// "+12%", "−8%" (sinal de menos de verdade, como no resto do app) ou "0%".
export function textoDaVariacao(variacao) {
  if (variacao > 0) {
    return `+${variacao}%`;
  }
  if (variacao < 0) {
    return `−${Math.abs(variacao)}%`;
  }
  return '0%';
}
