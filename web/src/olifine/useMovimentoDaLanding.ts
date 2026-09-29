import { useEffect, type RefObject } from 'react';

// Parte do elemento que precisa estar na tela para ele aparecer, e o quanto
// antes do pé da tela isso conta (a entrada acontece à vista, não escondida
// atrás da barra do navegador).
const LIMIAR = 0.12;
const MARGEM = '0px 0px -8% 0px';

function combina(consulta: string): boolean {
  return globalThis.matchMedia?.(consulta).matches ?? false;
}

// Movimento da landing fora do topo, sem biblioteca:
//
// - Revelação ao rolar: cada elemento com data-revela entra (sobe, gira de
//   leve em 3D e acende) quando chega à tela, uma vez só. O estado escondido
//   só existe com a raiz marcada (data-revelacao="ativa"), que este hook põe:
//   sem JavaScript, sem IntersectionObserver ou pedindo menos movimento, tudo
//   já aparece no lugar. O --ordem de cada elemento escalona a entrada.
// - Inclinação: o cartão com data-inclina gira em 3D na direção do mouse, com
//   um brilho que segue o ponteiro (--inclina-x, --inclina-y, --brilho-x e
//   --brilho-y). Só com mouse de verdade (hover e ponteiro fino); no toque, o
//   cartão fica parado. Um quadro de animação por movimento, no máximo.
//
// Os estilos estão em estilos/landing.css (Movimento ao rolar).
export function useMovimentoDaLanding(raiz: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const elemento = raiz.current;
    if (!elemento || combina('(prefers-reduced-motion: reduce)') || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) {
            entrada.target.setAttribute('data-revelado', '');
            observador.unobserve(entrada.target);
          }
        }
      },
      { threshold: LIMIAR, rootMargin: MARGEM },
    );
    elemento.querySelectorAll('[data-revela]').forEach((alvo) => observador.observe(alvo));
    elemento.setAttribute('data-revelacao', 'ativa');
    return () => {
      observador.disconnect();
      elemento.removeAttribute('data-revelacao');
    };
  }, [raiz]);

  useEffect(() => {
    const elemento = raiz.current;
    if (!elemento || combina('(prefers-reduced-motion: reduce)') || !combina('(hover: hover) and (pointer: fine)')) {
      return undefined;
    }
    let cartao: HTMLElement | null = null;
    let quadro = 0;
    let x = 0;
    let y = 0;

    function soltar() {
      if (cartao) {
        for (const variavel of ['--inclina-x', '--inclina-y', '--brilho-x', '--brilho-y']) {
          cartao.style.removeProperty(variavel);
        }
      }
      cartao = null;
    }

    function aplicar() {
      quadro = 0;
      if (!cartao) {
        return;
      }
      const caixa = cartao.getBoundingClientRect();
      const px = Math.min(1, Math.max(0, (x - caixa.left) / Math.max(1, caixa.width)));
      const py = Math.min(1, Math.max(0, (y - caixa.top) / Math.max(1, caixa.height)));
      cartao.style.setProperty('--inclina-x', (px * 2 - 1).toFixed(3));
      cartao.style.setProperty('--inclina-y', (py * 2 - 1).toFixed(3));
      cartao.style.setProperty('--brilho-x', `${(px * 100).toFixed(1)}%`);
      cartao.style.setProperty('--brilho-y', `${(py * 100).toFixed(1)}%`);
    }

    const aoMover = (evento: PointerEvent) => {
      if (evento.pointerType !== 'mouse') {
        return;
      }
      const sob = (evento.target as Element | null)?.closest?.<HTMLElement>('[data-inclina]') ?? null;
      if (sob !== cartao) {
        soltar();
        cartao = sob;
      }
      x = evento.clientX;
      y = evento.clientY;
      if (cartao && quadro === 0) {
        quadro = requestAnimationFrame(aplicar);
      }
    };

    elemento.addEventListener('pointermove', aoMover, { passive: true });
    elemento.addEventListener('pointerleave', soltar);
    return () => {
      cancelAnimationFrame(quadro);
      soltar();
      elemento.removeEventListener('pointermove', aoMover);
      elemento.removeEventListener('pointerleave', soltar);
    };
  }, [raiz]);
}
