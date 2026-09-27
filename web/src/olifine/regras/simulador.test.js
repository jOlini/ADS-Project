import { describe, expect, it } from 'vitest';
import { FAIXAS, simularOrcamento, textoDaLeitura, textoDoPrazo, VALORES_INICIAIS } from './simulador';

// Valores em centavos, como no app.
const reais = (valor) => valor * 100;

describe('simularOrcamento', () => {
  it('calcula a sobra, o ano e a reserva de seis meses', () => {
    const resultado = simularOrcamento({ renda: reais(6800), fixos: reais(2600), variaveis: reais(1900) });

    expect(resultado.sobra).toBe(reais(2300));
    expect(resultado.emUmAno).toBe(reais(27600));
    expect(resultado.reserva).toBe(reais(27000));
    // 27.000 / 2.300 = 11,7: doze meses guardando a sobra inteira.
    expect(resultado.mesesParaReserva).toBe(12);
  });

  it('lê como folga quem guarda 20% ou mais', () => {
    const resultado = simularOrcamento({ renda: reais(5000), fixos: reais(2500), variaveis: reais(1500) });

    expect(resultado.guardado).toBe(20);
    expect(resultado.leitura).toBe('folga');
  });

  it('lê como apertado quem guarda menos de 20%', () => {
    expect(simularOrcamento({ renda: reais(5000), fixos: reais(3000), variaveis: reais(1500) }).leitura).toBe('apertado');
  });

  it('no vermelho, a sobra fica negativa e a reserva não tem prazo', () => {
    const resultado = simularOrcamento({ renda: reais(3000), fixos: reais(2500), variaveis: reais(1000) });

    expect(resultado.sobra).toBe(reais(-500));
    expect(resultado.leitura).toBe('no-vermelho');
    expect(resultado.emUmAno).toBe(0);
    expect(resultado.mesesParaReserva).toBeNull();
  });

  it('as fatias da barra somam no máximo 100%, mesmo gastando mais do que ganha', () => {
    for (const entrada of [
      { renda: reais(6800), fixos: reais(2600), variaveis: reais(1900) },
      { renda: reais(3000), fixos: reais(2500), variaveis: reais(1000) },
    ]) {
      const soma = simularOrcamento(entrada).partes.reduce((total, parte) => total + parte.fatia, 0);
      expect(soma).toBeLessThanOrEqual(101);
    }
  });

  it('trata valor vazio ou negativo como zero', () => {
    const resultado = simularOrcamento({ renda: Number.NaN, fixos: -100, variaveis: undefined });

    expect(resultado).toMatchObject({ renda: 0, gastos: 0, sobra: 0, leitura: 'no-vermelho', guardado: 0 });
  });

  it('os valores iniciais cabem nas faixas dos controles', () => {
    for (const [campo, valor] of Object.entries(VALORES_INICIAIS)) {
      expect(valor).toBeGreaterThanOrEqual(FAIXAS[campo].minimo);
      expect(valor).toBeLessThanOrEqual(FAIXAS[campo].maximo);
    }
  });
});

describe('textos do simulador', () => {
  it('explica a leitura em uma frase', () => {
    expect(textoDaLeitura({ leitura: 'folga', guardado: 34 })).toBe('Você guardaria 34% da renda: acima dos 20% de referência.');
    expect(textoDaLeitura({ leitura: 'apertado', guardado: 8 })).toMatch(/^Dá para guardar 8%/);
    expect(textoDaLeitura({ leitura: 'no-vermelho', guardado: 0 })).toMatch(/passam da renda/);
  });

  it('escreve o prazo em anos e meses', () => {
    expect(textoDoPrazo(8)).toBe('8 meses');
    expect(textoDoPrazo(1)).toBe('1 mês');
    expect(textoDoPrazo(12)).toBe('1 ano');
    expect(textoDoPrazo(14)).toBe('1 ano e 2 meses');
    expect(textoDoPrazo(37)).toBe('3 anos e 1 mês');
    expect(textoDoPrazo(null)).toBe('sem sobra, a reserva não cresce');
  });
});
