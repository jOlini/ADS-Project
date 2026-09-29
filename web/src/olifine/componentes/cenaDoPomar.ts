// A cena WebGL do topo da landing: o campo de folhas, pontos e moedas que
// sobe da esquerda para a direita como a curva do saldo, ondula devagar, se
// levanta sob o ponteiro e abre anéis onde a pessoa toca ("rega"). WebGL 1 puro,
// sem biblioteca: um programa, dois buffers e um desenho de pontos por quadro.
// A conta de câmera, toque e distribuição das folhas está em regras/pomar.ts;
// o relevo e a cor são calculados aqui, no shader, para cada folha.

import { CAMPO, TIPO, pixelsPorUnidade, type Matriz4, type Pomar } from '../regras/pomar';

// Anéis de rega vivos ao mesmo tempo (o shader tem um laço fixo).
export const MAXIMO_DE_GOTAS = 3;
// Quanto dura um anel, em segundos (o shader para de somar depois disso).
export const VIDA_DA_GOTA = 3;

export interface Gota {
  x: number;
  z: number;
  inicio: number;
  forca: number;
}

export interface QuadroDaCena {
  // Relógio da cena (s): só anda com a cena visível, então nada pula ao voltar.
  tempo: number;
  matriz: Matriz4;
  // Onde o ponteiro toca o chão e com que força (0 a 1).
  ponteiro: [number, number, number];
  gotas: readonly Gota[];
  // Caixa do texto na tela (-1 a 1): as folhas por trás dele se apagam.
  mascara: [number, number, number, number];
  // 1 no tema claro; menos no escuro, onde a esmeralda é mais funda.
  intensidade: number;
  // Quantas folhas desenhar (as primeiras da lista, que já vem embaralhada).
  folhas: number;
}

export interface CenaDoPomar {
  redimensionar(larguraCss: number, alturaCss: number, densidade: number): void;
  desenhar(quadro: QuadroDaCena): void;
  destruir(): void;
}

const SOMBREADOR_DE_VERTICES = `
precision highp float;
attribute vec3 a_posicao;
attribute vec3 a_atributo;
uniform mat4 u_matriz;
uniform float u_tempo;
uniform float u_escala;
uniform float u_profundidade;
uniform vec3 u_ponteiro;
uniform vec4 u_gotas[${MAXIMO_DE_GOTAS}];
uniform vec4 u_mascara;
varying float v_tipo;
varying float v_giro;
varying float v_tamanho;
varying float v_alfa;
varying float v_fase;
varying vec3 v_cor;

// Relevo do campo: três ondas largas que andam devagar (as faixas orgânicas
// da marca, agora em profundidade) sobre uma rampa que sobe para a direita.
float relevo(vec2 p, float t) {
  float h = sin(p.x * 0.42 + p.y * 0.3 + t * 0.22) * 0.34;
  h += sin(p.x * 1.1 - p.y * 0.62 - t * 0.35) * 0.12;
  h += sin(p.y * 0.74 + p.x * 0.12 + t * 0.28) * 0.2;
  h += smoothstep(-9.0, 10.0, p.x) * 1.5;
  return h;
}

void main() {
  float fase = a_posicao.z;
  // O campo anda em direção à câmera e recomeça no fundo, na névoa.
  float z = mod(a_posicao.y - u_tempo * 0.35, u_profundidade);
  vec2 p = vec2(a_posicao.x, z);
  float h = relevo(p, u_tempo) + sin(u_tempo * 1.3 + fase * 6.2832) * 0.035;

  // Sob o ponteiro, as folhas se levantam e clareiam.
  float distancia = distance(p, u_ponteiro.xy);
  float brilho = u_ponteiro.z * exp(-distancia * distancia * 0.22);
  h += brilho * 0.8;

  // Cada toque abre um anel que corre pelo campo e some.
  for (int i = 0; i < ${MAXIMO_DE_GOTAS}; i++) {
    vec4 gota = u_gotas[i];
    float idade = u_tempo - gota.z;
    if (gota.w > 0.0 && idade >= 0.0 && idade < ${VIDA_DA_GOTA}.0) {
      float d = distance(p, gota.xy) - idade * 2.6;
      float anel = exp(-d * d * 1.4) * exp(-idade * 0.9) * gota.w;
      h += anel * 1.1;
      brilho += anel;
    }
  }

  // Profundidade do campo é o z negativo do mundo (regras/pomar.ts).
  vec4 posicao = u_matriz * vec4(p.x, h, -p.y, 1.0);
  gl_Position = posicao;
  float w = max(posicao.w, 0.1);
  float tamanho = a_atributo.z * u_escala / w * (1.0 + min(brilho, 1.0) * 0.5);
  gl_PointSize = clamp(tamanho, 1.0, 40.0);
  v_tamanho = gl_PointSize;
  v_tipo = a_atributo.x;
  v_giro = a_atributo.y + sin(u_tempo * 0.8 + fase * 6.2832) * 0.3;
  v_fase = fase;

  // Névoa no fundo e perto da câmera; folha menor que um pixel apaga em vez
  // de cintilar.
  float alfa = smoothstep(u_profundidade, u_profundidade * 0.4, z) * smoothstep(0.0, 1.4, z);
  alfa *= clamp(tamanho, 0.0, 1.0);
  // Distância até a caixa do texto, com cantos redondos e uma borda larga:
  // a clareira atrás do título não tem aresta.
  vec2 tela = posicao.xy / w;
  vec2 centro = (u_mascara.xy + u_mascara.zw) * 0.5;
  vec2 metade = (u_mascara.zw - u_mascara.xy) * 0.5;
  float fora = length(max(abs(tela - centro) - metade, 0.0));
  alfa *= 1.0 - 0.8 * (1.0 - smoothstep(0.0, 0.22, fora));
  v_alfa = alfa;

  // Cor pela altura, na família de verdes da marca: verde de ação nos vales,
  // verde de crescimento, verde sinal e a ponta lima nas cristas.
  float n = clamp((h + 0.6) / 2.8, 0.0, 1.0);
  vec3 cor = mix(vec3(0.169, 0.471, 0.341), vec3(0.271, 0.608, 0.447), smoothstep(0.0, 0.35, n));
  cor = mix(cor, vec3(0.392, 0.749, 0.553), smoothstep(0.3, 0.7, n));
  cor = mix(cor, vec3(0.678, 0.820, 0.498), smoothstep(0.72, 1.0, n));
  v_cor = mix(cor, vec3(0.925, 0.961, 0.941), min(brilho, 1.0) * 0.5);
}
`;

