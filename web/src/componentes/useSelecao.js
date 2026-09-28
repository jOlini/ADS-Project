import { useState } from 'react';
import { alternar, alternarTodos, marcadosVisiveis, situacaoDaSelecao } from '../regras/selecao';

// Estado da seleção em lote de uma lista (regras/selecao.js). idsVisiveis são
// os ids na tela, na ordem: o que um filtro ou a busca esconde deixa de
// contar como selecionado.
export function useSelecao(idsVisiveis) {
  const [marcados, setMarcados] = useState(() => new Set());
  const selecionados = marcadosVisiveis(marcados, idsVisiveis);

  return {
    selecionados,
    situacao: situacaoDaSelecao(marcados, idsVisiveis),
    marcado: (id) => marcados.has(id),
    alternar: (id) => setMarcados((atual) => alternar(atual, id)),
    alternarTodos: () => setMarcados((atual) => alternarTodos(atual, idsVisiveis)),
    limpar: () => setMarcados(new Set()),
  };
}
