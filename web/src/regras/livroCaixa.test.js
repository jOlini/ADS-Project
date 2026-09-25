// Testes das regras das telas do livro-caixa: funções puras, sem API.
import { describe, expect, it } from 'vitest';
import {
  corpoDoLancamento,
  errosDaApi,
  estaNoMes,
  intervaloDoMes,
  mesDe,
  mudarMes,
  ordemDoLancamento,
  paraExtrato,
  saldoTotal,
  validarCategoria,
  validarConta,
  validarLancamento,
} from './livroCaixa';

// Respostas da API com dados fictícios.
const CONTAS = [
  { id: 'c1', nome: 'Conta corrente', saldo_centavos: 100000 },
  { id: 'c2', nome: 'Poupança', saldo_centavos: 50000 },
];
const CATEGORIAS = [
  { id: 'k1', nome: 'Mercado', tipo: 'DESPESA', cor: 'mercado' },
  { id: 'k2', nome: 'Salário', tipo: 'RECEITA', cor: 'entrada' },
];

function lancamento(campos) {
  return { estorno_de: null, estornado_por: null, categoria_id: null, conta_destino_id: null, ...campos };
}

describe('paraExtrato', () => {
  it('despesa sai negativa, com o nome da categoria, a cor e a conta', () => {
    const [linha] = paraExtrato(
      [
        lancamento({
          id: 'l1', tipo: 'DESPESA', data: '2026-09-19', descricao: 'Supermercado', valor_centavos: 21437,
          conta_id: 'c1', categoria_id: 'k1',
          partidas: [{ conta_id: 'c1', categoria_id: null, valor_centavos: -21437 }, { conta_id: null, categoria_id: 'k1', valor_centavos: 21437 }],
        }),
      ],
      CONTAS,
      CATEGORIAS,
    );

    expect(linha).toEqual({
      id: 'l1', data: '2026-09-19', descricao: 'Supermercado', tipo: 'despesa', categoria: 'Mercado', cor: 'mercado',
      conta: 'Conta corrente', valor: -21437, pessoas: [], estorno: false, estornado: false,
    });
  });

  it('traz as pessoas do racha com a parte de cada uma', () => {
    const [linha] = paraExtrato(
      [
        lancamento({
          id: 'l4', tipo: 'DESPESA', data: '2026-09-19', descricao: 'Churrasco', valor_centavos: 30000,
          conta_id: 'c1', categoria_id: 'k1',
          partidas: [{ conta_id: 'c1', categoria_id: null, valor_centavos: -30000 }, { conta_id: null, categoria_id: 'k1', valor_centavos: 30000 }],
          divisao: [{ pessoa: 'Ana', valor_centavos: 10000 }, { pessoa: 'Bruno', valor_centavos: 15000 }],
        }),
      ],
      CONTAS,
      CATEGORIAS,
    );

    expect(linha.pessoas).toEqual([{ pessoa: 'Ana', valor: 10000 }, { pessoa: 'Bruno', valor: 15000 }]);
  });

  it('transferência mostra origem → destino e sai da conta de origem', () => {
    const [linha] = paraExtrato(
      [
        lancamento({
          id: 'l2', tipo: 'TRANSFERENCIA', data: '2026-09-10', descricao: 'Para a poupança', valor_centavos: 50000,
          conta_id: 'c1', conta_destino_id: 'c2',
          partidas: [{ conta_id: 'c1', categoria_id: null, valor_centavos: -50000 }, { conta_id: 'c2', categoria_id: null, valor_centavos: 50000 }],
        }),
      ],
      CONTAS,
      CATEGORIAS,
    );

    expect(linha).toMatchObject({ tipo: 'transferencia', categoria: 'Transferência', conta: 'Conta corrente → Poupança', valor: -50000 });
  });

  it('marca o estorno e o lançamento estornado; o estorno volta com o sinal trocado', () => {
    const linhas = paraExtrato(
      [
        lancamento({
          id: 'l3', tipo: 'DESPESA', data: '2026-09-20', descricao: 'Estorno: Supermercado', valor_centavos: 21437,
          conta_id: 'c1', categoria_id: 'k1', estorno_de: 'l1',
          partidas: [{ conta_id: 'c1', categoria_id: null, valor_centavos: 21437 }, { conta_id: null, categoria_id: 'k1', valor_centavos: -21437 }],
        }),
        lancamento({
          id: 'l1', tipo: 'DESPESA', data: '2026-09-19', descricao: 'Supermercado', valor_centavos: 21437,
          conta_id: 'c1', categoria_id: 'k1', estornado_por: 'l3',
          partidas: [{ conta_id: 'c1', categoria_id: null, valor_centavos: -21437 }, { conta_id: null, categoria_id: 'k1', valor_centavos: 21437 }],
        }),
      ],
      CONTAS,
      CATEGORIAS,
    );

    expect(linhas.map(({ valor, estorno, estornado }) => ({ valor, estorno, estornado }))).toEqual([
      { valor: 21437, estorno: true, estornado: false },
      { valor: -21437, estorno: false, estornado: true },
    ]);
  });
});

