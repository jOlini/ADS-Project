// Testes do destino do "← Voltar" das telas da área logada.
import { describe, expect, it } from 'vitest';
import { destinoDoVoltar } from './voltar';

describe('destinoDoVoltar', () => {
  it('não aparece na Visão geral, o começo do app', () => {
    expect(destinoDoVoltar('/principal')).toBeNull();
    expect(destinoDoVoltar('/principal/')).toBeNull();
  });

  it('a tela do cartão volta à carteira de Contas & Cartões', () => {
    expect(destinoDoVoltar('/contas/cartoes/abc123')).toEqual({ para: '/contas#cartoes', rotulo: 'Contas & Cartões' });
  });

  it('as outras telas voltam à Visão geral', () => {
    for (const caminho of ['/contas', '/lancamentos', '/metas', '/empresa/dre', '/familia/']) {
      expect(destinoDoVoltar(caminho)).toEqual({ para: '/principal', rotulo: 'Visão geral' });
    }
  });
});
