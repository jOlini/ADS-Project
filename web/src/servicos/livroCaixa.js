// Chamadas à API do livro-caixa. A área do cliente não tem senha na API: cada
// requisição leva o ID token do Firebase da sessão atual, que a API confere
// com as chaves públicas do Google. O SDK renova o token sozinho quando ele
// vence (1 hora).
//
// VITE_API_URL vazio (caso do GitHub Pages, que não tem API hospedada):
// apiConfigurada é false e as telas do livro-caixa mostram o aviso.
import { auth } from '../firebase';
import { enderecoDaApi } from './enderecoDaApi';
import { cabecalhoDoPlanoEmTeste } from './planoEmTeste';
import { limparCorpo } from '../regras/sanitizacao';

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
// da API (Problem Details "detail"), o erro de cada campo ("campos", no 400)
// e o corpo inteiro (detalhes), para os membros extras de alguns erros, como
// a quantidade de lançamentos no 409 da categoria em uso.
export class ErroDaApi extends Error {
  constructor(status, mensagem, campos = {}, detalhes = null) {
    super(mensagem);
    this.status = status;
    this.campos = campos;
    this.detalhes = detalhes;
  }
}

async function chamar(caminho, { metodo = 'GET', corpo } = {}) {
  const usuario = auth?.currentUser;
  if (!usuario) {
    throw new ErroDaApi(401, MENSAGEM_SESSAO_ENCERRADA);
  }
  let token;
  try {
    token = await usuario.getIdToken();
  } catch (erro) {
    // Renovar o token vencido exige falar com o Firebase. Sem rede, a mensagem é
    // a mesma da API fora do ar; conta desativada ou sessão revogada encerram a
    // sessão. O texto técnico do SDK não vai para a tela.
    const semRede = erro?.code === 'auth/network-request-failed';
    throw new ErroDaApi(semRede ? 0 : 401, semRede ? MENSAGEM_SEM_API : MENSAGEM_SESSAO_ENCERRADA);
  }

  let resposta;
  try {
    resposta = await fetch(`${URL_DA_API}${caminho}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(corpo ? { 'Content-Type': 'application/json' } : {}),
        // Super admin testando um plano (servicos/planoEmTeste.ts). Para as
        // outras contas a API ignora o cabeçalho.
        ...cabecalhoDoPlanoEmTeste(),
      },
      // Nome, descrição e pessoa saem limpos (sem tag, fórmula nem caractere
      // invisível); a API limpa de novo, com a mesma regra.
      body: corpo ? JSON.stringify(limparCorpo(corpo)) : undefined,
    });
  } catch {
    // Rede fora, API desligada ou CORS recusado: o navegador não diz qual.
    throw new ErroDaApi(0, MENSAGEM_SEM_API);
  }

  const dados = await resposta.json().catch(() => null);
  if (!resposta.ok) {
    const mensagem = resposta.status === 401 ? MENSAGEM_SESSAO_ENCERRADA : (dados?.detail ?? MENSAGEM_GENERICA);
    throw new ErroDaApi(resposta.status, mensagem, dados?.campos ?? {}, dados);
  }
  return dados;
}

const doEspaco = (espacoId, resto = '') => `/espacos/${encodeURIComponent(espacoId)}${resto}`;

// Os espaços da pessoa, o pessoal primeiro. No primeiro acesso, a API cria o
// espaço pessoal com as categorias iniciais.
export function listarEspacos() {
  return chamar('/espacos');
}

// O que a conta pode fazer além do uso normal: { super_admin, plano_simulado }.
// API antiga (sem a rota) responde 404, e quem chama trata como conta comum.
export function acessoDaConta() {
  return chamar('/espacos/acesso');
}

// Empresa nova no espaço empresarial: { nome, cnpj (ou null), regime }. Cada
// empresa é um livro-caixa próprio (tipo PJ na API).
export function criarEmpresa(empresa) {
  return chamar('/espacos', { metodo: 'POST', corpo: { tipo: 'PJ', ...empresa } });
}

// Nome, CNPJ e regime da empresa: só os campos enviados mudam.
export function atualizarEmpresa(espacoId, empresa) {
  return chamar(doEspaco(espacoId), { metodo: 'PATCH', corpo: empresa });
}

// Só a empresa sem movimento sai (a API responde 409 com o motivo).
export function excluirEspaco(espacoId) {
  return chamar(doEspaco(espacoId), { metodo: 'DELETE' });
}

// ------------------------------------------------------------ Modo Família
// Só no espaço pessoal. As pessoas da família são perfis dentro dele: um
// lançamento é de uma delas quando o responsável tem o nome dela.

// Liga ou desliga o modo; devolve { ativa, pessoas, maximo_de_pessoas }.
export function ligarFamilia(espacoId, ativa) {
  return chamar(doEspaco(espacoId, '/familia'), { metodo: 'PUT', corpo: { ativa } });
}

// { nome, cor }: devolve a pessoa com o id.
export function incluirPessoa(espacoId, pessoa) {
  return chamar(doEspaco(espacoId, '/familia/pessoas'), { metodo: 'POST', corpo: pessoa });
}

// Nome e cor novos; os lançamentos da pessoa passam para o nome novo
// (lancamentos_renomeados na resposta).
export function editarPessoa(espacoId, pessoaId, pessoa) {
  return chamar(doEspaco(espacoId, `/familia/pessoas/${encodeURIComponent(pessoaId)}`), { metodo: 'PUT', corpo: pessoa });
}

// Os lançamentos dela ficam, com o nome escrito como responsável. 204.
export function removerPessoa(espacoId, pessoaId) {
  return chamar(doEspaco(espacoId, `/familia/pessoas/${encodeURIComponent(pessoaId)}`), { metodo: 'DELETE' });
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

// Apaga a conta (ou o cartão) com todos os lançamentos dela, inclusive as
// transferências com outras contas. Devolve { excluidos } (lançamentos).
export function excluirConta(espacoId, contaId) {
  return chamar(doEspaco(espacoId, `/contas/${encodeURIComponent(contaId)}`), { metodo: 'DELETE' });
}

// ------------------------------------------------ Cartões de crédito
// O cartão é criado e editado como conta (tipo CARTAO_CREDITO, com limite,
// os dias de fechamento e vencimento e a cor). Aqui ficam o painel, as faturas, a
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

// As faturas que têm lançamentos (e a atual), da mais nova para a mais antiga,
// com o total de cada uma.
export function listarFaturas(espacoId, cartaoId) {
  return chamar(doCartao(espacoId, cartaoId, '/faturas'));
}

// Apaga as compras e os créditos da fatura (compra parcelada sai inteira); os
// pagamentos ficam. Devolve { excluidos }.
export function excluirFatura(espacoId, cartaoId, referencia) {
  return chamar(doCartao(espacoId, cartaoId, `/faturas/${encodeURIComponent(referencia)}`), { metodo: 'DELETE' });
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

// Só categoria sem lançamentos: com lançamentos, a API responde 409 (o caminho
// é desativar). 204.
// Com moverPara, os lançamentos da categoria passam para essa outra antes de
// ela sair: a resposta diz quantos ({ lancamentos_movidos }). Sem ele, a
// categoria em uso volta 409 com a quantidade (erro.detalhes.lancamentos).
export function excluirCategoria(espacoId, categoriaId, moverPara = null) {
  const destino = moverPara ? `?${new URLSearchParams({ mover_para: moverPara })}` : '';
  return chamar(doEspaco(espacoId, `/categorias/${encodeURIComponent(categoriaId)}${destino}`), { metodo: 'DELETE' });
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

// Só os campos enviados mudam: { descricao, data, valor_centavos,
// categoria_id, meio }. Na parcela de uma compra, a descrição e a categoria
// mudam na compra inteira.
export function editarLancamento(espacoId, lancamentoId, mudancas) {
  return chamar(doEspaco(espacoId, `/lancamentos/${encodeURIComponent(lancamentoId)}`), { metodo: 'PATCH', corpo: mudancas });
}

// Apaga de vez (erro de digitação, duplicata), junto com o estorno dele. 204.
export function excluir(espacoId, lancamentoId) {
  return chamar(doEspaco(espacoId, `/lancamentos/${encodeURIComponent(lancamentoId)}`), { metodo: 'DELETE' });
}

// Vários de uma vez, com as mesmas regras (estorno junto, parcela leva a
// compra). Devolve { excluidos }, contando parcelas e estornos.
export function excluirVarios(espacoId, ids) {
  return chamar(doEspaco(espacoId, '/lancamentos/exclusao-em-lote'), { metodo: 'POST', corpo: { ids } });
}

// Nomes já usados em rachas, para o formulário sugerir.
export function listarPessoas(espacoId) {
  return chamar(doEspaco(espacoId, '/pessoas'));
}

// ------------------------------------------------------ Racha a receber
// A parte de cada pessoa numa despesa dividida é um valor a receber
// (regras/aReceber.ts monta o que cada uma deve).

// As despesas divididas com nome, da mais nova para a mais antiga.
export function listarRachas(espacoId) {
  return chamar(doEspaco(espacoId, '/rachas'));
}

// { situacao: 'RECEBIDO', conta_id, data? } lança o reembolso na conta;
// { situacao: 'NAO_PAGO' } dá baixa; { situacao: 'PENDENTE', vencimento? }
// volta a cobrar. Devolve a despesa com as partes atualizadas.
export function atualizarParte(espacoId, lancamentoId, indice, mudanca) {
  return chamar(doEspaco(espacoId, `/lancamentos/${encodeURIComponent(lancamentoId)}/divisao/${indice}`), {
    metodo: 'PATCH',
    corpo: mudanca,
  });
}

// ------------------------------------------------------ Uso do plano
// { plano, contas: { usado, maximo }, lancamentos_do_mes: { usado, maximo } }:
// só o Free tem maximo (regras/acessoPorPlano.ts lê o teto). No teto, criar
// conta, lançar e comprar respondem 403 com detalhes.limite.
export function usoDoPlano(espacoId) {
  return chamar(doEspaco(espacoId, '/uso-do-plano'));
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

// ------------------------------------------------------- Gestão da empresa
// Só nas empresas do espaço empresarial (no pessoal, a API responde 404).
// Tudo o que mexe em dinheiro vira lançamento comum do livro-caixa.

// { [categoria_id]: 'VARIAVEL' | 'FIXO' | 'OPERACIONAL' | 'FORA' | null }:
// grava a classe de cada despesa na aba Custos. Devolve as categorias.
export function classificarCustos(espacoId, classes) {
  return chamar(doEspaco(espacoId, '/custos/classes'), { metodo: 'PUT', corpo: { classes } });
}

// Quadro societário: [{ id, nome, participacao_centesimos }] (5000 = 50%).
export function listarSocios(espacoId) {
  return chamar(doEspaco(espacoId, '/socios'));
}

export function incluirSocio(espacoId, socio) {
  return chamar(doEspaco(espacoId, '/socios'), { metodo: 'POST', corpo: socio });
}

// Com o nome novo, os lançamentos do sócio passam para ele.
export function editarSocio(espacoId, socioId, socio) {
  return chamar(doEspaco(espacoId, `/socios/${encodeURIComponent(socioId)}`), { metodo: 'PUT', corpo: socio });
}

export function removerSocio(espacoId, socioId) {
  return chamar(doEspaco(espacoId, `/socios/${encodeURIComponent(socioId)}`), { metodo: 'DELETE' });
}

// { tipo: 'APORTE' | 'DISTRIBUICAO' | 'PRO_LABORE', conta_id, valor_centavos,
// data, descricao? }: vira um lançamento com o sócio como responsável.
export function lancarMovimentoDoSocio(espacoId, socioId, movimento) {
  return chamar(doEspaco(espacoId, `/socios/${encodeURIComponent(socioId)}/movimentos`), { metodo: 'POST', corpo: movimento });
}

// Avisa que as guias mudaram (pagar, cadastrar, editar, excluir): o sino do
// topo lê de novo e a guia paga sai dos avisos na hora.
export const EVENTO_DOS_TRIBUTOS = 'olifine:tributos';

function avisarTributos(resposta) {
  globalThis.dispatchEvent?.(new Event(EVENTO_DOS_TRIBUTOS));
  return resposta;
}

// Tributos recorrentes, cada um com as competências pagas (pagamentos).
export function listarTributos(espacoId) {
  return chamar(doEspaco(espacoId, '/tributos'));
}

// { nome, tipo, base, aliquota_centesimos | valor_fixo_centavos,
// dia_vencimento, periodicidade, ativo }.
export function incluirTributo(espacoId, tributo) {
  return chamar(doEspaco(espacoId, '/tributos'), { metodo: 'POST', corpo: tributo }).then(avisarTributos);
}

export function editarTributo(espacoId, tributoId, tributo) {
  return chamar(doEspaco(espacoId, `/tributos/${encodeURIComponent(tributoId)}`), { metodo: 'PUT', corpo: tributo }).then(
    avisarTributos,
  );
}

// Os pagamentos já lançados ficam no extrato. 204.
export function removerTributo(espacoId, tributoId) {
  return chamar(doEspaco(espacoId, `/tributos/${encodeURIComponent(tributoId)}`), { metodo: 'DELETE' }).then(avisarTributos);
}

// { competencia: 'AAAA-MM', conta_id, valor_centavos, data }: a guia paga
// vira uma despesa; a mesma competência paga de novo é 409.
export function pagarTributo(espacoId, tributoId, pagamento) {
  return chamar(doEspaco(espacoId, `/tributos/${encodeURIComponent(tributoId)}/pagamentos`), {
    metodo: 'POST',
    corpo: pagamento,
  }).then(avisarTributos);
}

// Pessoas da folha, cada uma com as competências já lançadas.
export function listarColaboradores(espacoId) {
  return chamar(doEspaco(espacoId, '/colaboradores'));
}

export function incluirColaborador(espacoId, colaborador) {
  return chamar(doEspaco(espacoId, '/colaboradores'), { metodo: 'POST', corpo: colaborador });
}

export function editarColaborador(espacoId, colaboradorId, colaborador) {
  return chamar(doEspaco(espacoId, `/colaboradores/${encodeURIComponent(colaboradorId)}`), { metodo: 'PUT', corpo: colaborador });
}

export function removerColaborador(espacoId, colaboradorId) {
  return chamar(doEspaco(espacoId, `/colaboradores/${encodeURIComponent(colaboradorId)}`), { metodo: 'DELETE' });
}

// { competencia, conta_id, data? }: salário e benefícios de cada pessoa ativa
// viram lançamentos (quem já está lançado é pulado). Devolve { lancados,
// ja_lancados, total_centavos, lancamento_ids }.
export function lancarFolha(espacoId, folha) {
  return chamar(doEspaco(espacoId, '/folha'), { metodo: 'POST', corpo: folha });
}

// Relatórios da release 0.3 (DOCS_API.md, parte 7). Período em meses
// ({ de, ate } como 'AAAA-MM', opcionais): sem ele, a API usa os 12 meses que
// terminam no mês de hoje. membro (Modo Família): o id de uma pessoa da
// família ou 'titular'; sem ele, todos.
function consultaDoPeriodo({ de, ate, membro } = {}) {
  const periodo = new URLSearchParams();
  if (de) {
    periodo.set('de', de);
  }
  if (ate) {
    periodo.set('ate', ate);
  }
  if (membro) {
    periodo.set('membro', membro);
  }
  return periodo.size > 0 ? `?${periodo}` : '';
}

// Receita, despesa, sobra e saldo no fim de cada mês.
export function relatorioMensal(espacoId, periodo) {
  return chamar(doEspaco(espacoId, `/relatorios/mensal${consultaDoPeriodo(periodo)}`));
}

// Gasto por categoria no período, do maior para o menor, com a fatia.
export function relatorioCategorias(espacoId, periodo) {
  return chamar(doEspaco(espacoId, `/relatorios/categorias${consultaDoPeriodo(periodo)}`));
}