describe('saldoTotal', () => {
  it('soma o saldo de todas as contas', () => {
    expect(saldoTotal(CONTAS)).toBe(150000);
    expect(saldoTotal([])).toBe(0);
  });
});

describe('meses', () => {
  it('lê o mês de uma data ISO ou de um Date', () => {
    expect(mesDe('2026-09-24')).toEqual({ ano: 2026, mes: 9 });
    expect(mesDe(new Date(2026, 0, 31))).toEqual({ ano: 2026, mes: 1 });
  });

  it('devolve o primeiro e o último dia, inclusive em fevereiro bissexto', () => {
    expect(intervaloDoMes({ ano: 2026, mes: 9 })).toEqual({ de: '2026-09-01', ate: '2026-09-30' });
    expect(intervaloDoMes({ ano: 2028, mes: 2 })).toEqual({ de: '2028-02-01', ate: '2028-02-29' });
  });

  it('anda para trás e para a frente atravessando o ano', () => {
    expect(mudarMes({ ano: 2026, mes: 1 }, -1)).toEqual({ ano: 2025, mes: 12 });
    expect(mudarMes({ ano: 2026, mes: 12 }, 1)).toEqual({ ano: 2027, mes: 1 });
  });

  it('diz se uma data cai no mês', () => {
    expect(estaNoMes('2026-09-30', { ano: 2026, mes: 9 })).toBe(true);
    expect(estaNoMes('2026-10-01', { ano: 2026, mes: 9 })).toBe(false);
  });
});

const DESPESA_VALIDA = {
  tipo: 'DESPESA', descricao: ' Supermercado ', valor: '214,37', data: '2026-09-19', conta_id: 'c1', categoria_id: 'k1', conta_destino_id: '',
};

