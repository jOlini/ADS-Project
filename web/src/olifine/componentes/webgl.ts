// Peças comuns das cenas WebGL da landing (o pomar do topo e as folhas ao
// vento do resto da página): compilar e ligar os shaders, mandar os atributos
// para a placa de vídeo e abrir o contexto do jeito que as duas precisam.
// WebGL 1 puro, sem biblioteca.

// Contexto leve: sem profundidade nem estêncil (as cenas desenham pontos
// semitransparentes na ordem), canvas premultiplicado e a placa de vídeo de
// menor consumo. failIfMajorPerformanceCaveat recusa o desenho por software
// (máquina sem placa de vídeo ficaria lenta): aí a landing segue sem a cena.
export function abrirContexto(canvas: HTMLCanvasElement): WebGLRenderingContext | null {
  return canvas.getContext('webgl', {
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    powerPreference: 'low-power',
    failIfMajorPerformanceCaveat: true,
  });
}

function compilar(gl: WebGLRenderingContext, tipo: number, fonte: string, nome: string): WebGLShader | null {
  const sombreador = gl.createShader(tipo);
  if (!sombreador) {
    return null;
  }
  gl.shaderSource(sombreador, fonte);
  gl.compileShader(sombreador);
  if (!gl.getShaderParameter(sombreador, gl.COMPILE_STATUS)) {
    // Em desenvolvimento, o motivo aparece no console; publicado, a landing
    // só segue sem a cena.
    if (import.meta.env.DEV) {
      console.warn(`${nome}: shader recusado`, gl.getShaderInfoLog(sombreador));
    }
    gl.deleteShader(sombreador);
    return null;
  }
  return sombreador;
}

// Programa com os dois shaders ligados, ou null quando a placa recusa algum.
export function montarPrograma(
  gl: WebGLRenderingContext,
  vertices: string,
  fragmentos: string,
  nome: string,
): WebGLProgram | null {
  const deVertices = compilar(gl, gl.VERTEX_SHADER, vertices, nome);
  const deFragmentos = compilar(gl, gl.FRAGMENT_SHADER, fragmentos, nome);
  const programa = gl.createProgram();
  if (!deVertices || !deFragmentos || !programa) {
    return null;
  }
  gl.attachShader(programa, deVertices);
  gl.attachShader(programa, deFragmentos);
  gl.linkProgram(programa);
  // Depois de ligado, o programa guarda o que precisa dos dois.
  gl.deleteShader(deVertices);
  gl.deleteShader(deFragmentos);
  if (!gl.getProgramParameter(programa, gl.LINK_STATUS)) {
    if (import.meta.env.DEV) {
      console.warn(`${nome}: programa recusado`, gl.getProgramInfoLog(programa));
    }
    gl.deleteProgram(programa);
    return null;
  }
  return programa;
}

// Manda um atributo (tamanho números por vértice) para a placa, uma vez só:
// as cenas não mudam os buffers depois de criadas.
export function enviarAtributo(
  gl: WebGLRenderingContext,
  programa: WebGLProgram,
  nome: string,
  dados: Float32Array,
  tamanho = 3,
): WebGLBuffer | null {
  const buffer = gl.createBuffer();
  const local = gl.getAttribLocation(programa, nome);
  if (!buffer || local < 0) {
    return null;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, dados, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(local);
  gl.vertexAttribPointer(local, tamanho, gl.FLOAT, false, 0, 0);
  return buffer;
}

// Devolve o contexto na hora (o navegador limita quantos ficam abertos).
export function liberarContexto(gl: WebGLRenderingContext): void {
  gl.getExtension('WEBGL_lose_context')?.loseContext();
}
