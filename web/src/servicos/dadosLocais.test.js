import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { limparDadosLocais } from './dadosLocais';

// Armazenamento do navegador em memória, com a mesma interface (Storage).
function armazenamentoFalso(inicial) {
  const dados = new Map(Object.entries(inicial));
  return {
    get length() {
      return dados.size;
    },
    key: (indice) => [...dados.keys()][indice] ?? null,
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => dados.set(chave, String(valor)),
    removeItem: (chave) => dados.delete(chave),
    chaves: () => [...dados.keys()],
  };
}

describe('limparDadosLocais', () => {
  let local;
  let sessao;

  beforeEach(() => {
    local = armazenamentoFalso({
      'olifine:metas:uid-de-teste': '[]',
      'olifine:tentativas:1a2b3c4d': '[]',
      'olifine:tema': '"escuro"',
      'outro-site': 'x',
    });
    sessao = armazenamentoFalso({ 'firebase:authUser:chave:[DEFAULT]': '{}', 'outro-site': 'y' });
    vi.stubGlobal('localStorage', local);
    vi.stubGlobal('sessionStorage', sessao);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('apaga metas, tentativas e a sessão da aba, e mantém o tema', () => {
    limparDadosLocais();

    expect(local.chaves()).toEqual(['olifine:tema', 'outro-site']);
    expect(sessao.chaves()).toEqual(['outro-site']);
  });

  it('não quebra a saída quando o navegador bloqueia o armazenamento', () => {
    vi.stubGlobal('localStorage', {
      get length() {
        throw new Error('SecurityError');
      },
    });

    expect(() => limparDadosLocais()).not.toThrow();
    expect(sessao.chaves()).toEqual(['outro-site']);
  });
});
