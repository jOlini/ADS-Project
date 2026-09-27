// Tema aplicado na página: atributo data-tema no <html> (os tokens de cor de
// estilos/tokens.css trocam por ele), cor da barra do celular e a escolha
// salva no navegador. A regra fica em regras/tema.js.
import { CHAVE_DO_TEMA } from '../regras/dadosLocais';
import { COR_DA_BARRA, outroTema, temaInicial, temaValido } from '../regras/tema';

// Enquanto dura, a troca de cor anima (estilos/movimento.css).
const DURACAO_DA_TROCA = 400;

const ouvintes = new Set();
let fimDaTroca = 0;

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

function aplicar(tema, { animar = false } = {}) {
  const raiz = document.documentElement;
  if (animar && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    raiz.classList.add('trocando-tema');
    clearTimeout(fimDaTroca);
    fimDaTroca = setTimeout(() => raiz.classList.remove('trocando-tema'), DURACAO_DA_TROCA);
  }
  raiz.dataset.tema = tema;
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.content = COR_DA_BARRA[tema];
  }
  for (const ouvinte of ouvintes) {
    ouvinte();
  }
}

export function alternarTema() {
  const novo = outroTema(temaAtual());
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
