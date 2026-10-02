// Regras da importação do extrato (CSV) na tela. Quem lê as linhas, calcula
// a chave de cada uma, reconhece as colunas e escolhe a categoria é a API
// (api/app/financeiro/importacao.py, reconhecimento.py e categorizacao.py);
// aqui fica só o que a tela precisa: conferir o formulário, montar o
// mapeamento das colunas que a pessoa indicou, guardar o que ela editou na
// conferência e resumir a resposta. O arquivo em si é conferido em
// arquivoDoExtrato.ts.

import { conferirArquivo, type ArquivoEscolhido } from './arquivoDoExtrato';

export const ORDEM_DA_IMPORTACAO = ['arquivo', 'conta_id', 'categoria_despesa_id', 'categoria_receita_id'];

type Erros = Record<string, string>;

export interface Categoria {
  id: string;
  nome: string;
  tipo: 'DESPESA' | 'RECEITA';
  ativa: boolean;
  cor?: string;
}

export interface Destino {
  arquivo?: ArquivoEscolhido | null;
  conta_id?: string;
  categoria_despesa_id?: string;
  categoria_receita_id?: string;
}

export function validarImportacao({ arquivo, conta_id, categoria_despesa_id, categoria_receita_id }: Destino): Erros {
  const erros: Erros = {};
  const doArquivo = conferirArquivo(arquivo);
  if (doArquivo) {
    erros.arquivo = doArquivo;
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
// com o nome da informação ("valor"), que é como a tela de colunas os mostra,
// e os de uma linha editada ("ajustes.12.categoria_id"), como "linha-12".
export function errosDaImportacao(campos: Erros = {}): Erros {
  return Object.fromEntries(
    Object.entries(campos).map(([campo, mensagem]) => {
      if (campo === 'csv') {
        return ['arquivo', mensagem];
      }
      const ajuste = /^ajustes\.(\d+)\./.exec(campo);
      return [ajuste ? `linha-${ajuste[1]}` : campo.replace(/^mapeamento\./, ''), mensagem];
    }),
  );
}

// ------------------------------------------------ Colunas do arquivo

export type Papel = 'data' | 'descricao' | 'valor' | 'credito' | 'debito' | 'tipo' | 'categoria';

// O que cada coluna do arquivo pode ser. "Ignorar" (valor vazio) é o padrão.
export const PAPEIS_DAS_COLUNAS: { valor: Papel | ''; rotulo: string; descricao?: string }[] = [
  { valor: '', rotulo: 'Ignorar' },
  { valor: 'data', rotulo: 'Data' },
  { valor: 'descricao', rotulo: 'Descrição' },
  { valor: 'valor', rotulo: 'Valor', descricao: 'Com sinal: saída negativa' },
  { valor: 'credito', rotulo: 'Entrada', descricao: 'Coluna só de créditos' },
  { valor: 'debito', rotulo: 'Saída', descricao: 'Coluna só de débitos' },
  { valor: 'tipo', rotulo: 'D/C', descricao: 'Diz se é débito ou crédito' },
  { valor: 'categoria', rotulo: 'Categoria' },
];

const PAPEIS = PAPEIS_DAS_COLUNAS.map((papel) => papel.valor).filter((valor): valor is Papel => Boolean(valor));
export const ROTULO_DO_PAPEL = Object.fromEntries(PAPEIS_DAS_COLUNAS.map((papel) => [papel.valor, papel.rotulo])) as Record<
  Papel,
  string
>;

export const SEPARADORES = [
  { valor: ';', rotulo: 'Ponto e vírgula (;)' },
  { valor: ',', rotulo: 'Vírgula (,)' },
  { valor: '\t', rotulo: 'Tabulação' },
  { valor: '|', rotulo: 'Barra vertical (|)' },
];

export interface LinhaDoArquivo {
  numero: number;
  celulas: string[];
}

export interface Mapeamento extends Partial<Record<Papel, number | null>> {
  delimitador: string;
  cabecalho: number;
  inverter_sinal?: boolean;
}

// Quantas colunas a amostra tem (a linha mais larga manda).
export function quantidadeDeColunas(linhas: LinhaDoArquivo[]): number {
  return linhas.reduce((maior, linha) => Math.max(maior, linha.celulas.length), 0);
}

// Nome de cada coluna: o texto da linha do cabeçalho ou "Coluna N".
export function nomesDasColunas(linhas: LinhaDoArquivo[], cabecalho: number): string[] {
  const doCabecalho = linhas.find((linha) => linha.numero === cabecalho)?.celulas ?? [];
  return Array.from({ length: quantidadeDeColunas(linhas) }, (_, indice) => doCabecalho[indice]?.trim() || `Coluna ${indice + 1}`);
}

// As linhas da amostra que viram lançamento (as que vêm depois do cabeçalho).
export const linhasDeDados = (linhas: LinhaDoArquivo[], cabecalho: number) => linhas.filter((linha) => linha.numero > cabecalho);

const PARECE_DATA = /^\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{4}-\d{2}-\d{2})/;

// Palpite da linha do cabeçalho quando a API não reconheceu as colunas: se a
// primeira linha já tem uma data, o arquivo não tem cabeçalho (0); senão, a
// primeira linha é o cabeçalho. A pessoa confere e troca na tela.
export function cabecalhoProvavel(linhas: LinhaDoArquivo[]): number {
  const primeira = linhas[0];
  if (!primeira || primeira.celulas.some((celula) => PARECE_DATA.test(celula))) {
    return 0;
  }
  return primeira.numero;
}

export type Papeis = Record<number, Papel>;

// { coluna: papel } a partir do mapeamento da API (para preencher a tela).
export function papeisDoMapeamento(mapeamento: Mapeamento | null | undefined): Papeis {
  if (!mapeamento) {
    return {};
  }
  return Object.fromEntries(PAPEIS.filter((papel) => mapeamento[papel] != null).map((papel) => [mapeamento[papel], papel]));
}

// Troca o papel de uma coluna. Cada papel vale para uma coluna só: escolher
// "Data" numa coluna tira a "Data" de onde estava.
export function trocarPapel(papeis: Papeis, coluna: number, papel: Papel | ''): Papeis {
  const novos: Papeis = Object.fromEntries(
    Object.entries(papeis).filter(([indice, atual]) => Number(indice) !== coluna && atual !== papel),
  );
  if (papel) {
    novos[coluna] = papel;
  }
  return novos;
}

// Mapeamento no formato da API a partir dos papéis escolhidos na tela.
export function mapeamentoDosPapeis(
  papeis: Papeis,
  { delimitador, cabecalho, inverter_sinal = false }: { delimitador: string; cabecalho: number; inverter_sinal?: boolean },
): Mapeamento {
  const mapeamento: Mapeamento = { delimitador, cabecalho, inverter_sinal };
  for (const [coluna, papel] of Object.entries(papeis)) {
    mapeamento[papel] = Number(coluna);
  }
  return mapeamento;
}

// Mesmas regras de importacao.conferir_mapeamento na API, com a mensagem no
// papel que falta ou sobra. Vazio = dá para conferir o arquivo.
export function validarMapeamento(mapeamento: Mapeamento): Erros {
  const erros: Erros = {};
  const tem = (papel: Papel) => mapeamento[papel] != null;
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
export function descreverMapeamento(mapeamento: Mapeamento, nomes: string[]): string {
  const partes = PAPEIS.filter((papel) => mapeamento[papel] != null).map((papel) => {
    const coluna = mapeamento[papel] as number;
    return `${ROTULO_DO_PAPEL[papel]}: ${nomes[coluna] ?? `Coluna ${coluna + 1}`}`;
  });
  if (mapeamento.inverter_sinal) {
    partes.push('sinal invertido');
  }
  return partes.join(' · ');
}

// De onde vieram as colunas (EstruturaResposta.origem da API).
export const ROTULO_DA_ORIGEM_DAS_COLUNAS: Record<string, string> = {
  CABECALHO: 'Reconhecidas pelo cabeçalho',
  CONTEUDO: 'Reconhecidas pelo conteúdo',
  PESSOA: 'Indicadas por você',
  // O leitor do banco (regras/extratos) já tirou data, descrição e valor.
  LEITOR: 'Lido por',
};

// "Confira a data e o valor": as informações em dúvida, na ordem da tela.
export function textoDasDuvidas(duvidas: string[] = []): string {
  const rotulos = PAPEIS.filter((papel) => duvidas.includes(papel)).map((papel) => ROTULO_DO_PAPEL[papel].toLowerCase());
  if (rotulos.length === 0) {
    return '';
  }
  const lista = rotulos.length === 1 ? rotulos[0] : `${rotulos.slice(0, -1).join(', ')} e ${rotulos.at(-1)}`;
  return `Confira ${rotulos.length === 1 ? 'a coluna' : 'as colunas'} de ${lista}: o arquivo deixou dúvida.`;
}

// ------------------------------------------------ Categorias

// Sugestão para o extrato não exigir escolha: "Outras despesas" e "Outras
// receitas" (categorias iniciais) se estiverem ativas; senão, a primeira ativa.
const PREFERIDA = { DESPESA: 'Outras despesas', RECEITA: 'Outras receitas' };

export function categoriaSugerida(categorias: Categoria[], tipo: Categoria['tipo']): string {
  const doTipo = categorias.filter((categoria) => categoria.ativa && categoria.tipo === tipo);
  return (doTipo.find((categoria) => categoria.nome === PREFERIDA[tipo]) ?? doTipo[0])?.id ?? '';
}

// Opções do seletor de categoria de um tipo (ativas).
export const opcoesDaCategoria = (categorias: Categoria[], tipo: Categoria['tipo']) =>
  categorias
    .filter((categoria) => categoria.ativa && categoria.tipo === tipo)
    .map((categoria) => ({ valor: categoria.id, rotulo: categoria.nome, cor: categoria.cor }));

// De onde veio a categoria da linha (LinhaImportadaResposta.origem_da_categoria).
export const ROTULO_DA_ORIGEM_DA_CATEGORIA: Record<string, string> = {
  ARQUIVO: 'do arquivo',
  HISTORICO: 'como antes',
  REGRA: 'pela descrição',
  PADRAO: 'padrão',
  AJUSTE: 'escolhida por você',
};

// ------------------------------------------------ Conferência

export type Situacao = 'NOVA' | 'IMPORTADA' | 'JA_IMPORTADA' | 'INVALIDA';

export const ROTULO_DA_SITUACAO: Record<Situacao, string> = {
  NOVA: 'Nova',
  IMPORTADA: 'Importada',
  JA_IMPORTADA: 'Já importada',
  INVALIDA: 'Com erro',
};

export interface LinhaDaResposta {
  linha: number;
  situacao: Situacao;
  data: string | null;
  descricao: string | null;
  valor_centavos: number | null;
  categoria_id: string | null;
  fatura?: string | null;
  erro?: string | null;
  observacao?: string | null;
  origem_da_categoria?: string | null;
}

export interface Ajuste {
  descricao?: string;
  categoria_id?: string;
}

export type Ajustes = Record<number, Ajuste>;

// Só a linha nova entra: é a única que a pessoa edita na conferência.
export const editavel = (linha: LinhaDaResposta) => linha.situacao === 'NOVA';

export const tipoDaLinha = (linha: LinhaDaResposta): Categoria['tipo'] => ((linha.valor_centavos ?? 0) > 0 ? 'RECEITA' : 'DESPESA');

// Guarda o que a pessoa mudou numa linha. Voltar ao que a API sugeriu tira o
// ajuste, para o pedido levar só o que mudou de verdade.
export function ajustar(ajustes: Ajustes, linha: LinhaDaResposta, campo: keyof Ajuste, valor: string): Ajustes {
  const original = campo === 'descricao' ? (linha.descricao ?? '') : (linha.categoria_id ?? '');
  const atual: Ajuste = { ...ajustes[linha.linha] };
  if (valor === original) {
    delete atual[campo];
  } else {
    atual[campo] = valor;
  }
  const novos = { ...ajustes };
  if (Object.keys(atual).length === 0) {
    delete novos[linha.linha];
  } else {
    novos[linha.linha] = atual;
  }
  return novos;
}

// Descrição e categoria que a linha tem na tela (a editada, ou a da API).
export function valoresDaLinha(linha: LinhaDaResposta, ajustes: Ajustes): { descricao: string; categoria_id: string } {
  const ajuste = ajustes[linha.linha] ?? {};
  return {
    descricao: ajuste.descricao ?? linha.descricao ?? '',
    categoria_id: ajuste.categoria_id ?? linha.categoria_id ?? '',
  };
}

// Erro de uma descrição editada (vazia ou longa demais), por linha.
export const TAMANHO_MAXIMO_DA_DESCRICAO = 120;

export function validarAjustes(ajustes: Ajustes): Erros {
  const erros: Erros = {};
  for (const [linha, ajuste] of Object.entries(ajustes)) {
    if (ajuste.descricao === undefined) {
      continue;
    }
    const texto = ajuste.descricao.trim();
    if (!texto) {
      erros[`linha-${linha}`] = 'A descrição não pode ficar vazia.';
    } else if (texto.length > TAMANHO_MAXIMO_DA_DESCRICAO) {
      erros[`linha-${linha}`] = `Use até ${TAMANHO_MAXIMO_DA_DESCRICAO} caracteres.`;
    }
  }
  return erros;
}

// Ajustes no formato da API (a chave é o número da linha, como texto no JSON).
export function ajustesParaAApi(ajustes: Ajustes): Record<string, Ajuste> {
  return Object.fromEntries(
    Object.entries(ajustes).map(([linha, ajuste]) => [
      linha,
      { ...ajuste, ...(ajuste.descricao !== undefined ? { descricao: ajuste.descricao.trim() } : {}) },
    ]),
  );
}

// ------------------------------------------------ Resumo

const contar = (quantidade: number, singular: string, plural: string) => `${quantidade} ${quantidade === 1 ? singular : plural}`;

interface RespostaDaImportacao {
  simulacao: boolean;
  novas: number;
  importadas: number;
  ja_importadas: number;
  invalidas: number;
  parcelas_futuras?: number;
  linhas?: LinhaDaResposta[];
}

// "12 lançamentos novos · 3 já importados · 1 linha com erro · 11 parcelas
// futuras" (as vincendas das compras parceladas da fatura de um cartão).
export function resumoDaImportacao({
  simulacao,
  novas,
  importadas,
  ja_importadas: jaImportadas,
  invalidas,
  parcelas_futuras: futuras,
}: RespostaDaImportacao): string {
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
  if (futuras) {
    partes.push(contar(futuras, 'parcela futura', 'parcelas futuras'));
  }
  return partes.join(' · ');
}

// Quantas linhas novas vão com a categoria sugerida pela descrição, pelo
// histórico ou pelo arquivo (e não a padrão): "8 de 12 com categoria
// reconhecida".
export function categoriasReconhecidas(linhas: LinhaDaResposta[] = []): { reconhecidas: number; novas: number } {
  const novas = linhas.filter(editavel);
  const reconhecidas = novas.filter((linha) => linha.origem_da_categoria && linha.origem_da_categoria !== 'PADRAO').length;
  return { reconhecidas, novas: novas.length };
}

// Data (ISO) da linha mais recente numa situação (a importada, por padrão).
// null quando não há nenhuma.
export function dataMaisRecente(linhas: LinhaDaResposta[] = [], situacao: Situacao = 'IMPORTADA'): string | null {
  return linhas
    .filter((linha) => linha.situacao === situacao && linha.data)
    .reduce<string | null>((maior, linha) => (maior === null || (linha.data as string) > maior ? (linha.data as string) : maior), null);
}

// Onde o que foi importado está, como 'AAAA-MM', para a tela abrir lá e não
// parecer que a importação falhou: na fatura de um cartão, a fatura com mais
// linhas; no extrato de uma conta, o mês do lançamento mais recente. Vale o
// que entrou; sem nada novo, o que já estava lá (o arquivo já importado).
// null quando nenhuma linha tem destino (todas com erro).
export function destinoDaImportacao(linhas: LinhaDaResposta[] = []): string | null {
  const situacao: Situacao = linhas.some((linha) => linha.situacao === 'IMPORTADA') ? 'IMPORTADA' : 'JA_IMPORTADA';
  const alvo = linhas.filter((linha) => linha.situacao === situacao);
  if (alvo.length === 0) {
    return null;
  }
  const faturas = new Map<string, number>();
  for (const { fatura } of alvo) {
    if (fatura) {
      faturas.set(fatura, (faturas.get(fatura) ?? 0) + 1);
    }
  }
  if (faturas.size > 0) {
    // A mais cheia; no empate, a mais recente.
    return [...faturas].sort(([a, quantasA], [b, quantasB]) => quantasB - quantasA || b.localeCompare(a))[0]?.[0] ?? null;
  }
  return dataMaisRecente(alvo, situacao)?.slice(0, 7) ?? null;
}
