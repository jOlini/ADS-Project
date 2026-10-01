// Testes da conta 3D do pomar da landing: câmera, toque no chão, movimento
// suave, quantas folhas e onde elas nascem, e a proporção 70/10/20 de
// folhagem, moedas e cédulas (70/10/20).
import { describe, expect, it } from 'vitest';
import {
  aproximar,
  balancoOcioso,
  CAMPO,
  caixaNaTela,
  enquadramento,
  espalharNoCampo,
  FOLHAS_RATIO,
  gerarPomar,
  matrizDaCena,
  MOEDAS_RATIO,
  NOTAS_RATIO,
  partesDoPomar,
  pontoNoChao,
  projetar,
  quantidadeDeFolhas,
  quantoDesenhar,
  TAMANHOS_NO_POMAR,
  TIPO,
} from './pomar';
import { gerador } from './arvore';

const ASPECTO = 16 / 10;
const PARADO = enquadramento({ x: 0, y: 0 }, 0);

describe('matrizDaCena', () => {
  it('põe o ponto para onde a câmera olha no meio da tela', () => {
    const [x, y, z] = projetar(matrizDaCena(PARADO, ASPECTO), PARADO.alvo);
    expect(x).toBeCloseTo(0, 5);
    expect(y).toBeCloseTo(0, 5);
    expect(z).toBeGreaterThan(-1);
    expect(z).toBeLessThan(1);
  });

  it('mantém direita, esquerda, alto e fundo no lugar', () => {
    const matriz = matrizDaCena(PARADO, ASPECTO);
    const [alvoX, alvoY, alvoZ] = PARADO.alvo;
    expect(projetar(matriz, [alvoX + 2, alvoY, alvoZ])[0]).toBeGreaterThan(0);
    expect(projetar(matriz, [alvoX - 2, alvoY, alvoZ])[0]).toBeLessThan(0);
    expect(projetar(matriz, [alvoX, alvoY + 1, alvoZ])[1]).toBeGreaterThan(0);
    // O que está mais longe, no mesmo chão, sobe na tela até o horizonte.
    expect(projetar(matriz, [alvoX, 0, alvoZ - 6])[1]).toBeGreaterThan(projetar(matriz, [alvoX, 0, alvoZ])[1]);
  });

  it('o campo começa abaixo do meio da tela e o horizonte fica no terço de cima', () => {
    const matriz = matrizDaCena(PARADO, ASPECTO);
    expect(projetar(matriz, [0, 0, -1])[1]).toBeLessThan(-0.3);
    const horizonte = projetar(matriz, [0, 0, -CAMPO.profundidade])[1];
    expect(horizonte).toBeGreaterThan(0.2);
    expect(horizonte).toBeLessThan(0.8);
  });
});

describe('enquadramento', () => {
  it('segue o ponteiro de leve e para o mesmo lado', () => {
    const direita = enquadramento({ x: 1, y: 0 }, 0);
    expect(direita.olho[0]).toBeGreaterThan(PARADO.olho[0]);
    expect(direita.olho[0] - PARADO.olho[0]).toBeLessThanOrEqual(1);
    expect(enquadramento({ x: 0, y: 1 }, 0).olho[1]).toBeGreaterThan(PARADO.olho[1]);
  });

  it('avança e desce com a rolagem, sem passar do fim do topo', () => {
    const rolado = enquadramento({ x: 0, y: 0 }, 1);
    expect(rolado.olho[2]).toBeLessThan(PARADO.olho[2]);
    expect(rolado.olho[1]).toBeLessThan(PARADO.olho[1]);
    expect(enquadramento({ x: 0, y: 0 }, 5)).toEqual(rolado);
    expect(enquadramento({ x: 0, y: 0 }, -2)).toEqual(PARADO);
  });
});

