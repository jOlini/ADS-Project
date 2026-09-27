import { describe, expect, it } from 'vitest';
import {
  ESPERA_ENTRE_ENVIOS_EM_S,
  VALIDADE_DO_ULTIMO_ENVIO_EM_MIN,
  precisaDeLinkNovo,
  segundosParaReenviar,
} from './confirmacao';

const AGORA = Date.UTC(2026, 8, 26, 22, 0, 0);
const SEGUNDO = 1000;
const MINUTO = 60 * SEGUNDO;

describe('precisaDeLinkNovo', () => {
  it('manda o link quando este navegador nunca mandou um para a conta', () => {
    expect(precisaDeLinkNovo(null, AGORA)).toBe(true);
  });

  it('não manda outro logo depois do cadastro (o link ainda está a caminho)', () => {
    expect(precisaDeLinkNovo(AGORA - 2 * MINUTO, AGORA)).toBe(false);
  });

  it('manda de novo quando o último envio passou da validade', () => {
    expect(precisaDeLinkNovo(AGORA - VALIDADE_DO_ULTIMO_ENVIO_EM_MIN * MINUTO, AGORA)).toBe(true);
  });

  it('ignora registro estragado ou no futuro (relógio mudado) e manda o link', () => {
    expect(precisaDeLinkNovo('ontem', AGORA)).toBe(true);
    expect(precisaDeLinkNovo(AGORA + MINUTO, AGORA)).toBe(true);
  });
});

describe('segundosParaReenviar', () => {
  it('libera o botão quando não há envio registrado', () => {
    expect(segundosParaReenviar(null, AGORA)).toBe(0);
  });

  it('continua a contagem do envio recente', () => {
    expect(segundosParaReenviar(AGORA - 15 * SEGUNDO, AGORA)).toBe(ESPERA_ENTRE_ENVIOS_EM_S - 15);
  });

  it('libera o botão depois da espera', () => {
    expect(segundosParaReenviar(AGORA - ESPERA_ENTRE_ENVIOS_EM_S * SEGUNDO, AGORA)).toBe(0);
    expect(segundosParaReenviar(AGORA - 5 * MINUTO, AGORA)).toBe(0);
  });
});
