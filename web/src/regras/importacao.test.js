// Testes das regras da importação do extrato na tela: funções puras, sem
// Firebase, sem API e sem navegador. Dados fictícios.
import { describe, expect, it } from 'vitest';
import {
  categoriaSugerida,
  dataMaisRecente,
  decodificarExtrato,
  errosDaImportacao,
  resumoDaImportacao,
  TAMANHO_MAXIMO_DO_ARQUIVO,
  validarImportacao,
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
