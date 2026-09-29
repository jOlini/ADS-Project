// As folhas e moedas da landing em miniatura, dentro do app, sem interface: a
// conta por trás de componentes/FolhasEmVolta.tsx. São as mesmas peças do
// pomar e das folhas ao vento (a folha do F do monograma e a moeda dourada da
// árvore completa), desenhadas em CSS 3D: poucas por tela e sem um contexto
// WebGL novo a cada estado vazio. Tudo determinístico, testado em
// folhasEmVolta.test.ts.
//
// Três arranjos:
// - cabecalho: folhas subindo e virando no próprio eixo à direita do "Olá"
//   da Visão geral, como as folhas ao vento da landing;
// - vazio: uma órbita em volta do símbolo do estado vazio;
// - colheita: a explosão de folhas e moedas quando uma meta fica completa,
//   uma vez só.

import { gerador } from './arvore';

export type ArranjoDasFolhas = 'cabecalho' | 'vazio' | 'colheita';

export interface FolhaEmVolta {
  tipo: 'folha' | 'moeda';
  // cabecalho: posição de partida (0 a 1 da largura e da altura);
  // vazio: ângulo na órbita (graus) e altura (px);
  // colheita: para onde voa (px a partir do centro).
  x: number;
  y: number;
  // Profundidade (px): positivo vem para a frente.
  z: number;
  // Lado da folha (px).
  tamanho: number;
  // Segundos. No cabecalho e no vazio o atraso é negativo: a folha já
  // aparece no meio do caminho, sem todas nascerem juntas.
  atraso: number;
  duracao: number;
  // Giro inicial no plano da tela (graus).
  giro: number;
}

// Quantas peças por arranjo: fundo discreto, não espetáculo (a colheita é o
// momento de festa, e dura pouco).
export const QUANTIDADES: Record<ArranjoDasFolhas, number> = { cabecalho: 12, vazio: 6, colheita: 28 };

// Parte de moedas: o dinheiro que voa junto com as folhas.
const PARTE_DE_MOEDAS: Record<ArranjoDasFolhas, number> = { cabecalho: 0.2, vazio: 0.17, colheita: 0.4 };

const entre = (sorte: () => number, menor: number, maior: number) => menor + (maior - menor) * sorte();
const arredondar = (valor: number) => Math.round(valor * 100) / 100;

function peca(arranjo: ArranjoDasFolhas, indice: number, total: number, sorte: () => number): FolhaEmVolta {
  const moeda = sorte() < PARTE_DE_MOEDAS[arranjo];
  const giro = entre(sorte, 0, 360);
  if (arranjo === 'cabecalho') {
    const duracao = entre(sorte, 9, 16);
    return {
      tipo: moeda ? 'moeda' : 'folha',
      // Quase todas à direita do título, onde o cabeçalho tem respiro.
      x: sorte() < 0.8 ? entre(sorte, 0.42, 0.98) : entre(sorte, 0.02, 0.42),
      y: entre(sorte, 0.1, 1),
      z: entre(sorte, -90, 40),
      tamanho: moeda ? entre(sorte, 9, 14) : entre(sorte, 11, 22),
      atraso: -entre(sorte, 0, duracao),
      duracao,
      giro,
    };
  }
  if (arranjo === 'vazio') {
    // Ângulos espalhados por igual, com um pouco de sorte para não parecer
    // uma roda.
    const duracao = 14;
    return {
      tipo: moeda ? 'moeda' : 'folha',
      x: (indice / total) * 360 + entre(sorte, -12, 12),
      y: entre(sorte, -14, 14),
      z: 0,
      tamanho: moeda ? entre(sorte, 8, 11) : entre(sorte, 10, 15),
      atraso: -entre(sorte, 0, duracao),
      duracao,
      giro,
    };
  }
  // Colheita: cada peça sai do centro numa direção, mais para cima que para
  // baixo (a árvore solta por cima), e cai depois.
  const angulo = entre(sorte, -Math.PI * 0.95, Math.PI * 0.15) + (indice % 2 ? 0 : Math.PI * 0.1);
  const distancia = entre(sorte, 90, 210);
  return {
    tipo: moeda ? 'moeda' : 'folha',
    x: Math.cos(angulo) * distancia,
    y: Math.sin(angulo) * distancia,
    z: entre(sorte, -140, 170),
    tamanho: moeda ? entre(sorte, 12, 18) : entre(sorte, 14, 26),
    atraso: entre(sorte, 0, 0.25),
    duracao: entre(sorte, 1.7, 2.5),
    giro,
  };
}

export function gerarFolhasEmVolta(arranjo: ArranjoDasFolhas, semente = 2026, quantidade = QUANTIDADES[arranjo]): FolhaEmVolta[] {
  const sorte = gerador(semente);
  const total = Math.max(0, Math.floor(quantidade));
  return Array.from({ length: total }, (_, indice) => {
    const folha = peca(arranjo, indice, total, sorte);
    return {
      ...folha,
      x: arredondar(folha.x),
      y: arredondar(folha.y),
      z: arredondar(folha.z),
      tamanho: arredondar(folha.tamanho),
      atraso: arredondar(folha.atraso),
      duracao: arredondar(folha.duracao),
      giro: arredondar(folha.giro),
    };
  });
}
