import { useEffect, useRef } from 'react';
import Icone from './Icone';
import { textoDaSelecao } from '../regras/selecao';

// Barra da seleção em lote, no topo de uma lista: a caixa "Selecionar todos"
// (indeterminada quando só alguns estão marcados), quantos itens há e quantos
// foram marcados, "Remover selecionados" e "Remover todos". A página pede a
// confirmação: aoRemover recebe os ids (os marcados ou todos os da tela).
//
// ids: os ids na tela; selecao: o useSelecao da lista; nomes: [singular,
// plural] do item ("cartão", "cartões").
export default function BarraDeSelecao({ ids, selecao, nomes, aoRemover, ocupado = false }) {
  const caixa = useRef(null);
  const quantos = selecao.selecionados.length;

  // "Alguns marcados" não existe como atributo no HTML: só pela propriedade.
  useEffect(() => {
    if (caixa.current) {
      caixa.current.indeterminate = selecao.situacao === 'alguns';
    }
  }, [selecao.situacao]);

  if (ids.length === 0) {
    return null;
  }

  return (
    <div className={`barra-de-selecao${quantos > 0 ? ' com-marcados' : ''}`} role="group" aria-label={`Seleção de ${nomes[1]}`}>
      <label className="marcar-todos">
        <input
          ref={caixa}
          type="checkbox"
          checked={selecao.situacao === 'todos'}
          onChange={selecao.alternarTodos}
          aria-label={selecao.situacao === 'todos' ? 'Desmarcar todos' : 'Selecionar todos'}
        />
        <span aria-live="polite">{textoDaSelecao(quantos, ids.length, nomes)}</span>
      </label>
      <div className="acoes-da-selecao">
        {quantos > 0 && (
          <button type="button" className="discreto-botao" onClick={selecao.limpar} disabled={ocupado}>
            Limpar
          </button>
        )}
        <button type="button" className="perigo-discreto" onClick={() => aoRemover(selecao.selecionados)} disabled={ocupado || quantos === 0}>
          <Icone nome="excluir" tamanho={16} />
          Remover selecionados
        </button>
        <button type="button" className="perigo-discreto" onClick={() => aoRemover(ids)} disabled={ocupado}>
          Remover todos
        </button>
      </div>
    </div>
  );
}
