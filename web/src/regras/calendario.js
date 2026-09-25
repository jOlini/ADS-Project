// Calendário sem interface: a grade de um mês, a navegação por dia, mês e
// ano e a leitura do que a pessoa digita no campo de data. As datas são
// texto ISO "AAAA-MM-DD", como no resto do app; a conta é feita em UTC para
// o fuso horário nunca trocar o dia.
import { dataExiste } from './datas';

const doisDigitos = (numero) => String(numero).padStart(2, '0');

export const NOMES_DOS_MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
// A semana começa no domingo, como no calendário de parede brasileiro.
export const DIAS_DA_SEMANA = [
  { curto: 'D', nome: 'domingo' },
  { curto: 'S', nome: 'segunda-feira' },
  { curto: 'T', nome: 'terça-feira' },
  { curto: 'Q', nome: 'quarta-feira' },
  { curto: 'Q', nome: 'quinta-feira' },
  { curto: 'S', nome: 'sexta-feira' },
  { curto: 'S', nome: 'sábado' },
];
// Quantos anos cabem numa página da escolha de ano (grade de 3 × 4).
export const ANOS_POR_PAGINA = 12;

export function paraIso(ano, mes, dia) {
  return `${String(ano).padStart(4, '0')}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

// { ano, mes, dia } de uma data ISO, ou null se ela não existir.
export function partesDe(iso) {
  if (!dataExiste(iso)) {
    return null;
  }
  const [ano, mes, dia] = iso.split('-').map(Number);
  return { ano, mes, dia };
}

export function diasNoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

function comoUtc(iso) {
  const { ano, mes, dia } = partesDe(iso);
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function deUtc(data) {
  return paraIso(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate());
}

export function somarDias(iso, dias) {
  const data = comoUtc(iso);
  data.setUTCDate(data.getUTCDate() + dias);
  return deUtc(data);
}

// Soma meses mantendo o dia quando ele existe no mês de chegada; senão, fica
// no último dia (31/01 + 1 mês = 28/02 ou 29/02).
export function somarMeses(iso, meses) {
  const { ano, mes, dia } = partesDe(iso);
  const total = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  return paraIso(novoAno, novoMes, Math.min(dia, diasNoMes(novoAno, novoMes)));
}

// 0 = domingo ... 6 = sábado.
export function diaDaSemana(iso) {
  return comoUtc(iso).getUTCDay();
}

export const inicioDaSemana = (iso) => somarDias(iso, -diaDaSemana(iso));
export const fimDaSemana = (iso) => somarDias(iso, 6 - diaDaSemana(iso));

// Seis semanas (sempre seis, para a grade não mudar de altura entre meses),
// cada uma com sete dias { iso, dia, doMes }. Os dias de fora completam a
// primeira e a última semana.
export function semanasDoMes(ano, mes) {
  const primeiro = inicioDaSemana(paraIso(ano, mes, 1));
  return Array.from({ length: 6 }, (_, semana) =>
    Array.from({ length: 7 }, (_, diaDaSemana) => {
      const iso = somarDias(primeiro, semana * 7 + diaDaSemana);
      const [anoDoDia, mesDoDia, dia] = iso.split('-').map(Number);
      return { iso, dia, doMes: anoDoDia === ano && mesDoDia === mes };
    }),
  );
}

// Os anos da página que contém `ano` (ex.: 2016 a 2027 para 2026).
export function anosDaPagina(ano) {
  const primeiro = Math.floor(ano / ANOS_POR_PAGINA) * ANOS_POR_PAGINA;
  return Array.from({ length: ANOS_POR_PAGINA }, (_, indice) => primeiro + indice);
}

// Limites opcionais: min e max em ISO (texto ISO compara na ordem das datas).
export function dentroDoLimite(iso, min, max) {
  return (!min || iso >= min) && (!max || iso <= max);
}

export function limitar(iso, min, max) {
  if (min && iso < min) {
    return min;
  }
  if (max && iso > max) {
    return max;
  }
  return iso;
}

// Mês inteiro fora do limite (para desligar o mês na escolha de mês).
export function mesForaDoLimite(ano, mes, min, max) {
  return Boolean((max && paraIso(ano, mes, 1) > max) || (min && paraIso(ano, mes, diasNoMes(ano, mes)) < min));
}

// Máscara do campo de data enquanto a pessoa digita: só números viram
// "dd/mm/aaaa" com as barras no lugar; quem digita as barras ("5/9/2026")
// escolhe onde cada parte termina.
export function mascararData(texto) {
  const limpo = String(texto ?? '').replace(/[^\d/]/g, '');
  const partes = limpo.split('/');
  if (partes.length === 1) {
    const digitos = limpo.slice(0, 8);
    return [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4)].filter(Boolean).join('/');
  }
  const [dia, mes = '', ano = ''] = partes;
  return [dia.slice(0, 2), mes.slice(0, 2), ...(partes.length > 2 ? [ano.slice(0, 4)] : [])].join('/');
}

// "05/09/2026" ou "5/9/2026" -> "2026-09-05". null se incompleta ou inexistente.
export function lerDataDigitada(texto) {
  const partes = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(texto ?? '').trim());
  if (!partes) {
    return null;
  }
  const [, dia, mes, ano] = partes;
  const iso = paraIso(Number(ano), Number(mes), Number(dia));
  return dataExiste(iso) ? iso : null;
}

// "sexta-feira, 5 de setembro de 2026": o nome do dia para leitores de tela.
export function dataPorExtenso(iso) {
  const { ano, mes, dia } = partesDe(iso);
  return `${DIAS_DA_SEMANA[diaDaSemana(iso)].nome}, ${dia} de ${NOMES_DOS_MESES[mes - 1]} de ${ano}`;
}

export function nomeDoMes({ ano, mes }) {
  return `${NOMES_DOS_MESES[mes - 1]} de ${ano}`;
}
