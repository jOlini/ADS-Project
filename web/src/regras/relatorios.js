// Regras da tela Relatórios (release 0.3), em funções puras testadas em
// relatorios.test.js. Os números vêm prontos da API (GET .../relatorios/mensal
// e /categorias, DOCS_API.md parte 7): aqui só o período, os totais, a régua
// das colunas e os rótulos.
import { passoRedondo } from '../olifine/regras/serie';

// Períodos da linha de filtros: sempre até o mês de hoje.
export const PERIODOS = Object.freeze([
  { id: '3m', meses: 3, rotulo: '3 meses' },
  { id: '6m', meses: 6, rotulo: '6 meses' },
  { id: '12m', meses: 12, rotulo: '12 meses' },
]);

export const PERIODO_PADRAO = '6m';

// 'AAAA-MM' de um mês n meses antes (ou depois, com n negativo) de outro.
export function somarMeses(mes, quantos) {
  const [ano, numero] = mes.split('-').map(Number);
  const indice = ano * 12 + (numero - 1) + quantos;
  const novoAno = Math.floor(indice / 12);
  return `${novoAno}-${String((indice % 12) + 1).padStart(2, '0')}`;
}

// { de, ate } em 'AAAA-MM' para um período da lista, terminando no mês de
// hoje (hoje em 'AAAA-MM-DD'). Id desconhecido vale o padrão.
export function periodoDoFiltro(id, hoje) {
  const periodo = PERIODOS.find((item) => item.id === id) ?? PERIODOS.find((item) => item.id === PERIODO_PADRAO);
  const ate = hoje.slice(0, 7);
  return { de: somarMeses(ate, -(periodo.meses - 1)), ate };
}

// Soma do período: receitas, despesas e sobra, e a média de despesa por mês.
export function totaisDoPeriodo(meses) {
  const receitas = meses.reduce((soma, mes) => soma + mes.receitas_centavos, 0);
  const despesas = meses.reduce((soma, mes) => soma + mes.despesas_centavos, 0);
  return {
    receitas,
    despesas,
    sobra: receitas - despesas,
    mediaDeDespesas: meses.length > 0 ? Math.round(despesas / meses.length) : 0,
  };
}

// Régua das colunas: começa sempre no zero (a coluna cresce da base) e desce
// abaixo dele só quando há valor negativo (um mês com mais estorno que
// gasto). Passos redondos, com uma folga pequena em cima para a coluna mais
// alta não encostar na borda.
export function reguaDasColunas(valores, partes = 4) {
  const maior = Math.max(0, ...valores);
  const menor = Math.min(0, ...valores);
  if (maior === 0 && menor === 0) {
    return { minimo: 0, maximo: 100000, marcas: [0, 25000, 50000, 75000, 100000] };
  }
  const passo = passoRedondo(((maior - menor) * 1.08) / partes);
  const minimo = Math.floor(menor / passo) * passo;
  const maximo = Math.ceil((maior * 1.04) / passo) * passo;
  const marcas = [];
  for (let valor = minimo; valor <= maximo + passo / 2; valor += passo) {
    marcas.push(Math.round(valor));
  }
  return { minimo, maximo, marcas };
}

const MES_CURTO = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });
const MES_LONGO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const comoData = (mes) => {
  const [ano, numero] = mes.split('-').map(Number);
  return new Date(Date.UTC(ano, numero - 1, 1));
};

// Rótulo do eixo: "set"; janeiro e o primeiro mês levam o ano ("jan/26"),
// para quem lê saber onde o ano vira.
export function rotuloDoMes(mes, { comAno = false } = {}) {
  const nome = MES_CURTO.format(comoData(mes)).replace('.', '');
  return comAno || mes.endsWith('-01') ? `${nome}/${mes.slice(2, 4)}` : nome;
}

// "setembro de 2026", para o balão e a tabela.
export function nomeDoMes(mes) {
  return MES_LONGO.format(comoData(mes));
}

// Largura da barra de uma categoria, de 0 a 100, contra a maior do período.
export function larguraDaBarra(valor, maior) {
  if (maior <= 0 || valor <= 0) {
    return 0;
  }
  return Math.max(1, Math.round((valor / maior) * 1000) / 10);
}