describe('pontoNoChao', () => {
  it('o meio da tela toca o chão na direção do alvo da câmera', () => {
    const chao = pontoNoChao({ x: 0, y: 0 }, PARADO, ASPECTO);
    expect(chao).not.toBeNull();
    const [x, profundidade] = chao ?? [0, 0];
    expect(x).toBeCloseTo(PARADO.alvo[0], 0);
    expect(profundidade).toBeCloseTo(-PARADO.alvo[2], 0);
  });

  it('é o inverso da projeção: o ponto achado volta ao mesmo lugar da tela', () => {
    const matriz = matrizDaCena(PARADO, ASPECTO);
    for (const ponteiro of [
      { x: -0.6, y: -0.5 },
      { x: 0.4, y: -0.8 },
      { x: 0.9, y: -0.2 },
    ]) {
      const [x, profundidade] = pontoNoChao(ponteiro, PARADO, ASPECTO) ?? [0, 0];
      const [telaX, telaY] = projetar(matriz, [x, 0, -profundidade]);
      expect(telaX).toBeCloseTo(ponteiro.x, 3);
      expect(telaY).toBeCloseTo(ponteiro.y, 3);
    }
  });

  it('no céu, acima do horizonte, não toca o chão', () => {
    expect(pontoNoChao({ x: 0, y: 0.95 }, PARADO, ASPECTO)).toBeNull();
  });
});

describe('aproximar', () => {
  it('chega perto do alvo sem passar dele', () => {
    let valor = 0;
    for (let quadro = 0; quadro < 120; quadro += 1) {
      valor = aproximar(valor, 1, 1 / 60);
      expect(valor).toBeLessThanOrEqual(1);
    }
    expect(valor).toBeGreaterThan(0.99);
  });

  it('anda o mesmo com 30 ou 120 quadros por segundo', () => {
    let lento = 0;
    let rapido = 0;
    for (let quadro = 0; quadro < 15; quadro += 1) lento = aproximar(lento, 1, 1 / 30);
    for (let quadro = 0; quadro < 60; quadro += 1) rapido = aproximar(rapido, 1, 1 / 120);
    expect(lento).toBeCloseTo(rapido, 6);
  });

  it('um quadro atrasado não vira salto', () => {
    expect(aproximar(0, 1, 5)).toBe(aproximar(0, 1, 0.1));
    expect(aproximar(0.3, 1, -1)).toBe(0.3);
  });
});

describe('balancoOcioso', () => {
  it('balança devagar, dentro de um terço do alcance do mouse', () => {
    for (let segundos = 0; segundos < 60; segundos += 0.5) {
      const { x, y } = balancoOcioso(segundos);
      expect(Math.abs(x)).toBeLessThanOrEqual(0.34);
      expect(Math.abs(y)).toBeLessThanOrEqual(0.34);
      const depois = balancoOcioso(segundos + 1 / 60);
      expect(Math.abs(depois.x - x)).toBeLessThan(0.01);
    }
  });
});

describe('quantidadeDeFolhas', () => {
  it('cresce com a tela, entre o piso e o teto', () => {
    const celular = quantidadeDeFolhas(390, 1100);
    const computador = quantidadeDeFolhas(1440, 960);
    expect(celular).toBeGreaterThanOrEqual(4500);
    expect(computador).toBeGreaterThan(celular);
    expect(quantidadeDeFolhas(3840, 2160)).toBe(14000);
    expect(quantidadeDeFolhas(0, 0)).toBe(4500);
  });

  it('pede menos folhas com pouca memória', () => {
    expect(quantidadeDeFolhas(3840, 2160, 2)).toBeLessThan(quantidadeDeFolhas(3840, 2160, 8));
  });
});

