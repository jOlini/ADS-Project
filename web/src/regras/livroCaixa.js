// Regras das telas do livro-caixa, sem interface: tradução do que a API
// devolve para o formato do extrato, navegação por mês e validação dos
// formulários antes de ir à rede. A API confere tudo de novo; a validação
// aqui só poupa uma ida ao servidor e põe a mensagem no campo certo.
import { lerValor } from './dinheiro';
import { dataExiste } from './datas';
import { camposDaDivisao, corpoDaDivisao, validarDivisao } from './divisao';

export const TIPOS_DE_CONTA = [
  { valor: 'CORRENTE', rotulo: 'Conta corrente' },
  { valor: 'POUPANCA', rotulo: 'Poupança' },
  { valor: 'CARTEIRA', rotulo: 'Carteira' },
  { valor: 'INVESTIMENTO', rotulo: 'Investimento' },
];

export const TIPOS_DE_LANCAMENTO = [
  { valor: 'DESPESA', rotulo: 'Despesa' },
  { valor: 'RECEITA', rotulo: 'Receita' },
  { valor: 'TRANSFERENCIA', rotulo: 'Transferência' },
];

// Mesmos nomes das variáveis --cat-* do CSS. O rótulo diz a cor, porque a
// cor nunca aparece sozinha: sempre ao lado do nome da categoria.
export const CORES_DE_CATEGORIA = [
  { valor: 'moradia', rotulo: 'Azul' },
  { valor: 'mercado', rotulo: 'Verde' },
  { valor: 'entrada', rotulo: 'Verde de entrada' },
  { valor: 'transporte', rotulo: 'Roxo' },
  { valor: 'casa', rotulo: 'Âmbar' },
  { valor: 'saude', rotulo: 'Ciano' },
  { valor: 'lazer', rotulo: 'Rosa' },
  { valor: 'neutro', rotulo: 'Cinza' },
];

export function rotuloDoTipoDeConta(tipo) {
  return TIPOS_DE_CONTA.find((item) => item.valor === tipo)?.rotulo ?? tipo;
}

// ------------------------------------------------------------ Extrato

// Lançamentos da API viram linhas do extrato (o formato de resumo.js):
// valor em centavos com o sinal do que aconteceu na conta de origem,
// nome da categoria e da conta no lugar dos ids e as pessoas do racha.
export function paraExtrato(lancamentos, contas, categorias) {
  const nomeDaConta = new Map(contas.map((conta) => [conta.id, conta.nome]));
  const categoriaPorId = new Map(categorias.map((categoria) => [categoria.id, categoria]));
  const nome = (id) => nomeDaConta.get(id) ?? 'Conta removida';

  return lancamentos.map((lancamento) => {
    const transferencia = lancamento.tipo === 'TRANSFERENCIA';
    const categoria = categoriaPorId.get(lancamento.categoria_id);
    const partidaDaConta = lancamento.partidas.find((partida) => partida.conta_id === lancamento.conta_id);
    return {
      id: lancamento.id,
      data: lancamento.data,
      descricao: lancamento.descricao,
      tipo: transferencia ? 'transferencia' : lancamento.tipo.toLowerCase(),
      categoria: transferencia ? 'Transferência' : (categoria?.nome ?? 'Sem categoria'),
      cor: transferencia ? 'neutro' : (categoria?.cor ?? 'neutro'),
      conta: transferencia ? `${nome(lancamento.conta_id)} → ${nome(lancamento.conta_destino_id)}` : nome(lancamento.conta_id),
      valor: partidaDaConta?.valor_centavos ?? 0,
      pessoas: (lancamento.divisao ?? []).map((parte) => ({ pessoa: parte.pessoa, valor: parte.valor_centavos })),
      estorno: Boolean(lancamento.estorno_de),
      estornado: Boolean(lancamento.estornado_por),
    };
  });
}

// Saldo de todas as contas, inclusive as desativadas: o dinheiro delas
// continua existindo.
export function saldoTotal(contas) {
  return contas.reduce((soma, conta) => soma + conta.saldo_centavos, 0);
}

// ------------------------------------------------------------- Meses

const doisDigitos = (numero) => String(numero).padStart(2, '0');

// { ano, mes } de uma data ISO ou de um Date (mes de 1 a 12).
export function mesDe(data) {
  if (typeof data === 'string') {
    const [ano, mes] = data.split('-').map(Number);
    return { ano, mes };
  }
  return { ano: data.getFullYear(), mes: data.getMonth() + 1 };
}

// Primeiro e último dia do mês, em ISO, para o filtro da API.
export function intervaloDoMes({ ano, mes }) {
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return { de: `${ano}-${doisDigitos(mes)}-01`, ate: `${ano}-${doisDigitos(mes)}-${doisDigitos(ultimoDia)}` };
}

export function mudarMes({ ano, mes }, meses) {
  const total = ano * 12 + (mes - 1) + meses;
  return { ano: Math.floor(total / 12), mes: (((total % 12) + 12) % 12) + 1 };
}

export function estaNoMes(iso, { ano, mes }) {
  return iso.startsWith(`${ano}-${doisDigitos(mes)}-`);
}

