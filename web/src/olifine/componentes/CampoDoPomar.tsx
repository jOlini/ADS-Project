import { useEffect, useRef, type RefObject } from 'react';
import {
  aproximar,
  balancoOcioso,
  caixaNaTela,
  enquadramento,
  gerarPomar,
  matrizDaCena,
  pontoNoChao,
  quantidadeDeFolhas,
  type Ponteiro,
} from '../regras/pomar';
import type { CenaDoPomar, Gota } from './cenaDoPomar';

// Quem pede menos movimento vê o campo parado neste instante.
const TEMPO_PARADO = 8;
// Onde o toque não vira rega: links, botões e o celular com os números.
const SEM_REGA = 'a, button, input, label, select, textarea, .lp-palco';
// Quadros medidos antes de decidir se a máquina aguenta o campo cheio.
const QUADROS_DE_MEDIDA = 90;
// Acima disso por quadro (ms, mediana), o campo fica mais ralo e mais leve.
const QUADRO_LENTO = 22;

interface Props {
  // O topo inteiro: é onde o ponteiro conta e onde vão as variáveis de CSS
  // da inclinação (--pomar-x e --pomar-y, de -1 a 1) que o celular usa.
  palco: RefObject<HTMLElement | null>;
  // O bloco do título: as folhas por trás dele ficam mais apagadas.
  texto: RefObject<HTMLElement | null>;
}

function poucoMovimento(): MediaQueryList | null {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)') ?? null;
}

