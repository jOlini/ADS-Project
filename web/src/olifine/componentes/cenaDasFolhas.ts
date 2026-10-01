// A cena WebGL das folhas ao vento: folhas, moedas e cédulas soltas no ar atrás de toda
// a página abaixo do topo. Cada uma sobe devagar, balança, gira no plano da
// tela e vira em volta do próprio eixo (mostra o verso, mais claro, e fica de
// lado, fininha): é o que dá volume a um ponto desenhado. As de perto andam
// mais com a rolagem que as do fundo (paralaxe) e têm a cor mais funda; as do
// fundo ficam pequenas, claras e desfocadas, como numa névoa.
//
// A moeda é uma caricatura 3D: a face dourada com o aro em relevo e o cifrão
// ($) no centro, a espessura serrilhada que aparece quando ela vira de lado e
// o contorno escuro de desenho animado. A cédula é um retângulo deitado, de
// cantos redondos, com a moldura, os selos nas pontas e o medalhão do cifrão.
// Nenhuma peça vira outra: cada uma sobe com a forma com que nasceu (a troca
// de folha para cédula não fechava, as duas formas não combinam).
//
// WebGL 1 puro, um desenho de pontos por quadro e nada alocado depois de
// criada. Carregada só quando a página chega perto dela (FolhasAoVento.tsx).
// A distribuição e a paralaxe estão em regras/folhasAoVento.ts.

import { TIPO_NO_AR, type FolhasAoVento } from '../regras/folhasAoVento';
import { abrirContexto, enviarAtributo, liberarContexto, montarPrograma } from './webgl';

export interface QuadroDasFolhas {
  // Relógio da cena (s): só anda com a cena visível, então nada pula ao voltar.
  tempo: number;
  // Quanto a página rolou (px de CSS).
  rolagem: number;
  // Ponteiro na tela (-1 a 1), já suavizado; 0 no toque.
  ponteiro: [number, number];
  // 1 no tema claro; menos no escuro.
  intensidade: number;
  // Quantas desenhar (as primeiras da lista, que já vem embaralhada).
  folhas: number;
}

export interface CenaDasFolhas {
  redimensionar(larguraCss: number, alturaCss: number, densidade: number): void;
  desenhar(quadro: QuadroDasFolhas): void;
  destruir(): void;
}

