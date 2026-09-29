// O pomar da landing, sem interface: a conta 3D por trás da cena WebGL do
// topo (pomar/cenaDoPomar.ts). Folhas, pontos e moedas espalhados num campo,
// a câmera que olha para ele e segue o ponteiro, o ponto do chão sob o
// ponteiro (onde as folhas se levantam) e quantas folhas cabem em cada tela. Tudo determinístico e testado em
// pomar.test.ts; o relevo e a cor de cada folha são feitos na placa de vídeo
// (o shader), a partir do que sai daqui.

import { gerador } from './arvore';

export type Vetor3 = [number, number, number];
// Matriz 4 × 4 em colunas, o formato que o WebGL espera.
export type Matriz4 = Float32Array;

// Tamanho do campo em unidades do mundo: x vai de -largura/2 a +largura/2 e a
// profundidade de 0 a profundidade, à frente da câmera. No mundo, a câmera
// olha para o z negativo (como no WebGL, e aí o x positivo fica à direita da
// tela): a folha na profundidade p está em z = -p.
export const CAMPO = { largura: 26, profundidade: 22 } as const;

// Lente da câmera: 46° na vertical, que deixa o horizonte perto do alto do
// topo e o campo por baixo do texto e do celular.
export const LENTE = { fovY: (46 * Math.PI) / 180, perto: 0.1, longe: 80 } as const;

export const TIPO = { folha: 0, ponto: 1, moeda: 2 } as const;

// Moedas são raras: o dinheiro que brota no meio das folhas (a moeda dourada
// é a mesma da árvore completa das metas).
const PARTE_DE_MOEDAS = 0.008;
const PARTE_DE_PONTOS = 0.3;

// --- Vetores e matrizes --------------------------------------------------------

function subtrair(a: Vetor3, b: Vetor3): Vetor3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vetorial(a: Vetor3, b: Vetor3): Vetor3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function escalar(a: Vetor3, b: Vetor3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normalizar(a: Vetor3): Vetor3 {
  const tamanho = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / tamanho, a[1] / tamanho, a[2] / tamanho];
}

export function perspectiva(fovY: number, aspecto: number, perto: number, longe: number): Matriz4 {
  const f = 1 / Math.tan(fovY / 2);
  const inverso = 1 / (perto - longe);
  // prettier-ignore
  return new Float32Array([
    f / aspecto, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (longe + perto) * inverso, -1,
    0, 0, 2 * longe * perto * inverso, 0,
  ]);
}

// Matriz da câmera em `olho` olhando para `alvo`, com o céu para cima.
export function olharPara(olho: Vetor3, alvo: Vetor3, cima: Vetor3 = [0, 1, 0]): Matriz4 {
  const z = normalizar(subtrair(olho, alvo));
  const x = normalizar(vetorial(cima, z));
  const y = vetorial(z, x);
  // prettier-ignore
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -escalar(x, olho), -escalar(y, olho), -escalar(z, olho), 1,
  ]);
}

export function multiplicar(a: Matriz4, b: Matriz4): Matriz4 {
  const resultado = new Float32Array(16);
  for (let coluna = 0; coluna < 4; coluna += 1) {
    for (let linha = 0; linha < 4; linha += 1) {
      let soma = 0;
      for (let k = 0; k < 4; k += 1) {
        soma += (a[k * 4 + linha] ?? 0) * (b[coluna * 4 + k] ?? 0);
      }
      resultado[coluna * 4 + linha] = soma;
    }
  }
  return resultado;
}

// Onde um ponto do mundo aparece na tela, de -1 a 1 (y para cima), e a
// profundidade. Serve aos testes e à conferência do enquadramento.
export function projetar(matriz: Matriz4, ponto: Vetor3): Vetor3 {
  const [x, y, z] = ponto;
  const m = (indice: number) => matriz[indice] ?? 0;
  const cx = m(0) * x + m(4) * y + m(8) * z + m(12);
  const cy = m(1) * x + m(5) * y + m(9) * z + m(13);
  const cz = m(2) * x + m(6) * y + m(10) * z + m(14);
  const w = m(3) * x + m(7) * y + m(11) * z + m(15);
  return [cx / w, cy / w, cz / w];
}

