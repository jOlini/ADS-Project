// Último espaço escolhido, por conta, no navegador: ao voltar, o app abre no
// mesmo livro-caixa. A chave começa com "olifine:" e sai no logout como as
// outras do app (regras/dadosLocais.js); o que fica guardado é só o id.

import { PREFIXO_DO_APP } from '../regras/dadosLocais';

type Armazenamento = Pick<Storage, 'getItem' | 'setItem'>;

export const chaveDoEspacoAtivo = (uid: string) => `${PREFIXO_DO_APP}espaco:${uid}`;

// Navegador que recusa o armazenamento (modo privado, bloqueado): o app abre
// no pessoal, e a troca vale até a página fechar.
export function lerEspacoAtivo(uid: string, armazenamento: Armazenamento | undefined = globalThis.localStorage): string | null {
  try {
    return armazenamento?.getItem(chaveDoEspacoAtivo(uid)) ?? null;
  } catch {
    return null;
  }
}

export function guardarEspacoAtivo(uid: string, id: string, armazenamento: Armazenamento | undefined = globalThis.localStorage): void {
  try {
    armazenamento?.setItem(chaveDoEspacoAtivo(uid), id);
  } catch {
    // Sem onde guardar: a escolha vale só nesta página.
  }
}
