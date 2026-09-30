// Testes das regras dos espaços: só pessoal e empresarial, qual livro abre, o
// nome na tela, quem gerencia, o CNPJ, o formulário da empresa, a seção
// depois da troca e a lista de metas de cada espaço.
import { describe, expect, it } from 'vitest';
import {
  cnpjValido,
  corpoDaEmpresa,
  donoDasMetas,
  ehEmpresa,
  empresasDe,
  escolherEspacoAtivo,
  espacoDoContexto,
  formatarCnpj,
  limparCnpj,
  nomeDoEspaco,
  podeGerenciar,
  REGIMES,
  secaoDaRota,
  TIPOS_DE_ESPACO,
  validarEmpresa,
  type Espaco,
} from './espacos';

const PESSOAL: Espaco = { id: 'p1', tipo: 'PF', nome: 'Pessoal', papel: 'DONO' };
const OFICINA: Espaco = { id: 'e1', tipo: 'PJ', nome: 'Oficina', papel: 'DONO', cnpj: null, regime: 'SIMPLES' };
const LOJA: Espaco = { id: 'e2', tipo: 'PJ', nome: 'Loja', papel: 'DONO', cnpj: '11222333000181', regime: 'MEI' };

describe('TIPOS_DE_ESPACO', () => {
  it('são dois, e só dois: pessoal e empresarial', () => {
    expect(Object.keys(TIPOS_DE_ESPACO)).toEqual(['PF', 'PJ']);
    expect(TIPOS_DE_ESPACO.PF.rotulo).toBe('Pessoal');
    expect(TIPOS_DE_ESPACO.PJ.rotulo).toBe('Empresarial');
  });
});

describe('escolherEspacoAtivo', () => {
  it('abre o último escolhido quando ele ainda existe', () => {
    expect(escolherEspacoAtivo([PESSOAL, OFICINA, LOJA], 'e2')).toBe(LOJA);
  });

  it('sem escolha, ou com uma empresa que foi excluída, abre o pessoal', () => {
    expect(escolherEspacoAtivo([OFICINA, PESSOAL], null)).toBe(PESSOAL);
    expect(escolherEspacoAtivo([PESSOAL, OFICINA], 'apagada')).toBe(PESSOAL);
  });

  it('sem pessoal na lista, abre o primeiro; lista vazia, nenhum', () => {
    expect(escolherEspacoAtivo([OFICINA, LOJA], undefined)).toBe(OFICINA);
    expect(escolherEspacoAtivo([], 'p1')).toBeNull();
  });
});

describe('espacoDoContexto', () => {
  const todos = [PESSOAL, OFICINA, LOJA];

  it('Pessoal abre o espaço pessoal', () => {
    expect(espacoDoContexto(todos, 'PF', 'e2')).toBe(PESSOAL);
  });

  it('Empresarial volta à última empresa usada, senão abre a primeira', () => {
    expect(espacoDoContexto(todos, 'PJ', 'e2')).toBe(LOJA);
    expect(espacoDoContexto(todos, 'PJ', 'apagada')).toBe(OFICINA);
    expect(espacoDoContexto(todos, 'PJ', null)).toBe(OFICINA);
  });

  it('sem empresa cadastrada, não há o que abrir', () => {
    expect(espacoDoContexto([PESSOAL], 'PJ', null)).toBeNull();
  });

  it('empresasDe separa as empresas na ordem da lista', () => {
    expect(empresasDe(todos)).toEqual([OFICINA, LOJA]);
  });
});

describe('nomeDoEspaco', () => {
  it('o pessoal é sempre "Espaço pessoal"; a empresa, o nome dado', () => {
    expect(nomeDoEspaco(PESSOAL)).toBe('Espaço pessoal');
    expect(nomeDoEspaco(OFICINA)).toBe('Oficina');
    expect(nomeDoEspaco(null)).toBe('Espaço pessoal');
  });
});

