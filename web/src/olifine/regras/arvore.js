// Geometria da árvore das metas, sem interface: a estrutura dos galhos sai de
// uma semente (cada meta tem a sua árvore, sempre igual) e o desenho de cada
// quadro sai do progresso, de 0 a 1. Um aporte muda só o progresso, e o
// crescimento se espalha por todos os galhos. Testado em arvore.test.js.

// Chão da árvore no desenho (viewBox 0 0 320 300).
export const RAIZ = { x: 160, y: 262 };
const PROFUNDIDADE = 5;
// Progresso em que cada nível de galho começa a nascer, e quanto dura.
const NASCE = [0, 0.14, 0.3, 0.46, 0.62, 0.78];
const DURACAO = 0.22;

// Gerador de números previsível (mulberry32): mesma semente, mesma árvore.
function gerador(semente) {
  let estado = semente >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const limitar = (valor) => Math.min(1, Math.max(0, valor));
const suavizar = (t) => 1 - (1 - t) ** 3;

// Lista de galhos, pais antes dos filhos. Cada galho: ângulo (graus, -90 é
// para cima), comprimento, nível, quando nasce, curvatura e as folhas.
export function montarGalhos(semente) {
  const sorte = gerador(semente);
  const galhos = [];

  function crescer(pai, angulo, comprimento, nivel) {
    const galho = {
      id: galhos.length,
      pai,
      angulo,
      comprimento,
      nivel,
      nasce: NASCE[nivel] + (nivel > 0 ? (sorte() - 0.5) * 0.05 : 0),
      curva: (sorte() - 0.5) * 0.35,
      folhas: [],
      fruto: false,
    };
    galhos.push(galho);
    if (nivel < PROFUNDIDADE) {
      const quantos = nivel === 0 ? 2 : sorte() < 0.3 ? 3 : 2;
      for (let indice = 0; indice < quantos; indice += 1) {
        const lado = quantos === 2 ? (indice === 0 ? -1 : 1) : indice - 1;
        const abertura = 17 + sorte() * 17;
        // Galhos puxam levemente para cima, como uma copa de verdade.
        const rumo = angulo + lado * abertura + (sorte() - 0.5) * 8;
        const puxado = rumo + (-90 - rumo) * 0.18;
        crescer(galho.id, puxado, comprimento * (0.68 + sorte() * 0.12), nivel + 1);
      }
    }
    if (nivel >= 1) {
      const folhas = nivel >= 4 ? 3 + Math.floor(sorte() * 3) : nivel >= 2 ? 2 + Math.floor(sorte() * 2) : 1 + Math.floor(sorte() * 2);
      for (let indice = 0; indice < folhas; indice += 1) {
        galho.folhas.push({
          ao: 0.35 + sorte() * 0.65,
          giro: (sorte() < 0.5 ? -1 : 1) * (28 + sorte() * 50),
          tamanho: 9 + sorte() * 7,
          tom: Math.floor(sorte() * 4),
        });
      }
    }
    galho.fruto = nivel === PROFUNDIDADE && sorte() < 0.17;
    return galho;
  }

  crescer(null, -90 + (sorte() - 0.5) * 5, 66, 0);
  return galhos;
}

// Desenho de um quadro: segmentos (traço de cada galho), folhas, frutos e as
// duas folhinhas do broto, que somem quando os galhos chegam.
export function desenharArvore(galhos, progresso) {
  const p = limitar(progresso);
  const pontas = new Array(galhos.length);
  const segmentos = [];
  const folhas = [];
  const frutos = [];
  // Copa: um halo verde atrás das folhas nas pontas do nível 3, que enche a
  // árvore a partir da arvoreta.
  const copas = [];

  for (const galho of galhos) {
    const base = galho.pai === null ? RAIZ : pontas[galho.pai];
    // O tronco aparece com o primeiro aporte; o resto, na hora do seu nível.
    const inicio = galho.nivel === 0 ? 0 : galho.nasce;
    const bruto = galho.nivel === 0 ? limitar(p / 0.3) : limitar((p - inicio) / DURACAO);
    if (p <= 0 || bruto <= 0) {
      pontas[galho.id] = base;
      continue;
    }
    const crescido = suavizar(bruto);
    // O tronco começa como um talinho e engrossa até o fim.
    const comprimento = galho.nivel === 0 ? galho.comprimento * (0.22 + 0.78 * crescido) : galho.comprimento * crescido;
    const radianos = (galho.angulo * Math.PI) / 180;
    const fim = { x: base.x + Math.cos(radianos) * comprimento, y: base.y + Math.sin(radianos) * comprimento };
    const meio = {
      x: (base.x + fim.x) / 2 - Math.sin(radianos) * comprimento * galho.curva,
      y: (base.y + fim.y) / 2 + Math.cos(radianos) * comprimento * galho.curva,
    };
    const espessura = Math.max(1.1, (10.5 - galho.nivel * 1.9) * (0.45 + 0.55 * p) * (0.5 + 0.5 * crescido));
    segmentos.push({ id: galho.id, base, meio, fim, espessura, nivel: galho.nivel });
    pontas[galho.id] = fim;

    for (const [indice, folha] of galho.folhas.entries()) {
      const aparece = suavizar(limitar((p - galho.nasce - 0.03) / 0.14));
      if (aparece <= 0) {
        continue;
      }
      const t = folha.ao;
      // Ponto na curva do galho (Bézier quadrática).
      const x = (1 - t) ** 2 * base.x + 2 * (1 - t) * t * meio.x + t ** 2 * fim.x;
      const y = (1 - t) ** 2 * base.y + 2 * (1 - t) * t * meio.y + t ** 2 * fim.y;
      folhas.push({
        id: `${galho.id}-${indice}`,
        x,
        y,
        angulo: galho.angulo + folha.giro,
        tamanho: folha.tamanho * aparece,
        tom: folha.tom,
      });
    }
    if (galho.nivel === 3) {
      const cheia = suavizar(limitar((p - 0.5) / 0.4));
      if (cheia > 0) {
        copas.push({ id: galho.id, x: fim.x, y: fim.y, raio: 26 * cheia });
      }
    }
    if (galho.fruto && p >= 1) {
      frutos.push({ id: galho.id, x: fim.x, y: fim.y + 6 });
    }
  }

  const tronco = segmentos.find((segmento) => segmento.nivel === 0);
  const brotoVisivel = p > 0 ? 1 - limitar((p - 0.16) / 0.14) : 0;
  const broto =
    tronco && brotoVisivel > 0
      ? { x: tronco.fim.x, y: tronco.fim.y, tamanho: 13 * brotoVisivel * suavizar(limitar(p / 0.04)) }
      : null;

  return { segmentos, folhas, frutos, copas, broto, semente: p <= 0 };
}

// Recorte da miniatura: a árvore desenhada (com o chão) e uma margem, num
// quadrado de pelo menos `minimo` unidades. Numa lista, a árvore enche o
// quadradinho em qualquer fase, em vez de ser um risco no meio do vazio.
export function recorteDaMiniatura(quadro, minimo = 150) {
  const pontos = [
    { x: RAIZ.x - 60, y: RAIZ.y + 18 },
    { x: RAIZ.x + 60, y: RAIZ.y + 18 },
    ...quadro.segmentos.flatMap((segmento) => [segmento.base, segmento.fim]),
    ...quadro.folhas.flatMap((folha) => [
      { x: folha.x - folha.tamanho, y: folha.y - folha.tamanho },
      { x: folha.x + folha.tamanho, y: folha.y + folha.tamanho },
    ]),
  ];
  const xs = pontos.map((ponto) => ponto.x);
  const ys = pontos.map((ponto) => ponto.y);
  const margem = 10;
  const lado = Math.max(minimo, Math.max(...xs) - Math.min(...xs) + margem * 2, Math.max(...ys) - Math.min(...ys) + margem * 2);
  const centroX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const base = Math.max(...ys) + margem;
  return { x: centroX - lado / 2, y: base - lado, lado };
}

// Curva do galho como caminho SVG.
export const caminhoDoGalho = ({ base, meio, fim }) =>
  `M${base.x.toFixed(1)} ${base.y.toFixed(1)}Q${meio.x.toFixed(1)} ${meio.y.toFixed(1)} ${fim.x.toFixed(1)} ${fim.y.toFixed(1)}`;
