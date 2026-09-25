import { useEffect, useId, useRef } from 'react';

// Diálogo de confirmação com o <dialog> nativo: prende o foco, fecha no Esc
// e devolve o foco a quem abriu. Mesmo desenho do diálogo do painel. Com
// perigo, o botão de confirmar fica vermelho (ação sem volta, como excluir).
export default function Confirmacao({ aberta, titulo, children, rotuloDeConfirmar, ocupado = false, perigo = false, aoConfirmar, aoCancelar }) {
  const dialogo = useRef(null);
  const idDoTitulo = useId();

  useEffect(() => {
    const elemento = dialogo.current;
    if (aberta && !elemento.open) {
      elemento.showModal();
    } else if (!aberta && elemento.open) {
      elemento.close();
    }
  }, [aberta]);

  return (
    <dialog ref={dialogo} className="dialogo" aria-labelledby={idDoTitulo} onClose={aoCancelar}>
      <form
        method="dialog"
        onSubmit={(evento) => {
          evento.preventDefault();
          aoConfirmar();
        }}
      >
        <h2 id={idDoTitulo}>{titulo}</h2>
        <div className="discreto">{children}</div>
        <div className="acoes">
          <button type="button" className="secundario" onClick={aoCancelar} disabled={ocupado}>
            Cancelar
          </button>
          <button type="submit" className={perigo ? 'perigo' : undefined} disabled={ocupado} aria-busy={ocupado}>
            {rotuloDeConfirmar}
          </button>
        </div>
      </form>
    </dialog>
  );
}
