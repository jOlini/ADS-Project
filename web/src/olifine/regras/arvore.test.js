import { describe, expect, it } from 'vitest';
import { desenharArvore, montarGalhos, RAIZ, recorteDaMiniatura } from './arvore';

describe('montarGalhos', () => {
  it('a mesma semente dá sempre a mesma árvore', () => {
    expect(montarGalhos(42)).toEqual(montarGalhos(42));
    expect(montarGalhos(42)).not.toEqual(montarGalhos(43));
  });

  it('pais vêm antes dos filhos', () => {
    const galhos = montarGalhos(7);
    for (const galho of galhos) {
      if (galho.pai !== null) {
        expect(galho.pai).toBeLessThan(galho.id);
      }
    }
  });
});

describe('recorteDaMiniatura', () => {
  it('é um quadrado com a árvore inteira e o chão dentro', () => {
    const quadro = desenharArvore(montarGalhos(5), 0.45);
    const recorte = recorteDaMiniatura(quadro);
    expect(recorte.lado).toBeGreaterThanOrEqual(150);
    for (const segmento of quadro.segmentos) {
      expect(segmento.fim.y).toBeGreaterThanOrEqual(recorte.y);
      expect(segmento.fim.x).toBeGreaterThanOrEqual(recorte.x);
      expect(segmento.fim.x).toBeLessThanOrEqual(recorte.x + recorte.lado);
    }
    expect(recorte.y + recorte.lado).toBeGreaterThanOrEqual(RAIZ.y + 18);
  });
});

describe('desenharArvore', () => {
  const galhos = montarGalhos(2026);

  it('sem aporte é só a semente', () => {
    const quadro = desenharArvore(galhos, 0);
    expect(quadro.semente).toBe(true);
    expect(quadro.segmentos).toHaveLength(0);
  });

  it('no começo é um broto: talinho e duas folhinhas, sem copa', () => {
    const quadro = desenharArvore(galhos, 0.05);
    expect(quadro.segmentos).toHaveLength(1);
    expect(quadro.broto).not.toBeNull();
    expect(quadro.folhas).toHaveLength(0);
  });

  it('cresce com o progresso e dá frutos só com a meta completa', () => {
    const meio = desenharArvore(galhos, 0.5);
    const cheia = desenharArvore(galhos, 1);
    expect(cheia.segmentos.length).toBeGreaterThan(meio.segmentos.length);
    expect(cheia.folhas.length).toBeGreaterThan(meio.folhas.length);
    expect(meio.frutos).toHaveLength(0);
    expect(cheia.broto).toBeNull();
  });

  it('fica dentro do desenho, acima do chão', () => {
    const cheia = desenharArvore(galhos, 1);
    for (const segmento of cheia.segmentos) {
      expect(segmento.fim.y).toBeLessThanOrEqual(RAIZ.y);
      expect(segmento.fim.x).toBeGreaterThan(0);
      expect(segmento.fim.x).toBeLessThan(320);
      expect(segmento.fim.y).toBeGreaterThan(0);
    }
  });
});
