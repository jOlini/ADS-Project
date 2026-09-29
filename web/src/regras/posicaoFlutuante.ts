// Posição do que flutua preso a um campo (lista do Seletor, calendário, menu),
// sem interface: recebe a caixa da âncora, o tamanho natural do painel e a
// janela, e devolve o estilo (position: fixed). Usado por
// componentes/flutuante.js e testado em posicaoFlutuante.test.ts.

// Em px: distância mínima da borda da janela, folga entre a âncora e o
// painel e a menor altura aceitável antes de o painel rolar por dentro.
export const MARGEM = 8;
export const AFASTAMENTO = 4;
export const ALTURA_MINIMA = 120;

export interface CaixaDaAncora {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
}

export interface Janela {
  largura: number;
  altura: number;
}

export interface OpcoesDaPosicao {
  // 'inicio': borda esquerda com a da âncora; 'fim': borda direita.
  alinhar?: 'inicio' | 'fim';
  // O painel tem pelo menos a largura da âncora (a lista de um seletor).
  larguraDaAncora?: boolean;
}

export interface Posicao {
  paraCima: boolean;
  top: number | 'auto';
  bottom: number | 'auto';
  left: number;
  minWidth?: number;
  // Teto de altura para o CSS (--espaco-disponivel), com rolagem por dentro.
  espacoDisponivel: number;
}

// Abaixo da âncora, ou acima quando falta espaço embaixo e sobra em cima.
//
// Acima, o painel fica preso pela borda de BAIXO (bottom), encostado no topo
// do campo. Preso pelo topo, a conta precisaria da altura que o painel vai
// ter de verdade, e ela não é a natural: a lista dos 31 dias tem 1.300 px, mas
// o CSS a corta em 18 rem. Com a altura natural na conta, a lista do modal do
// cartão abria colada no alto da janela, longe do campo.
export function posicaoDoPainel(
  ancora: CaixaDaAncora,
  painel: { largura: number; altura: number },
  janela: Janela,
  { alinhar = 'inicio', larguraDaAncora = false }: OpcoesDaPosicao = {},
): Posicao {
  const embaixo = janela.altura - ancora.bottom - MARGEM - AFASTAMENTO;
  const emCima = ancora.top - MARGEM - AFASTAMENTO;
  const paraCima = painel.altura > embaixo && emCima > embaixo;
  const largura = Math.max(painel.largura, larguraDaAncora ? ancora.width : 0);
  const esquerda = alinhar === 'fim' ? ancora.right - largura : ancora.left;
  return {
    paraCima,
    top: paraCima ? 'auto' : ancora.bottom + AFASTAMENTO,
    bottom: paraCima ? janela.altura - ancora.top + AFASTAMENTO : 'auto',
    left: Math.min(Math.max(MARGEM, esquerda), janela.largura - largura - MARGEM),
    minWidth: larguraDaAncora ? ancora.width : undefined,
    espacoDisponivel: Math.max(paraCima ? emCima : embaixo, ALTURA_MINIMA),
  };
}
