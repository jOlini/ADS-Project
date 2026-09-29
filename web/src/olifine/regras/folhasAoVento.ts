// As folhas ao vento da landing, sem interface: a conta por trás da cena WebGL
// que acompanha a página inteira abaixo do topo (componentes/cenaDasFolhas.ts).
// Poucas folhas e moedas soltas no ar, cada uma numa profundidade: as de perto
// são maiores, mais nítidas e andam mais com a rolagem (paralaxe); as do fundo,
// pequenas e apagadas. Tudo determinístico e testado em folhasAoVento.test.ts;
// o movimento de cada quadro é feito no shader, a partir do que sai daqui.

import { gerador } from './arvore';

export const TIPO_NO_AR = { folha: 0, moeda: 1 } as const;

// Moedas são poucas: o dinheiro que voa junto com as folhas.
const PARTE_DE_MOEDAS = 0.16;
// Parte das folhas que pode passar pelo meio da tela (atrás do texto). As
// outras ficam nas margens, onde a página tem respiro.
const PARTE_NO_MEIO = 0.14;

// Tamanho de uma folha bem na frente (px de CSS); o shader divide pela
// profundidade.
export const TAMANHOS = {
  folha: { menor: 30, maior: 60 },
  moeda: { menor: 18, maior: 30 },
} as const;

export interface FolhasAoVento {
  quantidade: number;
  // x (-1 a 1, da esquerda para a direita), altura na coluna (0 a 1),
  // profundidade (0 perto, 1 longe) e fase (0 a 1) por folha.
  posicoes: Float32Array;
  // tipo (TIPO_NO_AR), tamanho (px), velocidade (0,4 a 1) e giro inicial (rad).
  atributos: Float32Array;
}

// Quantas folhas no ar para a tela: poucas (é fundo, não espetáculo), mais na
// tela grande, menos no celular e na máquina com pouca memória.
export function quantidadeNoAr(larguraCss: number, alturaCss: number, memoriaEmGb?: number): number {
  const area = Math.max(0, larguraCss) * Math.max(0, alturaCss);
  let quantidade = Math.round((area / (1440 * 900)) * 80);
  if (larguraCss < 640) {
    quantidade = Math.min(quantidade, 36);
  }
  if (memoriaEmGb !== undefined && memoriaEmGb < 4) {
    quantidade = Math.round(quantidade * 0.6);
  }
  return Math.min(110, Math.max(18, quantidade));
}

// x de uma folha: quase sempre numa das margens (lado sorteado), às vezes em
// qualquer lugar da largura.
function posicaoNaLargura(sorte: () => number): number {
  if (sorte() < PARTE_NO_MEIO) {
    return sorte() * 2 - 1;
  }
  const lado = sorte() < 0.5 ? -1 : 1;
  return lado * (0.42 + 0.58 * sorte() ** 0.7);
}

// Espalha as folhas na coluna (a altura é sorteada em faixas iguais, sem
// montinhos) e embaralha a ordem: desenhar só as primeiras (máquina lenta)
// deixa o céu mais ralo por igual.
export function gerarFolhasAoVento(quantidade: number, semente = 2026): FolhasAoVento {
  const sorte = gerador(semente);
  const total = Math.max(0, Math.floor(quantidade));
  const faixas = Array.from({ length: total }, (_, indice) => indice);
  for (let indice = faixas.length - 1; indice > 0; indice -= 1) {
    const outro = Math.floor(sorte() * (indice + 1));
    [faixas[indice], faixas[outro]] = [faixas[outro] ?? 0, faixas[indice] ?? 0];
  }

  const posicoes = new Float32Array(total * 4);
  const atributos = new Float32Array(total * 4);
  for (let indice = 0; indice < total; indice += 1) {
    const faixa = faixas[indice] ?? 0;
    posicoes[indice * 4] = posicaoNaLargura(sorte);
    posicoes[indice * 4 + 1] = (faixa + sorte()) / Math.max(1, total);
    // Um pouco mais de folhas perto do meio do que coladas na tela ou sumidas
    // no fundo.
    posicoes[indice * 4 + 2] = 0.08 + 0.92 * sorte() ** 1.1;
    posicoes[indice * 4 + 3] = sorte();

    const moeda = sorte() < PARTE_DE_MOEDAS;
    const tamanhos = moeda ? TAMANHOS.moeda : TAMANHOS.folha;
    atributos[indice * 4] = moeda ? TIPO_NO_AR.moeda : TIPO_NO_AR.folha;
    atributos[indice * 4 + 1] = tamanhos.menor + (tamanhos.maior - tamanhos.menor) * sorte();
    atributos[indice * 4 + 2] = 0.4 + 0.6 * sorte();
    atributos[indice * 4 + 3] = sorte() * Math.PI * 2;
  }
  return { quantidade: total, posicoes, atributos };
}

// Divisor da perspectiva de uma profundidade (0 perto, 1 longe): 1 na frente,
// 3,2 no fundo. O mesmo número do shader, aqui para os testes e para quem
// precisar saber o tamanho na tela.
export function divisorDaProfundidade(profundidade: number): number {
  return 1 + 2.2 * Math.min(1, Math.max(0, profundidade));
}

// Quanto a folha anda na tela para cada px rolado: as de perto andam quase
// junto com a página, as do fundo bem menos (paralaxe).
export function paralaxe(profundidade: number): number {
  return 0.6 / divisorDaProfundidade(profundidade);
}
