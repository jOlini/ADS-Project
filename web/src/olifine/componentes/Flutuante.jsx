import { useId, useRef, useState } from 'react';
import { useCliqueFora, usePosicaoFlutuante, usePresenca } from '../../componentes/flutuante';

// Botão que abre um painel preso a ele (avisos, conta, "Mais" do celular).
// Mesma mecânica da lista do Seletor e do menu de ações do app: posição fixa,
// fecha com Esc, com clique fora e ao rolar a página. O conteúdo recebe
// fechar() para fechar depois de uma escolha.
export default function Flutuante({ rotulo, className = '', classeDoPainel = '', alinhar = 'fim', botao, children }) {
  const id = useId();
  const ancora = useRef(null);
  const painel = useRef(null);
  const [aberto, setAberto] = useState(false);
  const fechar = () => setAberto(false);
  const estilo = usePosicaoFlutuante(ancora, painel, aberto, { alinhar, aoRolarFora: fechar });
  // Continua na tela durante a animação de saída.
  const presente = usePresenca(aberto);
  useCliqueFora([ancora, painel], fechar, aberto);

  function teclar(evento) {
    if (evento.key === 'Escape') {
      evento.stopPropagation();
      fechar();
      ancora.current?.focus();
    }
  }

  return (
    <>
      <button
        ref={ancora}
        type="button"
        className={className}
        aria-label={rotulo}
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        onClick={() => setAberto((atual) => !atual)}
      >
        {botao}
      </button>
      {presente && (
        <div ref={painel} id={id} className={`of-flutuante ${classeDoPainel}`.trim()} style={estilo} onKeyDown={teclar}>
          {children(fechar)}
        </div>
      )}
    </>
  );
}
