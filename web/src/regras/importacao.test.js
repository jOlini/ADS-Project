// Testes das regras da importação do extrato na tela: funções puras, sem
// Firebase, sem API e sem navegador. Dados fictícios.
import { describe, expect, it } from 'vitest';
import {
  cabecalhoProvavel,
  categoriaSugerida,
  dataMaisRecente,
  decodificarExtrato,
  descreverMapeamento,
  errosDaImportacao,
  linhasDeDados,
  mapeamentoDosPapeis,
  nomesDasColunas,
  papeisDoMapeamento,
  resumoDaImportacao,
  TAMANHO_MAXIMO_DO_ARQUIVO,
  trocarPapel,
  validarImportacao,
  validarMapeamento,
} from './importacao';

const CATEGORIAS = [
  { id: 'd1', nome: 'Mercado', tipo: 'DESPESA', ativa: true },
  { id: 'd2', nome: 'Outras despesas', tipo: 'DESPESA', ativa: true },
  { id: 'r1', nome: 'Salário', tipo: 'RECEITA', ativa: true },
  { id: 'r2', nome: 'Outras receitas', tipo: 'RECEITA', ativa: false },
];

describe('decodificarExtrato', () => {
  it('lê UTF-8', () => {
    const bytes = new TextEncoder().encode('Data;Descrição;Valor');
    expect(decodificarExtrato(bytes)).toBe('Data;Descrição;Valor');
  });

  it('lê Windows-1252 quando o arquivo não é UTF-8 (CSV "ANSI" do Excel)', () => {
    // "Descrição" em Windows-1252: ç = 0xE7, ã = 0xE3.
    const bytes = new Uint8Array([0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f]);
    expect(decodificarExtrato(bytes)).toBe('Descrição');
  });
});

describe('validarImportacao', () => {
  const completo = { arquivo: { size: 120 }, conta_id: 'c1', categoria_despesa_id: 'd2', categoria_receita_id: 'r1' };

  it('aceita o formulário completo', () => {
    expect(validarImportacao(completo)).toEqual({});
  });

  it('pede o arquivo, a conta e as duas categorias', () => {
    expect(Object.keys(validarImportacao({}))).toEqual(['arquivo', 'conta_id', 'categoria_despesa_id', 'categoria_receita_id']);
  });

  it('recusa arquivo vazio ou maior que o limite da API', () => {
    expect(validarImportacao({ ...completo, arquivo: { size: 0 } }).arquivo).toBe('O arquivo está vazio.');
    expect(validarImportacao({ ...completo, arquivo: { size: TAMANHO_MAXIMO_DO_ARQUIVO + 1 } }).arquivo).toMatch(/grande demais/);
  });
});

describe('errosDaImportacao', () => {
  it('leva o erro do texto do CSV para o seletor de arquivo', () => {
    expect(errosDaImportacao({ csv: 'Sem cabeçalho.', conta_id: 'Conta não encontrada.' })).toEqual({
      arquivo: 'Sem cabeçalho.',
      conta_id: 'Conta não encontrada.',
    });
  });

  it('deixa o erro do mapeamento com o nome da informação', () => {
    expect(errosDaImportacao({ 'mapeamento.valor': 'Indique a coluna do valor.' })).toEqual({ valor: 'Indique a coluna do valor.' });
  });
});

describe('categoriaSugerida', () => {
  it('prefere "Outras despesas" para as saídas', () => {
    expect(categoriaSugerida(CATEGORIAS, 'DESPESA')).toBe('d2');
  });

  it('cai na primeira ativa do tipo quando a preferida está desativada', () => {
    expect(categoriaSugerida(CATEGORIAS, 'RECEITA')).toBe('r1');
  });

  it('fica vazia sem categoria ativa do tipo', () => {
    expect(categoriaSugerida([], 'RECEITA')).toBe('');
  });
});

describe('resumoDaImportacao', () => {
  it('resume a simulação', () => {
    expect(resumoDaImportacao({ simulacao: true, novas: 12, importadas: 0, ja_importadas: 3, invalidas: 1 })).toBe(
      '12 lançamentos novos · 3 já importados · 1 linha com erro',
    );
  });

  it('resume a importação, no singular quando é um só', () => {
    expect(resumoDaImportacao({ simulacao: false, novas: 0, importadas: 1, ja_importadas: 0, invalidas: 0 })).toBe(
      '1 lançamento importado',
    );
  });
});

