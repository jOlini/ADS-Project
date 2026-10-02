// Leitores de extrato (padrão Strategy), sem interface e sem rede. Cada banco
// exporta de um jeito: um leitor sabe reconhecer o arquivo dele e prepará-lo
// para a API, que confere, categoriza e simula a importação. Os leitores ficam
// num registro (leitores.ts); a tela escolhe sozinha o que reconhece melhor o
// arquivo e a pessoa pode trocar, se ele errar.
//
// O PDF nunca sai do navegador: o leitor dele tira só as linhas de lançamento
// (data, descrição e valor) e as manda para a API como um CSV simples. Nome,
// CPF, endereço e código de barras que estão na fatura não vão para lugar
// nenhum.

import type { Mapeamento } from '../importacao';

export type FormatoDoArquivo = 'csv' | 'pdf';

// Um pedaço de texto de uma página do PDF, com a posição (em pontos, a partir
// do canto de cima à esquerda) e a largura.
export interface TrechoDoPdf {
  texto: string;
  x: number;
  y: number;
  largura: number;
}

export interface PaginaDoPdf {
  numero: number;
  largura: number;
  altura: number;
  trechos: TrechoDoPdf[];
}

export interface DocumentoPdf {
  paginas: PaginaDoPdf[];
}

// O arquivo já lido: o texto do CSV ou as páginas do PDF.
export type ArquivoLido = { formato: 'csv'; texto: string } | { formato: 'pdf'; documento: DocumentoPdf };

// Uma linha de lançamento tirada do documento. O valor tem o sinal da conta:
// saída negativa (a compra no cartão também), entrada positiva.
export interface LinhaLida {
  data: string;
  descricao: string;
  valorCentavos: number;
}

// Total impresso no documento comparado com a soma das linhas lidas: se não
// bater, alguma linha ficou de fora (ou entrou a mais) e a tela avisa.
export interface ConferenciaDoTotal {
  rotulo: string;
  esperadoCentavos: number;
  lidoCentavos: number;
}

export interface ExtratoPreparado {
  // O que vai para a API (POST /importacoes).
  csv: string;
  // null: a API reconhece as colunas sozinha (CSV do banco).
  mapeamento: Mapeamento | null;
  conferencias: ConferenciaDoTotal[];
  avisos: string[];
}

// Onde o arquivo vai entrar: na fatura de um cartão (cartao) ou no extrato
// de uma conta. Muda o sinal: na fatura, a compra vem sem sinal e é saída.
export interface ContextoDaLeitura {
  cartao: boolean;
  // Data de hoje (AAAA-MM-DD), para o ano das datas que vêm sem ele.
  hoje: string;
}

export interface LeitorDeExtrato {
  id: string;
  // Como aparece na tela: "Fatura do cartão Bradesco (PDF)".
  nome: string;
  formato: FormatoDoArquivo;
  // Quão certo o leitor está de que o arquivo é dele: 0 = não é; o automático
  // fica com o de maior nota (o específico de um banco ganha do genérico).
  reconhece(arquivo: ArquivoLido): number;
  // Lança ErroDoLeitor quando não acha nenhum lançamento.
  preparar(arquivo: ArquivoLido, contexto: ContextoDaLeitura): ExtratoPreparado;
}

// Falha de leitura com a mensagem para a pessoa (vai para o campo do arquivo).
export class ErroDoLeitor extends Error {}
