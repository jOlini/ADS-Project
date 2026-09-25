// Regras da importação do extrato (CSV) na tela. Quem lê as linhas, calcula
// a chave de cada uma e decide o que entra é a API
// (api/app/financeiro/importacao.py); aqui fica só o que a tela precisa:
// ler o arquivo, conferir o formulário, montar o mapeamento das colunas que
// a pessoa indicou e resumir a resposta.

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
// tela é o seletor de arquivo. Os do mapeamento ("mapeamento.valor") ficam
// com o nome da informação ("valor"), que é como a tela de colunas os mostra.
export function errosDaImportacao(campos = {}) {
  return Object.fromEntries(
    Object.entries(campos).map(([campo, mensagem]) => [campo === 'csv' ? 'arquivo' : campo.replace(/^mapeamento\./, ''), mensagem]),
  );
}

// ------------------------------------------------ Colunas do arquivo

// O que cada coluna do arquivo pode ser. "Ignorar" (valor vazio) é o padrão.
export const PAPEIS_DAS_COLUNAS = [
  { valor: '', rotulo: 'Ignorar' },
  { valor: 'data', rotulo: 'Data' },
  { valor: 'descricao', rotulo: 'Descrição' },
  { valor: 'valor', rotulo: 'Valor', descricao: 'Com sinal: saída negativa' },
  { valor: 'credito', rotulo: 'Entrada', descricao: 'Coluna só de créditos' },
  { valor: 'debito', rotulo: 'Saída', descricao: 'Coluna só de débitos' },
  { valor: 'tipo', rotulo: 'D/C', descricao: 'Diz se é débito ou crédito' },
  { valor: 'categoria', rotulo: 'Categoria' },
];

const PAPEIS = PAPEIS_DAS_COLUNAS.map((papel) => papel.valor).filter(Boolean);
const ROTULO_DO_PAPEL = Object.fromEntries(PAPEIS_DAS_COLUNAS.map((papel) => [papel.valor, papel.rotulo]));

export const SEPARADORES = [
  { valor: ';', rotulo: 'Ponto e vírgula (;)' },
  { valor: ',', rotulo: 'Vírgula (,)' },
  { valor: '\t', rotulo: 'Tabulação' },
  { valor: '|', rotulo: 'Barra vertical (|)' },
];

// Quantas colunas a amostra tem (a linha mais larga manda).
export function quantidadeDeColunas(linhas) {
  return linhas.reduce((maior, linha) => Math.max(maior, linha.celulas.length), 0);
}

// Nome de cada coluna: o texto da linha do cabeçalho ou "Coluna N".
export function nomesDasColunas(linhas, cabecalho) {
  const doCabecalho = linhas.find((linha) => linha.numero === cabecalho)?.celulas ?? [];
  return Array.from({ length: quantidadeDeColunas(linhas) }, (_, indice) => doCabecalho[indice]?.trim() || `Coluna ${indice + 1}`);
}

// As linhas da amostra que viram lançamento (as que vêm depois do cabeçalho).
export const linhasDeDados = (linhas, cabecalho) => linhas.filter((linha) => linha.numero > cabecalho);

const PARECE_DATA = /^\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})/;

// Palpite da linha do cabeçalho quando a API não reconheceu as colunas: se a
// primeira linha já tem uma data, o arquivo não tem cabeçalho (0); senão, a
// primeira linha é o cabeçalho. A pessoa confere e troca na tela.
export function cabecalhoProvavel(linhas) {
  const primeira = linhas[0];
  if (!primeira || primeira.celulas.some((celula) => PARECE_DATA.test(celula))) {
    return 0;
  }
  return primeira.numero;
}

// { coluna: papel } a partir do mapeamento da API (para preencher a tela).
export function papeisDoMapeamento(mapeamento) {
  if (!mapeamento) {
    return {};
  }
  return Object.fromEntries(PAPEIS.filter((papel) => mapeamento[papel] != null).map((papel) => [mapeamento[papel], papel]));
}

// Troca o papel de uma coluna. Cada papel vale para uma coluna só: escolher
// "Data" numa coluna tira a "Data" de onde estava.
export function trocarPapel(papeis, coluna, papel) {
  const novos = Object.fromEntries(Object.entries(papeis).filter(([indice, atual]) => Number(indice) !== coluna && atual !== papel));
  if (papel) {
    novos[coluna] = papel;
  }
  return novos;
}

// Mapeamento no formato da API a partir dos papéis escolhidos na tela.
export function mapeamentoDosPapeis(papeis, { delimitador, cabecalho, inverter_sinal = false }) {
  const mapeamento = { delimitador, cabecalho, inverter_sinal };
  for (const [coluna, papel] of Object.entries(papeis)) {
    mapeamento[papel] = Number(coluna);
  }
  return mapeamento;
}

// Mesmas regras de importacao.conferir_mapeamento na API, com a mensagem no
// papel que falta ou sobra. Vazio = dá para conferir o arquivo.
export function validarMapeamento(mapeamento) {
  const erros = {};
  const tem = (papel) => mapeamento[papel] != null;
  if (!tem('data')) {
    erros.data = 'Indique a coluna da data.';
  }
  if (!tem('descricao')) {
    erros.descricao = 'Indique a coluna da descrição.';
  }
  const separadas = tem('credito') || tem('debito');
  if (!tem('valor') && !separadas) {
    erros.valor = 'Indique a coluna do valor, ou as de entrada e saída.';
  } else if (tem('valor') && separadas) {
    erros.valor = 'Use a coluna do valor ou as de entrada e saída, não as duas.';
  }
  if (tem('tipo') && !tem('valor')) {
    erros.tipo = 'A coluna D/C acompanha a coluna do valor.';
  }
  return erros;
}

// "Data: Data · Descrição: Histórico · Valor: Valor (R$)": o formato
// reconhecido, com o nome de cada coluna no arquivo.
export function descreverMapeamento(mapeamento, nomes) {
  const partes = PAPEIS.filter((papel) => mapeamento[papel] != null).map(
    (papel) => `${ROTULO_DO_PAPEL[papel]}: ${nomes[mapeamento[papel]] ?? `Coluna ${mapeamento[papel] + 1}`}`,
  );
  if (mapeamento.inverter_sinal) {
    partes.push('sinal invertido');
  }
  return partes.join(' · ');
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
