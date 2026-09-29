// Testes da posição do que flutua preso a um campo.
import { describe, expect, it } from 'vitest';
import { AFASTAMENTO, MARGEM, posicaoDoPainel } from './posicaoFlutuante';

const janela = { largura: 1280, altura: 900 };
const caixa = (top: number, altura = 46, left = 377, largura = 249) => ({
  top,
  bottom: top + altura,
  left,
  right: left + largura,
  width: largura,
});

describe('posicaoDoPainel', () => {
  it('abre embaixo quando cabe, logo abaixo do campo', () => {
    const posicao = posicaoDoPainel(caixa(200), { largura: 249, altura: 300 }, janela, { larguraDaAncora: true });
    expect(posicao).toMatchObject({ paraCima: false, top: 246 + AFASTAMENTO, bottom: 'auto', left: 377, minWidth: 249 });
  });

  // Regressão: no modal do cartão, a lista dos 31 dias (1.300 px naturais,
  // cortada em 288 px pelo CSS) abria em top: 8px, a 136 px do campo.
  it('abre em cima presa pela borda de baixo, encostada no campo', () => {
    const campo = caixa(432);
    const posicao = posicaoDoPainel(campo, { largura: 249, altura: 1300 }, janela, { larguraDaAncora: true });
    expect(posicao.paraCima).toBe(true);
    expect(posicao.top).toBe('auto');
    // A borda de baixo do painel fica AFASTAMENTO acima do topo do campo,
    // seja qual for a altura que o CSS deixar.
    expect(janela.altura - (posicao.bottom as number)).toBe(campo.top - AFASTAMENTO);
    expect(posicao.espacoDisponivel).toBe(432 - MARGEM - AFASTAMENTO);
  });

  it('fica embaixo quando em cima tem menos espaço', () => {
    const posicao = posicaoDoPainel(caixa(300), { largura: 249, altura: 1300 }, janela);
    expect(posicao.paraCima).toBe(false);
    expect(posicao.espacoDisponivel).toBe(900 - 346 - MARGEM - AFASTAMENTO);
  });

  it('não sai pela direita nem pela esquerda da janela', () => {
    expect(posicaoDoPainel(caixa(100, 46, 1200, 60), { largura: 300, altura: 100 }, janela).left).toBe(1280 - 300 - MARGEM);
    expect(posicaoDoPainel(caixa(100, 46, 2, 60), { largura: 300, altura: 100 }, janela).left).toBe(MARGEM);
  });

  it('alinha pela direita quando pedido (menu de ações)', () => {
    const posicao = posicaoDoPainel(caixa(100, 36, 900, 36), { largura: 220, altura: 150 }, janela, { alinhar: 'fim' });
    expect(posicao.left).toBe(936 - 220);
  });

  it('tem uma altura mínima para rolar por dentro, mesmo sem espaço', () => {
    const posicao = posicaoDoPainel(caixa(20, 46), { largura: 200, altura: 2000 }, { largura: 1280, altura: 150 });
    expect(posicao.espacoDisponivel).toBe(120);
  });
});
