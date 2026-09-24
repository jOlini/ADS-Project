// Chamadas à API do livro-caixa. A área do cliente não tem senha na API: cada
// requisição leva o ID token do Firebase da sessão atual, que a API confere
// com as chaves públicas do Google. O SDK renova o token sozinho quando ele
// vence (1 hora).
//
// VITE_API_URL vazio (caso do GitHub Pages, que não tem API hospedada):
// apiConfigurada é false e as telas do livro-caixa mostram o aviso.
import { auth } from '../firebase';

const URL_DA_API = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

export const apiConfigurada = Boolean(URL_DA_API);

export const MENSAGEM_SEM_API = 'Não foi possível falar com o servidor. Confira se a API está no ar e tente de novo.';
export const MENSAGEM_SESSAO_ENCERRADA = 'Sua sessão terminou. Entre de novo.';
const MENSAGEM_GENERICA = 'O servidor não conseguiu concluir a operação. Tente de novo.';

// Falha que a tela sabe mostrar: status HTTP (0 = sem resposta), a mensagem
// da API (Problem Details "detail") e o erro de cada campo ("campos", no 400).
export class ErroDaApi extends Error {
  constructor(status, mensagem, campos = {}) {
    super(mensagem);
    this.status = status;
    this.campos = campos;
  }
}

async function chamar(caminho, { metodo = 'GET', corpo } = {}) {
  const usuario = auth?.currentUser;
  if (!usuario) {
    throw new ErroDaApi(401, MENSAGEM_SESSAO_ENCERRADA);
  }
  const token = await usuario.getIdToken();

  let resposta;
  try {
    resposta = await fetch(`${URL_DA_API}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    // Rede fora, API desligada ou CORS recusado: o navegador não diz qual.
    throw new ErroDaApi(0, MENSAGEM_SEM_API);
  }

  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const mensagem = resposta.status === 401 ? MENSAGEM_SESSAO_ENCERRADA : (dados?.detail ?? MENSAGEM_GENERICA);
    throw new ErroDaApi(resposta.status, mensagem, dados?.campos ?? {});
  }
  return dados;
}

const doEspaco = (espacoId, resto = '') => `/espacos/${encodeURIComponent(espacoId)}${resto}`;

// No primeiro acesso, a API cria o espaço pessoal com as categorias iniciais.
export async function espacoPessoal() {
  const espacos = await chamar('/espacos');
  return espacos.find((espaco) => espaco.tipo === 'PF') ?? espacos[0] ?? null;
}

export function listarContas(espacoId) {
  return chamar(doEspaco(espacoId, '/contas'));
}

export function criarConta(espacoId, conta) {
  return chamar(doEspaco(espacoId, '/contas'), { metodo: 'POST', corpo: conta });
}

export function atualizarConta(espacoId, contaId, conta) {
  return chamar(doEspaco(espacoId, `/contas/${encodeURIComponent(contaId)}`), { metodo: 'PUT', corpo: conta });
}

export function listarCategorias(espacoId) {
  return chamar(doEspaco(espacoId, '/categorias'));
}

export function criarCategoria(espacoId, categoria) {
  return chamar(doEspaco(espacoId, '/categorias'), { metodo: 'POST', corpo: categoria });
}

export function atualizarCategoria(espacoId, categoriaId, categoria) {
  return chamar(doEspaco(espacoId, `/categorias/${encodeURIComponent(categoriaId)}`), { metodo: 'PUT', corpo: categoria });
}

// Limite da API para uma consulta.
export const LIMITE_DE_LANCAMENTOS = 1000;

// { de, ate } em ISO, ambos opcionais. Do mais recente para o mais antigo.
export function listarLancamentos(espacoId, { de, ate } = {}) {
  const filtro = new URLSearchParams({ limite: String(LIMITE_DE_LANCAMENTOS) });
  if (de) {
    filtro.set('de', de);
  }
  if (ate) {
    filtro.set('ate', ate);
  }
  return chamar(doEspaco(espacoId, `/lancamentos?${filtro}`));
}

export function lancar(espacoId, lancamento) {
  return chamar(doEspaco(espacoId, '/lancamentos'), { metodo: 'POST', corpo: lancamento });
}

export function estornar(espacoId, lancamentoId) {
  return chamar(doEspaco(espacoId, `/lancamentos/${encodeURIComponent(lancamentoId)}/estorno`), { metodo: 'POST' });
}

// Extrato do banco em CSV: { conta_id, categoria_despesa_id, categoria_receita_id,
// csv, simular }. Com simular, a API só diz o que entraria. Linha já importada
// antes não entra de novo (chave de idempotência calculada pela API).
export function importarExtrato(espacoId, importacao) {
  return chamar(doEspaco(espacoId, '/importacoes'), { metodo: 'POST', corpo: importacao });
}
