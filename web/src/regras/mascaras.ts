// Máscaras dos campos, sem interface: cada uma recebe o texto que ficou no
// campo depois da tecla (ou do colar) e a posição do cursor, e devolve o
// texto no formato do tipo de dado e onde o cursor fica. Quem aplica é o
// hook useMascara (componentes/useMascara.ts), no Campo e onde mais houver
// um <input> de valor. O texto de saída é o mesmo que dinheiro.lerValor lê
// na hora de enviar o formulário. A data tem máscara própria, no
// SeletorDeData (calendario.mascararData); daqui ela usa só o podeDigitar.

import { LIMITE_EM_CENTAVOS } from './dinheiro';

export type TipoDeMascara = 'moeda' | 'moeda-com-sinal' | 'inteiro' | 'data' | 'texto';

export interface TextoMascarado {
  texto: string;
  cursor: number;
}

export interface OpcoesDaMoeda {
  permitirNegativo?: boolean;
  // A tecla que acabou de entrar (InputEvent.data). A tecla "." vale como
  // vírgula decimal (teclado numérico, celular em inglês).
  teclaDigitada?: string | null;
  // Texto colado (ou arrastado): pode trazer o ponto como decimal ("10.5").
  // Digitando, todo ponto no campo é de milhar, porque foi a máscara que o pôs.
  colado?: boolean;
}

// Maior quantidade de dígitos antes da vírgula: o teto de R$ 1 bilhão
// (LIMITE_EM_CENTAVOS) tem 10. O décimo primeiro dígito nem entra.
export const DIGITOS_INTEIROS = String(Math.floor(LIMITE_EM_CENTAVOS / 100)).length;
const SINAIS_DE_MENOS = new Set(['-', '−']);

// Um caractere que ficou no texto final e a posição de onde ele veio no
// texto digitado. É o que leva o cursor para o lugar certo depois que os
// pontos de milhar entram, saem ou mudam de lugar.
interface Peca {
  caractere: string;
  origem: number;
}

const agruparMilhares = (digitos: string): string => digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// Posição no texto final logo depois das `quantas` primeiras peças (os
// pontos de milhar não são peças: o cursor passa por cima deles).
function cursorDepoisDe(texto: string, quantas: number): number {
  if (quantas <= 0) {
    return 0;
  }
  let vistas = 0;
  for (let indice = 0; indice < texto.length; indice += 1) {
    if (texto[indice] !== '.') {
      vistas += 1;
      if (vistas === quantas) {
        return indice + 1;
      }
    }
  }
  return texto.length;
}

const digitosDe = (texto: string, de: number, ate: number): Peca[] =>
  [...texto.slice(de, ate)].flatMap((caractere, indice) => (/\d/.test(caractere) ? [{ caractere, origem: de + indice }] : []));

// Sem zeros à esquerda ("007" -> "7"), mas o último zero fica ("000" -> "0").
function semZerosAEsquerda(pecas: Peca[]): Peca[] {
  let inicio = 0;
  while (inicio < pecas.length - 1 && pecas[inicio]?.caractere === '0') {
    inicio += 1;
  }
  return pecas.slice(inicio);
}

