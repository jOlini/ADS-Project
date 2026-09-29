// Testes do saldo livre do mês: o que ainda entra e sai até o fim do mês, a
// fatura do cartão, a falsa folga e a leitura.
import { describe, expect, it } from 'vitest';
import {
  calcularSaldoLivre,
  dividaDasFaturas,
  fimDoMes,
  leituraDoSaldoLivre,
  type LinhaDaConta,
} from './saldoLivre';

const HOJE = '2026-09-20';
const reais = (centavos: number) => `R$ ${(centavos / 100).toFixed(2)}`;
const linha = (data: string, valor: number, tipo = valor > 0 ? 'receita' : 'despesa'): LinhaDaConta => ({ data, valor, tipo });

describe('fimDoMes', () => {
  it('acha o último dia, com fevereiro e anos bissextos', () => {
    expect(fimDoMes('2026-09-20')).toBe('2026-09-30');
    expect(fimDoMes('2026-02-03')).toBe('2026-02-28');
    expect(fimDoMes('2028-02-03')).toBe('2028-02-29');
    expect(fimDoMes('2026-12-31')).toBe('2026-12-31');
  });
});

describe('calcularSaldoLivre', () => {
  it('sem nada previsto, o saldo inteiro está livre', () => {
    const resultado = calcularSaldoLivre({ saldo: 500_000, linhasDasContas: [linha('2026-09-05', -20_000)], hoje: HOJE });

    expect(resultado).toMatchObject({ saldoDeHoje: 500_000, aReceber: 0, aPagar: 0, livre: 500_000, saude: 'folga' });
  });

  it('não conta de novo a despesa que já saiu do saldo', () => {
    // O aluguel do dia 10 já está no saldo de hoje.
    const resultado = calcularSaldoLivre({ saldo: 100_000, linhasDasContas: [linha('2026-09-10', -150_000)], hoje: HOJE });

    expect(resultado.livre).toBe(100_000);
  });

  it('tira do saldo o que tem data futura e devolve só o que é do mês', () => {
    // Saldo da API com tudo lançado: 300 + 5.000 (salário dia 30) − 1.800
    // (aluguel dia 25) − 900 (escola em outubro) = 2.600.
    const linhas = [
      linha('2026-09-30', 500_000),
      linha('2026-09-25', -180_000),
      linha('2026-10-05', -90_000),
      linha('2026-09-22', -30_000, 'transferencia'),
    ];

    const resultado = calcularSaldoLivre({ saldo: 260_000, linhasDasContas: linhas, hoje: HOJE });

    expect(resultado).toMatchObject({ saldoDeHoje: 30_000, aReceber: 500_000, aPagarNasContas: 180_000, livre: 350_000 });
  });

  it('mostra a falsa folga: positivo hoje, negativo no fim do mês', () => {
    const cartao = { usado_centavos: 250_000, parcelamentos_futuros_centavos: 40_000 };

    const resultado = calcularSaldoLivre({
      saldo: 120_000,
      linhasDasContas: [linha('2026-09-28', -30_000)],
      cartoes: [cartao],
      hoje: HOJE,
    });

    expect(resultado).toMatchObject({ saldoDeHoje: 150_000, faturas: 210_000, aPagar: 240_000, livre: -90_000 });
    expect(resultado.saude).toBe('negativo');
    expect(resultado.folgaAparente).toBe(true);
    expect(resultado.comprometido).toBe(1);
    expect(leituraDoSaldoLivre(resultado, reais)).toMatch(/positivo, mas as contas previstas passam dele em R\$ 900\.00/);
  });

  it('pagamento de fatura marcado para o mês seguinte continua a pagar', () => {
    // A API já baixou a dívida do cartão com o pagamento de 5/10.
    const resultado = calcularSaldoLivre({
      saldo: 50_000,
      linhasDasContas: [linha('2026-10-05', -80_000, 'pagamento')],
      cartoes: [{ usado_centavos: 0, parcelamentos_futuros_centavos: 0 }],
      hoje: HOJE,
    });

    expect(resultado).toMatchObject({ saldoDeHoje: 130_000, aPagarNasContas: 80_000, livre: 50_000 });
  });

  it('sobra pequena ou só com o investido pede atenção', () => {
    const pouco = calcularSaldoLivre({ saldo: 100_000, linhasDasContas: [linha('2026-09-29', -95_000)], hoje: HOJE });
    const soInvestido = calcularSaldoLivre({ saldo: 300_000, investido: 250_000, linhasDasContas: [linha('2026-09-29', -100_000)], hoje: HOJE });

    expect(pouco).toMatchObject({ livre: 100_000, saude: 'folga' });
    expect(calcularSaldoLivre({ saldo: 5_000, linhasDasContas: [linha('2026-09-29', -95_000)], hoje: HOJE }).saude).toBe('atencao');
    expect(soInvestido).toMatchObject({ livre: 300_000, livreSemInvestido: 50_000, saude: 'folga' });
    expect(calcularSaldoLivre({ saldo: 100_000, investido: 250_000, linhasDasContas: [], hoje: HOJE })).toMatchObject({
      livreSemInvestido: -150_000,
      saude: 'atencao',
    });
  });
});

describe('dividaDasFaturas', () => {
  it('soma o devido até a fatura atual e ignora crédito a favor', () => {
    expect(
      dividaDasFaturas([
        { usado_centavos: 100_000, parcelamentos_futuros_centavos: 30_000 },
        { usado_centavos: -5_000, parcelamentos_futuros_centavos: 0 },
        { usado_centavos: 20_000, parcelamentos_futuros_centavos: 50_000 },
      ]),
    ).toBe(70_000);
  });
});

describe('leituraDoSaldoLivre', () => {
  it('diz quando não há nada previsto', () => {
    const resultado = calcularSaldoLivre({ saldo: 100_000, linhasDasContas: [], hoje: HOJE });

    expect(leituraDoSaldoLivre(resultado, reais)).toMatch(/Nenhuma conta prevista/);
  });
});
