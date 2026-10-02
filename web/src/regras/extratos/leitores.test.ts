import { describe, expect, it } from 'vitest';
import { csvDoBanco } from './csvDoBanco';
import { escolherLeitor, LEITOR_AUTOMATICO, opcoesDeLeitor } from './leitores';
import { csvSimples, centavosDoTexto, dataDepoisDe, dataSemAno, descricaoParaCsv, linhasDaPagina, valorDepoisDe } from './pdfComum';
import { pdfGenerico } from './pdfGenerico';
import type { ArquivoLido, TrechoDoPdf } from './tipos';

const t = (x: number, y: number, texto: string): TrechoDoPdf => ({ x, y, texto, largura: texto.length * 4.5 });
const pdf = (trechos: TrechoDoPdf[]): ArquivoLido => ({ formato: 'pdf', documento: { paginas: [{ numero: 1, largura: 595, altura: 842, trechos }] } });

describe('peças comuns dos PDFs', () => {
  it('junta os trechos na mesma altura e separa linhas próximas', () => {
    const linhas = linhasDaPagina({ numero: 1, largura: 595, altura: 842, trechos: [t(80, 10, 'mundo'), t(10, 10.6, 'olá'), t(10, 13, 'outra')] });
    expect(linhas.map((linha) => linha.texto)).toEqual(['olá mundo', 'outra']);
  });

  it('lê o valor brasileiro com o crédito no fim', () => {
    expect(centavosDoTexto('1.234,56')).toBe(123456);
    expect(centavosDoTexto('475,98-')).toBe(-47598);
    expect(centavosDoTexto('R$ 9,90')).toBe(990);
    expect(centavosDoTexto('abc')).toBeNull();
  });

  it('põe o ano na data sem ano a partir do vencimento', () => {
    expect(dataSemAno('31/08', '2026-10-10')).toBe('2026-08-31');
    expect(dataSemAno('20/12', '2027-01-10')).toBe('2026-12-20');
    expect(dataSemAno('31/02', '2026-10-10')).toBeNull();
  });

  it('acha a data e o valor depois do rótulo', () => {
    const texto = 'Total de fatura Vencimento\nR$ 195,85 10/10/2026\n(+)Compras/Débitos..... R$ 195,85';
    expect(dataDepoisDe(texto, /vencimento/i)).toBe('2026-10-10');
    expect(valorDepoisDe(texto, /\(\+\)compras\/d[ée]bitos/i)).toBe(19585);
    expect(dataDepoisDe(texto, /fechamento/i)).toBeNull();
  });

  it('monta o CSV simples sem quebrar as colunas', () => {
    expect(descricaoParaCsv(' LOJA; "X"\n ')).toBe('LOJA X');
    expect(csvSimples([{ data: '2026-09-05', descricao: 'Padaria', valorCentavos: -1250 }])).toBe('Data;Descrição;Valor\n05/09/2026;Padaria;-12,50\n');
  });
});

describe('leitor genérico de PDF', () => {
  const extrato = pdf([
    t(40, 20, 'Extrato da conta'),
    t(40, 40, '05/09/2026 Pix recebido 300,00'),
    t(40, 50, '06/09/2026 Padaria Exemplo -12,50'),
    t(40, 60, '07/09/2026 SALDO DO DIA 287,50'),
  ]);

  it('na conta, o "-" é saída e o resto entrada; saldo fica de fora', () => {
    const { csv, avisos } = pdfGenerico.preparar(extrato, { cartao: false, hoje: '2026-10-02' });
    expect(csv.trim().split('\n').slice(1)).toEqual(['05/09/2026;Pix recebido;300,00', '06/09/2026;Padaria Exemplo;-12,50']);
    expect(avisos[0]).toMatch(/confira/);
  });

  it('na fatura, o valor sem sinal é compra e o "dd/mm" ganha o ano do vencimento', () => {
    const fatura = pdf([t(40, 20, 'Vencimento 10/10/2026'), t(40, 40, '31/08 LOJA EXEMPLO 45,00'), t(40, 50, '09/09 PAGAMENTO 100,00-')]);
    const { csv } = pdfGenerico.preparar(fatura, { cartao: true, hoje: '2026-10-02' });
    expect(csv.trim().split('\n').slice(1)).toEqual(['31/08/2026;LOJA EXEMPLO;-45,00', '09/09/2026;PAGAMENTO;100,00']);
  });

  it('PDF sem lançamentos dá erro claro', () => {
    expect(() => pdfGenerico.preparar(pdf([t(40, 40, 'Olá')]), { cartao: false, hoje: '2026-10-02' })).toThrow(/Não achei lançamentos/);
  });
});

describe('escolha do leitor', () => {
  it('o CSV vai inteiro para a API reconhecer as colunas', () => {
    const csv: ArquivoLido = { formato: 'csv', texto: 'Data;Descrição;Valor\n' };
    expect(escolherLeitor(csv)).toBe(csvDoBanco);
    expect(csvDoBanco.preparar(csv, { cartao: false, hoje: '2026-10-02' })).toEqual({
      csv: 'Data;Descrição;Valor\n',
      mapeamento: null,
      conferencias: [],
      avisos: [],
    });
  });

  it('PDF sem leitor próprio fica com o genérico; a pessoa pode forçar um leitor do formato', () => {
    const outro = pdf([t(40, 40, 'Banco Exemplo')]);
    expect(escolherLeitor(outro)).toBe(pdfGenerico);
    expect(escolherLeitor(outro, 'bradesco-fatura-pdf')?.id).toBe('bradesco-fatura-pdf');
    // Leitor de outro formato não serve: volta para o automático.
    expect(escolherLeitor(outro, 'csv-do-banco')).toBe(pdfGenerico);
  });

  it('as opções do seletor começam pelo automático', () => {
    expect(opcoesDeLeitor(null).map((opcao) => opcao.valor)).toEqual([LEITOR_AUTOMATICO]);
    expect(opcoesDeLeitor('pdf').map((opcao) => opcao.valor)).toEqual([LEITOR_AUTOMATICO, 'bradesco-fatura-pdf', 'pdf-generico']);
  });
});