// ---------------------------------------------------------- Formulários

export const ORDEM_DO_LANCAMENTO = ['descricao', 'valor', 'data', 'conta_id', 'categoria_id', 'conta_destino_id'];

// Ordem dos campos do formulário de lançamento, com os da divisão no fim.
export function ordemDoLancamento(formulario) {
  return [...ORDEM_DO_LANCAMENTO, ...camposDaDivisao(formulario.divisao ?? [])];
}

// Racha só em receita e despesa: transferência entre contas próprias não
// tem o que dividir.
const temDivisao = (formulario) => formulario.tipo !== 'TRANSFERENCIA' && (formulario.divisao?.length ?? 0) > 0;
export const ORDEM_DA_CONTA = ['nome', 'tipo', 'saldoInicial'];
export const ORDEM_DA_CATEGORIA = ['nome', 'tipo', 'cor'];

const TAMANHO_DO_NOME = 60;
const TAMANHO_DA_DESCRICAO = 120;

// { campo: mensagem } só com os campos inválidos; vazio = pode enviar.
export function validarLancamento(formulario) {
  const erros = {};
  const descricao = formulario.descricao?.trim() ?? '';
  const valor = lerValor(formulario.valor);

  if (!descricao) {
    erros.descricao = 'Descreva o lançamento (ex.: Supermercado).';
  } else if (descricao.length > TAMANHO_DA_DESCRICAO) {
    erros.descricao = `Use no máximo ${TAMANHO_DA_DESCRICAO} caracteres.`;
  }

  if (!formulario.valor?.trim()) {
    erros.valor = 'Informe o valor.';
  } else if (valor === null) {
    erros.valor = 'Valor inválido. Use o formato 214,37.';
  } else if (valor === 0) {
    erros.valor = 'O valor precisa ser maior que zero.';
  }

  if (!formulario.data) {
    erros.data = 'Informe a data.';
  } else if (!dataExiste(formulario.data)) {
    erros.data = 'Data inválida.';
  }

  if (!formulario.conta_id) {
    erros.conta_id = 'Escolha a conta.';
  }

  if (formulario.tipo === 'TRANSFERENCIA') {
    if (!formulario.conta_destino_id) {
      erros.conta_destino_id = 'Escolha a conta de destino.';
    } else if (formulario.conta_destino_id === formulario.conta_id) {
      erros.conta_destino_id = 'Escolha uma conta diferente da de origem.';
    }
  } else if (!formulario.categoria_id) {
    erros.categoria_id = 'Escolha a categoria.';
  }

  if (temDivisao(formulario)) {
    Object.assign(erros, validarDivisao(formulario.divisao, valor || null));
  }

  return erros;
}

// Corpo do POST /lancamentos a partir de um formulário já validado. Só vai o
// que o tipo usa: a API recusa categoria em transferência e vice-versa.
export function corpoDoLancamento(formulario) {
  const corpo = {
    tipo: formulario.tipo,
    descricao: formulario.descricao.trim(),
    data: formulario.data,
    valor_centavos: lerValor(formulario.valor),
    conta_id: formulario.conta_id,
  };
  if (formulario.tipo === 'TRANSFERENCIA') {
    corpo.conta_destino_id = formulario.conta_destino_id;
  } else {
    corpo.categoria_id = formulario.categoria_id;
  }
  if (temDivisao(formulario)) {
    corpo.divisao = corpoDaDivisao(formulario.divisao);
  }
  return corpo;
}

function validarNome(nome, erros) {
  const limpo = nome?.trim() ?? '';
  if (!limpo) {
    erros.nome = 'Informe o nome.';
  } else if (limpo.length > TAMANHO_DO_NOME) {
    erros.nome = `Use no máximo ${TAMANHO_DO_NOME} caracteres.`;
  }
}

export function validarConta(formulario) {
  const erros = {};
  validarNome(formulario.nome, erros);
  if (formulario.saldoInicial?.trim() && lerValor(formulario.saldoInicial, { permitirNegativo: true }) === null) {
    erros.saldoInicial = 'Valor inválido. Use o formato 1.500,00 (ou -150,00 se estiver no vermelho).';
  }
  return erros;
}

export function validarCategoria(formulario) {
  const erros = {};
  validarNome(formulario.nome, erros);
  return erros;
}

// Os erros de campo da API (400) usam os nomes do JSON; os formulários usam
// "valor" e "saldoInicial" para o texto digitado, também dentro da divisão
// ("divisao.0.valor_centavos" vira "divisao.0.valor").
const CAMPO_DO_FORMULARIO = { valor_centavos: 'valor', saldo_inicial_centavos: 'saldoInicial' };

function campoDoFormulario(campo) {
  const partes = campo.split('.');
  const ultimo = partes.at(-1);
  return [...partes.slice(0, -1), CAMPO_DO_FORMULARIO[ultimo] ?? ultimo].join('.');
}

export function errosDaApi(campos = {}) {
  return Object.fromEntries(Object.entries(campos).map(([campo, mensagem]) => [campoDoFormulario(campo), mensagem]));
}
