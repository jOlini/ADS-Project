// Testes da conferência do arquivo do extrato antes de ir à API.
import { describe, expect, it } from 'vitest';
import { conferirArquivo, conferirConteudo, decodificarExtrato, TAMANHO_MAXIMO_DO_ARQUIVO } from './arquivoDoExtrato';

const csv = (extras = {}) => ({ name: 'extrato.csv', type: 'text/csv', size: 1200, ...extras });
const bytes = (...valores: number[]) => new Uint8Array(valores);

describe('conferirArquivo', () => {
  it('aceita o CSV, inclusive com o tipo que o Windows e o Excel dão', () => {
    expect(conferirArquivo(csv())).toBe('');
    expect(conferirArquivo(csv({ type: 'application/vnd.ms-excel' }))).toBe('');
    expect(conferirArquivo(csv({ type: '' }))).toBe('');
    expect(conferirArquivo(csv({ name: 'EXTRATO.TXT', type: 'text/plain' }))).toBe('');
  });

  it('recusa outra extensão ou outro tipo', () => {
    expect(conferirArquivo(csv({ name: 'extrato.xlsx' }))).toMatch(/\.csv/);
    expect(conferirArquivo(csv({ name: 'extrato.pdf', type: 'application/pdf' }))).toMatch(/\.csv/);
    // Nome certo, conteúdo declarado errado.
    expect(conferirArquivo(csv({ type: 'image/png' }))).toMatch(/\.csv/);
  });

  it('recusa vazio, grande demais e nenhum arquivo', () => {
    expect(conferirArquivo(null)).toBe('Escolha o arquivo do extrato.');
    expect(conferirArquivo(csv({ size: 0 }))).toBe('O arquivo está vazio.');
    expect(conferirArquivo(csv({ size: TAMANHO_MAXIMO_DO_ARQUIVO + 1 }))).toMatch(/grande demais/);
  });
});

describe('conferirConteudo', () => {
  it('reconhece planilha, PDF e imagem renomeados para .csv', () => {
    expect(conferirConteudo(bytes(0x50, 0x4b, 0x03, 0x04, 0x14))).toMatch(/Excel \(\.xlsx\)/);
    expect(conferirConteudo(bytes(0xd0, 0xcf, 0x11, 0xe0))).toMatch(/Excel \(\.xls\)/);
    expect(conferirConteudo(new TextEncoder().encode('%PDF-1.7'))).toMatch(/PDF/);
    expect(conferirConteudo(bytes(0x89, 0x50, 0x4e, 0x47))).toMatch(/imagem/);
  });

  it('recusa binário e aceita texto', () => {
    expect(conferirConteudo(bytes(0x44, 0x61, 0x00, 0x74))).toMatch(/não é um texto CSV/);
    expect(conferirConteudo(new TextEncoder().encode('Data;Descrição;Valor\r\n01/09/2026;Café;-5,00\n'))).toBe('');
  });

  it('aceita texto em UTF-16 (o "Unicode" do Excel)', () => {
    expect(conferirConteudo(bytes(0xff, 0xfe, 0x44, 0x00, 0x61, 0x00))).toBe('');
  });
});

describe('decodificarExtrato', () => {
  it('lê UTF-8', () => {
    expect(decodificarExtrato(new TextEncoder().encode('Data;Descrição;Valor'))).toBe('Data;Descrição;Valor');
  });

  it('lê Windows-1252 quando o arquivo não é UTF-8 (CSV "ANSI" do Excel)', () => {
    // "Descrição" em Windows-1252: ç = 0xE7, ã = 0xE3.
    expect(decodificarExtrato(bytes(0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f))).toBe('Descrição');
  });

  it('lê UTF-16 com BOM', () => {
    // "Dá" em UTF-16 LE com BOM.
    expect(decodificarExtrato(bytes(0xff, 0xfe, 0x44, 0x00, 0xe1, 0x00))).toBe('Dá');
  });
});
