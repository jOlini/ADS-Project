// Pedidos de e-mail da conta à API (confirmação e nova senha), que manda com a
// marca OliFine. Cada função devolve true quando a API aceitou e false quando
// a API não pode mandar: sem VITE_API_URL (GitHub Pages), fora do ar, sem
// provedor configurado (503) ou versão sem a rota (404). No false, quem chama
// (contas.js) usa o envio do próprio Firebase, e a pessoa recebe o link do
// mesmo jeito.
import { enderecoDaApi } from './enderecoDaApi';

const URL_DA_API = enderecoDaApi(
  import.meta.env.VITE_API_URL,
  globalThis.location?.hostname,
  import.meta.env.BASE_URL,
);

// Recusas que não adianta repetir pelo Firebase: o limite de pedidos e o
// e-mail inválido. O código segue o formato dos erros do Firebase para a tela
// usar o mesmo mensagemDeErro (regras/erros.js).
export const MUITOS_PEDIDOS = 'olifine/muitos-pedidos';

class RecusaDaApi extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function pedir(caminho, { token, corpo } = {}) {
  if (!URL_DA_API) {
    return false;
  }
  let resposta;
  try {
    resposta = await fetch(`${URL_DA_API}${caminho}`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    return false;
  }
  if (resposta.ok) {
    return true;
  }
  if (resposta.status === 429) {
    throw new RecusaDaApi(MUITOS_PEDIDOS);
  }
  if (resposta.status === 400) {
    throw new RecusaDaApi('auth/invalid-email');
  }
  return false;
}

// Link de confirmação para a conta logada (ainda sem confirmação).
export async function linkDeConfirmacaoPelaApi(usuario) {
  if (!URL_DA_API) {
    return false;
  }
  return pedir('/conta/confirmacao', { token: await usuario.getIdToken() });
}

// Link para criar uma senha nova. A API responde igual com e sem conta.
export function linkDeNovaSenhaPelaApi(email) {
  return pedir('/conta/nova-senha', { corpo: { email } });
}
