// Leitura das metas gravadas no navegador. O localStorage é um dublê em
// memória (vi.stubGlobal): o teste não depende do ambiente do Vitest.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chaveDasMetas, gravarMetas, lerMetas } from './metasLocais';

const UID = 'uid-teste';

function armazenamento() {
  const itens = new Map();
  return {
    getItem: (chave) => (itens.has(chave) ? itens.get(chave) : null),
    setItem: (chave, valor) => itens.set(chave, String(valor)),
  };
}

const meta = (extras) => ({ id: 'm1', nome: 'Viagem', alvo: 100000, prazo: null, criadaEm: '2026-09-01', aportes: [], ...extras });

beforeEach(() => vi.stubGlobal('localStorage', armazenamento()));
afterEach(() => vi.unstubAllGlobals());

describe('lerMetas', () => {
  it('devolve o que foi gravado', () => {
    gravarMetas(UID, [meta({ prazo: '2026-12-20' })]);
    expect(lerMetas(UID)).toEqual([meta({ prazo: '2026-12-20' })]);
  });

  // Regressão: metas gravadas antes da correção do campo Prazo têm um objeto
  // no lugar da data. A meta e os aportes ficam; só o prazo sai.
  it('conserta prazo fora do formato em vez de derrubar a tela', () => {
    const aportes = [{ id: 'a1', valor: 5000, data: '2026-09-20' }];
    gravarMetas(UID, [meta({ prazo: { target: { name: 'prazo', value: '2026-12-20' } }, aportes })]);
    expect(lerMetas(UID)).toEqual([meta({ prazo: null, aportes })]);
  });

  it('descarta meta sem o formato mínimo e texto que não é JSON', () => {
    gravarMetas(UID, [meta(), { id: 7, nome: 'Sem alvo' }]);
    expect(lerMetas(UID)).toEqual([meta()]);
    localStorage.setItem(chaveDasMetas(UID), '{quebrado');
    expect(lerMetas(UID)).toEqual([]);
  });
});
