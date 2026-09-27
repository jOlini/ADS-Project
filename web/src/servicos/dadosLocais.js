// Leitura e limpeza do armazenamento do navegador. A decisão do que apagar
// fica em regras/dadosLocais.js (testada sem navegador).
import { chavesParaApagar } from '../regras/dadosLocais';

function chavesDe(armazenamento) {
  const chaves = [];
  for (let indice = 0; indice < armazenamento.length; indice += 1) {
    chaves.push(armazenamento.key(indice));
  }
  return chaves;
}

function apagar(armazenamento, opcoes) {
  if (!armazenamento) {
    return;
  }
  // As chaves são lidas antes de apagar: remover no meio do laço muda os índices.
  for (const chave of chavesParaApagar(chavesDe(armazenamento), opcoes)) {
    armazenamento.removeItem(chave);
  }
}

// Logout: tira do navegador tudo o que o app guardou sobre a conta (metas,
// tentativas de login, sessão da aba). Um navegador que recusa o acesso ao
// armazenamento (modo restrito) não impede a saída.
export function limparDadosLocais() {
  for (const [armazenamento, opcoes] of [
    [globalThis.localStorage, {}],
    [globalThis.sessionStorage, { sessao: true }],
  ]) {
    try {
      apagar(armazenamento, opcoes);
    } catch {
      // Sem acesso ao armazenamento: não há o que apagar.
    }
  }
}

export function lerJson(chave) {
  try {
    const texto = globalThis.localStorage?.getItem(chave);
    return texto ? JSON.parse(texto) : null;
  } catch {
    return null;
  }
}

export function gravarJson(chave, valor) {
  try {
    globalThis.localStorage?.setItem(chave, JSON.stringify(valor));
  } catch {
    // Sem espaço ou bloqueado: a contagem vale só enquanto a página estiver aberta.
  }
}

export function apagarChave(chave) {
  try {
    globalThis.localStorage?.removeItem(chave);
  } catch {
    // Idem.
  }
}
