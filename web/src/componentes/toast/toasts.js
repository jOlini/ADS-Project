// Regras dos toasts (notificações flutuantes), separadas da interface para
// serem testadas sem renderizar componente.

export const TIPOS_DE_TOAST = ['sucesso', 'erro', 'aviso', 'info'];
export const POSICOES_DE_TOAST = ['topo-direita', 'topo-centro', 'base-direita', 'base-centro'];

// duracao em milissegundos; 0 deixa o toast na tela até a pessoa fechar.
export const PADROES_DE_TOAST = { duracao: 4500, maximo: 4, posicao: 'topo-direita' };

const TITULO_DO_TIPO = {
  sucesso: 'Tudo certo',
  erro: 'Algo deu errado',
  aviso: 'Atenção',
  info: 'Aviso',
};

// Monta um toast completo a partir das opções de quem chamou. Valor fora do
// esperado cai no padrão, em vez de quebrar a tela.
export function criarToast(opcoes, id, padroes = PADROES_DE_TOAST) {
  const tipo = TIPOS_DE_TOAST.includes(opcoes.tipo) ? opcoes.tipo : 'info';
  const duracao = Number.isFinite(opcoes.duracao) && opcoes.duracao >= 0 ? opcoes.duracao : padroes.duracao;
  const acaoValida = typeof opcoes.acao?.rotulo === 'string' && typeof opcoes.acao?.aoClicar === 'function';

  return {
    id,
    tipo,
    titulo: opcoes.titulo || TITULO_DO_TIPO[tipo],
    mensagem: opcoes.mensagem ?? '',
    duracao,
    acao: acaoValida ? opcoes.acao : null,
    saindo: false,
  };
}

// Estado da pilha de toasts. O mais novo fica em primeiro; passando do
// máximo, o mais antigo sai para a tela não encher.
export function reducerDeToasts(toasts, acao) {
  switch (acao.tipo) {
    case 'adicionar': {
      const maximo = acao.maximo ?? PADROES_DE_TOAST.maximo;
      return [acao.toast, ...toasts.filter((toast) => toast.id !== acao.toast.id)].slice(0, maximo);
    }
    case 'iniciarSaida':
      return toasts.map((toast) => (toast.id === acao.id ? { ...toast, saindo: true } : toast));
    case 'remover':
      return toasts.filter((toast) => toast.id !== acao.id);
    case 'limpar':
      return [];
    default:
      return toasts;
  }
}
