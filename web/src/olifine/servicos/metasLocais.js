// Metas guardadas no navegador, uma lista por conta (uid do Firebase), até a
// API de metas da release 0.5. Não sincroniza entre aparelhos: a tela avisa.
// Trocar por chamadas à API muda só este arquivo.

const prefixo = 'olifine:metas:';

export const chaveDasMetas = (uid) => `${prefixo}${uid ?? 'sem-sessao'}`;

// Confere o formato do que veio do navegador: dado estragado ou de outra
// versão vira lista vazia, em vez de derrubar a tela.
function metaValida(meta) {
  return (
    meta &&
    typeof meta.id === 'string' &&
    typeof meta.nome === 'string' &&
    Number.isInteger(meta.alvo) &&
    Array.isArray(meta.aportes) &&
    meta.aportes.every((aporte) => Number.isInteger(aporte.valor) && typeof aporte.data === 'string')
  );
}

export function lerMetas(uid) {
  try {
    const texto = globalThis.localStorage?.getItem(chaveDasMetas(uid));
    const lista = texto ? JSON.parse(texto) : [];
    return Array.isArray(lista) ? lista.filter(metaValida) : [];
  } catch {
    return [];
  }
}

// Devolve false quando o navegador recusou gravar (sem espaço, bloqueado).
export function gravarMetas(uid, metas) {
  try {
    globalThis.localStorage?.setItem(chaveDasMetas(uid), JSON.stringify(metas));
    return true;
  } catch {
    return false;
  }
}

export function novoId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
