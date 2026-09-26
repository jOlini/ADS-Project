import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Peças comuns do que flutua preso a um botão: a lista do Seletor, o
// calendário e o menu de ações.

// Em px: distância mínima da borda da janela, folga entre a âncora e o
// painel e a menor altura aceitável antes de o painel rolar por dentro.
const MARGEM = 8;
const AFASTAMENTO = 4;
const ALTURA_MINIMA = 120;

// Enquanto a posição não foi medida, o painel existe (para ter tamanho) mas
// não aparece. Opacidade, e não visibility: um elemento invisível não recebe
// foco, e o calendário e o menu põem o foco dentro deles ao abrir. O passo
// acima e os 98% são o ponto de partida da animação de chegada
// (estilos/movimento.css): medido, o painel desce até o lugar dele.
export const ESCONDIDO = { top: 0, left: 0, opacity: 0, pointerEvents: 'none', transform: 'translateY(-4px) scale(0.98)' };

// Saída: o painel fica onde estava e some voltando para o botão, mais
// depressa do que chegou. Em ms, o mesmo --tempo dos tokens.
export const TEMPO_DE_SAIDA = 160;
const SAINDO = {
  opacity: 0,
  pointerEvents: 'none',
  transform: 'translateY(-4px) scale(0.98)',
  transitionDuration: `${TEMPO_DE_SAIDA}ms`,
  transitionTimingFunction: 'cubic-bezier(0.4, 0, 1, 1)',
};

// Mantém o painel na tela durante a animação de saída: presente liga com a
// abertura e só desliga TEMPO_DE_SAIDA depois de fechar.
export function usePresenca(aberto) {
  const [presente, setPresente] = useState(aberto);
  if (aberto && !presente) {
    setPresente(true);
  }
  useEffect(() => {
    if (aberto || !presente) {
      return undefined;
    }
    const espera = setTimeout(() => setPresente(false), TEMPO_DE_SAIDA);
    return () => clearTimeout(espera);
  }, [aberto, presente]);
  return presente;
}

// Rola só o painel para mostrar o item, sem mexer na página: rolar a página
// fecharia o próprio painel (aoRolarFora).
export function mostrarNoPainel(painel, item) {
  if (!painel || !item) {
    return;
  }
  if (item.offsetTop < painel.scrollTop) {
    painel.scrollTop = item.offsetTop;
  } else if (item.offsetTop + item.offsetHeight > painel.scrollTop + painel.clientHeight) {
    painel.scrollTop = item.offsetTop + item.offsetHeight - painel.clientHeight;
  }
}

// Guarda o valor mais recente sem reiniciar os efeitos que o usam: as funções
// passadas pelos componentes mudam a cada renderização.
function useMaisRecente(valor) {
  const referencia = useRef(valor);
  useLayoutEffect(() => {
    referencia.current = valor;
  });
  return referencia;
}

// Posição (position: fixed) de um painel preso à âncora: abaixo dela, ou
// acima quando falta espaço embaixo. Fixed escapa da rolagem do extrato e do
// corpo dos modais, que cortariam um painel absoluto. Rolar a página fora do
// painel chama aoRolarFora (os componentes fecham o painel em vez de deixá-lo
// solto longe da âncora). alinhar: 'inicio' (borda esquerda com a da âncora)
// ou 'fim' (borda direita); larguraDaAncora: o painel tem pelo menos a
// largura da âncora, como a lista de um seletor.
export function usePosicaoFlutuante(ancora, painel, aberto, { alinhar = 'inicio', larguraDaAncora = false, aoRolarFora } = {}) {
  const [estilo, setEstilo] = useState(null);
  const rolarFora = useMaisRecente(aoRolarFora);

  useLayoutEffect(() => {
    if (!aberto) {
      return undefined;
    }
    function medir() {
      const caixa = ancora.current?.getBoundingClientRect();
      const elemento = painel.current;
      if (!caixa || !elemento) {
        return;
      }
      const largura = Math.max(elemento.offsetWidth, larguraDaAncora ? caixa.width : 0);
      const altura = elemento.scrollHeight;
      const embaixo = window.innerHeight - caixa.bottom - MARGEM - AFASTAMENTO;
      const emCima = caixa.top - MARGEM - AFASTAMENTO;
      const paraCima = altura > embaixo && emCima > embaixo;
      const esquerda = alinhar === 'fim' ? caixa.right - largura : caixa.left;
      // O CSS usa --espaco-disponivel como teto de altura (com rolagem dentro).
      setEstilo({
        top: paraCima ? Math.max(MARGEM, caixa.top - AFASTAMENTO - Math.min(altura, emCima)) : caixa.bottom + AFASTAMENTO,
        left: Math.min(Math.max(MARGEM, esquerda), window.innerWidth - largura - MARGEM),
        minWidth: larguraDaAncora ? caixa.width : undefined,
        '--espaco-disponivel': `${Math.max(paraCima ? emCima : embaixo, ALTURA_MINIMA)}px`,
      });
    }
    function rolou(evento) {
      if (painel.current?.contains(evento.target)) {
        return;
      }
      if (rolarFora.current) {
        rolarFora.current();
      } else {
        medir();
      }
    }
    medir();
    window.addEventListener('scroll', rolou, true);
    window.addEventListener('resize', medir);
    return () => {
      window.removeEventListener('scroll', rolou, true);
      window.removeEventListener('resize', medir);
      // Fechou: fica na última posição, a caminho de sumir.
      setEstilo((atual) => (atual ? { ...atual, ...SAINDO } : null));
    };
  }, [aberto, ancora, painel, alinhar, larguraDaAncora, rolarFora]);

  return estilo ?? ESCONDIDO;
}

// Fecha o painel quando a pessoa clica ou toca fora dele e da âncora.
export function useCliqueFora(elementos, aoFechar, ativo) {
  const atual = useMaisRecente({ elementos, aoFechar });

  useEffect(() => {
    if (!ativo) {
      return undefined;
    }
    function apertou(evento) {
      const { elementos: dentro, aoFechar: fechar } = atual.current;
      if (!dentro.some((elemento) => elemento.current?.contains(evento.target))) {
        fechar();
      }
    }
    document.addEventListener('pointerdown', apertou, true);
    return () => document.removeEventListener('pointerdown', apertou, true);
  }, [ativo, atual]);
}