// --- Câmera --------------------------------------------------------------------

export interface Ponteiro {
  // Posição do ponteiro no topo, de -1 a 1 (y para cima).
  x: number;
  y: number;
}

export interface Enquadramento {
  olho: Vetor3;
  alvo: Vetor3;
}

// A câmera sobrevoa o campo um pouco acima das folhas e acompanha o ponteiro
// de leve (paralaxe: o campo parece ter fundo). Rolando a página, ela avança
// e desce, como quem entra no pomar ao sair do topo.
export function enquadramento(ponteiro: Ponteiro, rolagem: number): Enquadramento {
  const r = Math.min(1, Math.max(0, rolagem));
  return {
    olho: [ponteiro.x * 0.9, 2.9 + ponteiro.y * 0.35 - r * 0.7, 3.2 - r * 2.4],
    alvo: [1.2 + ponteiro.x * 0.35, 0.1, -8],
  };
}

// Projeção e câmera juntas, na ordem em que o shader as aplica.
export function matrizDaCena(quadro: Enquadramento, aspecto: number): Matriz4 {
  return multiplicar(perspectiva(LENTE.fovY, aspecto, LENTE.perto, LENTE.longe), olharPara(quadro.olho, quadro.alvo));
}

// Quantos pixels mede uma unidade do mundo a uma unidade de distância: o
// shader divide pela distância de cada folha para achar o tamanho dela.
export function pixelsPorUnidade(alturaEmPixels: number): number {
  return alturaEmPixels / (2 * Math.tan(LENTE.fovY / 2));
}

// Onde o ponteiro toca o chão (y = altura): o raio sai do olho e passa pelo
// ponto da tela. Devolve [x, profundidade] no campo, ou null se o raio sobe
// (o ponteiro está no céu, acima do horizonte).
export function pontoNoChao(
  ponteiro: Ponteiro,
  quadro: Enquadramento,
  aspecto: number,
  altura = 0,
): [number, number] | null {
  const frente = normalizar(subtrair(quadro.alvo, quadro.olho));
  const direita = normalizar(vetorial(frente, [0, 1, 0]));
  const cima = vetorial(direita, frente);
  const tangente = Math.tan(LENTE.fovY / 2);
  const direcao = normalizar([
    frente[0] + direita[0] * ponteiro.x * tangente * aspecto + cima[0] * ponteiro.y * tangente,
    frente[1] + direita[1] * ponteiro.x * tangente * aspecto + cima[1] * ponteiro.y * tangente,
    frente[2] + direita[2] * ponteiro.x * tangente * aspecto + cima[2] * ponteiro.y * tangente,
  ]);
  if (direcao[1] > -1e-4) {
    return null;
  }
  const t = (altura - quadro.olho[1]) / direcao[1];
  return [quadro.olho[0] + direcao[0] * t, -(quadro.olho[2] + direcao[2] * t)];
}

// --- Movimento -----------------------------------------------------------------

// Aproxima `atual` de `alvo` com meia-vida fixa (s): o mesmo andar com 30 ou
// 144 quadros por segundo, sem passar do alvo. Um quadro atrasado (aba em
// segundo plano) não vira um salto: o passo é limitado a 0,1 s.
export function aproximar(atual: number, alvo: number, segundos: number, meiaVida = 0.14): number {
  const passo = Math.min(0.1, Math.max(0, segundos));
  const fator = 1 - 2 ** (-passo / meiaVida);
  return atual + (alvo - atual) * fator;
}

// Sem mouse (celular, ou ponteiro fora do topo), o celular e o campo
// balançam devagar sozinhos, dentro de um terço do alcance do mouse.
export function balancoOcioso(segundos: number): Ponteiro {
  return {
    x: Math.sin(segundos * 0.31) * 0.24 + Math.sin(segundos * 0.13 + 2) * 0.09,
    y: Math.sin(segundos * 0.23 + 1) * 0.16,
  };
}