const SOMBREADOR_DE_VERTICES = `
precision highp float;
attribute vec4 a_posicao;
attribute vec4 a_atributo;
uniform float u_tempo;
uniform float u_rolagem;
uniform vec2 u_tela;
uniform float u_densidade;
uniform vec2 u_ponteiro;
varying float v_tipo;
varying float v_giro;
varying float v_virada;
varying float v_tamanho;
varying float v_alfa;
varying float v_fundo;

void main() {
  float fundo = a_posicao.z;
  // Mesmo divisor de regras/folhasAoVento.ts: 1 na frente, 3,2 no fundo.
  float divisor = 1.0 + 2.2 * fundo;
  float fase = a_posicao.w;
  float velocidade = a_atributo.z;

  // A coluna do céu é maior que a tela: a folha que sai por cima volta por
  // baixo, fora da vista.
  float margem = 140.0;
  float coluna = u_tela.y + margem * 2.0;
  float subida = u_tempo * velocidade * 16.0 / divisor;
  float y = a_posicao.y * coluna - subida - u_rolagem * 0.6 / divisor;
  y = mod(y, coluna) - margem;
  float balanco = sin(u_tempo * (0.35 + velocidade * 0.3) + fase * 6.2832) * 30.0 / divisor;
  float x = (a_posicao.x * 0.5 + 0.5) * u_tela.x + balanco - u_ponteiro.x * 26.0 / divisor;
  y += u_ponteiro.y * 16.0 / divisor;

  gl_Position = vec4(x / u_tela.x * 2.0 - 1.0, 1.0 - y / u_tela.y * 2.0, 0.0, 1.0);
  float tamanho = a_atributo.y * u_densidade / divisor;
  gl_PointSize = clamp(tamanho, 1.0, 96.0);
  v_tamanho = gl_PointSize;
  v_tipo = a_atributo.x;
  // A moeda só balança um pouco no plano da tela: o cifrão fica de pé.
  float ehMoeda = step(0.5, a_atributo.x) * step(a_atributo.x, 1.5);
  float balancoDoGiro = sin(u_tempo * 0.45 + fase * 6.2832);
  v_giro = mix(a_atributo.w + balancoDoGiro * 0.7, balancoDoGiro * 0.35, ehMoeda);
  v_virada = u_tempo * (0.45 + velocidade * 0.8) + fase * 6.2832;
  v_fundo = fundo;
  // O fundo apaga (névoa); a de perto, grande, também não pesa sobre o texto.
  v_alfa = mix(0.72, 0.2, fundo) * smoothstep(0.02, 0.18, fundo);
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
varying float v_fundo;

// Um traço de arco (anel de raio r e meia espessura w em volta de c), sem o
// pedaço entre os ângulos a0 e a1 (radianos, de -pi a pi). s é a borda suave.
float arco(vec2 p, vec2 c, float r, float w, float a0, float a1, float s) {
  vec2 d = p - c;
  float tracado = 1.0 - smoothstep(w - s, w + s, abs(length(d) - r));
  float angulo = atan(d.y, d.x);
  float corte = step(a0, angulo) * step(angulo, a1);
  return tracado * (1.0 - corte);
}

// O cifrão ($) no quadrado de -1 a 1, com y para baixo (gl_PointCoord): o S de
// dois arcos (o de baixo é o de cima girado meia volta) e a barra que o
// atravessa. Devolve 0 fora e 1 dentro.
float cifrao(vec2 p, float s) {
  p.y = -p.y;
  float r = 0.36;
  float w = 0.13;
  float cima = arco(p, vec2(0.0, r), r, w, -1.5708, 0.45, s);
  float baixo = arco(-p, vec2(0.0, r), r, w, -1.5708, 0.45, s);
  float barra = (1.0 - smoothstep(w * 0.7 - s, w * 0.7 + s, abs(p.x))) * step(abs(p.y), 1.0);
  return max(max(cima, baixo), barra);
}

void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float c = cos(v_giro);
  float s = sin(v_giro);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  // Virada em volta do eixo vertical: de lado, a peça fica fininha.
  float virada = cos(v_virada);
  float largura = max(abs(virada), 0.1);
  // Borda suave, mais larga no fundo (fora de foco).
  float suave = (2.0 + v_fundo * 9.0) / max(v_tamanho, 1.0);
  vec3 cor;
  float borda;
  float opacidade;
  if (v_tipo < ${TIPO_NO_AR.moeda}.0 - 0.5) {
    vec2 q = vec2(p.x / largura, p.y);
    // Folha: a lente de dois círculos do F do monograma, com a nervura.
    borda = 1.0 - max(length(q - vec2(0.0, 0.58)), length(q + vec2(0.0, 0.58)));
    // Verde de ação na frente, verde claro no fundo (perspectiva do ar).
    cor = mix(vec3(0.169, 0.471, 0.341), vec3(0.392, 0.749, 0.553), smoothstep(0.1, 0.6, v_fundo));
    cor = mix(cor, vec3(0.678, 0.820, 0.620), smoothstep(0.55, 1.0, v_fundo));
    // O verso, virado para a tela, é mais claro que a frente.
    cor = mix(cor, cor * 0.6 + vec3(0.36, 0.42, 0.36), step(virada, 0.0) * 0.55);
    cor *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.08, abs(q.y))) * step(abs(q.x), 0.7);
    opacidade = 0.9;
  } else if (v_tipo < ${TIPO_NO_AR.nota}.0 - 0.5) {
    // Moeda em 3D: o corpo é a face "arrastada" pela espessura, que aparece
    // quando a moeda vira de lado; a face fica na frente desse corpo.
    vec2 q = p * 1.12;
    float lado = sin(v_virada);
    float espessura = 0.18 * abs(lado);
    float dx = q.x - clamp(q.x, -espessura, espessura);
    borda = (1.0 - length(vec2(dx / largura, q.y))) / 1.12;
    vec2 f = vec2((q.x + espessura * sign(lado)) / largura, q.y);
    // O cifrão é desenhado no plano da tela (só achatado pela virada): lido
    // do jeito certo na frente e no verso, sem espelhar.
    float rf = length(f);
    float naFace = 1.0 - smoothstep(0.98, 1.0, rf);
    // A espessura: ouro escuro com a serrilha da borda.
    vec3 lateral = vec3(0.62, 0.44, 0.15) * (0.82 + 0.18 * step(0.5, fract(q.y * 7.0)));
    // A face: ouro que clareia para o alto à esquerda, o aro em relevo e o
    // cifrão em baixo relevo (escuro, com a luz na borda de baixo).
    vec3 ouro = mix(vec3(0.99, 0.83, 0.40), vec3(0.86, 0.62, 0.20), smoothstep(0.0, 1.3, length(f - vec2(-0.4, -0.45))));
    float aro = smoothstep(0.68, 0.72, rf) * (1.0 - smoothstep(0.80, 0.84, rf));
    ouro = mix(ouro, ouro * 0.8, aro);
    float simbolo = cifrao(f / 0.6, suave * 2.0);
    float luzDoSimbolo = cifrao((f - vec2(0.0, 0.035)) / 0.6, suave * 2.0);
    ouro = mix(ouro, vec3(1.0, 0.93, 0.66), luzDoSimbolo * (1.0 - simbolo) * 0.8);
    ouro = mix(ouro, vec3(0.55, 0.35, 0.07), simbolo);
    // O brilho que acende quando a face olha para a luz.
    ouro += vec3(0.2) * smoothstep(0.4, 0.0, length(f - vec2(-0.4, -0.45))) * abs(virada);
    cor = mix(lateral, ouro, naFace);
    // O contorno de desenho animado.
    cor = mix(vec3(0.38, 0.25, 0.07), cor, smoothstep(0.0, 0.06, borda));
    // Mais firme que as folhas: a moeda é o destaque do céu.
    opacidade = 1.3;
  } else {
    // Cédula: retângulo deitado de cantos redondos (0,86 × 0,48 de meia
    // medida, para os cantos não saírem do quadrado do ponto quando ela
    // gira), que ondula um pouco ao vento.
    vec2 q = vec2(p.x / largura, p.y);
    q.y += sin(q.x * 3.0 + v_virada) * 0.04;
    vec2 d = abs(q) - vec2(0.86, 0.48) + 0.1;
    borda = -(length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.1);
    // Verde-dinheiro, a moldura fina por dentro da borda, os dois selos nas
    // pontas e o medalhão claro com o cifrão no meio.
    cor = vec3(0.50, 0.72, 0.44);
    float moldura = smoothstep(0.05, 0.08, borda) * (1.0 - smoothstep(0.1, 0.13, borda));
    cor = mix(cor, vec3(0.30, 0.52, 0.30), moldura);
    float selos = 1.0 - smoothstep(0.09, 0.12, length(vec2(abs(q.x) - 0.6, q.y)));
    cor = mix(cor, vec3(0.36, 0.58, 0.34), selos);
    float medalhao = 1.0 - smoothstep(0.27, 0.3, length(q));
    cor = mix(cor, vec3(0.80, 0.90, 0.72), medalhao);
    cor = mix(cor, vec3(0.20, 0.42, 0.24), cifrao(q / 0.22, suave * 4.0) * medalhao);
    // O verso, virado para a tela, é mais claro.
    cor = mix(cor, cor * 0.78 + vec3(0.12), step(virada, 0.0) * 0.5);
    opacidade = 0.92;
  }
  // Luz de cima: a face de frente para ela clareia, a de lado escurece.
  cor *= 0.8 + 0.2 * abs(virada);
  float alfa = min(1.0, smoothstep(0.0, suave, borda) * v_alfa * opacidade * u_intensidade);
  if (alfa < 0.004) {
    discard;
  }
  gl_FragColor = vec4(cor * alfa, alfa);
}
`;

