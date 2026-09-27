import { useSyncExternalStore } from 'react';
import Icone from './Icone';
import { alternarTema, assinarTema, temaAtual } from '../servicos/tema';

// Botão de modo escuro: mostra a lua no claro e o sol no escuro (o tema para
// onde o clique leva). aria-pressed diz ao leitor de tela se o modo escuro
// está ligado.
export default function AlternadorDeTema({ className = '' }) {
  const escuro = useSyncExternalStore(assinarTema, temaAtual) === 'escuro';
  return (
    <button
      type="button"
      className={`botao-icone alternador-de-tema ${className}`.trim()}
      aria-pressed={escuro}
      aria-label="Modo escuro"
      title={escuro ? 'Voltar ao modo claro' : 'Ativar o modo escuro'}
      onClick={alternarTema}
    >
      <Icone nome={escuro ? 'sol' : 'lua'} />
    </button>
  );
}
