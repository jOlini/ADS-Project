// Barra lateral recolhida (só os ícones) ou aberta, guardada no navegador. É
// preferência de tela, como o tema: fica depois do logout (regras/dadosLocais.js)
// e não diz nada sobre a conta. Testado em lateral.test.ts.

import { CHAVE_DA_LATERAL } from '../regras/dadosLocais';

type Armazenamento = Pick<Storage, 'getItem' | 'setItem'>;

const RECOLHIDA = 'recolhida';

// Sem escolha salva ou sem acesso ao armazenamento: aberta, com os nomes.
export function lerLateralRecolhida(armazenamento: Armazenamento | undefined = globalThis.localStorage): boolean {
  try {
    return armazenamento?.getItem(CHAVE_DA_LATERAL) === RECOLHIDA;
  } catch {
    return false;
  }
}

export function guardarLateralRecolhida(
  recolhida: boolean,
  armazenamento: Armazenamento | undefined = globalThis.localStorage,
): void {
  try {
    armazenamento?.setItem(CHAVE_DA_LATERAL, recolhida ? RECOLHIDA : 'aberta');
  } catch {
    // Sem onde guardar: a escolha vale até a página fechar.
  }
}
