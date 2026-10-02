// Peças comuns dos leitores de PDF, sem interface: as linhas de uma página
// (os trechos de texto na mesma altura), o valor e a data no jeito brasileiro
// e o CSV simples que vai para a API. Testado em pdfComum.test.ts.

import type { Mapeamento } from '../importacao';
import { lerValor } from '../dinheiro';
import { dataExiste } from '../datas';
import type { DocumentoPdf, LinhaLida, PaginaDoPdf, TrechoDoPdf } from './tipos';

export interface LinhaDoPdf {
  pagina: number;
  y: number;
  // Da esquerda para a direita.
  trechos: TrechoDoPdf[];
  texto: string;
}

// Trechos com até esta diferença de altura (em pontos) estão na mesma linha.
// Pequena de propósito: nas faturas, duas colunas lado a lado têm linhas a
// 2 ou 3 pontos de distância, e juntá-las misturaria os textos.
const MESMA_LINHA = 1.5;

const juntar = (trechos: readonly TrechoDoPdf[]) =>
  trechos
    .map((trecho) => trecho.texto)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

export function linhasDaPagina(pagina: PaginaDoPdf, filtro: (trecho: TrechoDoPdf) => boolean = () => true): LinhaDoPdf[] {
  const ordenados = pagina.trechos.filter((trecho) => trecho.texto.trim() && filtro(trecho)).sort((a, b) => a.y - b.y || a.x - b.x);
  const linhas: LinhaDoPdf[] = [];
  for (const trecho of ordenados) {
    const atual = linhas.at(-1);
    if (atual && Math.abs(trecho.y - atual.y) <= MESMA_LINHA) {
      atual.trechos.push(trecho);
    } else {
      linhas.push({ pagina: pagina.numero, y: trecho.y, trechos: [trecho], texto: '' });
    }
  }
  for (const linha of linhas) {
    linha.trechos.sort((a, b) => a.x - b.x);
    linha.texto = juntar(linha.trechos);
  }
  return linhas;
}

// O texto do documento inteiro, linha a linha (para reconhecer o banco e achar
// datas e totais pelo rótulo).
export function textoDoDocumento(documento: DocumentoPdf): string {
  return documento.paginas.map((pagina) => linhasDaPagina(pagina).map((linha) => linha.texto).join('\n')).join('\n');
}

// "1.234,56" ou "1.234,56-" (o "-" no fim é crédito nas faturas).
export const VALOR_BR = /^\d{1,3}(?:\.\d{3})*,\d{2}-?$/;

// Centavos de um valor escrito no jeito brasileiro, com o sinal de crédito no
// fim ("475,98-" = -47598). null quando não é valor.
export function centavosDoTexto(texto: string): number | null {
  const limpo = texto.replace(/\s/g, '').replace(/^R\$/i, '');
  const credito = limpo.endsWith('-');
  const valor = lerValor(credito ? limpo.slice(0, -1) : limpo);
  return valor === null ? null : credito ? -valor : valor;
}

// "dd/mm" de uma fatura sem o ano: o ano é o da data de referência (o
// vencimento), e o mês depois dele é do ano anterior (a compra de dezembro
// na fatura que vence em janeiro). null quando a data não existe.
export function dataSemAno(diaMes: string, referencia: string): string | null {
  const partes = /^(\d{2})\/(\d{2})$/.exec(diaMes.trim());
  if (!partes || !dataExiste(referencia)) {
    return null;
  }
  const [anoRef, mesRef] = referencia.split('-').map(Number) as [number, number];
  const dia = Number(partes[1]);
  const mes = Number(partes[2]);
  const ano = mes > mesRef ? anoRef - 1 : anoRef;
  const iso = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return dataExiste(iso) ? iso : null;
}

// "dd/mm/aaaa" -> ISO, ou null.
export function dataCompleta(texto: string | undefined): string | null {
  const partes = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((texto ?? '').trim());
  if (!partes) {
    return null;
  }
  const iso = `${partes[3]}-${partes[2]}-${partes[1]}`;
  return dataExiste(iso) ? iso : null;
}

// A primeira data completa (dd/mm/aaaa) até `alcance` caracteres depois do
// rótulo, ou null.
export function dataDepoisDe(texto: string, rotulo: RegExp, alcance = 200): string | null {
  const achado = rotulo.exec(texto);
  if (!achado) {
    return null;
  }
  const trecho = texto.slice(achado.index + achado[0].length, achado.index + achado[0].length + alcance);
  return dataCompleta(/\d{2}\/\d{2}\/\d{4}/.exec(trecho)?.[0]);
}

// O primeiro valor (1.234,56) até `alcance` caracteres depois do rótulo, em
// centavos, ou null.
export function valorDepoisDe(texto: string, rotulo: RegExp, alcance = 80): number | null {
  const achado = rotulo.exec(texto);
  if (!achado) {
    return null;
  }
  const trecho = texto.slice(achado.index + achado[0].length, achado.index + achado[0].length + alcance);
  const valor = /\d{1,3}(?:\.\d{3})*,\d{2}/.exec(trecho)?.[0];
  return valor ? centavosDoTexto(valor) : null;
}

export function somarDias(iso: string, dias: number): string {
  const data = new Date(`${iso}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

// ------------------------------------------------- CSV simples para a API

// Data;Descrição;Valor, com o valor com sinal (saída negativa). As colunas
// são fixas: a API não precisa adivinhar nada.
export const MAPEAMENTO_DO_CSV_SIMPLES: Mapeamento = {
  delimitador: ';',
  cabecalho: 1,
  data: 0,
  descricao: 1,
  valor: 2,
  inverter_sinal: false,
};

const TAMANHO_DA_DESCRICAO = 120;

// A descrição sem o que quebraria a coluna (o separador e as aspas) nem
// caractere de controle, com os espaços apertados.
export function descricaoParaCsv(texto: string): string {
  return (
    texto
      // eslint-disable-next-line no-control-regex
      .replace(/[;"\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, TAMANHO_DA_DESCRICAO)
  );
}

function valorParaCsv(centavos: number): string {
  const absoluto = Math.abs(centavos);
  return `${centavos < 0 ? '-' : ''}${Math.floor(absoluto / 100)},${String(absoluto % 100).padStart(2, '0')}`;
}

const dataParaCsv = (iso: string) => iso.split('-').reverse().join('/');

export function csvSimples(linhas: readonly LinhaLida[]): string {
  const corpo = linhas.map((linha) => `${dataParaCsv(linha.data)};${descricaoParaCsv(linha.descricao)};${valorParaCsv(linha.valorCentavos)}`);
  return ['Data;Descrição;Valor', ...corpo].join('\n') + '\n';
}
