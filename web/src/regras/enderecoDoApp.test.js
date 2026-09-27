// Testes do caminho de publicação: GitHub Pages (/ADS-Project/) e domínio próprio (/).
import { describe, expect, it } from 'vitest';
import { BASE_DO_PAGES, enderecoSemBaseAntiga, normalizarBase } from './enderecoDoApp';

describe('normalizarBase', () => {
  it('vazio fica com o caminho do GitHub Pages', () => {
    expect(normalizarBase(undefined)).toBe(BASE_DO_PAGES);
    expect(normalizarBase('')).toBe('/ADS-Project/');
    expect(normalizarBase('  ')).toBe('/ADS-Project/');
  });

  it('põe a barra nas duas pontas, como o Vite exige', () => {
    expect(normalizarBase('/')).toBe('/');
    expect(normalizarBase('//')).toBe('/');
    expect(normalizarBase('app')).toBe('/app/');
    expect(normalizarBase('/app')).toBe('/app/');
    expect(normalizarBase('/ADS-Project/')).toBe('/ADS-Project/');
    expect(normalizarBase('/olifine/app/')).toBe('/olifine/app/');
  });

  it('recusa endereço completo, subida de pasta, consulta e fragmento', () => {
    const invalidos = ['https://app.exemplo.com/', 'C:/Program Files/Git/', '/a b/', '../', '/app/../x', './', '/app?x=1', '/app#x', '\\app'];
    for (const valor of invalidos) {
      expect(() => normalizarBase(valor)).toThrow(/VITE_BASE inválido/);
    }
  });
});

describe('enderecoSemBaseAntiga', () => {
  it('no domínio próprio, tira o /ADS-Project de um link antigo e mantém o código do e-mail', () => {
    const link = { pathname: '/ADS-Project/auth/verificar-email', search: '', hash: '#oobCode=abc' };
    expect(enderecoSemBaseAntiga(link, '/')).toBe('/auth/verificar-email#oobCode=abc');
    expect(enderecoSemBaseAntiga({ pathname: '/ADS-Project/auth/acao', search: '?mode=resetPassword' }, '/')).toBe(
      '/auth/acao?mode=resetPassword',
    );
    expect(enderecoSemBaseAntiga({ pathname: '/ADS-Project' }, '/')).toBe('/');
    expect(enderecoSemBaseAntiga({ pathname: '/ADS-Project/' }, '/')).toBe('/');
    expect(enderecoSemBaseAntiga({ pathname: '/ADS-Project/login' }, '/app/')).toBe('/app/login');
  });

  it('não mexe no endereço que já é da base atual', () => {
    expect(enderecoSemBaseAntiga({ pathname: '/ADS-Project/login' }, '/ADS-Project/')).toBeNull();
    expect(enderecoSemBaseAntiga({ pathname: '/login' }, '/')).toBeNull();
    expect(enderecoSemBaseAntiga({ pathname: '/ADS-Projeto/login' }, '/')).toBeNull();
    expect(enderecoSemBaseAntiga({ pathname: '/ADS-Project/app/login' }, '/ADS-Project/app/')).toBeNull();
  });
});
