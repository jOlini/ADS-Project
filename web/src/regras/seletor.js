// Navegação pelo teclado nas listas de opções (Seletor e Menu), sem
// interface. Uma opção é { rotulo, desabilitada? }; a posição é o índice.
import { normalizarTexto } from './texto';

// Índice da opção habilitada a `passo` posições de `atual` (1 = próxima,
// -1 = anterior, 10 = uma página). Para nas pontas em vez de dar a volta,
// como a lista do <select>. Pula as desabilitadas; -1 se nenhuma serve.
export function proximaHabilitada(opcoes, atual, passo) {
  if (opcoes.length === 0) {
    return -1;
  }
  const direcao = Math.sign(passo) || 1;
  const alvo = Math.min(Math.max(atual + passo, 0), opcoes.length - 1);
  for (let indice = alvo; indice >= 0 && indice < opcoes.length; indice += direcao) {
    if (!opcoes[indice].desabilitada) {
      return indice;
    }
  }
  for (let indice = alvo; indice >= 0 && indice < opcoes.length; indice -= direcao) {
    if (!opcoes[indice].desabilitada) {
      return indice;
    }
  }
  return -1;
}

export const primeiraHabilitada = (opcoes) => proximaHabilitada(opcoes, -1, 1);
export const ultimaHabilitada = (opcoes) => proximaHabilitada(opcoes, opcoes.length, -1);

// Opção cujo rótulo começa com o que a pessoa digitou (sem acento nem caixa).
// A mesma letra repetida ("mmm") anda entre as opções com aquela inicial;
// letras diferentes ("mer") procuram o começo inteiro. -1 se nada casa.
export function opcaoPorDigitacao(opcoes, digitado, atual) {
  const procurado = normalizarTexto(digitado);
  if (!procurado) {
    return -1;
  }
  const repetido = [...procurado].every((letra) => letra === procurado[0]);
  const alvo = repetido ? procurado[0] : procurado;
  const inicio = Math.max(repetido ? atual + 1 : atual, 0);
  for (let passo = 0; passo < opcoes.length; passo += 1) {
    const indice = (inicio + passo) % opcoes.length;
    const opcao = opcoes[indice];
    if (!opcao.desabilitada && normalizarTexto(opcao.rotulo).startsWith(alvo)) {
      return indice;
    }
  }
  return -1;
}