describe('validarLancamento', () => {
  it('aceita uma despesa completa', () => {
    expect(validarLancamento(DESPESA_VALIDA)).toEqual({});
  });

  it('aponta cada campo que falta', () => {
    expect(validarLancamento({ tipo: 'DESPESA', descricao: ' ', valor: '', data: '', conta_id: '', categoria_id: '' })).toEqual({
      descricao: 'Descreva o lançamento (ex.: Supermercado).',
      valor: 'Informe o valor.',
      data: 'Informe a data.',
      conta_id: 'Escolha a conta.',
      categoria_id: 'Escolha a categoria.',
    });
  });

  it('recusa valor ilegível ou zero', () => {
    expect(validarLancamento({ ...DESPESA_VALIDA, valor: '12,345' }).valor).toBe('Valor inválido. Use o formato 214,37.');
    expect(validarLancamento({ ...DESPESA_VALIDA, valor: '0,00' }).valor).toBe('O valor precisa ser maior que zero.');
  });

  it('confere a divisão junto, contra o valor do lançamento', () => {
    const churrasco = { ...DESPESA_VALIDA, valor: '300,00', divisao: [{ pessoa: 'Ana', valor: '100,00' }, { pessoa: 'Bruno', valor: '250,00' }] };

    expect(validarLancamento(churrasco)).toEqual({ divisao: 'As partes somam R$ 350,00, mais que o valor do lançamento.' });
    expect(validarLancamento({ ...churrasco, divisao: [{ pessoa: '', valor: '100,00' }] })).toEqual({ 'divisao.0.pessoa': 'Informe o nome.' });
    // Transferência ignora a divisão (a tela nem mostra o racha).
    expect(validarLancamento({ ...churrasco, tipo: 'TRANSFERENCIA', categoria_id: '', conta_destino_id: 'c2' })).toEqual({});
  });

  it('põe os campos da divisão no fim da ordem de foco', () => {
    expect(ordemDoLancamento({ divisao: [{ pessoa: '', valor: '' }] }).slice(-3)).toEqual(['divisao.0.pessoa', 'divisao.0.valor', 'divisao']);
  });

  it('transferência pede destino diferente da origem e dispensa categoria', () => {
    const transferencia = { ...DESPESA_VALIDA, tipo: 'TRANSFERENCIA', categoria_id: '' };

    expect(validarLancamento({ ...transferencia, conta_destino_id: 'c2' })).toEqual({});
    expect(validarLancamento({ ...transferencia, conta_destino_id: 'c1' })).toEqual({
      conta_destino_id: 'Escolha uma conta diferente da de origem.',
    });
  });
});

describe('corpoDoLancamento', () => {
  it('converte o valor para centavos e manda só os campos do tipo', () => {
    expect(corpoDoLancamento(DESPESA_VALIDA)).toEqual({
      tipo: 'DESPESA', descricao: 'Supermercado', data: '2026-09-19', valor_centavos: 21437, conta_id: 'c1', categoria_id: 'k1',
    });
    expect(corpoDoLancamento({ ...DESPESA_VALIDA, tipo: 'TRANSFERENCIA', conta_destino_id: 'c2' })).not.toHaveProperty('categoria_id');
  });

  it('manda a divisão só quando há pessoas e o tipo permite', () => {
    const comRacha = { ...DESPESA_VALIDA, divisao: [{ pessoa: ' Ana ', valor: '100' }] };

    expect(corpoDoLancamento(comRacha).divisao).toEqual([{ pessoa: 'Ana', valor_centavos: 10000 }]);
    expect(corpoDoLancamento({ ...DESPESA_VALIDA, divisao: [] })).not.toHaveProperty('divisao');
    expect(corpoDoLancamento({ ...comRacha, tipo: 'TRANSFERENCIA', conta_destino_id: 'c2' })).not.toHaveProperty('divisao');
  });
});

describe('validarConta e validarCategoria', () => {
  it('exigem nome e aceitam saldo inicial vazio ou negativo', () => {
    expect(validarConta({ nome: 'Carteira', saldoInicial: '' })).toEqual({});
    expect(validarConta({ nome: 'Cartão', saldoInicial: '-150,00' })).toEqual({});
    expect(validarConta({ nome: '', saldoInicial: 'abc' })).toEqual({
      nome: 'Informe o nome.',
      saldoInicial: 'Valor inválido. Use o formato 1.500,00 (ou -150,00 se estiver no vermelho).',
    });
    expect(validarCategoria({ nome: 'x'.repeat(61) })).toEqual({ nome: 'Use no máximo 60 caracteres.' });
  });
});

describe('errosDaApi', () => {
  it('traduz os nomes de campo da API para os do formulário', () => {
    expect(errosDaApi({ valor_centavos: 'Use um valor maior que 0.', conta_id: 'Conta não encontrada.' })).toEqual({
      valor: 'Use um valor maior que 0.',
      conta_id: 'Conta não encontrada.',
    });
    expect(errosDaApi({ 'divisao.1.valor_centavos': 'Use um valor maior que 0.', 'divisao.0.pessoa': 'Campo obrigatório.' })).toEqual({
      'divisao.1.valor': 'Use um valor maior que 0.',
      'divisao.0.pessoa': 'Campo obrigatório.',
    });
  });
});
