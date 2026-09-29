// Testes das folhas em volta (o 3D da landing dentro do app): quantidade por
// arranjo, determinismo e os limites de cada um.
import { describe, expect, it } from 'vitest';
import { gerarFolhasEmVolta, QUANTIDADES } from './folhasEmVolta';

describe('gerarFolhasEmVolta', () => {
  it('é determinístico pela semente', () => {
    expect(gerarFolhasEmVolta('cabecalho', 7)).toEqual(gerarFolhasEmVolta('cabecalho', 7));
    expect(gerarFolhasEmVolta('cabecalho', 7)).not.toEqual(gerarFolhasEmVolta('cabecalho', 8));
  });

  it('usa a quantidade de cada arranjo, ou a pedida', () => {
    expect(gerarFolhasEmVolta('cabecalho')).toHaveLength(QUANTIDADES.cabecalho);
    expect(gerarFolhasEmVolta('vazio')).toHaveLength(QUANTIDADES.vazio);
    expect(gerarFolhasEmVolta('colheita')).toHaveLength(QUANTIDADES.colheita);
    expect(gerarFolhasEmVolta('vazio', 1, 3)).toHaveLength(3);
    expect(gerarFolhasEmVolta('vazio', 1, -2)).toEqual([]);
  });

  it('no cabeçalho, a maioria fica à direita do título e já no meio do caminho', () => {
    const folhas = gerarFolhasEmVolta('cabecalho', 2026, 200);
    const aDireita = folhas.filter((folha) => folha.x >= 0.42).length;

    expect(aDireita / folhas.length).toBeGreaterThan(0.7);
    for (const folha of folhas) {
      expect(folha.x).toBeGreaterThanOrEqual(0);
      expect(folha.x).toBeLessThanOrEqual(1);
      expect(folha.atraso).toBeLessThanOrEqual(0);
      expect(-folha.atraso).toBeLessThanOrEqual(folha.duracao);
    }
  });

  it('na órbita do estado vazio, os ângulos cobrem a volta inteira', () => {
    const folhas = gerarFolhasEmVolta('vazio');
    const quadrantes = new Set(folhas.map((folha) => Math.floor((((folha.x % 360) + 360) % 360) / 90)));

    expect(quadrantes.size).toBe(4);
    expect(new Set(folhas.map((folha) => folha.duracao)).size).toBe(1);
  });

  it('na colheita, tudo sai do centro e a maior parte voa para cima', () => {
    const folhas = gerarFolhasEmVolta('colheita');
    const paraCima = folhas.filter((folha) => folha.y < 0).length;

    expect(paraCima / folhas.length).toBeGreaterThan(0.6);
    expect(folhas.some((folha) => folha.tipo === 'moeda')).toBe(true);
    for (const folha of folhas) {
      expect(Math.hypot(folha.x, folha.y)).toBeLessThanOrEqual(211);
      expect(folha.atraso).toBeGreaterThanOrEqual(0);
    }
  });
});
