// Tentativas de login da área do cliente: quantas senhas erradas ainda cabem
// antes de o acesso ficar bloqueado por um tempo.
//
// O Firebase já freia a força bruta do lado dele (auth/too-many-requests),
// mas não diz quantas tentativas restam nem quando libera. Esta contagem é a
// do navegador: 5 senhas erradas para o mesmo e-mail em 15 minutos bloqueiam
// o formulário para esse e-mail, a mesma regra do login do back-office na API
// (api/app/limites.py). Ela avisa e freia quem está na tela; quem chama o
// Firebase direto continua esbarrando no limite do próprio Firebase.
//
// Enumeração de usuários: a contagem sobe igual para e-mail com e sem conta
// (o Firebase devolve o mesmo auth/invalid-credential), então o aviso não
// revela quem tem cadastro.

export const MAXIMO_DE_TENTATIVAS = 5;
export const JANELA_EM_MINUTOS = 15;
const JANELA_EM_MS = JANELA_EM_MINUTOS * 60 * 1000;

// Só estes códigos contam como senha errada. Rede fora ou Firebase
// indisponível não gastam tentativa de ninguém.
const CODIGOS_DE_CREDENCIAL_RECUSADA = new Set(['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password']);

export const contaComoTentativa = (codigo) => CODIGOS_DE_CREDENCIAL_RECUSADA.has(codigo);

// Falhas (instantes em ms) que ainda estão dentro da janela.
export function falhasRecentes(falhas, agora) {
  return (Array.isArray(falhas) ? falhas : []).filter((instante) => Number.isFinite(instante) && instante > agora - JANELA_EM_MS && instante <= agora);
}

export function comFalha(falhas, agora) {
  return [...falhasRecentes(falhas, agora), agora];
}

// { restantes, liberaEm }: liberaEm é o instante (ms) em que o bloqueio acaba,
// ou null quando o formulário está livre.
export function situacaoDoLogin(falhas, agora) {
  const recentes = falhasRecentes(falhas, agora).sort((a, b) => a - b);
  const restantes = Math.max(0, MAXIMO_DE_TENTATIVAS - recentes.length);
  if (restantes > 0) {
    return { restantes, liberaEm: null };
  }
  // Libera quando a falha de número "máximo", contando da mais nova, sai da janela.
  return { restantes: 0, liberaEm: recentes[recentes.length - MAXIMO_DE_TENTATIVAS] + JANELA_EM_MS };
}

export function textoDasTentativas(restantes) {
  if (restantes <= 0) {
    return '';
  }
  return restantes === 1
    ? `Resta 1 tentativa antes de o acesso ser bloqueado por ${JANELA_EM_MINUTOS} minutos.`
    : `Restam ${restantes} tentativas antes de o acesso ser bloqueado por ${JANELA_EM_MINUTOS} minutos.`;
}

export function textoDoBloqueio(liberaEm, agora) {
  const minutos = Math.max(1, Math.ceil((liberaEm - agora) / 60000));
  return `Muitas tentativas seguidas. Por segurança, o acesso com este e-mail fica bloqueado por ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`;
}

// Chave da contagem no navegador, sem guardar o e-mail em texto: um resumo
// FNV-1a de 32 bits do e-mail normalizado. Não é criptografia (é só para o
// e-mail não ficar legível no localStorage de um computador compartilhado).
export function chaveDoEmail(email) {
  const texto = String(email ?? '').trim().toLowerCase();
  let resumo = 0x811c9dc5;
  for (let indice = 0; indice < texto.length; indice += 1) {
    resumo ^= texto.charCodeAt(indice);
    resumo = Math.imul(resumo, 0x01000193) >>> 0;
  }
  return resumo.toString(16).padStart(8, '0');
}
