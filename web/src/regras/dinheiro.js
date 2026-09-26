// Dinheiro na interface, separado dos componentes para ser testado sem
// renderizar nada. Todo valor é inteiro em centavos, igual ao que a API
// guarda: 21437 = R$ 214,37. Nenhuma conta passa por número quebrado; a
// divisão por 100 acontece só na hora de escrever o texto.

// Teto de um valor, o mesmo da API (R$ 1 bilhão).
export const LIMITE_EM_CENTAVOS = 100_000_000_000;

const FORMATO = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function semSinal(centavos) {
  return FORMATO.format(Math.abs(centavos) / 100);
}

// "R$ 1.234,56". Valor negativo sai com o sinal de menos antes do símbolo.
export function formatarBRL(centavos) {
  return `${centavos < 0 ? '− ' : ''}R$ ${semSinal(centavos)}`;
}

// "+ R$ 550,00" / "− R$ 214,37": usado no extrato, onde o sinal informa.
export function formatarComSinal(centavos) {
  const sinal = centavos > 0 ? '+ ' : centavos < 0 ? '− ' : '';
  return `${sinal}R$ ${semSinal(centavos)}`;
}

// Centavos no formato do campo de valor, sem o símbolo: 3334 -> "33,34".
// É o texto que lerValor lê de volta.
export function valorParaCampo(centavos) {
  return semSinal(centavos);
}

// Lê o que a pessoa digitou no campo de valor e devolve centavos, ou null se
// não der para entender. Aceita o jeito brasileiro ("1.234,56", "1234,5",
// "R$ 80") e o ponto como decimal quando não há dúvida ("10.5"). Um ponto
// seguido de três dígitos é milhar ("1.500" = mil e quinhentos).
// A conta é feita em texto, sem float: "0,29" vira 29, e não 28,999...
export function lerValor(texto, { permitirNegativo = false } = {}) {
  let limpo = String(texto ?? '')
    .replace(/R\$/i, '')
    .replace(/\s/g, '');
  const negativo = limpo.startsWith('-') || limpo.startsWith('−');
  if (negativo) {
    if (!permitirNegativo) {
      return null;
    }
    limpo = limpo.slice(1);
  }

  let inteiro;
  let decimais = '';
  if (limpo.includes(',')) {
    [inteiro, decimais] = limpo.split(',');
    if (limpo.split(',').length > 2 || !/^\d{1,3}(\.\d{3})*$|^\d+$/.test(inteiro)) {
      return null;
    }
    inteiro = inteiro.replaceAll('.', '');
  } else if (/^\d+\.\d{1,2}$/.test(limpo)) {
    [inteiro, decimais] = limpo.split('.');
  } else if (/^\d{1,3}(\.\d{3})+$|^\d+$/.test(limpo)) {
    inteiro = limpo.replaceAll('.', '');
  } else {
    return null;
  }

  if (!/^\d{0,2}$/.test(decimais)) {
    return null;
  }
  const centavos = Number(inteiro) * 100 + Number(decimais.padEnd(2, '0'));
  if (!Number.isSafeInteger(centavos) || centavos > LIMITE_EM_CENTAVOS) {
    return null;
  }
  return negativo ? -centavos : centavos;
}
