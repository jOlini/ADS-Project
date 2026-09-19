// Testes unitários das regras dos toasts: funções puras, sem React.
import { describe, expect, it } from 'vitest';
import { PADROES_DE_TOAST, criarToast, reducerDeToasts } from './toasts';

describe('criarToast', () => {
  it('completa título e duração com o padrão do tipo', () => {
    const toast = criarToast({ tipo: 'sucesso', mensagem: 'Salvo.' }, 1);

    expect(toast).toMatchObject({ id: 1, tipo: 'sucesso', titulo: 'Tudo certo', mensagem: 'Salvo.' });
    expect(toast.duracao).toBe(PADROES_DE_TOAST.duracao);
  });

  it('troca tipo desconhecido por info', () => {
    expect(criarToast({ tipo: 'festa' }, 1).tipo).toBe('info');
  });

  it('aceita duração 0 para o toast ficar até a pessoa fechar', () => {
    expect(criarToast({ duracao: 0 }, 1).duracao).toBe(0);
    expect(criarToast({ duracao: -5 }, 1).duracao).toBe(PADROES_DE_TOAST.duracao);
  });

  it('ignora ação sem rótulo ou sem função', () => {
    expect(criarToast({ acao: { rotulo: 'Desfazer' } }, 1).acao).toBeNull();

    const aoClicar = () => {};
    expect(criarToast({ acao: { rotulo: 'Desfazer', aoClicar } }, 1).acao).toEqual({ rotulo: 'Desfazer', aoClicar });
  });
});

describe('reducerDeToasts', () => {
  const toast = (id) => criarToast({ mensagem: `toast ${id}` }, id);

  it('põe o mais novo em primeiro e descarta o mais antigo ao passar do máximo', () => {
    let pilha = [];
    for (const id of [1, 2, 3]) {
      pilha = reducerDeToasts(pilha, { tipo: 'adicionar', toast: toast(id), maximo: 2 });
    }

    expect(pilha.map((item) => item.id)).toEqual([3, 2]);
  });

  it('marca a saída antes de remover, para a animação rodar', () => {
    const pilha = [toast(1), toast(2)];

    const saindo = reducerDeToasts(pilha, { tipo: 'iniciarSaida', id: 1 });
    expect(saindo.find((item) => item.id === 1).saindo).toBe(true);
    expect(saindo).toHaveLength(2);

    expect(reducerDeToasts(saindo, { tipo: 'remover', id: 1 }).map((item) => item.id)).toEqual([2]);
  });

  it('limpa a pilha inteira', () => {
    expect(reducerDeToasts([toast(1), toast(2)], { tipo: 'limpar' })).toEqual([]);
  });
});
