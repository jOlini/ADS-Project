// Testes das regras dos espaços: qual abre, o nome na tela, quem gerencia, o
// formulário, a seção depois da troca e a lista de metas de cada espaço.
import { describe, expect, it } from 'vitest';
import {
  donoDasMetas,
  escolherEspacoAtivo,
  nomeCurto,
  nomeDoEspaco,
  nomeSugerido,
  podeGerenciar,
  ehEmpresa,
  secaoDaRota,
  TIPOS_DE_ESPACO,
  TIPOS_QUE_SE_CRIAM,
  validarEspaco,
  type Espaco,
} from './espacos';

const PESSOAL: Espaco = { id: 'p1', tipo: 'PF', nome: 'Pessoal', papel: 'DONO' };
const CASA: Espaco = { id: 'f1', tipo: 'FAMILIA', nome: 'Família Souza', papel: 'DONO' };
const OFICINA: Espaco = { id: 'e1', tipo: 'PJ', nome: 'Oficina', papel: 'DONO' };

describe('escolherEspacoAtivo', () => {
  it('abre o último escolhido quando ele ainda existe', () => {
    expect(escolherEspacoAtivo([PESSOAL, CASA, OFICINA], 'e1')).toBe(OFICINA);
  });

  it('sem escolha, ou com um espaço que foi excluído, abre o pessoal', () => {
    expect(escolherEspacoAtivo([CASA, PESSOAL], null)).toBe(PESSOAL);
    expect(escolherEspacoAtivo([PESSOAL, CASA], 'apagado')).toBe(PESSOAL);
  });

  it('sem pessoal na lista, abre o primeiro; lista vazia, nenhum', () => {
    expect(escolherEspacoAtivo([OFICINA, CASA], undefined)).toBe(OFICINA);
    expect(escolherEspacoAtivo([], 'p1')).toBeNull();
  });
});

describe('nomeDoEspaco', () => {
  it('o pessoal é sempre "Espaço pessoal"; os outros, o nome dado', () => {
    expect(nomeDoEspaco(PESSOAL)).toBe('Espaço pessoal');
    expect(nomeDoEspaco(CASA)).toBe('Família Souza');
    expect(nomeDoEspaco(null)).toBe('Espaço pessoal');
  });

  it('no botão do topo, o pessoal é só "Pessoal"', () => {
    expect(nomeCurto(PESSOAL)).toBe('Pessoal');
    expect(nomeCurto(OFICINA)).toBe('Oficina');
  });
});

describe('podeGerenciar', () => {
  it('só os espaços criados, e só por quem é dono', () => {
    expect(podeGerenciar(PESSOAL)).toBe(false);
    expect(podeGerenciar(CASA)).toBe(true);
    expect(podeGerenciar({ ...CASA, papel: 'LEITOR' })).toBe(false);
    expect(podeGerenciar(null)).toBe(false);
  });
});

describe('validarEspaco', () => {
  it('pede família ou empresa e um nome', () => {
    expect(validarEspaco({ tipo: '', nome: '' })).toEqual({
      tipo: 'Escolha família ou empresa.',
      nome: 'Dê um nome ao espaço.',
    });
    expect(validarEspaco({ tipo: 'PF', nome: 'Outro' })).toHaveProperty('tipo');
    expect(validarEspaco({ tipo: 'PJ', nome: 'Oficina' })).toEqual({});
  });

  it('confere o nome já limpo: só sinais de tag não é nome', () => {
    expect(validarEspaco({ tipo: 'FAMILIA', nome: ' <> ' })).toEqual({ nome: 'Dê um nome ao espaço.' });
    expect(validarEspaco({ tipo: 'FAMILIA', nome: 'x'.repeat(61) })).toEqual({ nome: 'Use até 60 caracteres.' });
  });

  it('renomeando, só o nome conta', () => {
    expect(validarEspaco({ tipo: '', nome: 'Casa nova' }, { renomeando: true })).toEqual({});
  });
});

describe('nomeSugerido', () => {
  it('família leva o último sobrenome; empresa começa em branco', () => {
    expect(nomeSugerido('FAMILIA', 'de Souza Lima')).toBe('Família Lima');
    expect(nomeSugerido('FAMILIA', '')).toBe('Família');
    expect(nomeSugerido('PJ', 'Souza')).toBe('');
  });
});

describe('secaoDaRota', () => {
  it('volta ao começo da seção: o cartão e a busca eram do outro livro', () => {
    expect(secaoDaRota('/contas/cartoes/abc')).toBe('/contas');
    expect(secaoDaRota('/lancamentos?busca=mercado')).toBe('/lancamentos');
    expect(secaoDaRota('/principal')).toBe('/principal');
    expect(secaoDaRota('/')).toBe('/principal');
  });

  it('as visões da empresa são seções inteiras', () => {
    expect(secaoDaRota('/empresa/dre')).toBe('/empresa/dre');
    expect(secaoDaRota('/empresa/fluxo?mes=2026-09')).toBe('/empresa/fluxo');
    expect(secaoDaRota('/empresa')).toBe('/empresa');
  });
});

describe('ehEmpresa', () => {
  it('só o espaço de empresa ganha as visões de DRE e fluxo de caixa', () => {
    expect(ehEmpresa(OFICINA)).toBe(true);
    expect(ehEmpresa(PESSOAL)).toBe(false);
    expect(ehEmpresa(CASA)).toBe(false);
    expect(ehEmpresa(null)).toBe(false);
  });
});

describe('donoDasMetas', () => {
  it('as metas do pessoal continuam na chave de sempre; cada outro espaço tem a sua', () => {
    expect(donoDasMetas('uid-ana', PESSOAL)).toBe('uid-ana');
    expect(donoDasMetas('uid-ana', null)).toBe('uid-ana');
    expect(donoDasMetas('uid-ana', CASA)).toBe('uid-ana:f1');
    expect(donoDasMetas(undefined, CASA)).toBeUndefined();
  });
});

describe('TIPOS_DE_ESPACO', () => {
  it('descreve os três tipos, e só família e empresa se criam', () => {
    expect(Object.keys(TIPOS_DE_ESPACO)).toEqual(['PF', 'FAMILIA', 'PJ']);
    expect(TIPOS_QUE_SE_CRIAM).toEqual(['FAMILIA', 'PJ']);
  });
});
