// Testes do acesso por plano: a guarda das rotas do espaço empresarial, o
// teto do Free (situação, erro da API e texto) e o convite de cada motivo.
import { describe, expect, it } from 'vitest';
import {
  conviteDe,
  decidirRota,
  empresarialLiberado,
  limiteDoErro,
  podeCriar,
  rotaDoEmpresarial,
  situacaoDoLimite,
  textoDoUso,
  type UsoDoPlano,
} from './acessoPorPlano';

describe('guarda das rotas', () => {
  it('reconhece as rotas do espaço empresarial, com ou sem consulta', () => {
    expect(rotaDoEmpresarial('/empresarial')).toBe(true);
    expect(rotaDoEmpresarial('/empresa/dre')).toBe(true);
    expect(rotaDoEmpresarial('/empresa/fluxo?mes=2026-10')).toBe(true);
    expect(rotaDoEmpresarial('/empresarial#topo')).toBe(true);
    expect(rotaDoEmpresarial('/principal')).toBe(false);
    expect(rotaDoEmpresarial('/contas/cartoes/1')).toBe(false);
    expect(rotaDoEmpresarial('/empresas')).toBe(false);
  });

  it('só o Empresarial abre; Free e Família recebem o convite', () => {
    expect(empresarialLiberado('EMPRESARIAL')).toBe(true);
    expect(decidirRota('/empresarial', 'FREE')).toBe('convite');
    expect(decidirRota('/empresa/custos', 'FAMILIA')).toBe('convite');
    expect(decidirRota('/empresa/custos', 'EMPRESARIAL')).toBe('liberada');
  });

  it('as outras rotas abrem em qualquer plano', () => {
    expect(decidirRota('/principal', 'FREE')).toBe('liberada');
    expect(decidirRota('/familia', 'FREE')).toBe('liberada');
  });
});

describe('teto do Free', () => {
  const uso = (usado: number, maximo: number | null = 100): UsoDoPlano => ({
    plano: maximo === null ? 'FAMILIA' : 'FREE',
    contas: { usado: 1, maximo: maximo === null ? null : 5 },
    lancamentos_do_mes: { usado, maximo },
  });

  it('livre, perto (a partir de 80%) e atingido; sem teto, sempre livre', () => {
    expect(situacaoDoLimite({ usado: 79, maximo: 100 })).toBe('livre');
    expect(situacaoDoLimite({ usado: 80, maximo: 100 })).toBe('perto');
    expect(situacaoDoLimite({ usado: 100, maximo: 100 })).toBe('atingido');
    expect(situacaoDoLimite({ usado: 5000, maximo: null })).toBe('livre');
    expect(situacaoDoLimite(null)).toBe('livre');
  });

  it('pode criar abaixo do teto e sem saber o uso (a API decide)', () => {
    expect(podeCriar(uso(99), 'lancamentos_do_mes')).toBe(true);
    expect(podeCriar(uso(100), 'lancamentos_do_mes')).toBe(false);
    expect(podeCriar(uso(9999, null), 'lancamentos_do_mes')).toBe(true);
    expect(podeCriar(null, 'contas')).toBe(true);
  });

  it('lê o limite só do 403 com o membro limite', () => {
    const limite = { recurso: 'contas', usado: 5, maximo: 5, plano: 'FREE' };

    expect(limiteDoErro({ status: 403, detalhes: { limite } })).toEqual(limite);
    expect(limiteDoErro({ status: 403, detalhes: { detail: 'Responsável é do Família.' } })).toBeNull();
    expect(limiteDoErro({ status: 400, detalhes: { limite } })).toBeNull();
    expect(limiteDoErro({ status: 403, detalhes: { limite: { ...limite, recurso: 'outro' } } })).toBeNull();
    expect(limiteDoErro(null)).toBeNull();
  });

  it('escreve o uso com o teto, ou só a contagem sem teto', () => {
    expect(textoDoUso('lancamentos_do_mes', { usado: 37, maximo: 100 })).toBe('37 de 100 lançamentos este mês');
    expect(textoDoUso('contas', { usado: 5, maximo: 5 })).toBe('5 de 5 contas e cartões');
    expect(textoDoUso('contas', { usado: 1, maximo: null })).toBe('1 conta ou cartão');
  });
});

describe('conviteDe', () => {
  it('a empresa leva ao Empresarial; o teto e o racha, ao Família', () => {
    expect(conviteDe('empresarial').plano).toBe('EMPRESARIAL');
    expect(conviteDe('racha').plano).toBe('FAMILIA');
    expect(conviteDe('contas', 5).plano).toBe('FAMILIA');
  });

  it('o texto do teto diz o número', () => {
    expect(conviteDe('contas', 5).texto).toContain('até 5 contas');
    expect(conviteDe('lancamentos_do_mes', 100).texto).toContain('até 100 lançamentos');
  });
});
