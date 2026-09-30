// Para onde leva o botão "← Voltar" de cada tela da área logada, sem
// interface. Testado em voltar.test.ts.
//
// O destino é a tela de cima na hierarquia, e não o histórico do navegador:
// quem chega por um link direto (um e-mail, um favorito) não sai do app ao
// voltar, e o botão leva sempre ao mesmo lugar.

export interface DestinoDoVoltar {
  para: string;
  // Nome da tela de destino, lido pelo leitor de tela ("Voltar para ...").
  rotulo: string;
}

const INICIO = '/principal';

// A tela do cartão volta à carteira; as outras, à Visão geral. Na própria
// Visão geral (o começo do app), não há botão.
export function destinoDoVoltar(caminho: string): DestinoDoVoltar | null {
  const limpo = caminho.replace(/\/+$/, '') || '/';
  if (limpo === INICIO || limpo === '/') {
    return null;
  }
  if (limpo.startsWith('/contas/cartoes/')) {
    return { para: '/contas#cartoes', rotulo: 'Contas & Cartões' };
  }
  return { para: INICIO, rotulo: 'Visão geral' };
}
