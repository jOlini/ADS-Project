// Fatura fictícia no desenho da fatura do Bradesco: as posições copiam o
// layout real (duas colunas na página dos lançamentos), mas nomes, cartão,
// lojas e valores são inventados. Nenhum dado real entra no repositório.
import { describe, expect, it } from 'vitest';
import { faturaBradescoPdf } from './faturaBradescoPdf';
import { escolherLeitor } from './leitores';
import { ErroDoLeitor, type ArquivoLido, type TrechoDoPdf } from './tipos';

const t = (x: number, y: number, texto: string, largura = texto.length * 4.5): TrechoDoPdf => ({ x, y, texto, largura });

const RESUMO = [
  t(53, 24, 'Fatura Mensal'),
  t(40, 60, 'ANA EXEMPLO DA SILVA'),
  t(40, 90, 'Total de fatura'),
  t(140, 90, 'Vencimento'),
  t(220, 90, 'Limite de compras'),
  t(40, 100, 'R$ 210,00'),
  t(140, 100, '10/10/2026'),
  t(220, 100, 'R$ 3.000,00'),
  t(40, 300, 'Resumo da fatura'),
  t(40, 310, 'Saldo anterior......................... R$ 300,00'),
  t(40, 320, '(-) Créditos/Pagamentos..... R$ 300,00'),
  t(40, 330, '(+)Compras/Débitos............ R$ 210,00'),
  t(40, 340, '(=)Total.................................... R$ 210,00'),
  t(40, 700, 'Banco Bradesco S/A - CNPJ 00.000.000/0001-00'),
];

const LANCAMENTOS = [
  // Cabeçalho da tabela e a coluna da direita (limites e taxas).
  t(45.3, 114, 'Data'),
  t(66.6, 114, 'Histórico de Lançamentos'),
  t(204.3, 114, 'Cidade'),
  t(253.2, 114, 'US$'),
  t(332.3, 114, 'R$'),
  t(364.6, 111.4, 'Limites'),
  t(401.2, 126, 'Total'),
  t(453, 126, 'Utilizado'),
  t(503.8, 126, 'Disponível em'),
  t(507.7, 133.9, '25/09/2026'),
  t(364.3, 147.3, 'Compras'),
  t(401.2, 147.3, 'R$ 3.000,00'),
  t(453, 147.3, 'R$ 447,78'),
  t(519.5, 147.3, 'R$ 2.552,22'),
  t(364.6, 186.1, 'Taxas mensais'),
  t(437.6, 225.6, '12,50%'),
  // Pagamento da fatura anterior: crédito, com o "-" no mesmo trecho.
  t(45.4, 128.1, '09/09'),
  t(73.7, 128.1, 'PAG BOLETO BANCARIO'),
  t(324.9, 128.1, '300,00 -'),
  // O titular do cartão: sem valor, fica de fora.
  t(45.4, 138, 'ANA EXEMPLO DA SILVA'),
  t(209.7, 138, 'Cartão'),
  t(232.1, 138, '0000 XXXX XXXX 0000'),
  // Parcelamento da fatura: o "10/12" na coluna da data é a parcela.
  t(45.4, 146.9, '10/12'),
  t(66.6, 146.9, 'PARC.FACIL'),
  t(114.5, 146.9, '10/12'),
  t(329.3, 146.9, '90,00'),
  t(48.2, 156.3, 'Encargos sobre parcelado'),
  t(175.8, 156.3, '10/12'),
  t(330.6, 156.3, '30,00'),
  // Compras do mês, com a cidade (fora da descrição).
  t(45.4, 188.1, '31/08'),
  t(66.6, 188.1, 'PADARIA EXEMPLO'),
  t(205.5, 188.1, 'CURITIBA'),
  t(328.8, 188.1, '40,00'),
  t(45.4, 196.5, '02/09'),
  t(66.6, 196.5, 'LIVRARIA FICTICIA'),
  t(205.5, 196.5, 'SAO PAULO'),
  t(259, 196.5, '9,00'),
  t(329.1, 196.5, '50,00'),
  // Totais: ficam de fora.
  t(45.4, 217.2, 'Total para ANA EXEMPLO DA SILVA'),
  t(323.5, 217.2, '210,00'),
  t(45.4, 227, 'Total da fatura em real'),
  t(323.5, 227, '210,00'),
];

