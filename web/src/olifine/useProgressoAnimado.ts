import { useEffect, useRef, useState } from 'react';
import { avancarMola, emRepouso, type Mola } from './regras/crescimento';

// Na primeira rega, a água cai antes de a árvore crescer (ms). Com a árvore
// já crescendo, a rega seguinte muda só o alvo, sem nova espera.
export const ESPERA_DA_AGUA = 450;

function preferePoucoMovimento(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

// Progresso mostrado na tela, que anda até o valor novo numa mola
// (regras/crescimento.ts). Um laço só de requestAnimationFrame fica vivo
// enquanto a mola se move: cliques seguidos em "Regar" só mudam o alvo, e a
// árvore e a barra seguem crescendo sem travar e sem pular no fim. Sem
// animação quando o sistema pede menos movimento, ou com animar = false.
export function useProgressoAnimado(alvo: number, { rega = 0, animar = true }: { rega?: number; animar?: boolean } = {}): number {
  const [mostrado, setMostrado] = useState(alvo);
  const estado = useRef({ mola: { posicao: alvo, velocidade: 0 } as Mola, alvo, quadro: 0, ultimo: 0, esperaAte: 0, rega });
  const semAnimacao = !animar || preferePoucoMovimento();
  // Sem animação, o mostrado é o próprio alvo (ajustado na renderização, como
  // o React indica para estado derivado de uma prop).
  if (semAnimacao && mostrado !== alvo) {
    setMostrado(alvo);
  }

  useEffect(() => {
    const atual = estado.current;
    atual.alvo = alvo;
    const regou = rega !== atual.rega;
    atual.rega = rega;
    if (semAnimacao) {
      cancelAnimationFrame(atual.quadro);
      atual.quadro = 0;
      atual.mola = { posicao: alvo, velocidade: 0 };
      return;
    }
    if (atual.quadro !== 0 || emRepouso(atual.mola, alvo)) {
      return;
    }
    atual.esperaAte = regou ? performance.now() + ESPERA_DA_AGUA : 0;
    atual.ultimo = 0;
    const passo = (agora: number) => {
      if (agora < atual.esperaAte) {
        atual.quadro = requestAnimationFrame(passo);
        return;
      }
      const segundos = atual.ultimo ? Math.min(0.1, (agora - atual.ultimo) / 1000) : 0;
      atual.ultimo = agora;
      atual.mola = avancarMola(atual.mola, atual.alvo, segundos);
      if (emRepouso(atual.mola, atual.alvo)) {
        atual.mola = { posicao: atual.alvo, velocidade: 0 };
        atual.quadro = 0;
        setMostrado(atual.alvo);
        return;
      }
      setMostrado(atual.mola.posicao);
      atual.quadro = requestAnimationFrame(passo);
    };
    atual.quadro = requestAnimationFrame(passo);
  }, [alvo, rega, semAnimacao]);

  // Saiu da tela no meio do crescimento: para o laço.
  useEffect(() => {
    const atual = estado.current;
    return () => {
      cancelAnimationFrame(atual.quadro);
      atual.quadro = 0;
    };
  }, []);

  return mostrado;
}