describe('dataMaisRecente', () => {
  it('acha a data do último lançamento que entrou', () => {
    const linhas = [
      { situacao: 'IMPORTADA', data: '2026-08-30' },
      { situacao: 'JA_IMPORTADA', data: '2026-09-15' },
      { situacao: 'IMPORTADA', data: '2026-09-02' },
      { situacao: 'INVALIDA', data: null },
    ];
    expect(dataMaisRecente(linhas)).toBe('2026-09-02');
  });

  it('devolve null quando nada entrou', () => {
    expect(dataMaisRecente([{ situacao: 'JA_IMPORTADA', data: '2026-09-15' }])).toBeNull();
  });
});

// Começo de um arquivo como a API devolve em /importacoes/estrutura.
const AMOSTRA = [
  { numero: 1, celulas: ['Extrato da conta'] },
  { numero: 3, celulas: ['Data', 'Histórico', 'Valor (R$)', 'D/C'] },
  { numero: 4, celulas: ['01/09/2026', 'Café', '5,00', 'D'] },
];

describe('colunas do arquivo', () => {
  it('dá nome às colunas pelo cabeçalho ou pelo número', () => {
    expect(nomesDasColunas(AMOSTRA, 3)).toEqual(['Data', 'Histórico', 'Valor (R$)', 'D/C']);
    expect(nomesDasColunas(AMOSTRA, 0)).toEqual(['Coluna 1', 'Coluna 2', 'Coluna 3', 'Coluna 4']);
  });

  it('adivinha a linha do cabeçalho pela data na primeira linha', () => {
    expect(cabecalhoProvavel(AMOSTRA)).toBe(1);
    expect(cabecalhoProvavel([{ numero: 1, celulas: ['2026-09-01', 'Feira', '30,00'] }])).toBe(0);
    expect(cabecalhoProvavel([{ numero: 2, celulas: ['5/9/26', 'Pão'] }])).toBe(0);
    expect(cabecalhoProvavel([])).toBe(0);
  });

  it('separa as linhas de dados das de antes do cabeçalho', () => {
    expect(linhasDeDados(AMOSTRA, 3).map((linha) => linha.numero)).toEqual([4]);
    expect(linhasDeDados(AMOSTRA, 0)).toHaveLength(3);
  });

  it('vai e volta entre o mapeamento da API e os papéis das colunas', () => {
    const mapeamento = { delimitador: ';', cabecalho: 3, data: 0, descricao: 1, valor: 2, tipo: 3, credito: null, inverter_sinal: false };
    const papeis = papeisDoMapeamento(mapeamento);

    expect(papeis).toEqual({ 0: 'data', 1: 'descricao', 2: 'valor', 3: 'tipo' });
    expect(mapeamentoDosPapeis(papeis, { delimitador: ';', cabecalho: 3 })).toEqual({
      delimitador: ';', cabecalho: 3, inverter_sinal: false, data: 0, descricao: 1, valor: 2, tipo: 3,
    });
    expect(papeisDoMapeamento(null)).toEqual({});
  });

  it('cada papel fica numa coluna só', () => {
    const papeis = { 0: 'data', 1: 'descricao' };

    expect(trocarPapel(papeis, 2, 'data')).toEqual({ 1: 'descricao', 2: 'data' });
    expect(trocarPapel(papeis, 1, '')).toEqual({ 0: 'data' });
    expect(trocarPapel(papeis, 0, 'valor')).toEqual({ 0: 'valor', 1: 'descricao' });
  });

  it('confere o mapeamento como a API', () => {
    expect(validarMapeamento({ data: 0, descricao: 1, valor: 2 })).toEqual({});
    expect(validarMapeamento({ data: 0, descricao: 1, credito: 2, debito: 3 })).toEqual({});
    expect(validarMapeamento({ tipo: 3 })).toEqual({
      data: 'Indique a coluna da data.',
      descricao: 'Indique a coluna da descrição.',
      valor: 'Indique a coluna do valor, ou as de entrada e saída.',
      tipo: 'A coluna D/C acompanha a coluna do valor.',
    });
    expect(validarMapeamento({ data: 0, descricao: 1, valor: 2, debito: 3 }).valor).toMatch(/não as duas/);
  });

  it('descreve o formato com os nomes do arquivo', () => {
    const mapeamento = { data: 0, descricao: 1, valor: 2, tipo: 3, inverter_sinal: true };

    expect(descreverMapeamento(mapeamento, nomesDasColunas(AMOSTRA, 3))).toBe(
      'Data: Data · Descrição: Histórico · Valor: Valor (R$) · D/C: D/C · sinal invertido',
    );
  });
});
