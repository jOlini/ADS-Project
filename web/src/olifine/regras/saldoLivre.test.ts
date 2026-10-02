// Testes do saldo livre do mês: o que ainda entra e sai até o fim do mês, a
// fatura do cartão, a falsa folga e a leitura.
import { describe, expect, it } from 'vitest';
import {
  calcularSaldoLivre,
  dividaDasFaturas,
  fimDoMes,
  leituraDoSaldoLivre,
  rotuloDoSaldo,
  type LinhaDaConta,
} from './saldoLivre';

describe('rotuloDoSaldo', () => {
  it('com sobra (ou zero, ou sem números) é o Saldo livre', () => {
    expect(rotuloDoSaldo(120_000)).toMatchObject({ titulo: 'Saldo livre', deficit: false });
    expect(rotuloDoSaldo(0)).toMatchObject({ titulo: 'Saldo livre', deficit: false });
    expect(rotuloDoSaldo(null)).toMatchObject({ titulo: 'Saldo livre', deficit: false });
  });

  it('no vermelho vira Déficit de caixa, explicando a necessidade de caixa', () => {
    const rotulo = rotuloDoSaldo(-1);

    expect(rotulo).toMatchObject({ titulo: 'Déficit de caixa', deficit: true });
    expect(rotulo.explicacao).toContain('necessidade de caixa');
  });
});

describe('racha a receber no saldo livre', () => {
  it('o que vão te devolver até o fim do mês entra no a receber e no livre', () => {
    const sem = calcularSaldoLivre({ saldo: 50_000, linhasDasContas: [], hoje: '2026-09-20' });
    const com = calcularSaldoLivre({ saldo: 50_000, linhasDasContas: [], aReceberDoRacha: 12_000, hoje: '2026-09-20' });

    expect(com.doRacha).toBe(12_000);
    expect(com.aReceber - sem.aReceber).toBe(12_000);
    expect(com.livre - sem.livre).toBe(12_000);
  });

  it('valor negativo do racha não tira dinheiro', () => {
    expect(calcularSaldoLivre({ saldo: 1_000, linhasDasContas: [], aReceberDoRacha: -500, hoje: '2026-09-20' }).doRacha).toBe(0);
  });
});

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
    expect(leituraDoSaldoLivre(resultado, reais, '30/09')).toMatchObject({ estado: 'negativo', titulo: 'Vai faltar dinheiro' });
    expect(leituraDoSaldoLivre(resultado, reais, '30/09').texto).toMatch(/parece boa.*até 30\/09.*faltam R\$ 900\.00/);
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
  const ler = (entrada: Parameters<typeof calcularSaldoLivre>[0]) => leituraDoSaldoLivre(calcularSaldoLivre(entrada), reais, '30/09');

  it('positivo com folga: verde, com o valor seguro para gastar', () => {
    const leitura = ler({ saldo: 100_000, linhasDasContas: [], hoje: HOJE });

    expect(leitura).toMatchObject({ estado: 'positivo', titulo: 'Seguro para gastar' });
    expect(leitura.texto).toBe('Você pode gastar até R$ 1000.00 até 30/09 sem faltar dinheiro para as contas previstas.');
  });

  it('positivo com pouca folga ou zerado: neutro', () => {
    // A fatura do cartão leva quase tudo (ou tudo) o que há nas contas.
    const fatura = (usado: number) => [{ usado_centavos: usado, parcelamentos_futuros_centavos: 0 }];
    const pouco = ler({ saldo: 10_000, linhasDasContas: [], cartoes: fatura(9_900), hoje: HOJE });
    const zerado = ler({ saldo: 10_000, linhasDasContas: [], cartoes: fatura(10_000), hoje: HOJE });

    expect(pouco).toMatchObject({ estado: 'neutro', titulo: 'Sobra pouco' });
    expect(pouco.texto).toMatch(/até R\$ 1\.00 até 30\/09/);
    expect(zerado).toMatchObject({ estado: 'neutro', titulo: 'Tudo já tem destino' });
  });

  it('negativo: vermelho, com quanto falta e o que fazer', () => {
    const semDinheiro = ler({
      saldo: 10_000,
      linhasDasContas: [],
      cartoes: [{ usado_centavos: 40_000, parcelamentos_futuros_centavos: 0 }],
      hoje: HOJE,
    });
    const soComInvestido = ler({ saldo: 100_000, investido: 250_000, linhasDasContas: [], hoje: HOJE });

    expect(semDinheiro.estado).toBe('negativo');
    expect(semDinheiro.texto).toMatch(/faltam R\$ 300\.00\. Evite gastos novos/);
    expect(soComInvestido).toMatchObject({ estado: 'negativo', titulo: 'Só fecha usando o investido' });
    expect(soComInvestido.texto).toMatch(/faltam R\$ 1500\.00/);
  });
});
