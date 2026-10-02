import { describe, expect, it } from 'vitest';
import { chavesParaApagar } from '../regras/dadosLocais';
import { cabecalhoDoPlanoEmTeste, CHAVE_DO_PLANO_EM_TESTE, guardarPlanoEmTeste, lerPlanoEmTeste } from './planoEmTeste';

function armazenamento(inicial: Record<string, string> = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => void dados.set(chave, valor),
    removeItem: (chave: string) => void dados.delete(chave),
    dados,
  };
}

describe('plano em teste do super admin', () => {
  it('sem nada guardado, não simula', () => {
    expect(lerPlanoEmTeste(armazenamento())).toBeNull();
    expect(cabecalhoDoPlanoEmTeste(armazenamento())).toEqual({});
  });

  it('guarda, lê e manda o plano no cabeçalho', () => {
    const local = armazenamento();
    guardarPlanoEmTeste('FAMILIA', local);
    expect(lerPlanoEmTeste(local)).toBe('FAMILIA');
    expect(cabecalhoDoPlanoEmTeste(local)).toEqual({ 'X-Simular-Plano': 'FAMILIA' });
  });

  it('voltar ao plano real apaga a chave', () => {
    const local = armazenamento({ [CHAVE_DO_PLANO_EM_TESTE]: 'FREE' });
    guardarPlanoEmTeste(null, local);
    expect(local.dados.has(CHAVE_DO_PLANO_EM_TESTE)).toBe(false);
  });

  it('valor estranho guardado vale como sem simulação', () => {
    expect(lerPlanoEmTeste(armazenamento({ [CHAVE_DO_PLANO_EM_TESTE]: 'OURO' }))).toBeNull();
  });

  it('armazenamento bloqueado não quebra a tela', () => {
    const bloqueado = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
      removeItem: () => {
        throw new Error('bloqueado');
      },
    };
    expect(lerPlanoEmTeste(bloqueado)).toBeNull();
    expect(() => guardarPlanoEmTeste('FREE', bloqueado)).not.toThrow();
  });

  it('sai no logout, com as outras chaves do app', () => {
    expect(chavesParaApagar([CHAVE_DO_PLANO_EM_TESTE], { sessao: true })).toEqual([CHAVE_DO_PLANO_EM_TESTE]);
  });
});
