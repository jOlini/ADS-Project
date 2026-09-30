// Último espaço escolhido e última empresa usada, por conta, no navegador: ao
// voltar, o app abre no mesmo livro-caixa, e trocar de Pessoal para
// Empresarial volta à empresa em que a pessoa estava. As chaves começam com
// "olifine:" e saem no logout como as outras do app (regras/dadosLocais.js);
// o que fica guardado é só o id.

import { PREFIXO_DO_APP } from '../regras/dadosLocais';

type Armazenamento = Pick<Storage, 'getItem' | 'setItem'>;

export const chaveDoEspacoAtivo = (uid: string) => `${PREFIXO_DO_APP}espaco:${uid}`;
export const chaveDaUltimaEmpresa = (uid: string) => `${PREFIXO_DO_APP}empresa:${uid}`;

// Navegador que recusa o armazenamento (modo privado, bloqueado): o app abre
// no pessoal, e a troca vale até a página fechar.
function ler(chave: string, armazenamento: Armazenamento | undefined): string | null {
  try {
    return armazenamento?.getItem(chave) ?? null;
  } catch {
    return null;
  }
}

function guardar(chave: string, valor: string, armazenamento: Armazenamento | undefined): void {
  try {
    armazenamento?.setItem(chave, valor);
  } catch {
    // Sem onde guardar: a escolha vale só nesta página.
  }
}

export function lerEspacoAtivo(uid: string, armazenamento: Armazenamento | undefined = globalThis.localStorage): string | null {
  return ler(chaveDoEspacoAtivo(uid), armazenamento);
}

export function guardarEspacoAtivo(uid: string, id: string, armazenamento: Armazenamento | undefined = globalThis.localStorage): void {
  guardar(chaveDoEspacoAtivo(uid), id, armazenamento);
}

export function lerUltimaEmpresa(uid: string, armazenamento: Armazenamento | undefined = globalThis.localStorage): string | null {
  return ler(chaveDaUltimaEmpresa(uid), armazenamento);
}

export function guardarUltimaEmpresa(uid: string, id: string, armazenamento: Armazenamento | undefined = globalThis.localStorage): void {
  guardar(chaveDaUltimaEmpresa(uid), id, armazenamento);
}
