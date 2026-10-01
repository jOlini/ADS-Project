// O pomar da landing, sem interface: a conta 3D por trás da cena WebGL do
// topo (pomar/cenaDoPomar.ts). Folhas, pontos, moedas e cédulas espalhados num campo,
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

export const TIPO = { folha: 0, ponto: 1, moeda: 2, nota: 3 } as const;
export type TipoNoPomar = (typeof TIPO)[keyof typeof TIPO];

// Proporção 70/10/20 do pomar: aqui as folhas mandam e o dinheiro brota no
// meio delas, no inverso do céu do resto da página (regras/folhasAoVento.ts,
// 40% moedas, 40% cédulas e 20% folhas), onde o dinheiro é o assunto. Começou
// em 60/20/20; o dourado da moeda pesa mais que o verde da cédula no campo, e
// as moedas caíram para 10% a pedido do usuário (a folhagem ficou com a sobra).
export const FOLHAS_RATIO = 0.7;
export const MOEDAS_RATIO = 0.1;
export const NOTAS_RATIO = 0.2;
// Dentro dos 70% de folhagem, parte são os pontinhos de luz do campo (o
// desenho de antes): continuam folhagem, não dinheiro.
const PONTOS_NA_FOLHAGEM = 0.3;

// Tamanho de cada peça em unidades do mundo (o shader divide pela distância).
// Moeda e cédula ficam no tamanho das folhas menores: aparecem entre elas
// sem tomar a frente do campo.
export const TAMANHOS_NO_POMAR: Record<keyof typeof TIPO, { menor: number; maior: number }> = {
  folha: { menor: 0.08, maior: 0.15 },
  ponto: { menor: 0.03, maior: 0.055 },
  moeda: { menor: 0.07, maior: 0.085 },
  nota: { menor: 0.09, maior: 0.12 },
};

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

// Um trecho contínuo do buffer: o dinheiro vem antes da folhagem.
export interface Faixa {
  inicio: number;
  quantidade: number;
}

export interface Pomar {
  quantidade: number;
  // x, z e uma fase (0 a 1) por peça: onde nasce e em que tempo balança.
  posicoes: Float32Array;
  // tipo (TIPO), giro inicial (rad) e tamanho (unidades do mundo) por peça.
  atributos: Float32Array;
  // Moedas e cédulas primeiro, a folhagem depois: a cena desenha o dinheiro
  // antes, e as folhas pintam por cima dele (o dinheiro fica sob e entre as
  // folhas, sem cobrir o campo).
  dinheiro: Faixa;
  folhagem: Faixa;
}

export interface PartesDoPomar {
  folhagem: number;
  moedas: number;
  notas: number;
}

// Quantas peças de cada grupo, pela proporção 70/10/20 (MOEDAS_RATIO e
// NOTAS_RATIO arredondados; a folhagem fica com o resto, então a soma é
// sempre o total).
export function partesDoPomar(total: number): PartesDoPomar {
  const inteiro = Math.max(0, Math.floor(total));
  const moedas = Math.round(inteiro * MOEDAS_RATIO);
  const notas = Math.round(inteiro * NOTAS_RATIO);
  return { folhagem: Math.max(0, inteiro - moedas - notas), moedas, notas };
}

// Embaralha no lugar (Fisher-Yates) com o sorteio da semente.
function embaralhar<T>(lista: T[], sorte: () => number): T[] {
  for (let indice = lista.length - 1; indice > 0; indice -= 1) {
    const outro = Math.floor(sorte() * (indice + 1));
    [lista[indice], lista[outro]] = [lista[outro] as T, lista[indice] as T];
  }
  return lista;
}