describe('podeGerenciar e ehEmpresa', () => {
  it('só a empresa, e só por quem é dono, se edita e se exclui', () => {
    expect(podeGerenciar(PESSOAL)).toBe(false);
    expect(podeGerenciar(OFICINA)).toBe(true);
    expect(podeGerenciar({ ...OFICINA, papel: 'CONTADOR' })).toBe(false);
    expect(podeGerenciar(null)).toBe(false);
  });

  it('só a empresa ganha a gestão no menu', () => {
    expect(ehEmpresa(OFICINA)).toBe(true);
    expect(ehEmpresa(PESSOAL)).toBe(false);
    expect(ehEmpresa(null)).toBe(false);
  });
});

describe('CNPJ', () => {
  it('confere os dígitos do numérico e do alfanumérico, como a API', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('12.abc.345/01de-35')).toBe(true);
    expect(cnpjValido('11.222.333/0001-82')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
    expect(cnpjValido('1122233300018')).toBe(false);
    expect(cnpjValido('')).toBe(false);
  });

  it('limpa a pontuação e formata com ela', () => {
    expect(limparCnpj(' 11.222.333/0001-81 ')).toBe('11222333000181');
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
    expect(formatarCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35');
    // Incompleto: fica como a pessoa digitou.
    expect(formatarCnpj('11.222')).toBe('11.222');
    expect(formatarCnpj(null)).toBe('');
  });
});

describe('validarEmpresa', () => {
  it('pede nome e regime; o CNPJ é opcional, mas conferido', () => {
    expect(validarEmpresa({ nome: '', cnpj: '', regime: '' })).toEqual({
      nome: 'Dê um nome à empresa.',
      regime: 'Escolha o regime tributário.',
    });
    expect(validarEmpresa({ nome: 'Oficina', cnpj: '', regime: 'MEI' })).toEqual({});
    expect(validarEmpresa({ nome: 'Oficina', cnpj: '11.222.333/0001-00', regime: 'MEI' })).toEqual({
      cnpj: 'CNPJ inválido. Confira os 14 caracteres.',
    });
  });

  it('confere o nome já limpo: só sinais de tag não é nome', () => {
    expect(validarEmpresa({ nome: ' <> ', cnpj: '', regime: 'REAL' })).toEqual({ nome: 'Dê um nome à empresa.' });
    expect(validarEmpresa({ nome: 'x'.repeat(61), cnpj: '', regime: 'REAL' })).toEqual({ nome: 'Use até 60 caracteres.' });
  });

  it('o corpo leva o CNPJ só com os caracteres, ou null', () => {
    expect(corpoDaEmpresa({ nome: ' Oficina ', cnpj: '11.222.333/0001-81', regime: 'SIMPLES' })).toEqual({
      nome: 'Oficina',
      cnpj: '11222333000181',
      regime: 'SIMPLES',
    });
    expect(corpoDaEmpresa({ nome: 'Oficina', cnpj: '  ', regime: 'MEI' }).cnpj).toBeNull();
  });

  it('os quatro regimes, na ordem do menor ao maior', () => {
    expect(REGIMES.map((opcao) => opcao.valor)).toEqual(['MEI', 'SIMPLES', 'PRESUMIDO', 'REAL']);
  });
});

describe('secaoDaRota', () => {
  it('volta ao começo da seção: o cartão e a busca eram do outro livro', () => {
    expect(secaoDaRota('/contas/cartoes/abc')).toBe('/contas');
    expect(secaoDaRota('/lancamentos?busca=mercado')).toBe('/lancamentos');
    expect(secaoDaRota('/principal')).toBe('/principal');
    expect(secaoDaRota('/')).toBe('/principal');
  });

  it('as telas da empresa são seções inteiras', () => {
    expect(secaoDaRota('/empresa/dre')).toBe('/empresa/dre');
    expect(secaoDaRota('/empresa/impostos?competencia=2026-09')).toBe('/empresa/impostos');
    expect(secaoDaRota('/empresa')).toBe('/empresa');
  });
});

describe('donoDasMetas', () => {
  it('as metas do pessoal continuam na chave de sempre; cada empresa tem a sua', () => {
    expect(donoDasMetas('uid-ana', PESSOAL)).toBe('uid-ana');
    expect(donoDasMetas('uid-ana', null)).toBe('uid-ana');
    expect(donoDasMetas('uid-ana', OFICINA)).toBe('uid-ana:e1');
    expect(donoDasMetas(undefined, OFICINA)).toBeUndefined();
  });
});
