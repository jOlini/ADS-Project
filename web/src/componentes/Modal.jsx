import { Fragment, useEffect, useId, useRef, useState } from 'react';
import Icone from './Icone';
import { TEMPO_DE_SAIDA } from './flutuante';

// Janela modal com o <dialog> nativo: prende o foco, fecha no Esc e devolve o
// foco a quem abriu. Clicar no véu não fecha: num formulário pela metade,
// um clique fora não pode jogar fora o que foi digitado. O conteúdo só
// existe com a janela aberta (e durante a animação de saída, para a janela
// não sumir vazia), e cada abertura começa do zero.
// ocupado (salvando, importando) trava o Esc e o botão de fechar.
export default function Modal({ aberta, titulo, descricao, aoFechar, ocupado = false, largura = 'normal', children }) {
  const dialogo = useRef(null);
  const idDoTitulo = useId();
  const idDaDescricao = useId();
  // Conteúdo montado: liga junto com a abertura e desliga depois da saída.
  // aberturas troca a chave do conteúdo, para uma reabertura rápida (antes
  // de a saída terminar) também começar do zero.
  const [montado, setMontado] = useState(aberta);
  const [aberturas, setAberturas] = useState(0);
  if (aberta && !montado) {
    setMontado(true);
    setAberturas((quantas) => quantas + 1);
  }

  useEffect(() => {
    if (aberta || !montado) {
      return undefined;
    }
    const espera = setTimeout(() => setMontado(false), TEMPO_DE_SAIDA);
    return () => clearTimeout(espera);
  }, [aberta, montado]);

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
      {montado && (
        <Fragment key={aberturas}>
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
        </Fragment>
      )}
    </dialog>
  );
}
