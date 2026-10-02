import { describe, expect, it } from 'vitest';
import { proximaCompra, proximoLancamento, SEQUENCIA_VAZIA, somarNaSequencia, textoDaSequencia } from './lancamentoEmSequencia';

describe('lançamentos em sequência', () => {
  it('limpa o que é de cada gasto e mantém o que se repete', () => {
    const formulario = {
      tipo: 'DESPESA',
      descricao: 'Padaria',
      valor: '23,50',
      data: '2026-10-02',
      conta_id: 'c1',
      categoria_id: 'mercado',
      responsavel: 'Léo',
      divisao: [{ pessoa: 'Ana', valor: '10,00' }],
      dividido_entre: '2',
      meio: 'DEBITO',
    };
    expect(proximoLancamento(formulario)).toEqual({
      ...formulario,
      descricao: '',
      valor: '',
      divisao: [],
      dividido_entre: '',
    });
  });

  it('a compra seguinte volta para à vista', () => {
    const compra = { descricao: 'TV', valor: '1.200,00', parcelas: '10', data: '2026-10-02', categoria_id: 'lazer', divisao: [], dividido_entre: '' };
    expect(proximaCompra(compra)).toMatchObject({ descricao: '', valor: '', parcelas: '1', data: '2026-10-02', categoria_id: 'lazer' });
  });

  it('conta a sequência e escreve o resumo', () => {
    expect(textoDaSequencia(SEQUENCIA_VAZIA)).toBe('');
    const uma = somarNaSequencia(SEQUENCIA_VAZIA, 'Padaria', 2350);
    const duas = somarNaSequencia(uma, 'Feira', 4000);
    expect(textoDaSequencia(uma)).toBe('1 lançamento nesta sequência · R$ 23,50 · último: Padaria');
    expect(textoDaSequencia(duas, ['compra', 'compras'])).toBe('2 compras nesta sequência · R$ 63,50 · último: Feira');
  });
});
