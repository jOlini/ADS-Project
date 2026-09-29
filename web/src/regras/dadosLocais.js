// O que o app guarda no navegador e o que sai no logout.
//
// Chaves do app começam com "olifine:" (metas por conta, contagem de
// tentativas de login, último link de confirmação do e-mail, tema, barra
// lateral recolhida). Sair da conta apaga todas, menos as preferências de tela
// (tema e barra lateral), que não dizem nada sobre a pessoa. Num computador compartilhado, quem
// senta depois não encontra as metas nem os rastros de quem saiu.
//
// Só as chaves do app, e nunca um clear() geral: no GitHub Pages a origem
// (jolini.github.io) é a mesma de todos os outros sites do usuário, e o
// armazenamento do navegador é por origem.

export const PREFIXO_DO_APP = 'olifine:';
export const CHAVE_DO_TEMA = `${PREFIXO_DO_APP}tema`;
export const CHAVE_DA_LATERAL = `${PREFIXO_DO_APP}lateral`;

// Preferências que continuam depois do logout.
const PERMANENTES = new Set([CHAVE_DO_TEMA, CHAVE_DA_LATERAL]);

// Sessão do Firebase Authentication na aba (firebase.js usa sessionStorage).
// O signOut() já a apaga; esta é a rede de proteção para quando ele falhou
// sem internet.
const PREFIXO_DO_FIREBASE = 'firebase:';

export function chavesParaApagar(chaves, { sessao = false } = {}) {
  return chaves.filter(
    (chave) =>
      typeof chave === 'string' &&
      !PERMANENTES.has(chave) &&
      (chave.startsWith(PREFIXO_DO_APP) || (sessao && chave.startsWith(PREFIXO_DO_FIREBASE))),
  );
}
