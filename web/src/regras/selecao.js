// Seleção em lote das listas (extrato, fatura, faturas, contas, cartões e
// categorias), sem interface. Os marcados são um Set de ids; nenhuma função
// muda o Set recebido: cada troca devolve um novo, como o estado do React pede.
//
// Só conta o que está na tela: se um filtro ou a busca esconde um item
// marcado, ele sai da seleção. Assim "Remover selecionados" nunca apaga algo
// que a pessoa não está vendo.

export function marcadosVisiveis(marcados, idsVisiveis) {
  return idsVisiveis.filter((id) => marcados.has(id));
}

export function alternar(marcados, id) {
  const novo = new Set(marcados);
  if (novo.has(id)) {
    novo.delete(id);
  } else {
    novo.add(id);
  }
  return novo;
}

// Estado da caixa "Selecionar todos": 'todos', 'alguns' (a caixa fica
// indeterminada) ou 'nenhum'.
export function situacaoDaSelecao(marcados, idsVisiveis) {
  const quantos = marcadosVisiveis(marcados, idsVisiveis).length;
  if (quantos === 0) {
    return 'nenhum';
  }
  return quantos === idsVisiveis.length ? 'todos' : 'alguns';
}

// "Selecionar todos": marca tudo o que está na tela; com tudo já marcado,
// desmarca.
export function alternarTodos(marcados, idsVisiveis) {
  return situacaoDaSelecao(marcados, idsVisiveis) === 'todos' ? new Set() : new Set(idsVisiveis);
}

const contar = (quantidade, [singular, plural]) => `${quantidade} ${quantidade === 1 ? singular : plural}`;

// "3 de 12 selecionados" com algo marcado; senão, "12 lançamentos".
// nomes: [singular, plural] do item ("lançamento", "lançamentos").
export function textoDaSelecao(quantos, total, nomes) {
  if (quantos === 0) {
    return contar(total, nomes);
  }
  return `${quantos} de ${total} ${quantos === 1 ? 'selecionado' : 'selecionados'}`;
}
