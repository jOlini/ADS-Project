import { useEffect, useRef } from 'react';

// Quem chega por um atalho ("Cadastrar conta", com ?cadastrar= na URL) cai
// no formulário: quando ele aparece na tela (depois da carga), o foco vai
// para o campo indicado, uma vez só.
export function useFocoAoChegar(ativo, idDoFormulario, campo = 'nome') {
  const feito = useRef(false);

  useEffect(() => {
    if (!ativo || feito.current) {
      return;
    }
    const elemento = document.getElementById(idDoFormulario)?.elements[campo];
    if (elemento) {
      feito.current = true;
      elemento.focus();
    }
  });
}