// Espalha `quantidade` pontos no campo numa grade com sorteio dentro de cada
// casa (cobre o campo sem buracos nem montinhos) e embaralha a ordem: qualquer
// começo da lista é uma amostra do campo inteiro. Devolve x, z e fase por
// ponto. Folhagem e dinheiro usam grades próprias, desencontradas: as moedas e
// as cédulas caem entre as folhas, não em fila com elas.
export function espalharNoCampo(quantidade: number, sorte: () => number): Float32Array {
  const total = Math.max(0, Math.floor(quantidade));
  const colunas = Math.max(1, Math.round(Math.sqrt((total * CAMPO.largura) / CAMPO.profundidade)));
  const linhas = Math.max(1, Math.ceil(total / colunas));
  const casaX = CAMPO.largura / colunas;
  const casaZ = CAMPO.profundidade / linhas;
  const ordem = embaralhar(Array.from({ length: colunas * linhas }, (_, indice) => indice), sorte);

  const posicoes = new Float32Array(total * 3);
  for (let indice = 0; indice < total; indice += 1) {
    const casa = ordem[indice] ?? 0;
    posicoes[indice * 3] = -CAMPO.largura / 2 + ((casa % colunas) + sorte()) * casaX;
    posicoes[indice * 3 + 1] = (Math.floor(casa / colunas) + sorte()) * casaZ;
    posicoes[indice * 3 + 2] = sorte();
  }
  return posicoes;
}

function sortearTamanho(tipo: keyof typeof TIPO, sorte: () => number): number {
  const { menor, maior } = TAMANHOS_NO_POMAR[tipo];
  return menor + (maior - menor) * sorte();
}

// Monta o pomar: a proporção 70/10/20 decide quantas peças vão para cada
// grupo (partesDoPomar), cada grupo é espalhado no campo inteiro e o dinheiro
// entra no buffer antes da folhagem. Moedas e cédulas são embaralhadas entre
// si: desenhar só o começo do grupo mantém as duas na mesma conta.
export function gerarPomar(quantidade: number, semente = 2026): Pomar {
  const sorte = gerador(semente);
  const partes = partesDoPomar(quantidade);
  const noDinheiro = partes.moedas + partes.notas;
  const total = noDinheiro + partes.folhagem;
  const posicoes = new Float32Array(total * 3);
  const atributos = new Float32Array(total * 3);

  const tiposDoDinheiro = embaralhar<'moeda' | 'nota'>(
    [...Array<'moeda'>(partes.moedas).fill('moeda'), ...Array<'nota'>(partes.notas).fill('nota')],
    sorte,
  );
  posicoes.set(espalharNoCampo(noDinheiro, sorte), 0);
  tiposDoDinheiro.forEach((tipo, indice) => {
    atributos[indice * 3] = TIPO[tipo];
    atributos[indice * 3 + 1] = sorte() * Math.PI * 2;
    atributos[indice * 3 + 2] = sortearTamanho(tipo, sorte);
  });

  posicoes.set(espalharNoCampo(partes.folhagem, sorte), noDinheiro * 3);
  for (let indice = noDinheiro; indice < total; indice += 1) {
    const tipo = sorte() < PONTOS_NA_FOLHAGEM ? 'ponto' : 'folha';
    atributos[indice * 3] = TIPO[tipo];
    atributos[indice * 3 + 1] = sorte() * Math.PI * 2;
    atributos[indice * 3 + 2] = sortearTamanho(tipo, sorte);
  }

  return {
    quantidade: total,
    posicoes,
    atributos,
    dinheiro: { inicio: 0, quantidade: noDinheiro },
    folhagem: { inicio: noDinheiro, quantidade: partes.folhagem },
  };
}

// Quantas peças de cada grupo desenhar quando a tela pede `pecas` (máquina
// lenta, tela menor): o corte é proporcional nos dois grupos, então o campo
// fica mais ralo sem mudar os 70/10/20.
export function quantoDesenhar(pomar: Pomar, pecas: number): { dinheiro: number; folhagem: number } {
  const fracao = pomar.quantidade > 0 ? Math.min(1, Math.max(0, pecas) / pomar.quantidade) : 0;
  return {
    dinheiro: Math.round(pomar.dinheiro.quantidade * fracao),
    folhagem: Math.round(pomar.folhagem.quantidade * fracao),
  };
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
