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
import { GLSL_DO_DINHEIRO } from './dinheiroNoShader';
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
  // Volta a 0 a cada giro: no fragmento (precisão média) um ângulo grande,
  // depois de minutos na página, perderia a casa decimal.
  v_virada = mod(u_tempo * (0.45 + velocidade * 0.8) + fase * 6.2832, 6.2832);
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

${GLSL_DO_DINHEIRO}
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
    // Moeda 3D (componentes/dinheiroNoShader.ts).
    vec4 moeda = moeda3d(p, v_virada, suave, v_tamanho);
    cor = moeda.rgb;
    borda = moeda.a;
    // Mais firme que as folhas: a moeda é o destaque do céu.
    opacidade = 1.3;
  } else {
    // Cédula (componentes/dinheiroNoShader.ts).
    vec4 nota = cedula(p, v_virada, suave, v_tamanho);
    cor = nota.rgb;
    borda = nota.a;
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