const fatura = (lancamentos = LANCAMENTOS): ArquivoLido => ({
  formato: 'pdf',
  documento: {
    paginas: [
      { numero: 1, largura: 595, altura: 842, trechos: RESUMO },
      { numero: 2, largura: 595, altura: 842, trechos: [t(53, 24, 'Fatura Mensal'), ...lancamentos] },
    ],
  },
});

const CARTAO = { cartao: true, hoje: '2026-10-02' };

describe('fatura do cartão Bradesco em PDF', () => {
  it('é reconhecida e escolhida no automático', () => {
    expect(faturaBradescoPdf.reconhece(fatura())).toBe(10);
    expect(escolherLeitor(fatura())?.id).toBe('bradesco-fatura-pdf');
  });

  it('lê só a coluna dos lançamentos, com o ano do vencimento e o sinal da fatura', () => {
    const { csv, mapeamento } = faturaBradescoPdf.preparar(fatura(), CARTAO);

    expect(csv.trim().split('\n')).toEqual([
      'Data;Descrição;Valor',
      '09/09/2026;PAG BOLETO BANCARIO;300,00',
      '24/09/2026;PARC.FACIL 10/12;-90,00',
      '24/09/2026;Encargos sobre parcelado 10/12;-30,00',
      '31/08/2026;PADARIA EXEMPLO;-40,00',
      '02/09/2026;LIVRARIA FICTICIA;-50,00',
    ]);
    expect(mapeamento).toMatchObject({ delimitador: ';', cabecalho: 1, data: 0, descricao: 1, valor: 2 });
  });

  it('confere a soma lida com o resumo da fatura e avisa das linhas sem data', () => {
    const { conferencias, avisos } = faturaBradescoPdf.preparar(fatura(), CARTAO);

    expect(conferencias).toEqual([
      { rotulo: 'Compras e débitos', esperadoCentavos: 21000, lidoCentavos: 21000 },
      { rotulo: 'Créditos e pagamentos', esperadoCentavos: 30000, lidoCentavos: 30000 },
    ]);
    expect(avisos[0]).toMatch(/^2 linhas sem data/);
  });

  it('linha que falta aparece na conferência', () => {
    const semPadaria = LANCAMENTOS.filter((trecho) => trecho.y !== 188.1);
    const [compras] = faturaBradescoPdf.preparar(fatura(semPadaria), CARTAO).conferencias;

    expect(compras).toEqual({ rotulo: 'Compras e débitos', esperadoCentavos: 21000, lidoCentavos: 17000 });
  });

  it('a compra de dezembro na fatura de janeiro é do ano anterior', () => {
    const janeiro = fatura(LANCAMENTOS.map((trecho) => (trecho.texto === '31/08' ? { ...trecho, texto: '20/12' } : trecho)));
    const documento = janeiro.formato === 'pdf' ? janeiro.documento : null;
    documento!.paginas[0]!.trechos = RESUMO.map((trecho) => (trecho.texto === '10/10/2026' ? { ...trecho, texto: '10/01/2027' } : trecho));

    expect(faturaBradescoPdf.preparar(janeiro, CARTAO).csv).toContain('20/12/2026;PADARIA EXEMPLO;-40,00');
  });

  it('fatura fora da tela do cartão é recusada com o caminho certo', () => {
    expect(() => faturaBradescoPdf.preparar(fatura(), { cartao: false, hoje: '2026-10-02' })).toThrow(ErroDoLeitor);
    expect(() => faturaBradescoPdf.preparar(fatura(), { cartao: false, hoje: '2026-10-02' })).toThrow(/Importar fatura/);
  });

  it('fatura sem a tabela dos lançamentos dá erro claro', () => {
    expect(() => faturaBradescoPdf.preparar(fatura([]), CARTAO)).toThrow(/Não achei lançamentos/);
  });

  it('PDF de outro banco não é desta fatura', () => {
    const outro: ArquivoLido = { formato: 'pdf', documento: { paginas: [{ numero: 1, largura: 595, altura: 842, trechos: [t(40, 40, 'Banco Exemplo')] }] } };
    expect(faturaBradescoPdf.reconhece(outro)).toBe(0);
    expect(faturaBradescoPdf.reconhece({ formato: 'csv', texto: 'Bradesco' })).toBe(0);
  });
});
