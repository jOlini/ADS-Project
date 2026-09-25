// Testes do racha: divisão igual no centavo, validação e corpo para a API.
import { describe, expect, it } from 'vitest';
import {
  camposDaDivisao,
  corpoDaDivisao,
  dividirIgualmente,
  MAXIMO_DE_PESSOAS,
  parteVazia,
  pessoasParaSugerir,
  repartirIgualmente,
  somaDaDivisao,
  validarDivisao,
} from './divisao';

const CHURRASCO = [
  { pessoa: 'Ana', valor: '100,00' },
  { pessoa: 'Bruno', valor: '150,00' },
  { pessoa: 'Carla', valor: '50,00' },
];

describe('dividirIgualmente', () => {
  it('distribui os centavos que sobram a partir da primeira parte', () => {
    expect(dividirIgualmente(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(dividirIgualmente(30000, 3)).toEqual([10000, 10000, 10000]);
    expect(dividirIgualmente(5, 3)).toEqual([2, 2, 1]);
  });

  it('não divide por zero nem valor vazio', () => {
    expect(dividirIgualmente(10000, 0)).toEqual([]);
    expect(dividirIgualmente(0, 3)).toEqual([]);
  });
});

describe('repartirIgualmente', () => {
  it('preenche o valor de cada pessoa no formato do campo', () => {
    const partes = repartirIgualmente([parteVazia('Ana'), parteVazia('Bruno')], 30000);

    expect(partes).toEqual([
      { pessoa: 'Ana', valor: '150,00' },
      { pessoa: 'Bruno', valor: '150,00' },
    ]);
  });

  it('com a minha parte, divide por mais um e deixa a minha como sobra', () => {
    const partes = repartirIgualmente([parteVazia('Ana'), parteVazia('Bruno')], 30000, { comMinhaParte: true });

    expect(partes.map((parte) => parte.valor)).toEqual(['100,00', '100,00']);
    expect(30000 - somaDaDivisao(partes)).toBe(10000);
  });
});

describe('validarDivisao', () => {
  it('aceita o churrasco de R$ 300 com valores diferentes que fecham o total', () => {
    expect(validarDivisao(CHURRASCO, 30000)).toEqual({});
    expect(somaDaDivisao(CHURRASCO)).toBe(30000);
  });

  it('aceita partes que somam menos que o total (o resto é de quem lançou)', () => {
    expect(validarDivisao(CHURRASCO.slice(0, 1), 30000)).toEqual({});
  });

  it('recusa partes que passam do total, com a soma na mensagem', () => {
    expect(validarDivisao(CHURRASCO, 20000)).toEqual({
      divisao: 'As partes somam R$ 300,00, mais que o valor do lançamento.',
    });
  });

  it('aponta nome vazio, repetido e valor que falta, ilegível ou zero', () => {
    const partes = [
      { pessoa: ' ', valor: '' },
      { pessoa: 'Ana', valor: 'dez' },
      { pessoa: ' ANA ', valor: '0,00' },
    ];

    expect(validarDivisao(partes, 30000)).toEqual({
      'divisao.0.pessoa': 'Informe o nome.',
      'divisao.0.valor': 'Informe a parte.',
      'divisao.1.valor': 'Valor inválido. Use o formato 100,00.',
      'divisao.2.pessoa': 'Esta pessoa já está na divisão.',
      'divisao.2.valor': 'A parte precisa ser maior que zero.',
    });
  });

  it('segue o limite de pessoas da API', () => {
    const muitas = Array.from({ length: MAXIMO_DE_PESSOAS + 1 }, (_, indice) => ({ pessoa: `P${indice}`, valor: '1,00' }));

    expect(validarDivisao(muitas, 100000).divisao).toBe('Divida entre no máximo 20 pessoas.');
  });
});

describe('corpo e campos', () => {
  it('manda o nome limpo e o valor em centavos', () => {
    expect(corpoDaDivisao([{ pessoa: '  Ana ', valor: '100' }])).toEqual([{ pessoa: 'Ana', valor_centavos: 10000 }]);
  });

  it('lista os campos na ordem da tela', () => {
    expect(camposDaDivisao([parteVazia(), parteVazia()])).toEqual([
      'divisao.0.pessoa', 'divisao.0.valor', 'divisao.1.pessoa', 'divisao.1.valor', 'divisao',
    ]);
  });

  it('sugere só quem ainda não está na divisão', () => {
    expect(pessoasParaSugerir(['Ana', 'Bruno', 'Carla'], [{ pessoa: 'ana', valor: '' }])).toEqual(['Bruno', 'Carla']);
    expect(pessoasParaSugerir(['A', 'B', 'C'], [], 2)).toEqual(['A', 'B']);
  });
});
