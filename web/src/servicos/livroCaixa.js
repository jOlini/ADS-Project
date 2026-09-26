// Chamadas à API do livro-caixa. A área do cliente não tem senha na API: cada
// requisição leva o ID token do Firebase da sessão atual, que a API confere
// com as chaves públicas do Google. O SDK renova o token sozinho quando ele
// vence (1 hora).
//
// VITE_API_URL vazio (caso do GitHub Pages, que não tem API hospedada):
// apiConfigurada é false e as telas do livro-caixa mostram o aviso.
import { auth } from '../firebase';
import { enderecoDaApi } from './enderecoDaApi';

// Aberta pela rede local, a página chama a API no IP de onde veio; pelo túnel,
// no proxy do Vite.
const URL_DA_API = enderecoDaApi(
  import.meta.env.VITE_API_URL,
  globalThis.location?.hostname,
  import.meta.env.BASE_URL,
);

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

// ------------------------------------------------ Cartões de crédito
// O cartão é criado e editado como conta (tipo CARTAO_CREDITO, com limite e
// os dias de fechamento e vencimento). Aqui ficam o painel, as faturas, a
// compra (à vista ou parcelada) e o pagamento da fatura.

const doCartao = (espacoId, cartaoId, resto = '') => doEspaco(espacoId, `/cartoes/${encodeURIComponent(cartaoId)}${resto}`);

// Cada cartão com limite, disponível, fatura atual, a pagar e parcelas futuras.
export function listarCartoes(espacoId) {
  return chamar(doEspaco(espacoId, '/cartoes'));
}

export function buscarCartao(espacoId, cartaoId) {
  return chamar(doCartao(espacoId, cartaoId));
}

// referencia: 'AAAA-MM', o mês do vencimento da fatura.
export function buscarFatura(espacoId, cartaoId, referencia) {
  return chamar(doCartao(espacoId, cartaoId, `/faturas/${encodeURIComponent(referencia)}`));
}

// { descricao, data, valor_centavos (total), categoria_id, parcelas, divisao? }.
// Devolve as parcelas criadas (uma só, à vista).
export function comprarNoCartao(espacoId, cartaoId, compra) {
  return chamar(doCartao(espacoId, cartaoId, '/compras'), { metodo: 'POST', corpo: compra });
}

// { conta_id, valor_centavos, data }: sai da conta e libera o limite.
export function pagarFatura(espacoId, cartaoId, pagamento) {
  return chamar(doCartao(espacoId, cartaoId, '/pagamentos'), { metodo: 'POST', corpo: pagamento });
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

// { de, ate, contaId }, todos opcionais (datas em ISO). Com contaId, só os
// lançamentos que mexem naquela conta. Do mais recente para o mais antigo.
export function listarLancamentos(espacoId, { de, ate, contaId } = {}) {
  const filtro = new URLSearchParams({ limite: String(LIMITE_DE_LANCAMENTOS) });
  if (de) {
    filtro.set('de', de);
  }
  if (ate) {
    filtro.set('ate', ate);
  }
  if (contaId) {
    filtro.set('conta_id', contaId);
  }
  return chamar(doEspaco(espacoId, `/lancamentos?${filtro}`));
}

export function lancar(espacoId, lancamento) {
  return chamar(doEspaco(espacoId, '/lancamentos'), { metodo: 'POST', corpo: lancamento });
}

export function estornar(espacoId, lancamentoId) {
  return chamar(doEspaco(espacoId, `/lancamentos/${encodeURIComponent(lancamentoId)}/estorno`), { metodo: 'POST' });
}

// Apaga de vez (erro de digitação, duplicata), junto com o estorno dele. 204.
export function excluir(espacoId, lancamentoId) {
  return chamar(doEspaco(espacoId, `/lancamentos/${encodeURIComponent(lancamentoId)}`), { metodo: 'DELETE' });
}

// Nomes já usados em rachas, para o formulário sugerir.
export function listarPessoas(espacoId) {
  return chamar(doEspaco(espacoId, '/pessoas'));
}

// Começo do CSV em células e o mapeamento das colunas, quando a API as
// reconhece pelo nome: { csv, delimitador? }. Nada é gravado.
export function estruturaDoExtrato(espacoId, pedido) {
  return chamar(doEspaco(espacoId, '/importacoes/estrutura'), { metodo: 'POST', corpo: pedido });
}

// Extrato do banco em CSV: { conta_id, categoria_despesa_id, categoria_receita_id,
// csv, mapeamento?, simular }. Com simular, a API só diz o que entraria. Linha
// já importada antes não entra de novo (chave de idempotência calculada pela API).
export function importarExtrato(espacoId, importacao) {
  return chamar(doEspaco(espacoId, '/importacoes'), { metodo: 'POST', corpo: importacao });
}
