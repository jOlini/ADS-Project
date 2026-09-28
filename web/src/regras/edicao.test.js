// Testes da edição de lançamento: funções puras, com dados fictícios.
import { describe, expect, it } from 'vitest';
import { camposEditaveis, corpoDaEdicao, formularioDaEdicao, validarEdicao } from './edicao';

const DESPESA = {
  id: 'l1',
  tipo: 'DESPESA',
  descricao: 'Supermercado',
  data: '2026-09-19',
  valor_centavos: 21437,
  categoria_id: 'k1',
  meio: 'PIX',
  divisao: [],
};

const TUDO = camposEditaveis(DESPESA);

describe('camposEditaveis', () => {
  it('despesa da conta muda tudo', () => {
    expect(TUDO).toEqual({ data: true, valor: true, categoria: true, meio: true });
  });

  it('estorno e estornado só mudam descrição e meio', () => {
    expect(camposEditaveis({ ...DESPESA, estornado_por: 'l2' })).toEqual({ data: false, valor: false, categoria: false, meio: true });
    expect(camposEditaveis({ ...DESPESA, estorno_de: 'l0' }).valor).toBe(false);
  });

  it('parcela muda a categoria, mas não data nem valor; no cartão não há meio', () => {
    expect(camposEditaveis({ ...DESPESA, compra_id: 'c1' }, { noCartao: true })).toEqual({
      data: false, valor: false, categoria: true, meio: false,
    });
  });

  it('transferência não tem categoria', () => {
    expect(camposEditaveis({ ...DESPESA, tipo: 'TRANSFERENCIA' }).categoria).toBe(false);
  });
});

describe('validarEdicao e corpoDaEdicao', () => {
  const formulario = formularioDaEdicao(DESPESA);

  it('o formulário começa com o lançamento, e sem mudança o corpo fica vazio', () => {
    expect(formulario).toEqual({ descricao: 'Supermercado', valor: '214,37', data: '2026-09-19', categoria_id: 'k1', meio: 'PIX' });
    expect(validarEdicao(formulario, DESPESA, TUDO)).toEqual({});
    expect(corpoDaEdicao(formulario, DESPESA, TUDO)).toEqual({});
  });

  it('manda só o que mudou, com o meio vazio virando null', () => {
    const mudado = { ...formulario, descricao: ' Mercado do bairro ', valor: '250,00', meio: '' };

    expect(corpoDaEdicao(mudado, DESPESA, TUDO)).toEqual({ descricao: 'Mercado do bairro', valor_centavos: 25000, meio: null });
  });

  it('aponta descrição vazia, valor inválido e data que não existe', () => {
    expect(validarEdicao({ ...formulario, descricao: ' ', valor: 'abc', data: '2026-02-30' }, DESPESA, TUDO)).toEqual({
      descricao: 'Descreva o lançamento.',
      valor: 'Valor inválido. Use o formato 214,37.',
      data: 'Data inválida.',
    });
  });

  it('o novo valor não fica abaixo das partes do racha', () => {
    const comRacha = { ...DESPESA, divisao: [{ pessoa: 'Ana', valor_centavos: 10000 }] };

    expect(validarEdicao({ ...formulario, valor: '99,99' }, comRacha, TUDO)).toEqual({
      valor: 'As partes do racha somam mais que o novo valor.',
    });
  });

  it('campo que não pode mudar não é conferido nem enviado', () => {
    const soNome = camposEditaveis({ ...DESPESA, estornado_por: 'l2' });

    expect(validarEdicao({ ...formulario, valor: 'abc' }, DESPESA, soNome)).toEqual({});
    expect(corpoDaEdicao({ ...formulario, valor: '1,00', data: '2026-01-01' }, DESPESA, soNome)).toEqual({});
  });
});
