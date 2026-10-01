// A cena WebGL do topo da landing: o campo de folhas, pontos, moedas e
// cédulas que sobe da esquerda para a direita como a curva do saldo, ondula
// devagar e se levanta sob o ponteiro. As folhas são a maioria (70/10/20,
// regras/pomar.ts); a moeda 3D e a cédula são as mesmas do céu do resto da
// página (dinheiroNoShader.ts). O dinheiro é desenhado antes e um pouco mais
// baixo que a folhagem: fica sob e entre as folhas, sem cobrir o campo. Só o hover mexe no campo: clicar não faz nada (os
// anéis de "rega" no toque saíram).
// WebGL 1 puro, sem biblioteca e sem textura: um programa, dois buffers e
// dois desenhos de pontos por quadro (o dinheiro, depois a folhagem). A conta de câmera, ponteiro e distribuição das folhas
// está em regras/pomar.ts; o relevo e a cor são calculados aqui, no shader,
// para cada folha.

import { CAMPO, TIPO, pixelsPorUnidade, quantoDesenhar, type Matriz4, type Pomar } from '../regras/pomar';
import { GLSL_DO_DINHEIRO } from './dinheiroNoShader';
import { abrirContexto, enviarAtributo, liberarContexto, montarPrograma } from './webgl';

export interface QuadroDaCena {
  // Relógio da cena (s): só anda com a cena visível, então nada pula ao voltar.
  tempo: number;
  matriz: Matriz4;
  // Onde o ponteiro toca o chão e com que força (0 a 1).
  ponteiro: [number, number, number];
  // Caixa do texto na tela (-1 a 1): as folhas por trás dele se apagam.
  mascara: [number, number, number, number];
  // 1 no tema claro; menos no escuro, onde a esmeralda é mais funda.
  intensidade: number;
  // Quantas peças desenhar no total (folhagem e dinheiro): a cena corta os
  // dois grupos na mesma proporção (quantoDesenhar), e os 70/10/20 ficam.
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
uniform vec4 u_mascara;
varying float v_tipo;
varying float v_giro;
varying float v_virada;
varying float v_tamanho;
varying float v_alfa;
varying float v_brilho;
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
  // Moeda e cédula ficam um pouco abaixo da folhagem (TIPO.moeda e acima):
  // as folhas em volta passam na frente, e o dinheiro aparece entre elas.
  float dinheiro = step(${TIPO.moeda}.0 - 0.5, a_atributo.x);
  h -= dinheiro * 0.06;

