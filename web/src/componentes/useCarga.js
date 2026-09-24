import { useCallback, useEffect, useMemo, useState } from 'react';

// Carrega dados de forma assíncrona e devolve { carregando, dados, erro,
// recarregar }. carregar precisa ser estável (useMemo/useCallback de quem
// chama): uma função nova dispara uma busca nova. null = ainda não dá para
// buscar (ex.: o espaço não chegou). recarregar() busca de novo depois de
// gravar algo; enquanto isso, os dados anteriores continuam na tela.
export function useCarga(carregar) {
  const [versao, setVersao] = useState(0);
  const [resultado, setResultado] = useState({ pedido: null, dados: null, erro: null });

  // Cada busca é um objeto próprio: a resposta só vale para o pedido atual.
  const pedido = useMemo(() => (carregar ? { carregar, versao } : null), [carregar, versao]);

  useEffect(() => {
    if (!pedido) {
      return undefined;
    }
    let ativo = true;
    pedido.carregar().then(
      (dados) => ativo && setResultado({ pedido, dados, erro: null }),
      (erro) => ativo && setResultado({ pedido, dados: null, erro }),
    );
    // Resposta de uma busca antiga que chega depois da nova é descartada.
    return () => {
      ativo = false;
    };
  }, [pedido]);

  const recarregar = useCallback(() => setVersao((atual) => atual + 1), []);
  const atual = resultado.pedido === pedido;
  return {
    carregando: Boolean(pedido) && !atual,
    dados: resultado.dados,
    erro: atual ? resultado.erro : null,
    recarregar,
  };
}
