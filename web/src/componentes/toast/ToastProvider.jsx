import { useCallback, useMemo, useReducer, useRef } from 'react';
import { ContextoToast } from './contexto';
import Toast from './Toast';
import { POSICOES_DE_TOAST, PADROES_DE_TOAST, criarToast, reducerDeToasts } from './toasts';

// Envolve a aplicação e desenha a pilha de toasts por cima de todas as
// páginas. Como fica acima das rotas, um toast disparado antes de navegar
// continua visível na página seguinte.
//
// Personalização geral pelas props:
//   posicao        'topo-direita' | 'topo-centro' | 'base-direita' | 'base-centro'
//   maximo         quantos toasts cabem na tela ao mesmo tempo
//   duracaoPadrao  milissegundos até fechar sozinho (0 = só fecha no X)
export default function ToastProvider({
  children,
  posicao = PADROES_DE_TOAST.posicao,
  maximo = PADROES_DE_TOAST.maximo,
  duracaoPadrao = PADROES_DE_TOAST.duracao,
}) {
  const [toasts, despachar] = useReducer(reducerDeToasts, []);
  const ultimoId = useRef(0);

  const fechar = useCallback((id) => despachar({ tipo: 'iniciarSaida', id }), []);
  const remover = useCallback((id) => despachar({ tipo: 'remover', id }), []);

  const mostrar = useCallback(
    (opcoes) => {
      ultimoId.current += 1;
      const toast = criarToast(opcoes, ultimoId.current, { duracao: duracaoPadrao, maximo });
      despachar({ tipo: 'adicionar', toast, maximo });
      return toast.id;
    },
    [duracaoPadrao, maximo],
  );

  const funcoes = useMemo(
    () => ({
      mostrar,
      fechar,
      limpar: () => despachar({ tipo: 'limpar' }),
      sucesso: (mensagem, opcoes) => mostrar({ ...opcoes, tipo: 'sucesso', mensagem }),
      erro: (mensagem, opcoes) => mostrar({ ...opcoes, tipo: 'erro', mensagem }),
      aviso: (mensagem, opcoes) => mostrar({ ...opcoes, tipo: 'aviso', mensagem }),
      info: (mensagem, opcoes) => mostrar({ ...opcoes, tipo: 'info', mensagem }),
    }),
    [mostrar, fechar],
  );

  const posicaoValida = POSICOES_DE_TOAST.includes(posicao) ? posicao : PADROES_DE_TOAST.posicao;

  return (
    <ContextoToast.Provider value={funcoes}>
      {children}
      <section className={`toasts toasts-${posicaoValida}`} aria-label="Notificações" aria-live="polite">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} aoFechar={fechar} aoSair={remover} />
        ))}
      </section>
    </ContextoToast.Provider>
  );
}
