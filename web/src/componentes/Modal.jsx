import { useEffect, useId, useRef } from 'react';
import Icone from './Icone';

// Janela modal com o <dialog> nativo: prende o foco, fecha no Esc e devolve o
// foco a quem abriu. Clicar no véu não fecha: num formulário pela metade,
// um clique fora não pode jogar fora o que foi digitado. O conteúdo só
// existe com a janela aberta, então cada abertura começa do zero.
// ocupado (salvando, importando) trava o Esc e o botão de fechar.
export default function Modal({ aberta, titulo, descricao, aoFechar, ocupado = false, largura = 'normal', children }) {
  const dialogo = useRef(null);
  const idDoTitulo = useId();
  const idDaDescricao = useId();

  useEffect(() => {
    const elemento = dialogo.current;
    if (aberta && !elemento.open) {
      elemento.showModal();
    } else if (!aberta && elemento.open) {
      elemento.close();
    }
  }, [aberta]);

  return (
    <dialog
      ref={dialogo}
      className={`modal${largura === 'larga' ? ' larga' : ''}`}
      aria-labelledby={idDoTitulo}
      aria-describedby={descricao ? idDaDescricao : undefined}
      onCancel={(evento) => {
        evento.preventDefault();
        if (!ocupado) {
          aoFechar();
        }
      }}
    >
      {aberta && (
        <>
          <header className="cabecalho-do-modal">
            <div>
              <h2 id={idDoTitulo}>{titulo}</h2>
              {descricao && (
                <p id={idDaDescricao} className="discreto">
                  {descricao}
                </p>
              )}
            </div>
            <button type="button" className="botao-icone" onClick={aoFechar} disabled={ocupado} aria-label="Fechar">
              <Icone nome="fechar" tamanho={18} />
            </button>
          </header>
          <div className="corpo-do-modal">{children}</div>
        </>
      )}
    </dialog>
  );
}