  // Profundidade do campo é o z negativo do mundo (regras/pomar.ts).
  vec4 posicao = u_matriz * vec4(p.x, h, -p.y, 1.0);
  gl_Position = posicao;
  float w = max(posicao.w, 0.1);
  float tamanho = a_atributo.z * u_escala / w * (1.0 + min(brilho, 1.0) * 0.5);
  gl_PointSize = clamp(tamanho, 1.0, 40.0);
  v_tamanho = gl_PointSize;
  v_tipo = a_atributo.x;
  float balancoDoGiro = sin(u_tempo * 0.8 + fase * 6.2832) * 0.3;
  // A moeda fica quase de pé (o cifrão se lê); folha, ponto e cédula giram.
  float ehMoeda = step(${TIPO.moeda}.0 - 0.5, a_atributo.x) * step(a_atributo.x, ${TIPO.moeda}.0 + 0.5);
  v_giro = mix(a_atributo.y + balancoDoGiro, balancoDoGiro, ehMoeda);
  // Moeda e cédula viram devagar em volta do eixo vertical, cada uma no seu
  // tempo: o brilho da face acende e apaga no meio das folhas.
  // Volta a 0 a cada giro: no fragmento (precisão média) um ângulo grande,
  // depois de minutos na página, perderia a casa decimal.
  v_virada = mod(u_tempo * (0.5 + fase * 0.6) + fase * 6.2832, 6.2832);
  v_brilho = min(brilho, 1.0);

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
uniform float u_intensidade;
varying float v_tipo;
varying float v_giro;
varying float v_virada;
varying float v_tamanho;
varying float v_alfa;
varying float v_brilho;
varying vec3 v_cor;

${GLSL_DO_DINHEIRO}
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
    // Moeda 3D ou cédula (dinheiroNoShader.ts), com a luz da face e o mesmo
    // clarão das folhas sob o ponteiro.
    vec4 peca;
    if (v_tipo < ${TIPO.nota}.0 - 0.5) {
      peca = moeda3d(p, v_virada, suave, v_tamanho);
    } else {
      peca = cedula(p, v_virada, suave, v_tamanho);
    }
    cor = peca.rgb * (0.8 + 0.2 * abs(cos(v_virada)));
    // Longe (ponto pequeno), o dinheiro puxa a cor do campo e fica mais
    // transparente: o ouro não vira um pontilhado amarelo no horizonte, e as
    // folhas seguem mandando no campo. De perto, a moeda e a cédula aparecem
    // inteiras.
    float perto = smoothstep(6.0, 16.0, v_tamanho);
    cor = mix(mix(cor, v_cor, 0.55), cor, perto);
    cor = mix(cor, vec3(0.925, 0.961, 0.941), v_brilho * 0.35);
    borda = peca.a;
    opacidade = mix(0.55, 0.9, perto);
  }
  float alfa = smoothstep(0.0, suave, borda) * v_alfa * opacidade * u_intensidade;
  if (alfa < 0.004) {
    discard;
  }
  gl_FragColor = vec4(cor * alfa, alfa);
}
`;

// Cria a cena no canvas. Devolve null quando não dá para desenhar bem: sem
// WebGL, só com desenho por software (failIfMajorPerformanceCaveat: a máquina
// sem placa de vídeo ficaria lenta) ou com o shader recusado. Nesses casos a
// landing mantém os contornos em SVG, que já são o visual de antes.
export function criarCenaDoPomar(canvas: HTMLCanvasElement, pomar: Pomar): CenaDoPomar | null {
  const gl = abrirContexto(canvas);
  if (!gl) {
    return null;
  }
  const programa = montarPrograma(gl, SOMBREADOR_DE_VERTICES, SOMBREADOR_DE_FRAGMENTOS, 'Pomar');
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
    mascara: local('u_mascara'),
    intensidade: local('u_intensidade'),
  };
  gl.uniform1f(u.profundidade, CAMPO.profundidade);
  // Folhas semitransparentes umas sobre as outras, com a cor já multiplicada
  // pelo alfa (o canvas é premultiplicado).
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  return {
    redimensionar(larguraCss, alturaCss, densidade) {
      canvas.width = Math.max(1, Math.round(larguraCss * densidade));
      canvas.height = Math.max(1, Math.round(alturaCss * densidade));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform1f(u.escala, pixelsPorUnidade(canvas.height));
    },
    desenhar(quadro) {
      gl.uniformMatrix4fv(u.matriz, false, quadro.matriz);
      gl.uniform1f(u.tempo, quadro.tempo);
      gl.uniform3fv(u.ponteiro, quadro.ponteiro);
      gl.uniform4fv(u.mascara, quadro.mascara);
      gl.uniform1f(u.intensidade, quadro.intensidade);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // Sem teste de profundidade, quem vem depois pinta por cima: o dinheiro
      // primeiro, a folhagem depois. O corte da máquina lenta é proporcional
      // nos dois grupos (70/10/20 mantido).
      const desenho = quantoDesenhar(pomar, quadro.folhas);
      if (desenho.dinheiro > 0) {
        gl.drawArrays(gl.POINTS, pomar.dinheiro.inicio, desenho.dinheiro);
      }
      if (desenho.folhagem > 0) {
        gl.drawArrays(gl.POINTS, pomar.folhagem.inicio, desenho.folhagem);
      }
    },
    // Limpeza ao desmontar: solta os atributos, apaga os dois buffers e o
    // programa e devolve o contexto (o navegador limita quantos ficam abertos).
    destruir() {
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      ['a_posicao', 'a_atributo'].forEach((nome) => {
        const local = gl.getAttribLocation(programa, nome);
        if (local >= 0) {
          gl.disableVertexAttribArray(local);
        }
      });
      buffers.forEach((buffer) => gl.deleteBuffer(buffer));
      gl.useProgram(null);
      gl.deleteProgram(programa);
      liberarContexto(gl);
    },
  };
}
