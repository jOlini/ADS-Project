// Séries do gráfico "Evolução do saldo" e a régua dele. Funções puras,
// testadas em serie.test.js. Valores em centavos; datas em texto ISO.

import { ehTransferencia } from '../../regras/resumo';

const DIA_EM_MS = 24 * 60 * 60 * 1000;

// 'AAAA-MM-DD' + n dias, sem o fuso mudar o dia (a conta é em UTC).
export function somarDias(iso, dias) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia) + dias * DIA_EM_MS);
  return data.toISOString().slice(0, 10);
}

// Saldo total no fim de cada um dos últimos `dias` dias, até hoje. O saldo de
// hoje já inclui tudo o que foi lançado (até o que tem data futura), então o
// fim de um dia é o saldo atual menos o que veio depois dele. Mesma conta do
// saldo do dia no extrato (agruparPorDia); transferência não muda o total.
export function serieDiaria(linhas, saldoAtual, { hoje, dias }) {
  const inicio = somarDias(hoje, -(dias - 1));
  const serie = [];
  for (let passo = 0; passo < dias; passo += 1) {
    const data = somarDias(inicio, passo);
    const depois = linhas.reduce(
      (soma, linha) => (linha.data > data && !ehTransferencia(linha) ? soma + linha.valor : soma),
      0,
    );
    serie.push({ data, saldo: saldoAtual - depois });
  }
  return serie;
}

// Os meses do relatório da API (GET .../relatorios/mensal) no formato do
// gráfico: um ponto por mês, com o saldo das contas no último dia.
export function serieDosMeses(meses) {
  return meses.map((mes) => ({ data: mes.mes, saldo: mes.saldo_final_centavos }));
}

// Passo "redondo" da régua: 1, 2, 2,5 ou 5 vezes uma potência de 10.
export function passoRedondo(bruto) {
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const fracao = bruto / potencia;
  const opcao = [1, 2, 2.5, 5, 10].find((candidato) => fracao <= candidato);
  return opcao * potencia;
}

// Régua do eixo vertical: de `minimo` a `maximo` em `partes` passos redondos,
// cobrindo todos os valores com uma folga de 15% da variação em cima e
// embaixo: a linha ocupa o miolo do gráfico, e um salário que entra num dia
// não vira um paredão de borda a borda. Série só positiva não ganha régua
// negativa. Série plana ganha uma folga própria.
export function reguaDoGrafico(valores, partes = 4) {
  if (valores.length === 0) {
    return { minimo: 0, maximo: 100, marcas: [0, 25, 50, 75, 100] };
  }
  let menor = Math.min(...valores);
  let maior = Math.max(...valores);
  if (menor === maior) {
    const folga = Math.max(Math.abs(maior) * 0.1, 10000);
    menor -= folga;
    maior += folga;
  } else {
    const folga = (maior - menor) * 0.15;
    menor = menor >= 0 ? Math.max(0, menor - folga) : menor - folga;
    maior += folga;
  }
  const passo = passoRedondo((maior - menor) / partes);
  const minimo = Math.floor(menor / passo) * passo;
  const maximo = Math.ceil(maior / passo) * passo;
  const marcas = [];
  for (let valor = minimo; valor <= maximo + passo / 2; valor += passo) {
    marcas.push(Math.round(valor));
  }
  return { minimo, maximo, marcas };
}
