// Curva suave que passa por todos os pontos sem inventar picos entre eles
// (interpolação monotônica de Fritsch–Carlson): o gráfico de saldo nunca
// desenha um valor que não existiu. Pontos { x, y } em ordem de x.

export function caminhoSuave(pontos) {
  if (pontos.length === 0) {
    return '';
  }
  if (pontos.length === 1) {
    return `M${pontos[0].x} ${pontos[0].y}`;
  }
  const n = pontos.length;
  const inclinacoes = [];
  for (let i = 0; i < n - 1; i += 1) {
    inclinacoes.push((pontos[i + 1].y - pontos[i].y) / (pontos[i + 1].x - pontos[i].x));
  }
  // Tangente em cada ponto: zero onde a curva muda de direção.
  const tangentes = [inclinacoes[0]];
  for (let i = 1; i < n - 1; i += 1) {
    const antes = inclinacoes[i - 1];
    const depois = inclinacoes[i];
    tangentes.push(antes * depois <= 0 ? 0 : (2 * antes * depois) / (antes + depois));
  }
  tangentes.push(inclinacoes[n - 2]);

  const numero = (valor) => Number(valor.toFixed(2));
  let caminho = `M${numero(pontos[0].x)} ${numero(pontos[0].y)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const a = pontos[i];
    const b = pontos[i + 1];
    const terco = (b.x - a.x) / 3;
    caminho +=
      `C${numero(a.x + terco)} ${numero(a.y + tangentes[i] * terco)} ` +
      `${numero(b.x - terco)} ${numero(b.y - tangentes[i + 1] * terco)} ${numero(b.x)} ${numero(b.y)}`;
  }
  return caminho;
}

// "R$ 4,5 mil", "R$ 12 mil", "R$ 1,2 mi": rótulo curto do eixo do gráfico.
export function valorCurto(centavos) {
  const reais = centavos / 100;
  const absoluto = Math.abs(reais);
  const sinal = reais < 0 ? '−' : '';
  const formato = (valor) => valor.toLocaleString('pt-BR', { maximumFractionDigits: valor < 10 ? 1 : 0 });
  if (absoluto >= 1_000_000) {
    return `${sinal}R$ ${formato(absoluto / 1_000_000)} mi`;
  }
  if (absoluto >= 1000) {
    return `${sinal}R$ ${formato(absoluto / 1000)} mil`;
  }
  return `${sinal}R$ ${formato(absoluto)}`;
}
