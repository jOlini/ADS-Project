// Testes do movimento da árvore: a mola que leva o progresso mostrado até o
// novo e as maçãs que caem na colheita.
import { describe, expect, it } from 'vitest';
import { avancarMola, emRepouso, frutosQueCaem, quedaDoFruto, type Mola } from './crescimento';

const parada = (posicao: number): Mola => ({ posicao, velocidade: 0 });

// Anda a mola em quadros de 16 ms até `ms`, devolvendo cada posição.
function simular(inicio: Mola, alvo: number | ((ms: number) => number), ms: number): number[] {
  const posicoes: number[] = [];
  let mola = inicio;
  for (let agora = 16; agora <= ms; agora += 16) {
    mola = avancarMola(mola, typeof alvo === 'function' ? alvo(agora) : alvo, 0.016);
    posicoes.push(mola.posicao);
  }
  return posicoes;
}

describe('avancarMola', () => {
  it('chega ao alvo em cerca de 1,2 s, sem passar dele', () => {
    const posicoes = simular(parada(0.2), 0.6, 2000);
    expect(Math.max(...posicoes)).toBeLessThanOrEqual(0.6 + 1e-9);
    expect(posicoes.at(-1)).toBeCloseTo(0.6, 3);
    // Em 1,2 s já fez quase todo o caminho.
    expect(posicoes[Math.round(1200 / 16) - 1]).toBeGreaterThan(0.58);
  });

  it('cresce sempre para a frente, sem salto de um quadro para o outro', () => {
    const posicoes = simular(parada(0), 1, 2000);
    for (let indice = 1; indice < posicoes.length; indice += 1) {
      const passo = (posicoes[indice] ?? 0) - (posicoes[indice - 1] ?? 0);
      expect(passo).toBeGreaterThanOrEqual(0);
      expect(passo).toBeLessThan(0.05);
    }
  });

  it('cliques seguidos só mudam o alvo: a árvore continua crescendo, sem parar nem pular', () => {
    // Um aporte de 10% a cada 150 ms, cinco vezes (0,1 → 0,6).
    const alvo = (ms: number) => Math.min(0.6, 0.1 + Math.floor(ms / 150) * 0.1);
    const posicoes = simular(parada(0.1), alvo, 2400);
    for (let indice = 1; indice < posicoes.length; indice += 1) {
      const passo = (posicoes[indice] ?? 0) - (posicoes[indice - 1] ?? 0);
      expect(passo).toBeGreaterThanOrEqual(-1e-9);
      expect(passo).toBeLessThan(0.05);
    }
    expect(posicoes.at(-1)).toBeCloseTo(0.6, 2);
  });

  it('quadro atrasado (aba em segundo plano) não pula nem passa do alvo', () => {
    const depois = avancarMola(parada(0), 1, 5);
    expect(depois.posicao).toBeCloseTo(1, 3);
    expect(depois.posicao).toBeLessThanOrEqual(1);
  });

  it('desfazer um aporte faz a árvore voltar, sem ir abaixo de zero', () => {
    const posicoes = simular(parada(0.3), 0, 2000);
    expect(Math.min(...posicoes)).toBeGreaterThanOrEqual(0);
    expect(posicoes.at(-1)).toBeCloseTo(0, 3);
  });
});

describe('emRepouso', () => {
  it('para perto do alvo e parada', () => {
    expect(emRepouso(parada(0.5), 0.5)).toBe(true);
    expect(emRepouso({ posicao: 0.5, velocidade: 0.1 }, 0.5)).toBe(false);
    expect(emRepouso(parada(0.4), 0.5)).toBe(false);
  });
});

describe('frutosQueCaem', () => {
  const frutos = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id, x: id * 10, y: 100 }));

  it('cai uma sim, outra não, no máximo três: as outras ficam na copa', () => {
    expect([...frutosQueCaem(frutos)]).toEqual([1, 3, 5]);
    expect([...frutosQueCaem(frutos.slice(0, 3))]).toEqual([1, 3]);
    expect([...frutosQueCaem(frutos.slice(0, 1))]).toEqual([1]);
  });

  it('nunca derruba todas quando há mais de uma', () => {
    for (let quantas = 2; quantas <= frutos.length; quantas += 1) {
      expect(frutosQueCaem(frutos.slice(0, quantas)).size).toBeLessThan(quantas);
    }
  });
});

describe('quedaDoFruto', () => {
  it('cai até o chão, para um lado ou para o outro', () => {
    expect(quedaDoFruto({ id: 1, x: 150, y: 120 }, 0, 266)).toEqual({ queda: 146, desvio: -6 });
    expect(quedaDoFruto({ id: 2, x: 180, y: 140 }, 1, 266).desvio).toBeGreaterThan(0);
  });
});
