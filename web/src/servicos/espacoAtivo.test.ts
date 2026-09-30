// Testes do espaço guardado no navegador: por conta, com a chave do app, e
// sem quebrar quando o navegador recusa o armazenamento.
import { describe, expect, it } from 'vitest';
import { chavesParaApagar } from '../regras/dadosLocais';
import {
  chaveDaUltimaEmpresa,
  chaveDoEspacoAtivo,
  guardarEspacoAtivo,
  guardarUltimaEmpresa,
  lerEspacoAtivo,
  lerUltimaEmpresa,
} from './espacoAtivo';

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

describe('espaço ativo no navegador', () => {
  it('guarda e lê o id por conta', () => {
    const armazenamento = memoria();
    guardarEspacoAtivo('uid-ana', 'f1', armazenamento);

    expect(lerEspacoAtivo('uid-ana', armazenamento)).toBe('f1');
    expect(lerEspacoAtivo('uid-bruno', armazenamento)).toBeNull();
  });

  it('guarda a última empresa à parte, para a volta ao Empresarial', () => {
    const armazenamento = memoria();
    guardarEspacoAtivo('uid-ana', 'p1', armazenamento);
    guardarUltimaEmpresa('uid-ana', 'e1', armazenamento);

    expect(lerUltimaEmpresa('uid-ana', armazenamento)).toBe('e1');
    expect(lerEspacoAtivo('uid-ana', armazenamento)).toBe('p1');
    expect(lerUltimaEmpresa('uid-ana', recusa)).toBeNull();
  });

  it('sai no logout junto com as outras chaves do app', () => {
    expect(chavesParaApagar([chaveDoEspacoAtivo('uid-ana'), chaveDaUltimaEmpresa('uid-ana')])).toEqual([
      'olifine:espaco:uid-ana',
      'olifine:empresa:uid-ana',
    ]);
  });

  it('navegador que recusa o armazenamento não quebra a tela', () => {
    expect(lerEspacoAtivo('uid-ana', recusa)).toBeNull();
    expect(() => guardarEspacoAtivo('uid-ana', 'f1', recusa)).not.toThrow();
    expect(lerEspacoAtivo('uid-ana', undefined)).toBeNull();
  });
});