// O campo 3D do topo da landing (a cena em cenaDoPomar.ts) e a inclinação do
// celular. Um laço só de requestAnimationFrame cuida dos dois, e só roda com
// o topo na tela e a aba à vista. Sem WebGL, a inclinação continua e o topo
// fica com os contornos em SVG; pedindo menos movimento, o campo é desenhado
// uma vez e nada se mexe.
export default function CampoDoPomar({ palco, texto }: Props) {
  const tela = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!tela.current || !palco.current) {
      return undefined;
    }
    // Com tipo explícito: as funções abaixo enxergam os dois já conferidos.
    const canvas: HTMLCanvasElement = tela.current;
    const topo: HTMLElement = palco.current;
    let desmontado = false;
    let cena: CenaDoPomar | null = null;
    let pomar = gerarPomar(0);
    let folhas = 0;
    let densidade = Math.min(globalThis.devicePixelRatio || 1, 1.75);
    let mascara: [number, number, number, number] = [2, 2, 2, 2];
    let intensidade = 1;
    let quadro = 0;
    let anterior = 0;
    let tempo = 0;
    let visivel = true;
    const medidas: number[] = [];
    const ponteiro: Ponteiro = { x: 0, y: 0 };
    const alvo: Ponteiro = { x: 0, y: 0 };
    let mouseNoTopo = false;
    let forca = 0;
    // Último ponto do chão sob o mouse: ao sair do topo, a elevação some
    // devagar ali mesmo, em vez de sumir de uma vez.
    let toque: [number, number] = [0, -99];
    const gotas: Gota[] = [];
    const media = poucoMovimento();

    const aspecto = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const rolagem = () => Math.min(1, Math.max(0, -topo.getBoundingClientRect().top / Math.max(1, topo.offsetHeight)));

    function medir() {
      const largura = topo.clientWidth;
      const altura = topo.clientHeight;
      cena?.redimensionar(largura, altura, densidade);
      const bloco = texto.current?.getBoundingClientRect();
      mascara = bloco ? caixaNaTela(bloco, canvas.getBoundingClientRect()) : [2, 2, 2, 2];
    }

    function lerTema() {
      intensidade = document.documentElement.dataset.tema === 'escuro' ? 0.82 : 1;
    }

    function pintar() {
      if (!cena) {
        return;
      }
      const quadroDaCamera = enquadramento(ponteiro, rolagem());
      const chao = mouseNoTopo ? pontoNoChao(alvo, quadroDaCamera, aspecto()) : null;
      if (chao) {
        toque = chao;
      }
      cena.desenhar({
        tempo,
        matriz: matrizDaCena(quadroDaCamera, aspecto()),
        ponteiro: [toque[0], toque[1], forca],
        gotas,
        mascara,
        intensidade,
        folhas,
      });
    }

    // Inclinação do celular e dos números em volta, pelas variáveis de CSS.
    function inclinar(x: number, y: number) {
      topo.style.setProperty('--pomar-x', x.toFixed(4));
      topo.style.setProperty('--pomar-y', y.toFixed(4));
    }

    function passo(agora: number) {
      const segundos = anterior ? (agora - anterior) / 1000 : 0;
      anterior = agora;
      tempo += Math.min(0.1, segundos);

      const destino = mouseNoTopo ? alvo : balancoOcioso(tempo);
      ponteiro.x = aproximar(ponteiro.x, destino.x, segundos, mouseNoTopo ? 0.14 : 0.5);
      ponteiro.y = aproximar(ponteiro.y, destino.y, segundos, mouseNoTopo ? 0.14 : 0.5);
      forca = aproximar(forca, mouseNoTopo ? 1 : 0, segundos, 0.2);
      inclinar(ponteiro.x, ponteiro.y);
      pintar();

      // Máquina lenta: menos folhas e menos pixels, uma vez só.
      if (cena && medidas.length < QUADROS_DE_MEDIDA && segundos > 0) {
        medidas.push(segundos * 1000);
        if (medidas.length === QUADROS_DE_MEDIDA) {
          const mediana = [...medidas].sort((a, b) => a - b)[Math.floor(QUADROS_DE_MEDIDA / 2)] ?? 0;
          if (mediana > QUADRO_LENTO) {
            folhas = Math.round(folhas * 0.55);
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
      const rodar = visivel && !document.hidden && !media?.matches && !desmontado;
      if (rodar && quadro === 0) {
        quadro = requestAnimationFrame(passo);
      } else if (!rodar && quadro !== 0) {
        parar();
      }
      if (media?.matches) {
        // Parado: a pose de repouso do celular e o campo num instante fixo.
        tempo = TEMPO_PARADO;
        ponteiro.x = 0;
        ponteiro.y = 0;
        forca = 0;
        gotas.length = 0;
        inclinar(0, 0);
        pintar();
      }
    }

    const aoMover = (evento: PointerEvent) => {
      if (evento.pointerType === 'touch') {
        return;
      }
      const caixa = topo.getBoundingClientRect();
      alvo.x = ((evento.clientX - caixa.left) / caixa.width) * 2 - 1;
      alvo.y = 1 - ((evento.clientY - caixa.top) / caixa.height) * 2;
      mouseNoTopo = true;
    };
    const aoSair = () => {
      mouseNoTopo = false;
    };
    // Tocar no campo rega: abre um anel onde o dedo (ou o clique) caiu.
    const aoTocar = (evento: PointerEvent) => {
      if (!cena || media?.matches || (evento.target as Element | null)?.closest?.(SEM_REGA)) {
        return;
      }
      const caixa = canvas.getBoundingClientRect();
      const local = {
        x: ((evento.clientX - caixa.left) / caixa.width) * 2 - 1,
        y: 1 - ((evento.clientY - caixa.top) / caixa.height) * 2,
      };
      const chao = pontoNoChao(local, enquadramento(ponteiro, rolagem()), aspecto());
      if (chao) {
        gotas.unshift({ x: chao[0], z: chao[1], inicio: tempo, forca: 1 });
        gotas.length = Math.min(gotas.length, 3);
      }
    };
    const aoMudarVisibilidade = () => atualizarLaco();
    const observadorDeTela = new IntersectionObserver(([entrada]) => {
      visivel = entrada?.isIntersecting ?? true;
      atualizarLaco();
    });
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
    // Contexto perdido (placa de vídeo reiniciada, economia de energia): volta
    // aos contornos em SVG e segue só com a inclinação.
    const aoPerderContexto = (evento: Event) => {
      evento.preventDefault();
      cena = null;
      delete topo.dataset.pomar;
    };

    lerTema();
    topo.addEventListener('pointermove', aoMover);
    topo.addEventListener('pointerleave', aoSair);
    topo.addEventListener('pointerdown', aoTocar);
    canvas.addEventListener('webglcontextlost', aoPerderContexto);
    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    media?.addEventListener('change', atualizarLaco);
    observadorDeTela.observe(topo);
    observadorDeTamanho.observe(topo);
    observadorDeTema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] });

    // A cena só é carregada depois do primeiro quadro pintado: o título, os
    // botões e o celular aparecem antes, e o campo chega por baixo deles.
    const espera = requestAnimationFrame(() => {
      import('./cenaDoPomar')
        .then(({ criarCenaDoPomar }) => {
          if (desmontado) {
            return;
          }
          const memoria = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
          folhas = quantidadeDeFolhas(topo.clientWidth, topo.clientHeight, memoria);
          pomar = gerarPomar(folhas);
          cena = criarCenaDoPomar(canvas, pomar);
          if (cena) {
            medir();
            topo.dataset.pomar = 'vivo';
          }
          atualizarLaco();
        })
        .catch(() => atualizarLaco());
    });

    return () => {
      desmontado = true;
      cancelAnimationFrame(espera);
      parar();
      topo.removeEventListener('pointermove', aoMover);
      topo.removeEventListener('pointerleave', aoSair);
      topo.removeEventListener('pointerdown', aoTocar);
      canvas.removeEventListener('webglcontextlost', aoPerderContexto);
      document.removeEventListener('visibilitychange', aoMudarVisibilidade);
      media?.removeEventListener('change', atualizarLaco);
      observadorDeTela.disconnect();
      observadorDeTamanho.disconnect();
      observadorDeTema.disconnect();
      cena?.destruir();
      delete topo.dataset.pomar;
      topo.style.removeProperty('--pomar-x');
      topo.style.removeProperty('--pomar-y');
    };
  }, [palco, texto]);

  return <canvas ref={tela} className="lp-pomar" aria-hidden="true" />;
}
