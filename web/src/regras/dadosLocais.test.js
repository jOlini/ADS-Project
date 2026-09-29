import { describe, expect, it } from 'vitest';
import { CHAVE_DA_LATERAL, CHAVE_DO_TEMA, chavesParaApagar } from './dadosLocais';

// Nomes fictícios: nenhum uid real entra no repositório público.
const LOCAIS = [
  'olifine:metas:uid-de-teste',
  'olifine:metas:outra-conta',
  'olifine:tentativas:1a2b3c4d',
  CHAVE_DO_TEMA,
  CHAVE_DA_LATERAL,
  'outro-site-do-mesmo-dominio',
];

describe('chavesParaApagar', () => {
  it('apaga as metas e as tentativas de login de qualquer conta', () => {
    expect(chavesParaApagar(LOCAIS)).toEqual([
      'olifine:metas:uid-de-teste',
      'olifine:metas:outra-conta',
      'olifine:tentativas:1a2b3c4d',
    ]);
  });

  it('mantém as preferências de tela (tema, barra lateral) e o que não é do app', () => {
    const apagadas = chavesParaApagar(LOCAIS);

    expect(apagadas).not.toContain(CHAVE_DO_TEMA);
    expect(apagadas).not.toContain(CHAVE_DA_LATERAL);
    expect(apagadas).not.toContain('outro-site-do-mesmo-dominio');
  });

  it('na sessão da aba, apaga também a sessão do Firebase', () => {
    const naAba = ['firebase:authUser:chave:[DEFAULT]', 'olifine:qualquer', 'outro'];

    expect(chavesParaApagar(naAba, { sessao: true })).toEqual(['firebase:authUser:chave:[DEFAULT]', 'olifine:qualquer']);
    expect(chavesParaApagar(naAba)).toEqual(['olifine:qualquer']);
  });

  it('ignora o que não é texto', () => {
    expect(chavesParaApagar([null, undefined, 42])).toEqual([]);
  });
});
