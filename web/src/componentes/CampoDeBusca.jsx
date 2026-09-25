import { useRef } from 'react';
import Icone from './Icone';

// Campo de busca com a lupa na frente e um botão para limpar. Esc também
// limpa. O filtro acontece a cada letra, sem botão de buscar.
export default function CampoDeBusca({ valor, aoMudar, rotulo, placeholder, className = '' }) {
  const campo = useRef(null);

  function limpar() {
    aoMudar('');
    campo.current?.focus();
  }

  return (
    <div className={`campo-de-busca ${className}`.trim()} role="search">
      <Icone nome="busca" tamanho={18} />
      <input
        ref={campo}
        type="search"
        aria-label={rotulo}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        onKeyDown={(evento) => {
          if (evento.key === 'Escape' && valor) {
            evento.preventDefault();
            limpar();
          }
        }}
      />
      {valor && (
        <button type="button" className="botao-icone" onClick={limpar} aria-label="Limpar a busca">
          <Icone nome="fechar" tamanho={16} />
        </button>
      )}
    </div>
  );
}
