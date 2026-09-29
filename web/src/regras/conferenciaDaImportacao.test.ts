// Testes da conferência da importação: o que a pessoa edita em cada linha
// (descrição e categoria) antes de gravar, e os textos que a tela mostra.
import { describe, expect, it } from 'vitest';
import {
  ajustar,
  ajustesParaAApi,
  categoriasReconhecidas,
  editavel,
  errosDaImportacao,
  textoDasDuvidas,
  tipoDaLinha,
  validarAjustes,
  valoresDaLinha,
  type LinhaDaResposta,
} from './importacao';

const linha = (extras: Partial<LinhaDaResposta> = {}): LinhaDaResposta => ({
  linha: 3,
  situacao: 'NOVA',
  data: '2026-09-02',
  descricao: 'UBER *TRIP',
  valor_centavos: -2390,
  categoria_id: 'transporte',
  origem_da_categoria: 'REGRA',
  ...extras,
});

describe('ajustar', () => {
  it('guarda só o que mudou, por linha', () => {
    const ajustes = ajustar({}, linha(), 'categoria_id', 'lazer');
    expect(ajustes).toEqual({ 3: { categoria_id: 'lazer' } });
    expect(ajustar(ajustes, linha(), 'descricao', 'Uber para o trabalho')).toEqual({
      3: { categoria_id: 'lazer', descricao: 'Uber para o trabalho' },
    });
  });

  it('voltar ao que a API sugeriu tira o ajuste', () => {
    const ajustes = ajustar({}, linha(), 'categoria_id', 'lazer');
    expect(ajustar(ajustes, linha(), 'categoria_id', 'transporte')).toEqual({});
  });
});

describe('valoresDaLinha', () => {
  it('mostra o editado ou, sem edição, o que a API mandou', () => {
    expect(valoresDaLinha(linha(), {})).toEqual({ descricao: 'UBER *TRIP', categoria_id: 'transporte' });
    expect(valoresDaLinha(linha(), { 3: { descricao: 'Uber' } })).toEqual({ descricao: 'Uber', categoria_id: 'transporte' });
  });
});

describe('validarAjustes', () => {
  it('não deixa a descrição vazia nem longa demais', () => {
    expect(validarAjustes({ 3: { descricao: '   ' } })).toEqual({ 'linha-3': 'A descrição não pode ficar vazia.' });
    expect(validarAjustes({ 4: { descricao: 'x'.repeat(121) } })).toEqual({ 'linha-4': 'Use até 120 caracteres.' });
    expect(validarAjustes({ 3: { categoria_id: 'lazer' } })).toEqual({});
  });
});

describe('ajustesParaAApi', () => {
  it('manda a descrição sem espaço nas pontas', () => {
    expect(ajustesParaAApi({ 3: { descricao: ' Uber ', categoria_id: 'lazer' } })).toEqual({
      3: { descricao: 'Uber', categoria_id: 'lazer' },
    });
  });
});

describe('linhas da conferência', () => {
  it('só a linha nova é editável', () => {
    expect(editavel(linha())).toBe(true);
    expect(editavel(linha({ situacao: 'JA_IMPORTADA' }))).toBe(false);
    expect(editavel(linha({ situacao: 'INVALIDA' }))).toBe(false);
  });

  it('saída vai em despesa e entrada em receita', () => {
    expect(tipoDaLinha(linha())).toBe('DESPESA');
    expect(tipoDaLinha(linha({ valor_centavos: 500000 }))).toBe('RECEITA');
  });

  it('conta as categorias reconhecidas entre as linhas novas', () => {
    const linhas = [
      linha(),
      linha({ linha: 4, origem_da_categoria: 'PADRAO' }),
      linha({ linha: 5, origem_da_categoria: 'HISTORICO' }),
      linha({ linha: 6, situacao: 'JA_IMPORTADA' }),
    ];
    expect(categoriasReconhecidas(linhas)).toEqual({ reconhecidas: 2, novas: 3 });
  });
});

describe('textoDasDuvidas', () => {
  it('diz o que conferir, na ordem das colunas', () => {
    expect(textoDasDuvidas([])).toBe('');
    expect(textoDasDuvidas(['valor'])).toBe('Confira a coluna de valor: o arquivo deixou dúvida.');
    expect(textoDasDuvidas(['debito', 'credito'])).toBe('Confira as colunas de entrada e saída: o arquivo deixou dúvida.');
  });
});

describe('errosDaImportacao', () => {
  it('leva o erro da categoria de uma linha para a linha', () => {
    expect(errosDaImportacao({ 'ajustes.12.categoria_id': 'Categoria não encontrada ou desativada.' })).toEqual({
      'linha-12': 'Categoria não encontrada ou desativada.',
    });
  });
});
