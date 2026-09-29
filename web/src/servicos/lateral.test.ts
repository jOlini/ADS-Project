// Testes da barra lateral recolhida guardada no navegador: lê o que foi
// guardado, abre por padrão e não quebra quando o armazenamento é recusado.
import { describe, expect, it } from 'vitest';
import { CHAVE_DA_LATERAL, chavesParaApagar } from '../regras/dadosLocais';
import { guardarLateralRecolhida, lerLateralRecolhida } from './lateral';

function memoria() {
  const dados = new Map<string, string>();
  return {
    getItem: (chave: string) => dados.get(chave) ?? null,
    setItem: (chave: string, valor: string) => void dados.set(chave, valor),
  };
}

const recusa = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

describe('barra lateral recolhida', () => {
  it('abre com os nomes quando não há escolha salva', () => {
    expect(lerLateralRecolhida(memoria())).toBe(false);
  });

  it('guarda e lê a escolha', () => {
    const armazenamento = memoria();
    guardarLateralRecolhida(true, armazenamento);
    expect(lerLateralRecolhida(armazenamento)).toBe(true);

    guardarLateralRecolhida(false, armazenamento);
    expect(lerLateralRecolhida(armazenamento)).toBe(false);
  });

  it('continua depois do logout, como o tema', () => {
    expect(chavesParaApagar([CHAVE_DA_LATERAL])).toEqual([]);
  });

  it('navegador que recusa o armazenamento não quebra a tela', () => {
    expect(lerLateralRecolhida(recusa)).toBe(false);
    expect(() => guardarLateralRecolhida(true, recusa)).not.toThrow();
    expect(lerLateralRecolhida(undefined)).toBe(false);
  });
});
