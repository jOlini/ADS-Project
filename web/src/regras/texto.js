// Texto para comparação: minúsculas, sem acento e com os espaços apertados.
// "  Ação " e "acao" viram a mesma coisa; serve para busca e para achar uma
// opção pela letra digitada.
export function normalizarTexto(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