// --- As folhas -----------------------------------------------------------------

// Folhas por tela: cresce com a área, dentro de um piso (o campo não fica
// ralo no celular) e de um teto (a placa de vídeo modesta segue a 60 quadros).
export function quantidadeDeFolhas(larguraCss: number, alturaCss: number, memoriaEmGb?: number): number {
  const pelaArea = Math.round((Math.max(0, larguraCss) * Math.max(0, alturaCss)) / 70);
  const teto = memoriaEmGb !== undefined && memoriaEmGb < 4 ? 8000 : 14000;
  return Math.min(teto, Math.max(4500, pelaArea));
}

export interface Pomar {
  quantidade: number;
  // x, z e uma fase (0 a 1) por folha: onde nasce e em que tempo balança.
  posicoes: Float32Array;
  // tipo (TIPO), giro inicial (rad) e tamanho (unidades do mundo) por folha.
  atributos: Float32Array;
}

// Espalha as folhas numa grade com sorteio dentro de cada casa (cobre o campo
// sem buracos nem montinhos) e embaralha a ordem: qualquer começo da lista é
// uma amostra do campo inteiro, então desenhar menos folhas (tela menor,
// máquina lenta) só deixa o campo mais ralo, sem cortar um pedaço.
export function gerarPomar(quantidade: number, semente = 2026): Pomar {
  const sorte = gerador(semente);
  const total = Math.max(0, Math.floor(quantidade));
  const colunas = Math.max(1, Math.round(Math.sqrt((total * CAMPO.largura) / CAMPO.profundidade)));
  const linhas = Math.max(1, Math.ceil(total / colunas));
  const casaX = CAMPO.largura / colunas;
  const casaZ = CAMPO.profundidade / linhas;

  const ordem = Array.from({ length: colunas * linhas }, (_, indice) => indice);
  for (let indice = ordem.length - 1; indice > 0; indice -= 1) {
    const outro = Math.floor(sorte() * (indice + 1));
    [ordem[indice], ordem[outro]] = [ordem[outro] ?? 0, ordem[indice] ?? 0];
  }

  const posicoes = new Float32Array(total * 3);
  const atributos = new Float32Array(total * 3);
  for (let indice = 0; indice < total; indice += 1) {
    const casa = ordem[indice] ?? 0;
    const coluna = casa % colunas;
    const linha = Math.floor(casa / colunas);
    posicoes[indice * 3] = -CAMPO.largura / 2 + (coluna + sorte()) * casaX;
    posicoes[indice * 3 + 1] = (linha + sorte()) * casaZ;
    posicoes[indice * 3 + 2] = sorte();

    const dado = sorte();
    const tipo = dado < PARTE_DE_MOEDAS ? TIPO.moeda : dado < PARTE_DE_MOEDAS + PARTE_DE_PONTOS ? TIPO.ponto : TIPO.folha;
    atributos[indice * 3] = tipo;
    atributos[indice * 3 + 1] = sorte() * Math.PI * 2;
    atributos[indice * 3 + 2] =
      tipo === TIPO.moeda ? 0.07 + sorte() * 0.015 : tipo === TIPO.ponto ? 0.03 + sorte() * 0.025 : 0.08 + sorte() * 0.07;
  }
  return { quantidade: total, posicoes, atributos };
}

// --- Máscara do texto ----------------------------------------------------------

export interface Caixa {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// A área do texto do topo na tela do WebGL (-1 a 1, y para cima), com uma
// folga: as folhas por trás do título ficam mais apagadas, e a leitura do
// texto branco não disputa com o brilho delas.
export function caixaNaTela(caixa: Caixa, tela: Caixa, folga = 24): [number, number, number, number] {
  const largura = tela.right - tela.left || 1;
  const altura = tela.bottom - tela.top || 1;
  const x = (valor: number) => ((valor - tela.left) / largura) * 2 - 1;
  const y = (valor: number) => 1 - ((valor - tela.top) / altura) * 2;
  return [x(caixa.left - folga), y(caixa.bottom + folga), x(caixa.right + folga), y(caixa.top - folga)];
}
