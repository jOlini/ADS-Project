// Contagem de senhas erradas no navegador, por e-mail (regras/tentativas.js).
// Fica no localStorage para valer em todas as abas; o logout a apaga junto com
// o resto do app (regras/dadosLocais.js).
import { PREFIXO_DO_APP } from '../regras/dadosLocais';
import { chaveDoEmail, comFalha, falhasRecentes, situacaoDoLogin } from '../regras/tentativas';
import { apagarChave, gravarJson, lerJson } from './dadosLocais';

const chaveDasTentativas = (email) => `${PREFIXO_DO_APP}tentativas:${chaveDoEmail(email)}`;

export function situacaoDasTentativas(email, agora = Date.now()) {
  return situacaoDoLogin(lerJson(chaveDasTentativas(email)), agora);
}

// Registra a senha errada e devolve a situação nova ({ restantes, liberaEm }).
export function registrarSenhaErrada(email, agora = Date.now()) {
  const falhas = comFalha(falhasRecentes(lerJson(chaveDasTentativas(email)), agora), agora);
  gravarJson(chaveDasTentativas(email), falhas);
  return situacaoDoLogin(falhas, agora);
}

// Login certo: a contagem daquele e-mail recomeça.
export function zerarTentativas(email) {
  apagarChave(chaveDasTentativas(email));
}
