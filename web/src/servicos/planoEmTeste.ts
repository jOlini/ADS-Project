// Plano em teste do super admin (modo de teste dos planos da API,
// api/app/financeiro/simulacao.py). Fica na aba (sessionStorage): fechar a aba
// volta ao plano real, e o logout apaga a chave (prefixo olifine:,
// regras/dadosLocais.js). Cada pedido à API leva o plano no cabeçalho
// X-Simular-Plano (servicos/livroCaixa.js); para quem não é super admin, a
// API ignora o cabeçalho. Testado em planoEmTeste.test.ts.

import { PREFIXO_DO_APP } from '../regras/dadosLocais';
import type { Plano } from '../regras/planos';

export const CHAVE_DO_PLANO_EM_TESTE = `${PREFIXO_DO_APP}plano-em-teste`;
export const CABECALHO_DO_PLANO_EM_TESTE = 'X-Simular-Plano';

const PLANOS: readonly Plano[] = ['FREE', 'FAMILIA', 'EMPRESARIAL'];

type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const ehPlano = (valor: string | null): valor is Plano => PLANOS.includes(valor as Plano);

// null: sem simulação (o plano gravado vale). Valor estranho também é null.
export function lerPlanoEmTeste(armazenamento: Armazenamento | undefined = globalThis.sessionStorage): Plano | null {
  try {
    const valor = armazenamento?.getItem(CHAVE_DO_PLANO_EM_TESTE) ?? null;
    return ehPlano(valor) ? valor : null;
  } catch {
    return null;
  }
}

export function guardarPlanoEmTeste(plano: Plano | null, armazenamento: Armazenamento | undefined = globalThis.sessionStorage): void {
  try {
    if (plano) {
      armazenamento?.setItem(CHAVE_DO_PLANO_EM_TESTE, plano);
    } else {
      armazenamento?.removeItem(CHAVE_DO_PLANO_EM_TESTE);
    }
  } catch {
    // Sem onde guardar: o teste vale até a página recarregar.
  }
}

// O cabeçalho de cada pedido à API ({} sem simulação).
export function cabecalhoDoPlanoEmTeste(armazenamento?: Armazenamento): Record<string, string> {
  const plano = lerPlanoEmTeste(armazenamento ?? globalThis.sessionStorage);
  return plano ? { [CABECALHO_DO_PLANO_EM_TESTE]: plano } : {};
}
