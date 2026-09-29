// Movimento da árvore das metas, sem interface: a mola que leva o progresso
// mostrado até o novo (a árvore e a barra crescem juntas, sem salto) e quais
// maçãs caem na colheita. Testado em crescimento.test.ts.

export interface Mola {
  // Progresso mostrado (0 a 1) e a velocidade dele, por segundo.
  posicao: number;
  velocidade: number;
}

// Frequência da mola (rad/s): chega ao alvo em cerca de 1,2 s. Amortecida no
// ponto crítico: vai direto, sem passar do alvo e voltar.
export const FREQUENCIA = 5.2;
// Maior passo de tempo de uma conta (s). Um quadro atrasado (aba em segundo
// plano) não dá um pulo: a conta é feita em passos pequenos.
const PASSO_MAXIMO = 1 / 60;
// Perto o bastante para parar.
const REPOUSO = { posicao: 0.0001, velocidade: 0.001 };

// A mola depois de `segundos`, puxada para o alvo. Um aporte novo no meio do
// caminho só muda o alvo: a velocidade continua, e a árvore não trava nem
// recomeça. Sem sair de 0 a 1.
export function avancarMola(mola: Mola, alvo: number, segundos: number, frequencia = FREQUENCIA): Mola {
  let { posicao, velocidade } = mola;
  let resto = Math.max(0, segundos);
  while (resto > 0) {
    const passo = Math.min(resto, PASSO_MAXIMO);
    // Semi-implícito: a velocidade nova move a posição (estável com passo pequeno).
    velocidade += (-(frequencia ** 2) * (posicao - alvo) - 2 * frequencia * velocidade) * passo;
    posicao += velocidade * passo;
    resto -= passo;
  }
  posicao = Math.min(1, Math.max(0, posicao));
  return { posicao, velocidade };
}

export function emRepouso(mola: Mola, alvo: number): boolean {
  return Math.abs(mola.posicao - alvo) < REPOUSO.posicao && Math.abs(mola.velocidade) < REPOUSO.velocidade;
}

export interface Fruto {
  id: number | string;
  x: number;
  y: number;
}

// Na colheita, cai uma maçã sim, outra não (no máximo `maximo`), e as outras
// ficam na copa. A que cai sai do galho: é o mesmo desenho que desce, e não
// uma cópia, então a árvore nunca mostra a mesma maçã duas vezes.
export function frutosQueCaem<T extends Fruto>(frutos: T[], maximo = 3): Set<T['id']> {
  return new Set(
    frutos
      .filter((_, indice) => indice % 2 === 0)
      .slice(0, maximo)
      .map((fruto) => fruto.id),
  );
}

// Até onde cada maçã cai (o chão, com uma pequena variação para não empilhar)
// e para que lado ela rola.
export function quedaDoFruto(fruto: Fruto, indice: number, chao: number): { queda: number; desvio: number } {
  return { queda: chao + (indice % 3) * 3 - fruto.y, desvio: (indice % 2 ? 1 : -1) * (6 + indice * 4) };
}
