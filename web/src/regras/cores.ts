// Cores de categorias, contas e cartões, sem interface. Uma cor é o nome de
// uma sugestão da paleta (as variáveis --cat-* e --cartao-* do CSS, que mudam
// com o tema claro e escuro) ou uma cor livre em hexadecimal (#rrggbb), do
// seletor de cor. A API aceita os dois e confere o formato de novo
// (api/app/financeiro/modelos.py, ler_cor). Testado em cores.test.ts.
//
// Segurança: a cor vai para o CSS da tela (style). Só passa o hexadecimal
// exato ou um nome da paleta conhecida; qualquer outro texto vira a cor
// padrão, e nada de fora chega ao CSS.

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsv {
  // Matiz em graus (0 a 360); saturação e brilho de 0 a 1.
  h: number;
  s: number;
  v: number;
}

const HEX_EXATO = /^#[0-9a-f]{6}$/i;

export const ehCorHex = (cor: unknown): cor is string => typeof cor === 'string' && HEX_EXATO.test(cor);

// O que a pessoa digita no campo do código: "1a2b3c", "#1A2B3C" ou o curto
// "#abc" viram "#1a2b3c" / "#aabbcc". null enquanto não é uma cor completa.
export function normalizarHex(texto: string | null | undefined): string | null {
  const limpo = String(texto ?? '')
    .trim()
    .replace(/^#/, '')
    .toLowerCase();
  if (/^[0-9a-f]{6}$/.test(limpo)) {
    return `#${limpo}`;
  }
  if (/^[0-9a-f]{3}$/.test(limpo)) {
    return `#${[...limpo].map((digito) => digito + digito).join('')}`;
  }
  return null;
}

// O que pode ficar no campo enquanto a pessoa digita: o "#" e até seis
// algarismos hexadecimais (o resto nem entra).
export function mascararHex(texto: string): string {
  const digitos = String(texto ?? '')
    .replace(/[^0-9a-f]/gi, '')
    .slice(0, 6)
    .toLowerCase();
  return `#${digitos}`;
}

export function hexParaRgb(hex: string): Rgb {
  const valor = normalizarHex(hex) ?? '#000000';
  return {
    r: Number.parseInt(valor.slice(1, 3), 16),
    g: Number.parseInt(valor.slice(3, 5), 16),
    b: Number.parseInt(valor.slice(5, 7), 16),
  };
}

const doisDigitos = (canal: number) =>
  Math.round(Math.min(255, Math.max(0, canal)))
    .toString(16)
    .padStart(2, '0');

export const rgbParaHex = ({ r, g, b }: Rgb): string => `#${doisDigitos(r)}${doisDigitos(g)}${doisDigitos(b)}`;

export function hexParaHsv(hex: string): Hsv {
  const { r, g, b } = hexParaRgb(hex);
  const [vermelho, verde, azul] = [r / 255, g / 255, b / 255];
  const maior = Math.max(vermelho, verde, azul);
  const menor = Math.min(vermelho, verde, azul);
  const delta = maior - menor;
  let h = 0;
  if (delta > 0) {
    if (maior === vermelho) {
      h = 60 * (((verde - azul) / delta) % 6);
    } else if (maior === verde) {
      h = 60 * ((azul - vermelho) / delta + 2);
    } else {
      h = 60 * ((vermelho - verde) / delta + 4);
    }
  }
  return { h: (h + 360) % 360, s: maior === 0 ? 0 : delta / maior, v: maior };
}

export function hsvParaHex({ h, s, v }: Hsv): string {
  const matiz = (((h % 360) + 360) % 360) / 60;
  const saturacao = Math.min(1, Math.max(0, s));
  const brilho = Math.min(1, Math.max(0, v));
  const croma = brilho * saturacao;
  const x = croma * (1 - Math.abs((matiz % 2) - 1));
  const m = brilho - croma;
  const setor = Math.floor(matiz) % 6;
  const [r, g, b] = [
    [croma, x, 0],
    [x, croma, 0],
    [0, croma, x],
    [0, x, croma],
    [x, 0, croma],
    [croma, 0, x],
  ][setor] as [number, number, number];
  return rgbParaHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 });
}

