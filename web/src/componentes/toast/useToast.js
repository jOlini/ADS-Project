import { useContext } from 'react';
import { ContextoToast } from './contexto';

// Uso em qualquer página:
//   const toast = useToast();
//   toast.sucesso('Cadastro concluído.');
//   toast.erro('Sem conexão.', { titulo: 'Firebase', duracao: 0 });
//   toast.mostrar({ tipo: 'aviso', titulo, mensagem, duracao, acao: { rotulo, aoClicar } });
/**
 * @typedef {{ titulo?: string, duracao?: number, acao?: { rotulo: string, aoClicar: () => void } }} OpcoesDoToast
 * @typedef {(mensagem: string, opcoes?: OpcoesDoToast) => void} Aviso
 * @typedef {{ sucesso: Aviso, erro: Aviso, info: Aviso, aviso: Aviso, mostrar: (toast: object) => void }} Toast
 * @returns {Toast}
 */
export function useToast() {
  const toast = useContext(ContextoToast);
  if (!toast) {
    throw new Error('useToast precisa estar dentro do <ToastProvider>.');
  }
  return toast;
}
