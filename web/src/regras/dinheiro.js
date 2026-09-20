// Formatação de dinheiro, separada da interface para ser testada sem
// renderizar componente. Valores em reais (número), com duas casas.
//
// Regra do projeto: o núcleo financeiro (0.2) guarda centavos inteiros. Aqui
// o valor já chega convertido para reais, e a formatação é só de exibição.

const FORMATO = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// "R$ 1.234,56". Valor negativo sai com o sinal de menos antes do símbolo.
export function formatarBRL(valor) {
  const numero = FORMATO.format(Math.abs(valor));
  return `${valor < 0 ? '− ' : ''}R$ ${numero}`;
}

// "+ R$ 550,00" / "− R$ 214,37": usado no extrato, onde o sinal informa.
export function formatarComSinal(valor) {
  const numero = FORMATO.format(Math.abs(valor));
  const sinal = valor > 0 ? '+ ' : valor < 0 ? '− ' : '';
  return `${sinal}R$ ${numero}`;
}

// Enquanto não há lançamentos, a casa do valor existe e fica vazia.
export const VALOR_VAZIO = 'R$ —';
