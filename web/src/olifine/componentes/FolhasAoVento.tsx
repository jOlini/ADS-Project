import { useEffect, useRef, type RefObject } from 'react';
import { gerarFolhasAoVento, quantidadeNoAr } from '../regras/folhasAoVento';
import { aproximar } from '../regras/pomar';
import type { CenaDasFolhas } from './cenaDasFolhas';

// Pedindo menos movimento, o céu é desenhado uma vez, parado neste instante.
const TEMPO_PARADO = 6;
// Mais nítido que isso não aparece em folhas desfocadas: poupa a placa.
const DENSIDADE_MAXIMA = 1.5;
// Quadros medidos antes de decidir se a máquina aguenta (como no pomar).
const QUADROS_DE_MEDIDA = 90;
// Acima disso por quadro (ms, mediana), metade das folhas e densidade 1.
const QUADRO_LENTO = 22;

interface Props {
  // A parte da página em que as folhas aparecem (o <main>, abaixo do topo).
  // Fora dela o laço para; perto dela, a cena é carregada.
  area: RefObject<HTMLElement | null>;
}

type Tarefa = () => void;

// Agenda para quando o navegador estiver livre (ou logo depois, sem a API).
function quandoLivre(tarefa: Tarefa): () => void {
  if (typeof globalThis.requestIdleCallback === 'function') {
    const id = globalThis.requestIdleCallback(tarefa, { timeout: 1500 });
    return () => globalThis.cancelIdleCallback(id);
  }
  const id = setTimeout(tarefa, 200);
  return () => clearTimeout(id);
}

// As folhas ao vento: um canvas fixo atrás de toda a página abaixo do topo
// (landing.css, .lp-folhas), com a cena WebGL de cenaDasFolhas.ts. Nada é
// baixado nem desenhado até a pessoa rolar perto do conteúdo; o laço de
// quadros só roda com essa parte na tela e a aba à vista, e para de vez
// pedindo menos movimento. Sem WebGL, a página fica como antes.
export default function FolhasAoVento({ area }: Props) {
  const tela = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!tela.current || !area.current) {
      return undefined;
    }
    const canvas: HTMLCanvasElement = tela.current;
    const regiao: HTMLElement = area.current;
    let desmontado = false;
    let pedida = false;
    let cancelarEspera: (() => void) | null = null;
    let cena: CenaDasFolhas | null = null;
    let folhas = 0;
    let densidade = Math.min(globalThis.devicePixelRatio || 1, DENSIDADE_MAXIMA);
    let intensidade = 1;
    let quadro = 0;
    let anterior = 0;
    let tempo = 0;
    let visivel = false;
    const medidas: number[] = [];
    const ponteiro = { x: 0, y: 0 };
    const alvo = { x: 0, y: 0 };
    const poucoMovimento = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;

    function medir() {
      cena?.redimensionar(canvas.clientWidth, canvas.clientHeight, densidade);
    }

    function lerTema() {
      intensidade = document.documentElement.dataset.tema === 'escuro' ? 0.85 : 1;
    }

    function pintar() {
      cena?.desenhar({ tempo, rolagem: globalThis.scrollY, ponteiro: [ponteiro.x, ponteiro.y], intensidade, folhas });
    }

    function passo(agora: number) {
      const segundos = anterior ? (agora - anterior) / 1000 : 0;
      anterior = agora;
      tempo += Math.min(0.1, segundos);
      ponteiro.x = aproximar(ponteiro.x, alvo.x, segundos, 0.35);
      ponteiro.y = aproximar(ponteiro.y, alvo.y, segundos, 0.35);
      pintar();

      if (medidas.length < QUADROS_DE_MEDIDA && segundos > 0) {
        medidas.push(segundos * 1000);
        if (medidas.length === QUADROS_DE_MEDIDA) {
          const mediana = [...medidas].sort((a, b) => a - b)[Math.floor(QUADROS_DE_MEDIDA / 2)] ?? 0;
          if (mediana > QUADRO_LENTO) {
            folhas = Math.round(folhas * 0.5);
            densidade = 1;
            medir();
          }
        }
      }
      quadro = requestAnimationFrame(passo);
    }

    function parar() {
      cancelAnimationFrame(quadro);
      quadro = 0;
      anterior = 0;
    }

    function atualizarLaco() {
      const rodar = Boolean(cena) && visivel && !document.hidden && !poucoMovimento?.matches && !desmontado;
      if (rodar && quadro === 0) {
        quadro = requestAnimationFrame(passo);
      } else if (!rodar && quadro !== 0) {
        parar();
      }
      if (poucoMovimento?.matches && cena) {
        tempo = TEMPO_PARADO;
        ponteiro.x = 0;
        ponteiro.y = 0;
        pintar();
      }
    }

    function carregar() {
      import('./cenaDasFolhas')
        .then(({ criarCenaDasFolhas }) => {
          if (desmontado) {
            return;
          }
          const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
          folhas = quantidadeNoAr(globalThis.innerWidth, globalThis.innerHeight, memoria);
          cena = criarCenaDasFolhas(canvas, gerarFolhasAoVento(folhas));
          if (cena) {
            medir();
            canvas.dataset.vivo = '';
          }
          atualizarLaco();
        })
        .catch(() => undefined);
    }

    // Mouse na página inteira: as folhas escorregam de leve para o lado
    // oposto (paralaxe). No toque, ficam paradas no eixo.
    const aoMover = (evento: PointerEvent) => {
      if (evento.pointerType !== 'mouse') {
        return;
      }
      alvo.x = (evento.clientX / Math.max(1, globalThis.innerWidth)) * 2 - 1;
      alvo.y = (evento.clientY / Math.max(1, globalThis.innerHeight)) * 2 - 1;
    };
    const aoMudarVisibilidade = () => atualizarLaco();
    const observadorDaArea = new IntersectionObserver(
      ([entrada]) => {
        visivel = entrada?.isIntersecting ?? false;
        if (visivel && !pedida) {
          pedida = true;
          cancelarEspera = quandoLivre(carregar);
        }
        atualizarLaco();
      },
      // Carrega um pouco antes de a área entrar na tela.
      { rootMargin: '300px 0px' },
    );
    const observadorDeTamanho = new ResizeObserver(() => {
      medir();
      if (quadro === 0) {
        pintar();
      }
    });
    const observadorDeTema = new MutationObserver(() => {
      lerTema();
      if (quadro === 0) {
        pintar();
      }
    });
    const aoPerderContexto = (evento: Event) => {
      evento.preventDefault();
      parar();
      cena = null;
      delete canvas.dataset.vivo;
    };

    lerTema();
    globalThis.addEventListener('pointermove', aoMover, { passive: true });
    canvas.addEventListener('webglcontextlost', aoPerderContexto);
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    poucoMovimento?.addEventListener('change', atualizarLaco);
    observadorDaArea.observe(regiao);
    observadorDeTamanho.observe(canvas);
    observadorDeTema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });

    return () => {
      desmontado = true;
      cancelarEspera?.();
      parar();
      globalThis.removeEventListener('pointermove', aoMover);
      canvas.removeEventListener('webglcontextlost', aoPerderContexto);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      poucoMovimento?.removeEventListener('change', atualizarLaco);
      observadorDaArea.disconnect();
      observadorDeTamanho.disconnect();
      observadorDeTema.disconnect();
      cena?.destruir();
      delete canvas.dataset.vivo;
    };
  }, [area]);

  return <canvas ref={tela} className="lp-folhas" aria-hidden="true" />;
}
