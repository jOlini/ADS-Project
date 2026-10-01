// O dinheiro das cenas WebGL da landing, em GLSL: a moeda 3D e a cédula que o
// céu do resto da página (cenaDasFolhas.ts) e o pomar do topo (cenaDoPomar.ts)
// desenham. Um texto só, colado nos dois shaders de fragmentos: a mesma moeda
// e a mesma cédula nas duas cenas, sem textura nem arquivo de imagem (tudo é
// campo de distância, calculado em cada pixel do ponto).
//
// As funções recebem o ponto já girado no plano da tela (p, de -1 a 1, y para
// baixo como o gl_PointCoord), a virada em volta do eixo vertical (rad), a
// borda suave (no espaço de p) e o tamanho do ponto em px: abaixo de 9 px o
// cifrão não se lê e não é calculado. Devolvem a cor em rgb e, em a, a
// distância até a beira (positiva dentro), para o alfa de quem chama.
export const GLSL_DO_DINHEIRO = `
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

// Moeda em 3D: o corpo é a face "arrastada" pela espessura, que aparece
// quando a moeda vira de lado; a face fica na frente desse corpo. O cifrão é
// desenhado no plano da tela (só achatado pela virada): lido do jeito certo na
// frente e no verso, sem espelhar.
vec4 moeda3d(vec2 p, float virada, float suave, float tamanho) {
  float frente = cos(virada);
  float largura = max(abs(frente), 0.1);
  vec2 q = p * 1.12;
  float lado = sin(virada);
  float espessura = 0.18 * abs(lado);
  float dx = q.x - clamp(q.x, -espessura, espessura);
  float borda = (1.0 - length(vec2(dx / largura, q.y))) / 1.12;
  vec2 f = vec2((q.x + espessura * sign(lado)) / largura, q.y);
  float rf = length(f);
  float naFace = 1.0 - smoothstep(0.98, 1.0, rf);
  // A espessura: ouro escuro com a serrilha da borda.
  vec3 lateral = vec3(0.62, 0.44, 0.15) * (0.82 + 0.18 * step(0.5, fract(q.y * 7.0)));
  // A face: ouro que clareia para o alto à esquerda, o aro em relevo e o
  // cifrão em baixo relevo (escuro, com a luz na borda de baixo).
  vec3 ouro = mix(vec3(0.99, 0.83, 0.40), vec3(0.86, 0.62, 0.20), smoothstep(0.0, 1.3, length(f - vec2(-0.4, -0.45))));
  float aro = smoothstep(0.68, 0.72, rf) * (1.0 - smoothstep(0.80, 0.84, rf));
  ouro = mix(ouro, ouro * 0.8, aro);
  if (tamanho >= 9.0) {
    float simbolo = cifrao(f / 0.6, suave * 2.0);
    float luzDoSimbolo = cifrao((f - vec2(0.0, 0.035)) / 0.6, suave * 2.0);
    ouro = mix(ouro, vec3(1.0, 0.93, 0.66), luzDoSimbolo * (1.0 - simbolo) * 0.8);
    ouro = mix(ouro, vec3(0.55, 0.35, 0.07), simbolo);
  }
  // O brilho que acende quando a face olha para a luz.
  ouro += vec3(0.2) * smoothstep(0.4, 0.0, length(f - vec2(-0.4, -0.45))) * abs(frente);
  vec3 cor = mix(lateral, ouro, naFace);
  // O contorno de desenho animado.
  cor = mix(vec3(0.38, 0.25, 0.07), cor, smoothstep(0.0, 0.06, borda));
  return vec4(cor, borda);
}

// Cédula: retângulo deitado de cantos redondos (0,86 × 0,48 de meia medida,
// para os cantos não saírem do quadrado do ponto quando ela gira), que ondula
// um pouco ao vento. Verde-dinheiro, a moldura fina por dentro da borda, os
// dois selos nas pontas, o medalhão claro com o cifrão no meio e o verso mais
// claro quando vira.
vec4 cedula(vec2 p, float virada, float suave, float tamanho) {
  float frente = cos(virada);
  float largura = max(abs(frente), 0.1);
  vec2 q = vec2(p.x / largura, p.y);
  q.y += sin(q.x * 3.0 + virada) * 0.04;
  vec2 d = abs(q) - vec2(0.86, 0.48) + 0.1;
  float borda = -(length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.1);
  vec3 cor = vec3(0.50, 0.72, 0.44);
  float moldura = smoothstep(0.05, 0.08, borda) * (1.0 - smoothstep(0.1, 0.13, borda));
  cor = mix(cor, vec3(0.30, 0.52, 0.30), moldura);
  float selos = 1.0 - smoothstep(0.09, 0.12, length(vec2(abs(q.x) - 0.6, q.y)));
  cor = mix(cor, vec3(0.36, 0.58, 0.34), selos);
  float medalhao = 1.0 - smoothstep(0.27, 0.3, length(q));
  cor = mix(cor, vec3(0.80, 0.90, 0.72), medalhao);
  if (tamanho >= 9.0) {
    cor = mix(cor, vec3(0.20, 0.42, 0.24), cifrao(q / 0.22, suave * 4.0) * medalhao);
  }
  cor = mix(cor, cor * 0.78 + vec3(0.12), step(frente, 0.0) * 0.5);
  return vec4(cor, borda);
}
`;