// Luminância relativa (WCAG 2.x), de 0 (preto) a 1 (branco).
export function luminancia(hex: string): number {
  const linear = (canal: number) => {
    const c = canal / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const { r, g, b } = hexParaRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

export function contraste(a: string, b: string): number {
  const [clara, escura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
  return (clara + 0.05) / (escura + 0.05);
}

export const TEXTO_CLARO = '#ffffff';
export const TEXTO_ESCURO = '#16201b';

// O texto que fica legível sobre a cor (o nome no plástico do cartão, o
// saldo no card da conta): branco ou quase preto, o de maior contraste.
export function textoSobre(hex: string): string {
  return contraste(hex, TEXTO_CLARO) >= contraste(hex, TEXTO_ESCURO) ? TEXTO_CLARO : TEXTO_ESCURO;
}

// ------------------------------------------------------- Paletas sugeridas

// Sugestões da paleta das categorias (variáveis --cat-*). O rótulo é só para
// o leitor de tela: na tela, a cor aparece sozinha no círculo.
export const SUGESTOES_DE_CATEGORIA: readonly { valor: string; rotulo: string }[] = [
  { valor: 'moradia', rotulo: 'Azul' },
  { valor: 'mercado', rotulo: 'Verde' },
  { valor: 'entrada', rotulo: 'Verde de entrada' },
  { valor: 'transporte', rotulo: 'Roxo' },
  { valor: 'casa', rotulo: 'Âmbar' },
  { valor: 'saude', rotulo: 'Ciano' },
  { valor: 'lazer', rotulo: 'Rosa' },
  { valor: 'neutro', rotulo: 'Cinza' },
];

// Sugestões da paleta dos plásticos (variáveis --cartao-*), para cartões e
// contas.
export const SUGESTOES_DE_PLASTICO: readonly { valor: string; rotulo: string }[] = [
  { valor: 'grafite', rotulo: 'Grafite' },
  { valor: 'azul', rotulo: 'Azul' },
  { valor: 'roxo', rotulo: 'Roxo' },
  { valor: 'verde', rotulo: 'Verde' },
  { valor: 'vinho', rotulo: 'Vinho' },
  { valor: 'laranja', rotulo: 'Laranja' },
  { valor: 'dourado', rotulo: 'Dourado' },
  { valor: 'prata', rotulo: 'Prata' },
];

const NOMES_DE_CATEGORIA = new Set(SUGESTOES_DE_CATEGORIA.map((cor) => cor.valor));
const NOMES_DE_PLASTICO = new Set(SUGESTOES_DE_PLASTICO.map((cor) => cor.valor));

// O valor CSS da cor de uma categoria: a hexadecimal, a variável da paleta ou
// a cinza (cor desconhecida ou vazia).
export function corDaCategoria(cor: string | null | undefined): string {
  if (ehCorHex(cor)) {
    return cor.toLowerCase();
  }
  return `var(--cat-${cor && NOMES_DE_CATEGORIA.has(cor) ? cor : 'neutro'})`;
}

// O valor CSS da cor de um plástico (cartão ou conta).
export function corDoPlastico(cor: string | null | undefined, padrao = 'grafite'): string {
  if (ehCorHex(cor)) {
    return cor.toLowerCase();
  }
  return `var(--cartao-${cor && NOMES_DE_PLASTICO.has(cor) ? cor : padrao})`;
}

// Cor de cada tipo de conta sem cor escolhida (o card da conta na carteira).
export const COR_DO_TIPO_DE_CONTA: Record<string, string> = {
  CORRENTE: 'azul',
  POUPANCA: 'verde',
  CARTEIRA: 'dourado',
  INVESTIMENTO: 'roxo',
};

// Classe e variáveis do plástico (cartão ou conta): a da paleta, ou a
// personalizada com a cor e o texto que fica legível sobre ela.
export function estiloDoPlastico(
  cor: string | null | undefined,
  padrao = 'grafite',
): { classe: string; estilo: Record<string, string> | undefined } {
  if (ehCorHex(cor)) {
    const hex = cor.toLowerCase();
    return { classe: 'cor-personalizada', estilo: { '--cor-da-amostra': hex, '--sobre-cartao': textoSobre(hex) } };
  }
  return { classe: `cor-${cor && NOMES_DE_PLASTICO.has(cor) ? cor : padrao}`, estilo: undefined };
}
