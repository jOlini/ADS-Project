import { useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icone from '../../componentes/Icone';
import { useCliqueFora, usePosicaoFlutuante, usePresenca } from '../../componentes/flutuante';

// O "i" das dicas: um botão pequeno que abre, preso a ele, um balão com a
// explicação de um número (os cards da Visão geral) ou de um recurso (a
// tabela de planos da landing). Abre com clique, toque ou Enter e fecha com
// Esc, clique fora ou rolagem, com a mesma posição do Seletor e do menu
// (componentes/flutuante.js).
//
// O balão vai para o fim do <body> (portal): dentro do card, o
// container-type e o transform do hover virariam a referência do
// position: fixed, e o overflow do card de altura fixa cortaria o balão.
// Fora do fluxo, abrir não empurra nada: a altura do card não muda.
// Aberto, o botão aponta o balão em aria-describedby, e o leitor de tela lê
// a explicação sem precisar achar o balão no fim da página.
export default function Dica({ titulo, rotulo = `Entenda: ${titulo}`, alinhar = 'fim', className = '', classeDoBalao = '', children }) {
  const id = useId();
  const ancora = useRef(null);
  const balao = useRef(null);
  const [aberta, setAberta] = useState(false);
  const fechar = () => setAberta(false);
  const estilo = usePosicaoFlutuante(ancora, balao, aberta, { alinhar, aoRolarFora: fechar });
  const presente = usePresenca(aberta);
  useCliqueFora([ancora, balao], fechar, aberta);

  function teclar(evento) {
    if (evento.key === 'Escape' && aberta) {
      evento.stopPropagation();
      fechar();
    }
  }

  return (
    <>
      <button
        ref={ancora}
        type="button"
        className={`of-dica-botao ${className}`.trim()}
        aria-label={rotulo}
        aria-expanded={aberta}
        aria-controls={aberta ? id : undefined}
        aria-describedby={aberta ? id : undefined}
        onClick={() => setAberta((atual) => !atual)}
        onKeyDown={teclar}
      >
        <Icone nome="info" tamanho={16} />
      </button>
      {presente &&
        createPortal(
          <div ref={balao} id={id} role="note" className={`of-flutuante of-dica ${classeDoBalao}`.trim()} style={estilo}>
            <p className="of-dica-titulo">{titulo}</p>
            <div className="of-dica-texto">{children}</div>
          </div>,
          document.body,
        )}
    </>
  );
}
