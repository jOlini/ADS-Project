// Regras da importação do extrato (CSV) na tela. Quem lê as linhas, calcula
// a chave de cada uma e decide o que entra é a API
// (api/app/financeiro/importacao.py); aqui fica só o que a tela precisa:
// ler o arquivo, conferir o formulário e resumir a resposta.

// Mesmo teto da API (TAMANHO_MAXIMO_DO_CSV, em caracteres). Em bytes o arquivo
// tem pelo menos o mesmo tamanho, então conferir os bytes já basta.
export const TAMANHO_MAXIMO_DO_ARQUIVO = 500_000;

export const ORDEM_DA_IMPORTACAO = ['arquivo', 'conta_id', 'categoria_despesa_id', 'categoria_receita_id'];

// Muitos bancos exportam o CSV em Windows-1252 (o "ANSI" do Excel). Lido como
// UTF-8, "Descrição" viraria "Descri��o" e o cabeçalho não seria achado. Tenta
// UTF-8 estrito e, se o arquivo não for UTF-8 válido, lê como Windows-1252.
export function decodificarExtrato(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

export function validarImportacao({ arquivo, conta_id, categoria_despesa_id, categoria_receita_id }) {
  const erros = {};
  if (!arquivo) {
    erros.arquivo = 'Escolha o arquivo do extrato.';
  } else if (arquivo.size === 0) {
    erros.arquivo = 'O arquivo está vazio.';
  } else if (arquivo.size > TAMANHO_MAXIMO_DO_ARQUIVO) {
    erros.arquivo = 'Arquivo grande demais (máximo de 500 KB). Exporte um período menor.';
  }
  if (!conta_id) {
    erros.conta_id = 'Escolha a conta do extrato.';
  }
  if (!categoria_despesa_id) {
    erros.categoria_despesa_id = 'Escolha a categoria das saídas.';
  }
  if (!categoria_receita_id) {
    erros.categoria_receita_id = 'Escolha a categoria das entradas.';
  }
  return erros;
}

// Erros de campo da API (400): o texto do arquivo vai no campo "csv", que na
// tela é o seletor de arquivo.
export function errosDaImportacao(campos = {}) {
  return Object.fromEntries(Object.entries(campos).map(([campo, mensagem]) => [campo === 'csv' ? 'arquivo' : campo, mensagem]));
}

// Sugestão para o extrato não exigir escolha: "Outras despesas" e "Outras
// receitas" (categorias iniciais) se estiverem ativas; senão, a primeira ativa.
const PREFERIDA = { DESPESA: 'Outras despesas', RECEITA: 'Outras receitas' };

export function categoriaSugerida(categorias, tipo) {
  const doTipo = categorias.filter((categoria) => categoria.ativa && categoria.tipo === tipo);
  return (doTipo.find((categoria) => categoria.nome === PREFERIDA[tipo]) ?? doTipo[0])?.id ?? '';
}

export const ROTULO_DA_SITUACAO = {
  NOVA: 'Nova',
  IMPORTADA: 'Importada',
  JA_IMPORTADA: 'Já importada',
  INVALIDA: 'Com erro',
};

const contar = (quantidade, singular, plural) => `${quantidade} ${quantidade === 1 ? singular : plural}`;

// "12 lançamentos novos · 3 já importados · 1 linha com erro".
export function resumoDaImportacao({ simulacao, novas, importadas, ja_importadas: jaImportadas, invalidas }) {
  const partes = [
    simulacao
      ? contar(novas, 'lançamento novo', 'lançamentos novos')
      : contar(importadas, 'lançamento importado', 'lançamentos importados'),
  ];
  if (jaImportadas) {
    partes.push(contar(jaImportadas, 'já importado', 'já importados'));
  }
  if (invalidas) {
    partes.push(contar(invalidas, 'linha com erro', 'linhas com erro'));
  }
  return partes.join(' · ');
}

// Data (ISO) do lançamento importado mais recente, para a tela abrir o mês
// dele. null quando nada entrou.
export function dataMaisRecente(linhas = []) {
  return linhas
    .filter((linha) => linha.situacao === 'IMPORTADA')
    .reduce((maior, linha) => (maior === null || linha.data > maior ? linha.data : maior), null);
}
