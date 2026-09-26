import { useLayoutEffect, useState } from 'react';

// Largura e altura do elemento, acompanhando o redimensionamento: os
// gráficos desenham em pixels de verdade (texto sem esticar), não num
// viewBox deformado.
export function useTamanho(ref) {
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 });
  useLayoutEffect(() => {
    const elemento = ref.current;
    if (!elemento) {
      return undefined;
    }
    const medir = () => setTamanho({ largura: elemento.clientWidth, altura: elemento.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [ref]);
  return tamanho;
}