describe('gerarPomar', () => {
  it('mesma semente, mesmo pomar', () => {
    expect(gerarPomar(500, 7)).toEqual(gerarPomar(500, 7));
    expect(gerarPomar(500, 7).posicoes).not.toEqual(gerarPomar(500, 8).posicoes);
  });

  it('toda folha nasce dentro do campo, com tamanho e giro válidos', () => {
    const { quantidade, posicoes, atributos } = gerarPomar(3000);
    expect(quantidade).toBe(3000);
    expect(posicoes).toHaveLength(9000);
    for (let indice = 0; indice < quantidade; indice += 1) {
      const x = posicoes[indice * 3] ?? NaN;
      const z = posicoes[indice * 3 + 1] ?? NaN;
      expect(Math.abs(x)).toBeLessThanOrEqual(CAMPO.largura / 2);
      expect(z).toBeGreaterThanOrEqual(0);
      expect(z).toBeLessThanOrEqual(CAMPO.profundidade);
      expect(Object.values(TIPO)).toContain(atributos[indice * 3]);
      expect(atributos[indice * 3 + 2]).toBeGreaterThan(0);
    }
  });

  it('70% de folhagem, 10% de moedas e 20% de cédulas, com o dinheiro antes no buffer', () => {
    const pomar = gerarPomar(10000);
    const tipos = Array.from({ length: pomar.quantidade }, (_, indice) => pomar.atributos[indice * 3]);
    const parte = (...procurados: number[]) =>
      tipos.filter((tipo) => procurados.includes(tipo ?? -1)).length / pomar.quantidade;

    expect(parte(TIPO.folha, TIPO.ponto)).toBeCloseTo(FOLHAS_RATIO, 2);
    expect(parte(TIPO.moeda)).toBeCloseTo(MOEDAS_RATIO, 2);
    expect(parte(TIPO.nota)).toBeCloseTo(NOTAS_RATIO, 2);
    // As folhas (sem contar os pontinhos) ainda passam cada tipo de dinheiro.
    expect(parte(TIPO.folha)).toBeGreaterThan(parte(TIPO.moeda));
    expect(parte(TIPO.folha)).toBeGreaterThan(parte(TIPO.nota));

    expect(pomar.dinheiro).toEqual({ inicio: 0, quantidade: 3000 });
    expect(pomar.folhagem).toEqual({ inicio: 3000, quantidade: 7000 });
    expect(tipos.slice(0, 3000).every((tipo) => tipo === TIPO.moeda || tipo === TIPO.nota)).toBe(true);
    expect(tipos.slice(3000).every((tipo) => tipo === TIPO.folha || tipo === TIPO.ponto)).toBe(true);
  });

  it('dá a cada tipo o tamanho dele, com o dinheiro no tamanho das folhas menores', () => {
    const { quantidade, atributos } = gerarPomar(4000);
    const nome = Object.fromEntries(Object.entries(TIPO).map(([chave, valor]) => [valor, chave])) as Record<
      number,
      keyof typeof TIPO
    >;
    for (let indice = 0; indice < quantidade; indice += 1) {
      const faixa = TAMANHOS_NO_POMAR[nome[atributos[indice * 3] ?? 0] ?? 'folha'];
      const tamanho = atributos[indice * 3 + 2] ?? 0;
      expect(tamanho).toBeGreaterThanOrEqual(faixa.menor);
      expect(tamanho).toBeLessThanOrEqual(faixa.maior);
    }
    expect(TAMANHOS_NO_POMAR.moeda.maior).toBeLessThan(TAMANHOS_NO_POMAR.folha.maior);
    expect(TAMANHOS_NO_POMAR.nota.maior).toBeLessThan(TAMANHOS_NO_POMAR.folha.maior);
  });

  it('o começo de cada grupo cobre o campo inteiro (desenhar menos só deixa mais ralo)', () => {
    const pomar = gerarPomar(8000);
    const quadrantesDoComeco = (faixa: { inicio: number; quantidade: number }) => {
      const quadrantes = new Set<string>();
      for (let indice = faixa.inicio; indice < faixa.inicio + faixa.quantidade / 2; indice += 1) {
        const x = pomar.posicoes[indice * 3] ?? 0;
        const z = pomar.posicoes[indice * 3 + 1] ?? 0;
        quadrantes.add(`${Math.floor(((x + CAMPO.largura / 2) / CAMPO.largura) * 4)}:${Math.floor((z / CAMPO.profundidade) * 4)}`);
      }
      return quadrantes.size;
    };
    expect(quadrantesDoComeco(pomar.folhagem)).toBe(16);
    expect(quadrantesDoComeco(pomar.dinheiro)).toBe(16);
  });

  it('mistura moedas e cédulas no começo do grupo do dinheiro', () => {
    const pomar = gerarPomar(5000);
    const comeco = Array.from({ length: 200 }, (_, indice) => pomar.atributos[indice * 3]);
    const moedas = comeco.filter((tipo) => tipo === TIPO.moeda).length;
    // Um terço do dinheiro é moeda (10 de 30).
    expect(moedas).toBeGreaterThan(40);
    expect(moedas).toBeLessThan(95);
  });
});