const SOMBREADOR_DE_FRAGMENTOS = `
precision mediump float;
// Mesma precisão do u_tempo do shader de vértices: uniforme com precisões
// diferentes nos dois lados não liga.
uniform highp float u_tempo;
uniform float u_intensidade;
varying float v_tipo;
varying float v_giro;
varying float v_tamanho;
varying float v_alfa;
varying float v_fase;
varying vec3 v_cor;

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float c = cos(v_giro);
  float s = sin(v_giro);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  // Borda suave de um pixel, qualquer que seja o tamanho do ponto.
  float suave = 2.0 / max(v_tamanho, 1.0);
  vec3 cor = v_cor;
  float borda;
  float opacidade;
  if (v_tipo < ${TIPO.ponto}.0 - 0.5) {
    // Folha: a lente de dois círculos, a mesma folha do F do monograma, com
    // a nervura no meio.
    borda = 1.0 - max(length(p - vec2(0.0, 0.58)), length(p + vec2(0.0, 0.58)));
    cor *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.07, abs(p.y))) * step(abs(p.x), 0.62);
    opacidade = 0.85;
  } else if (v_tipo < ${TIPO.moeda}.0 - 0.5) {
    borda = 1.0 - length(p);
    opacidade = 0.5;
  } else {
    // Moeda dourada com aro e um reflexo que acende e apaga.
    float r = length(p);
    borda = 1.0 - r;
    cor = mix(vec3(0.890, 0.733, 0.373), vec3(0.690, 0.529, 0.231), smoothstep(0.6, 0.72, r));
    cor += vec3(0.16) * smoothstep(0.55, 0.0, length(p - vec2(-0.3, -0.3)));
    cor += vec3(0.12) * max(0.0, sin(u_tempo * 1.7 + v_fase * 40.0));
    opacidade = 0.95;
  }
  float alfa = smoothstep(0.0, suave, borda) * v_alfa * opacidade * u_intensidade;
  if (alfa < 0.004) {
    discard;
  }
  gl_FragColor = vec4(cor * alfa, alfa);
}
`;

function compilar(gl: WebGLRenderingContext, tipo: number, fonte: string): WebGLShader | null {
  const sombreador = gl.createShader(tipo);
  if (!sombreador) {
    return null;
  }
  gl.shaderSource(sombreador, fonte);
  gl.compileShader(sombreador);
  if (!gl.getShaderParameter(sombreador, gl.COMPILE_STATUS)) {
    // Em desenvolvimento, o motivo aparece no console; publicado, a landing
    // só volta aos contornos em SVG.
    if (import.meta.env.DEV) {
      console.warn('Pomar: shader recusado', gl.getShaderInfoLog(sombreador));
    }
    gl.deleteShader(sombreador);
    return null;
  }
  return sombreador;
}

