import { useEffect, useState, type RefObject } from 'react';
import { ABERTO, aberturaDaTampa, anguloDaTampa, progressoDaPista } from './regras/notebook';

// Sem trava: quem pede menos movimento e a tela baixa demais para o palco
// (celular deitado). A mesma consulta do landing.css, que ali solta o sticky.
const SEM_TRAVA = '(prefers-reduced-motion: reduce), (max-height: 540px)';

// O notebook da landing preso na rolagem (regras/notebook.ts): enquanto a
// pista passa pela tela, a rolagem abre a tampa. Escreve no elemento da pista
// --abertura (0 a 1) e --angulo-da-tampa, que o landing.css usa, e devolve se
// a tampa já está aberta (a tela do app só responde aberta). Só trabalha com a
// pista perto da tela, uma vez por quadro, e só escreve o que mudou.
export function useNotebookPreso(pista: RefObject<HTMLElement | null>): boolean {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const elemento = pista.current;
    if (!elemento) {
      return undefined;
    }
    const alvo: HTMLElement = elemento;
    const semTrava = globalThis.matchMedia?.(SEM_TRAVA) ?? null;
    let quadro = 0;
    let perto = false;
    let ultima = Number.NaN;

    function aplicar() {
      quadro = 0;
      const caixa = alvo.getBoundingClientRect();
      const abertura = semTrava?.matches ? 1 : aberturaDaTampa(progressoDaPista(caixa.top, caixa.height, globalThis.innerHeight));
      if (abertura === ultima) {
        return;
      }
      ultima = abertura;
      alvo.style.setProperty('--abertura', abertura.toFixed(4));
      alvo.style.setProperty('--angulo-da-tampa', `${anguloDaTampa(abertura).toFixed(2)}deg`);
      setAberto(abertura >= ABERTO);
    }

    function pedir() {
      if (perto && quadro === 0) {
        quadro = requestAnimationFrame(aplicar);
      }
    }

    // Longe da tela, a rolagem não custa nada; ao sair, um último cálculo
    // deixa a tampa na posição certa (fechada acima, aberta abaixo).
    const observador = new IntersectionObserver(
      ([entrada]) => {
        perto = entrada?.isIntersecting ?? false;
        if (quadro === 0) {
          quadro = requestAnimationFrame(aplicar);
        }
      },
      { rootMargin: '200px 0px' },
    );
    const aoMudarTrava = () => {
      ultima = Number.NaN;
      aplicar();
    };

    aplicar();
    observador.observe(alvo);
    globalThis.addEventListener('scroll', pedir, { passive: true });
    globalThis.addEventListener('resize', pedir);
    semTrava?.addEventListener('change', aoMudarTrava);
    return () => {
      cancelAnimationFrame(quadro);
      observador.disconnect();
      globalThis.removeEventListener('scroll', pedir);
      globalThis.removeEventListener('resize', pedir);
      semTrava?.removeEventListener('change', aoMudarTrava);
      alvo.style.removeProperty('--abertura');
      alvo.style.removeProperty('--angulo-da-tampa');
    };
  }, [pista]);

  return aberto;
}