// Valor em reais no jeito brasileiro: "1.234,56". Enquanto a pessoa digita:
// - só entram dígitos, uma vírgula e (com permitirNegativo) o sinal de menos
//   no começo; letra e símbolo somem;
// - os pontos de milhar se ajeitam sozinhos;
// - depois da vírgula cabem só dois dígitos, e antes dela, os dez do teto.
// Colado de outro lugar, "R$ 1.234,56", "1234.5" e "80,00" chegam certos: o
// ponto é decimal só quando não há vírgula e é o único, seguido de 1 ou 2
// dígitos no fim (a mesma regra do lerValor).
export function mascararMoeda(bruto: string, cursor?: number, opcoes: OpcoesDaMoeda = {}): TextoMascarado {
  const { permitirNegativo = false, teclaDigitada = null, colado = false } = opcoes;
  let texto = String(bruto ?? '');
  const posicao = Math.min(Math.max(cursor ?? texto.length, 0), texto.length);

  // A tecla "." acabou de entrar: vira a vírgula, se ainda não houver uma.
  if (teclaDigitada === '.' && texto[posicao - 1] === '.' && !texto.includes(',')) {
    texto = `${texto.slice(0, posicao - 1)},${texto.slice(posicao)}`;
  }

  let decimal = texto.indexOf(',');
  if (decimal === -1 && colado) {
    const pontos = texto.match(/\./g) ?? [];
    const pontoNoFim = /\.\d{1,2}\s*$/.exec(texto);
    if (pontos.length === 1 && pontoNoFim) {
      decimal = pontoNoFim.index;
    }
  }

  const primeiro = texto.search(/\S/);
  const sinal: Peca[] =
    permitirNegativo && primeiro !== -1 && SINAIS_DE_MENOS.has(texto[primeiro] ?? '') ? [{ caractere: '-', origem: primeiro }] : [];
  const inteiros = semZerosAEsquerda(digitosDe(texto, 0, decimal === -1 ? texto.length : decimal)).slice(0, DIGITOS_INTEIROS);
  const pecas: Peca[] = [...sinal];
  if (decimal !== -1) {
    // "," digitada no campo vazio vira "0,": o zero conta como antes da vírgula.
    pecas.push(...(inteiros.length > 0 ? inteiros : [{ caractere: '0', origem: decimal - 0.5 }]));
    pecas.push({ caractere: ',', origem: decimal }, ...digitosDe(texto, decimal + 1, texto.length).slice(0, 2));
  } else {
    pecas.push(...inteiros);
  }

  const digitosDoInteiro = pecas.filter((peca) => peca.caractere !== '-' && peca.origem < (decimal === -1 ? Infinity : decimal));
  const resto = decimal === -1 ? '' : pecas.slice(pecas.findIndex((peca) => peca.caractere === ',')).map((peca) => peca.caractere).join('');
  const saida = `${sinal.length > 0 ? '-' : ''}${agruparMilhares(digitosDoInteiro.map((peca) => peca.caractere).join(''))}${resto}`;
  const antesDoCursor = pecas.filter((peca) => peca.origem < posicao).length;
  return { texto: saida, cursor: cursorDepoisDe(saida, antesDoCursor) };
}

// Número inteiro sem sinal (parcelas, dia do mês): só dígitos, sem zero à
// esquerda e com no máximo `digitos` algarismos.
export function mascararInteiro(bruto: string, cursor?: number, { digitos = 9 }: { digitos?: number } = {}): TextoMascarado {
  const texto = String(bruto ?? '');
  const posicao = Math.min(Math.max(cursor ?? texto.length, 0), texto.length);
  const pecas = semZerosAEsquerda(digitosDe(texto, 0, texto.length)).slice(0, digitos);
  const saida = pecas.map((peca) => peca.caractere).join('');
  return { texto: saida, cursor: pecas.filter((peca) => peca.origem < posicao).length };
}

// Caracteres que cada máscara deixa entrar pela tecla. O resto é barrado
// antes de aparecer (beforeinput), sem piscar no campo; o que vem colado
// passa pela máscara (ou pela limpeza do texto), que tira o que não serve.
const PERMITIDOS: Record<TipoDeMascara, RegExp> = {
  moeda: /^[\d.,]+$/,
  'moeda-com-sinal': /^[\d.,\-−]+$/,
  inteiro: /^\d+$/,
  data: /^[\d/]+$/,
  // Texto livre: tudo, menos os sinais de tag (defesa a mais contra XSS; o
  // React já escapa o que mostra) e caracteres de controle.
  // eslint-disable-next-line no-control-regex
  texto: /^[^<>\u0000-\u001F\u007F-\u009F]+$/,
};

export function podeDigitar(mascara: TipoDeMascara, tecla: string | null | undefined): boolean {
  if (!tecla) {
    return true;
  }
  return PERMITIDOS[mascara].test(tecla);
}

// Teclado de cada máscara no celular (atributo inputMode). O teclado
// "decimal" não tem o sinal de menos: o valor com sinal usa o de texto.
export const TECLADO: Record<TipoDeMascara, 'decimal' | 'numeric' | 'text'> = {
  moeda: 'decimal',
  'moeda-com-sinal': 'text',
  inteiro: 'numeric',
  data: 'numeric',
  texto: 'text',
};
