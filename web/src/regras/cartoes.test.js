// Testes das regras do cartão de crédito na tela: funções puras, sem API.
import { describe, expect, it } from 'vitest';
import {
  corpoDaCompra,
  corpoDoPagamento,
  faturasAVencer,
  mesDaReferencia,
  referenciaDoMes,
  situacaoDoLimite,
  textoDasParcelas,
  textoDoVencimento,
  ultimoDiaDaFatura,
  usoDoLimite,
  validarCompra,
  validarPagamento,
  valorSugeridoDoPagamento,
} from './cartoes';

// Painel de um cartão como a API devolve, com dados fictícios.
const CARTAO = {
  id: 'v1',
  nome: 'Cartão Roxo',
  limite_centavos: 500000,
  usado_centavos: 125000,
  disponivel_centavos: 375000,
  fatura_atual_centavos: 25000,
  a_pagar_centavos: 60000,
  parcelamentos_futuros_centavos: 40000,
  ultima_fechada: { referencia: '2026-09', vencimento: '2026-09-10' },
};

describe('referência da fatura', () => {
  it('vai e volta entre o texto AAAA-MM e o mês', () => {
    expect(referenciaDoMes({ ano: 2026, mes: 3 })).toBe('2026-03');
    expect(mesDaReferencia('2027-12')).toEqual({ ano: 2027, mes: 12 });
  });
});

describe('ultimoDiaDaFatura', () => {
  it('é a véspera do fechamento, inclusive na virada do mês e do ano', () => {
    expect(ultimoDiaDaFatura('2026-10-03')).toBe('2026-10-02');
    expect(ultimoDiaDaFatura('2026-03-01')).toBe('2026-02-28');
    expect(ultimoDiaDaFatura('2027-01-01')).toBe('2026-12-31');
  });
});

describe('uso e situação do limite', () => {
  it('mede o uso em porcentagem, sem passar de 100', () => {
    expect(usoDoLimite(CARTAO)).toBe(25);
    expect(usoDoLimite({ limite_centavos: 1000, usado_centavos: 1500 })).toBe(100);
    expect(usoDoLimite({ limite_centavos: 1000, usado_centavos: -200 })).toBe(0);
  });

  it('avisa quando o limite está no fim, esgotado ou ultrapassado', () => {
    expect(situacaoDoLimite(CARTAO).nivel).toBe('normal');
    expect(situacaoDoLimite({ limite_centavos: 1000, usado_centavos: 850, disponivel_centavos: 150 })).toEqual({
      nivel: 'atencao',
      rotulo: 'Limite quase no fim',
    });
    expect(situacaoDoLimite({ limite_centavos: 1000, usado_centavos: 1000, disponivel_centavos: 0 }).rotulo).toBe('Limite esgotado');
    expect(situacaoDoLimite({ limite_centavos: 1000, usado_centavos: 1200, disponivel_centavos: -200 }).rotulo).toBe('Acima do limite');
  });
});

describe('textoDasParcelas', () => {
  it('mostra as parcelas iguais ou a primeira com o centavo que sobra', () => {
    expect(textoDasParcelas(30000, 3)).toBe('3x de R$ 100,00');
    expect(textoDasParcelas(1000, 3)).toBe('1x de R$ 3,34 + 2x de R$ 3,33');
    expect(textoDasParcelas(5000, 1)).toBe('À vista, R$ 50,00');
    expect(textoDasParcelas(null, 3)).toBe('');
  });
});

describe('compra no cartão', () => {
  const compra = { descricao: 'Geladeira', valor: '3.000,00', data: '2026-09-20', categoria_id: 'k1', parcelas: '10', divisao: [] };

  it('aceita a compra completa e manda o total em centavos com as parcelas', () => {
    expect(validarCompra(compra)).toEqual({});
    expect(corpoDaCompra(compra)).toEqual({
      descricao: 'Geladeira', data: '2026-09-20', valor_centavos: 300000, categoria_id: 'k1', parcelas: 10,
    });
  });

  it('aponta cada campo que falta', () => {
    expect(Object.keys(validarCompra({ descricao: '', valor: '', data: '', categoria_id: '', parcelas: '1' }))).toEqual([
      'descricao', 'valor', 'data', 'categoria_id',
    ]);
  });

  it('recusa mais parcelas que centavos', () => {
    expect(validarCompra({ ...compra, valor: '0,05', parcelas: '10' }).valor).toMatch(/um centavo/);
  });

  it('manda a divisão só na compra à vista', () => {
    const divisao = [{ pessoa: 'Ana', valor: '100,00' }];
    expect(corpoDaCompra({ ...compra, parcelas: '1', divisao }).divisao).toEqual([{ pessoa: 'Ana', valor_centavos: 10000 }]);
    expect(corpoDaCompra({ ...compra, divisao }).divisao).toBeUndefined();
  });
});

describe('pagamento da fatura', () => {
  it('sugere o que há a pagar das faturas fechadas e, sem ele, a fatura atual', () => {
    expect(valorSugeridoDoPagamento(CARTAO)).toBe('600,00');
    expect(valorSugeridoDoPagamento({ ...CARTAO, a_pagar_centavos: 0 })).toBe('250,00');
    expect(valorSugeridoDoPagamento({ ...CARTAO, a_pagar_centavos: 0, fatura_atual_centavos: 0 })).toBe('');
  });

  it('confere conta, valor e data, e monta o corpo', () => {
    expect(Object.keys(validarPagamento({ conta_id: '', valor: '', data: '' }))).toEqual(['conta_id', 'valor', 'data']);
    expect(corpoDoPagamento({ conta_id: 'c1', valor: '600,00', data: '2026-09-08' })).toEqual({
      conta_id: 'c1', valor_centavos: 60000, data: '2026-09-08',
    });
  });
});

describe('textoDoVencimento', () => {
  it('fala no passado quando o vencimento já passou', () => {
    expect(textoDoVencimento('2026-09-10', '2026-09-25')).toBe('venceu em 10/09/2026');
    expect(textoDoVencimento('2026-10-10', '2026-09-25')).toBe('vence em 10/10/2026');
    expect(textoDoVencimento('2026-09-25', '2026-09-25')).toBe('vence em 25/09/2026');
  });
});

describe('faturasAVencer', () => {
  it('lista as faturas com valor a pagar, a que vence antes primeiro, e marca a vencida', () => {
    const outro = { ...CARTAO, id: 'v2', nome: 'Visa', ultima_fechada: { vencimento: '2026-09-05' } };
    const pago = { ...CARTAO, id: 'v3', a_pagar_centavos: 0 };

    expect(faturasAVencer([CARTAO, outro, pago], '2026-09-08')).toEqual([
      { id: 'v2', descricao: 'Fatura Visa', data: '2026-09-05', valor: 60000, vencida: true },
      { id: 'v1', descricao: 'Fatura Cartão Roxo', data: '2026-09-10', valor: 60000, vencida: false },
    ]);
  });
});
