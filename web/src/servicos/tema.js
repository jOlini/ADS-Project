// Tema aplicado na página: atributo data-tema no <html> (os tokens de cor de
// estilos/tokens.css trocam por ele), cor da barra do celular e a escolha
// salva no navegador. A regra fica em regras/tema.js.
import { CHAVE_DO_TEMA } from '../regras/dadosLocais';
import { COR_DA_BARRA, outroTema, temaInicial, temaValido } from '../regras/tema';

const ouvintes = new Set();
// O tema pedido por último. Com animação, o atributo só muda no quadro
// seguinte (dentro da View Transition): dois cliques rápidos leem daqui, e não
// do <html>, para não pedirem o mesmo tema duas vezes.
let temaPedido = null;

const sistemaEscuro = () => globalThis.matchMedia?.('(prefers-color-scheme: dark)');

function lerEscolha() {
  try {
    return globalThis.localStorage?.getItem(CHAVE_DO_TEMA) ?? null;
  } catch {
    return null;
  }
}

export function temaAtual() {
  const aplicado = document.documentElement.dataset.tema;
  return temaValido(aplicado) ? aplicado : temaInicial(lerEscolha(), sistemaEscuro()?.matches ?? false);
}

// Troca o atributo, a cor da barra e avisa quem acompanha (o botão). Uma
// escrita só no <html>: os tokens de cor mudam todos num recálculo de estilo.
function trocar(tema) {
  document.documentElement.dataset.tema = tema;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.content = COR_DA_BARRA[tema];
  }
  for (const ouvinte of ouvintes) {
    ouvinte();
  }
}

// Com animação, a troca vai dentro de uma View Transition: o navegador cruza
// a foto de antes com a de depois no compositor (estilos/movimento.css), sem
// transição de cor em cada elemento. Uma troca nova no meio da anterior pula
// para o fim dela; não precisa de debounce.
function aplicar(tema, { animar = false } = {}) {
  temaPedido = tema;
  const podeAnimar =
    animar &&
    typeof document.startViewTransition === 'function' &&
    !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (podeAnimar) {
    document.startViewTransition(() => trocar(tema));
  } else {
    trocar(tema);
  }
}

export function alternarTema() {
  const novo = outroTema(temaPedido ?? temaAtual());
  try {
    globalThis.localStorage?.setItem(CHAVE_DO_TEMA, novo);
  } catch {
    // Sem armazenamento: o tema troca, mas não fica para a próxima visita.
  }
  aplicar(novo, { animar: true });
}

// Chamada uma vez, antes do primeiro render (main.jsx).
export function iniciarTema() {
  aplicar(temaAtual());
  // Sem escolha salva, acompanha o sistema quando ele troca (ex.: modo
  // escuro automático à noite). Com escolha, a escolha manda.
  sistemaEscuro()?.addEventListener('change', (evento) => {
    if (!temaValido(lerEscolha())) {
      aplicar(evento.matches ? 'escuro' : 'claro', { animar: true });
    }
  });
}

export function assinarTema(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}
