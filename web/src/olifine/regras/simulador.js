// Simulador de orçamento da landing: o visitante move a renda e os gastos e
// vê quanto sobra, quanto isso vira em um ano e em quanto tempo monta uma
// reserva de emergência. Nada é gravado; tudo em centavos inteiros, como no
// resto do app (regras/dinheiro.js).
//
// Referência de leitura: guardar pelo menos 20% da renda (a parte "poupar"
// da regra 50/30/20, a mais conhecida no Brasil) e ter uma reserva de seis
// meses de gastos. São referências de educação financeira, não conselho.

export const PARTE_PARA_GUARDAR = 0.2;
export const MESES_DE_RESERVA = 6;

// Faixas dos controles, em reais inteiros (o controle desliza em reais; a
// conta é feita em centavos).
export const FAIXAS = {
  renda: { minimo: 1000, maximo: 30000, passo: 100 },
  fixos: { minimo: 0, maximo: 20000, passo: 50 },
  variaveis: { minimo: 0, maximo: 15000, passo: 50 },
};

export const VALORES_INICIAIS = { renda: 6800, fixos: 2600, variaveis: 1900 };

const inteiroNaoNegativo = (valor) => (Number.isFinite(valor) && valor > 0 ? Math.round(valor) : 0);

// Porcentagem inteira de uma parte da renda, entre 0 e 100.
const fatia = (parte, renda) => (renda > 0 ? Math.min(100, Math.max(0, Math.round((parte / renda) * 100))) : 0);

// { renda, fixos, variaveis } em centavos -> o resultado da simulação.
export function simularOrcamento({ renda, fixos, variaveis }) {
  const entrada = inteiroNaoNegativo(renda);
  const gastosFixos = inteiroNaoNegativo(fixos);
  const gastosVariaveis = inteiroNaoNegativo(variaveis);
  const gastos = gastosFixos + gastosVariaveis;
  const sobra = entrada - gastos;
  const reserva = gastos * MESES_DE_RESERVA;

  let leitura = 'no-vermelho';
  if (sobra > 0) {
    leitura = sobra >= entrada * PARTE_PARA_GUARDAR ? 'folga' : 'apertado';
  }

  return {
    renda: entrada,
    gastos,
    sobra,
    leitura,
    // Barras: cada parte como fatia da renda. Gastando mais do que ganha, a
    // barra mostra só os gastos (a sobra negativa não vira fatia).
    partes: [
      { id: 'fixos', rotulo: 'Gastos fixos', valor: gastosFixos, fatia: fatia(gastosFixos, Math.max(entrada, gastos)) },
      { id: 'variaveis', rotulo: 'Dia a dia', valor: gastosVariaveis, fatia: fatia(gastosVariaveis, Math.max(entrada, gastos)) },
      { id: 'sobra', rotulo: 'Sobra', valor: Math.max(0, sobra), fatia: fatia(Math.max(0, sobra), entrada) },
    ],
    guardado: fatia(Math.max(0, sobra), entrada),
    emUmAno: Math.max(0, sobra) * 12,
    reserva,
    // Meses para juntar a reserva guardando a sobra inteira (null: não há sobra).
    mesesParaReserva: sobra > 0 ? Math.ceil(reserva / sobra) : null,
  };
}

export function textoDaLeitura({ leitura, guardado }) {
  if (leitura === 'folga') {
    return `Você guardaria ${guardado}% da renda: acima dos 20% de referência.`;
  }
  if (leitura === 'apertado') {
    return `Dá para guardar ${guardado}% da renda. A referência é chegar a 20%.`;
  }
  return 'Os gastos passam da renda. Comece pelos gastos do dia a dia, os mais fáceis de ajustar.';
}

// "8 meses", "1 ano e 2 meses", "3 anos".
export function textoDoPrazo(meses) {
  if (meses === null) {
    return 'sem sobra, a reserva não cresce';
  }
  const anos = Math.floor(meses / 12);
  const resto = meses % 12;
  const partes = [];
  if (anos > 0) {
    partes.push(`${anos} ${anos === 1 ? 'ano' : 'anos'}`);
  }
  if (resto > 0) {
    partes.push(`${resto} ${resto === 1 ? 'mês' : 'meses'}`);
  }
  return partes.join(' e ');
}