// Cria a cena no canvas, ou null quando não dá para desenhar bem (sem WebGL,
// só por software, shader recusado): a landing segue sem as folhas.
export function criarCenaDasFolhas(canvas: HTMLCanvasElement, folhas: FolhasAoVento): CenaDasFolhas | null {
  const gl = abrirContexto(canvas);
  if (!gl) {
    return null;
  }
  const programa = montarPrograma(gl, SOMBREADOR_DE_VERTICES, SOMBREADOR_DE_FRAGMENTOS, 'Folhas');
  if (!programa) {
    return null;
  }
  gl.useProgram(programa);
  const buffers = [
    enviarAtributo(gl, programa, 'a_posicao', folhas.posicoes, 4),
    enviarAtributo(gl, programa, 'a_atributo', folhas.atributos, 4),
  ];
  if (buffers.some((buffer) => buffer === null)) {
    gl.deleteProgram(programa);
    return null;
  }

  const local = (nome: string) => gl.getUniformLocation(programa, nome);
  const u = {
    tempo: local('u_tempo'),
    rolagem: local('u_rolagem'),
    tela: local('u_tela'),
    densidade: local('u_densidade'),
    ponteiro: local('u_ponteiro'),
    intensidade: local('u_intensidade'),
  };
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.clearColor(0, 0, 0, 0);

  return {
    redimensionar(larguraCss, alturaCss, densidade) {
      canvas.width = Math.max(1, Math.round(larguraCss * densidade));
      canvas.height = Math.max(1, Math.round(alturaCss * densidade));
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u.tela, Math.max(1, larguraCss), Math.max(1, alturaCss));
      gl.uniform1f(u.densidade, densidade);
    },
    desenhar(quadro) {
      gl.uniform1f(u.tempo, quadro.tempo);
      gl.uniform1f(u.rolagem, quadro.rolagem);
      gl.uniform2f(u.ponteiro, quadro.ponteiro[0], quadro.ponteiro[1]);
      gl.uniform1f(u.intensidade, quadro.intensidade);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, Math.min(folhas.quantidade, Math.max(0, Math.floor(quadro.folhas))));
    },
    destruir() {
      buffers.forEach((buffer) => gl.deleteBuffer(buffer));
      gl.deleteProgram(programa);
      liberarContexto(gl);
    },
  };
}
