// O notebook da landing preso na rolagem, sem interface: quanto da pista a
// pessoa já rolou e quanto a tampa abriu. Testado em notebook.test.ts.
//
// A seção do notebook é uma pista mais alta que a tela; dentro dela, o palco
// fica preso (position: sticky) enquanto a pista passa. A rolagem da pista
// abre a tampa de 0% (fechada) a 100% (aberta); só depois de aberta a pista
// acaba e a página volta a descer. É o "pin" do ScrollTrigger, sem biblioteca:
// o sticky do CSS prende e esta conta liga a rolagem ao ângulo.

// Parte da pista em que a tampa termina de abrir. O resto é a pausa com o
// notebook aberto (a tela já responde ao mouse) antes de a página seguir.
export const FIM_DA_ABERTURA = 0.78;
// A partir daqui a tampa conta como aberta e a tela do app passa a responder.
export const ABERTO = 0.98;
// Ângulo da tampa fechada (graus, em rotateX): quase deitada sobre a base.
export const TAMPA_FECHADA = -86;

const limitar = (valor: number) => Math.min(1, Math.max(0, valor));

// Quanto da pista já passou pela tela (0 a 1). topo é o topo da pista em
// relação à janela (getBoundingClientRect().top), altura a altura da pista e
// janela a altura da tela. Pista que cabe na tela (sem trava) conta como
// percorrida.
export function progressoDaPista(topo: number, altura: number, janela: number): number {
  const percurso = altura - janela;
  if (!(percurso > 0)) {
    return 1;
  }
  return limitar(-topo / percurso);
}

// Abertura da tampa (0 fechada, 1 aberta) para o progresso da pista: começa e
// assenta devagar, e no meio acompanha a rolagem quase um para um (a pessoa
// sente que é ela quem abre).
export function aberturaDaTampa(progresso: number): number {
  const t = limitar(progresso / FIM_DA_ABERTURA);
  return t * t * (3 - 2 * t);
}

// Ângulo da tampa (graus) para uma abertura.
export function anguloDaTampa(abertura: number): number {
  const angulo = TAMPA_FECHADA * (1 - limitar(abertura));
  // Sem "-0": o estilo escrito fica rotateX(0deg).
  return angulo === 0 ? 0 : angulo;
}
