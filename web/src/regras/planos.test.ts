// Testes dos planos: o plano de cada espaço, o que libera a família e a
// tabela comparativa da landing (cada recurso com dica e oferta nos três).
import { describe, expect, it } from 'vitest';
import {
  familiaLiberada,
  planoDoCliente,
  planoDoEspaco,
  PLANOS,
  RECURSOS_DOS_PLANOS,
  textoDaOferta,
} from './planos';

describe('planoDoEspaco e planoDoCliente', () => {
  it('sem o campo ou com valor desconhecido, Free', () => {
    expect(planoDoEspaco({ plano: 'FAMILIA' })).toBe('FAMILIA');
    expect(planoDoEspaco({ plano: 'EMPRESARIAL' })).toBe('EMPRESARIAL');
    expect(planoDoEspaco({ plano: null })).toBe('FREE');
    expect(planoDoEspaco({ plano: 'PREMIUM' as never })).toBe('FREE');
    expect(planoDoEspaco(null)).toBe('FREE');
  });

  it('lê o plano no espaço pessoal, mesmo com uma empresa aberta', () => {
    const espacos = [
      { tipo: 'PJ' as const, plano: null },
      { tipo: 'PF' as const, plano: 'FAMILIA' as const },
    ];
    expect(planoDoCliente(espacos)).toBe('FAMILIA');
    expect(planoDoCliente([{ tipo: 'PJ', plano: null }])).toBe('FREE');
    expect(planoDoCliente(undefined)).toBe('FREE');
  });
});

describe('familiaLiberada', () => {
  it('só no Família e no Empresarial', () => {
    expect(familiaLiberada('FREE')).toBe(false);
    expect(familiaLiberada('FAMILIA')).toBe(true);
    expect(familiaLiberada('EMPRESARIAL')).toBe(true);
  });
});

describe('tabela da landing', () => {
  const recursos = RECURSOS_DOS_PLANOS.flatMap((grupo) => grupo.recursos);

  it('tem os três planos, com o Free a R$ 0 e os outros sem preço inventado', () => {
    expect(PLANOS.map((plano) => plano.nome)).toEqual(['Free', 'Família', 'Empresarial']);
    expect(PLANOS.map((plano) => plano.preco)).toEqual(['R$ 0', null, null]);
  });

  it('sobe de nível da esquerda para a direita, com o Empresarial como o único destaque', () => {
    expect(PLANOS.map((plano) => plano.nivel)).toEqual(['entrada', 'intermediario', 'principal']);
    expect(PLANOS.filter((plano) => plano.destaque).map((plano) => plano.id)).toEqual(['EMPRESARIAL']);
  });

  it('todo recurso tem dica e oferta nos três planos, sem id repetido', () => {
    expect(new Set(recursos.map((recurso) => recurso.id)).size).toBe(recursos.length);
    for (const recurso of recursos) {
      expect(recurso.dica.length).toBeGreaterThan(20);
      expect(Object.keys(recurso.oferta).sort()).toEqual(['EMPRESARIAL', 'FAMILIA', 'FREE']);
    }
  });

  it('o Empresarial inclui tudo do Família, e o Família tudo do Free', () => {
    for (const { oferta } of recursos) {
      if (oferta.FREE !== false) {
        expect(oferta.FAMILIA).not.toBe(false);
      }
      if (oferta.FAMILIA !== false) {
        expect(oferta.EMPRESARIAL).not.toBe(false);
      }
    }
  });

  it('a família fica fora do Free, como na API', () => {
    const doFree = (id: string) => recursos.find((recurso) => recurso.id === id)?.oferta.FREE;
    expect(doFree('pessoas')).toBe(false);
    expect(doFree('filtro')).toBe(false);
    expect(doFree('dividir')).toBe('Só o número');
  });

  it('cada célula tem texto para o leitor de tela', () => {
    expect(textoDaOferta(true)).toBe('Incluso');
    expect(textoDaOferta(false)).toBe('Não incluso');
    expect(textoDaOferta('Você + 5')).toBe('Você + 5');
  });
});