describe('partesDoPomar', () => {
  it('reparte pelos 70/10/20 e soma sempre o total', () => {
    expect(partesDoPomar(10000)).toEqual({ folhagem: 7000, moedas: 1000, notas: 2000 });
    for (const total of [0, 1, 2, 7, 4501, 13999]) {
      const partes = partesDoPomar(total);
      expect(partes.folhagem + partes.moedas + partes.notas).toBe(total);
      expect(partes.folhagem).toBeGreaterThanOrEqual(partes.moedas);
    }
    expect(partesDoPomar(-5)).toEqual({ folhagem: 0, moedas: 0, notas: 0 });
  });
});

describe('espalharNoCampo', () => {
  it('põe cada ponto dentro do campo, com a fase entre 0 e 1', () => {
    const posicoes = espalharNoCampo(900, gerador(3));
    expect(posicoes).toHaveLength(2700);
    for (let indice = 0; indice < 900; indice += 1) {
      expect(Math.abs(posicoes[indice * 3] ?? NaN)).toBeLessThanOrEqual(CAMPO.largura / 2);
      expect(posicoes[indice * 3 + 1]).toBeGreaterThanOrEqual(0);
      expect(posicoes[indice * 3 + 1]).toBeLessThanOrEqual(CAMPO.profundidade);
      expect(posicoes[indice * 3 + 2]).toBeGreaterThanOrEqual(0);
      expect(posicoes[indice * 3 + 2]).toBeLessThan(1);
    }
  });
});

describe('quantoDesenhar', () => {
  it('corta folhagem e dinheiro na mesma proporção', () => {
    const pomar = gerarPomar(10000);
    expect(quantoDesenhar(pomar, 10000)).toEqual({ dinheiro: 3000, folhagem: 7000 });
    expect(quantoDesenhar(pomar, 5500)).toEqual({ dinheiro: 1650, folhagem: 3850 });
    expect(quantoDesenhar(pomar, 99999)).toEqual({ dinheiro: 3000, folhagem: 7000 });
    expect(quantoDesenhar(pomar, -1)).toEqual({ dinheiro: 0, folhagem: 0 });
    expect(quantoDesenhar(gerarPomar(0), 100)).toEqual({ dinheiro: 0, folhagem: 0 });
  });
});

describe('caixaNaTela', () => {
  const tela = { left: 0, top: 0, right: 1000, bottom: 500 };

  it('converte a caixa do texto para a tela do WebGL, com y para cima e folga', () => {
    expect(caixaNaTela({ left: 0, top: 0, right: 500, bottom: 250 }, tela, 0)).toEqual([-1, 0, 0, 1]);
    const [x0, y0, x1, y1] = caixaNaTela({ left: 100, top: 100, right: 400, bottom: 300 }, tela, 50);
    expect(x0).toBeCloseTo(-0.9);
    expect(x1).toBeCloseTo(-0.1);
    expect(y0).toBeCloseTo(-0.4);
    expect(y1).toBeCloseTo(0.8);
  });
});
