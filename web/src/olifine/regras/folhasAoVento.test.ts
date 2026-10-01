// Testes das folhas ao vento da landing: quantas cabem em cada tela, como se
// espalham e a paralaxe de cada profundidade.
import { describe, expect, it } from 'vitest';
import { divisorDaProfundidade, gerarFolhasAoVento, paralaxe, quantidadeNoAr, TAMANHOS, TIPO_NO_AR } from './folhasAoVento';

describe('quantidadeNoAr', () => {
  it('põe mais folhas na tela grande e menos no celular', () => {
    const notebook = quantidadeNoAr(1440, 900);
    const monitor = quantidadeNoAr(2560, 1440);
    const celular = quantidadeNoAr(390, 844);

    expect(notebook).toBe(80);
    expect(monitor).toBeGreaterThan(notebook);
    expect(celular).toBeLessThanOrEqual(36);
  });

  it('fica entre 18 e 110, e cai com pouca memória', () => {
    expect(quantidadeNoAr(0, 0)).toBe(18);
    expect(quantidadeNoAr(8000, 5000)).toBe(110);
    expect(quantidadeNoAr(1440, 900, 2)).toBeLessThan(quantidadeNoAr(1440, 900, 8));
  });
});

describe('gerarFolhasAoVento', () => {
  const folhas = gerarFolhasAoVento(200);
  const coluna = (dados: Float32Array, deslocamento: number) =>
    Array.from({ length: folhas.quantidade }, (_, indice) => dados[indice * 4 + deslocamento] ?? Number.NaN);

  it('é determinístico pela semente', () => {
    expect(gerarFolhasAoVento(40, 7).posicoes).toEqual(gerarFolhasAoVento(40, 7).posicoes);
    expect(gerarFolhasAoVento(40, 7).posicoes).not.toEqual(gerarFolhasAoVento(40, 8).posicoes);
  });

  it('mantém cada valor na faixa que o shader espera', () => {
    expect(folhas.posicoes).toHaveLength(800);
    expect(coluna(folhas.posicoes, 0).every((x) => x >= -1 && x <= 1)).toBe(true);
    expect(coluna(folhas.posicoes, 1).every((y) => y >= 0 && y <= 1)).toBe(true);
    expect(coluna(folhas.posicoes, 2).every((z) => z >= 0.08 && z <= 1)).toBe(true);
    expect(coluna(folhas.atributos, 0).every((tipo) => Object.values(TIPO_NO_AR).includes(tipo as 0 | 1 | 2))).toBe(true);
  });

  it('dá a cada tipo o tamanho dele: a moeda cabe o cifrão e a cédula é a maior', () => {
    const nome = { [TIPO_NO_AR.folha]: 'folha', [TIPO_NO_AR.moeda]: 'moeda', [TIPO_NO_AR.nota]: 'nota' } as const;
    for (let indice = 0; indice < folhas.quantidade; indice += 1) {
      const tipo = nome[(folhas.atributos[indice * 4] ?? 0) as 0 | 1 | 2];
      const tamanho = folhas.atributos[indice * 4 + 1] ?? 0;
      expect(tamanho).toBeGreaterThanOrEqual(TAMANHOS[tipo].menor);
      expect(tamanho).toBeLessThanOrEqual(TAMANHOS[tipo].maior);
    }
    expect(TAMANHOS.moeda.menor).toBeGreaterThanOrEqual(24);
    expect(TAMANHOS.nota.maior).toBeGreaterThan(TAMANHOS.folha.maior);
  });

  it('deixa a maior parte nas margens e mistura moedas e cédulas às folhas', () => {
    const nasMargens = coluna(folhas.posicoes, 0).filter((x) => Math.abs(x) >= 0.42).length;
    const tipos = coluna(folhas.atributos, 0);
    const moedas = tipos.filter((tipo) => tipo === TIPO_NO_AR.moeda).length;
    const notas = tipos.filter((tipo) => tipo === TIPO_NO_AR.nota).length;
    const soFolhas = tipos.filter((tipo) => tipo === TIPO_NO_AR.folha).length;

    expect(nasMargens / folhas.quantidade).toBeGreaterThan(0.8);
    expect(moedas).toBeGreaterThan(10);
    expect(moedas).toBeLessThan(60);
    expect(notas).toBeGreaterThan(20);
    expect(notas).toBeLessThan(70);
    expect(soFolhas).toBeGreaterThan(folhas.quantidade / 2);
  });

  it('espalha a altura por igual: cada quinto da coluna tem folhas', () => {
    const quintos = new Set(coluna(folhas.posicoes, 1).map((y) => Math.min(4, Math.floor(y * 5))));

    expect(quintos.size).toBe(5);
  });

  it('aceita zero folhas', () => {
    expect(gerarFolhasAoVento(0).quantidade).toBe(0);
  });
});

describe('paralaxe', () => {
  it('as de perto andam mais com a rolagem que as do fundo', () => {
    expect(divisorDaProfundidade(0)).toBe(1);
    expect(divisorDaProfundidade(1)).toBe(3.2);
    expect(paralaxe(0.1)).toBeGreaterThan(paralaxe(0.9));
    expect(paralaxe(2)).toBe(paralaxe(1));
  });
});