function montarPrograma(gl: WebGLRenderingContext): WebGLProgram | null {
  const vertices = compilar(gl, gl.VERTEX_SHADER, SOMBREADOR_DE_VERTICES);
  const fragmentos = compilar(gl, gl.FRAGMENT_SHADER, SOMBREADOR_DE_FRAGMENTOS);
  const programa = gl.createProgram();
  if (!vertices || !fragmentos || !programa) {
    return null;
  }
  gl.attachShader(programa, vertices);
  gl.attachShader(programa, fragmentos);
  gl.linkProgram(programa);
  // Depois de ligado, o programa guarda o que precisa dos dois.
  gl.deleteShader(vertices);
  gl.deleteShader(fragmentos);
  if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) {
    if (import.meta.env.DEV) {
      console.warn('Pomar: programa recusado', gl.getProgramInfoLog(programa));
    }
    gl.deleteProgram(programa);
    return null;
  }
  return programa;
}

function enviarAtributo(gl: WebGLRenderingContext, programa: WebGLProgram, nome: string, dados: Float32Array): WebGLBuffer | null {
  const buffer = gl.createBuffer();
  const local = gl.getAttribLocation(programa, nome);
  if (!buffer || local < 0) {
    return null;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, dados, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(local);
  gl.vertexAttribPointer(local, 3, gl.FLOAT, false, 0, 0);
  return buffer;
}

// Cria a cena no canvas. Devolve null quando não dá para desenhar bem: sem
// WebGL, só com desenho por software (failIfMajorPerformanceCaveat: a máquina
// sem placa de vídeo ficaria lenta) ou com o shader recusado. Nesses casos a
// landing mantém os contornos em SVG, que já são o visual de antes.
export function criarCenaDoPomar(canvas: HTMLCanvasElement, pomar: Pomar): CenaDoPomar | null {
  const gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl) {
    return null;
  }
  const programa = montarPrograma(gl);
  if (!programa) {
    return null;
  }
  gl.useProgram(programa);
  const buffers = [
    enviarAtributo(gl, programa, 'a_posicao', pomar.posicoes),
    enviarAtributo(gl, programa, 'a_atributo', pomar.atributos),
  ];
  if (buffers.some((buffer) => buffer === null)) {
    gl.deleteProgram(programa);
    return null;
  }

  const local = (nome: string) => gl.getUniformLocation(programa, nome);
  const u = {
    matriz: local('u_matriz'),
    tempo: local('u_tempo'),
    escala: local('u_escala'),
    profundidade: local('u_profundidade'),
    ponteiro: local('u_ponteiro'),
    gotas: local('u_gotas'),
    mascara: local('u_mascara'),
    intensidade: local('u_intensidade'),
  };
  gl.uniform1f(u.profundidade, CAMPO.profundidade);
  // Folhas semitransparentes umas sobre as outras, com a cor já multiplicada
  // pelo alfa (o canvas é premultiplicado).
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  const gotas = new Float32Array(MAXIMO_DE_GOTAS * 4);

  return {
    redimensionar(larguraCss, alturaCss, densidade) {
      canvas.width = Math.max(1, Math.round(larguraCss * densidade));
      canvas.height = Math.max(1, Math.round(alturaCss * densidade));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(u.escala, pixelsPorUnidade(canvas.height));
    },
    desenhar(quadro) {
      gotas.fill(0);
      quadro.gotas.slice(0, MAXIMO_DE_GOTAS).forEach((gota, indice) => {
        gotas.set([gota.x, gota.z, gota.inicio, gota.forca], indice * 4);
      });
      gl.uniformMatrix4fv(u.matriz, false, quadro.matriz);
      gl.uniform1f(u.tempo, quadro.tempo);
      gl.uniform3fv(u.ponteiro, quadro.ponteiro);
      gl.uniform4fv(u.gotas, gotas);
      gl.uniform4fv(u.mascara, quadro.mascara);
      gl.uniform1f(u.intensidade, quadro.intensidade);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, Math.min(pomar.quantidade, Math.max(0, Math.floor(quadro.folhas))));
    },
    destruir() {
      buffers.forEach((buffer) => gl.deleteBuffer(buffer));
      gl.deleteProgram(programa);
      // Devolve o contexto na hora (o navegador limita quantos ficam abertos).
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
