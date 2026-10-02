// Leitor genérico de PDF, para o banco que ainda não tem leitor próprio: acha
// as linhas que começam com uma data e terminam com um valor ("05/09 PADARIA
// 12,50" ou "05/09/2026 Pix recebido 300,00"). Melhor do que nada, mas sem
// garantia: a tela avisa para conferir tudo. Testado em pdfGenerico.test.ts.
//
// O sinal depende de onde o arquivo entra (contexto.cartao): na fatura, o
// valor sem sinal é compra (saída) e o com "-" é crédito; no extrato da conta,
// o valor com "-" é saída e o sem sinal, entrada.

import { ErroDoLeitor, type ArquivoLido, type ContextoDaLeitura, type ExtratoPreparado, type LeitorDeExtrato, type LinhaLida } from './tipos';
import { centavosDoTexto, csvSimples, dataCompleta, dataDepoisDe, dataSemAno, linhasDaPagina, MAPEAMENTO_DO_CSV_SIMPLES, textoDoDocumento } from './pdfComum';

// Data no começo, descrição no meio e valor no fim (com "-" antes ou depois).
const LINHA = /^(\d{2}\/\d{2}(?:\/\d{4})?)\s+(.+?)\s+(-\s?)?(?:R\$\s?)?(\d{1,3}(?:\.\d{3})*,\d{2})(\s?-)?$/i;
const NAO_E_LANCAMENTO = /^(saldo|total)\b/i;

function preparar(arquivo: ArquivoLido, contexto: ContextoDaLeitura): ExtratoPreparado {
  if (arquivo.formato !== 'pdf') {
    throw new ErroDoLeitor('Este leitor é só para PDF.');
  }
  const texto = textoDoDocumento(arquivo.documento);
  // O ano das datas "dd/mm": o do vencimento (fatura) ou o de hoje.
  const referencia = dataDepoisDe(texto, /vencimento/i) ?? contexto.hoje;
  const linhas: LinhaLida[] = [];
  for (const pagina of arquivo.documento.paginas) {
    for (const linha of linhasDaPagina(pagina)) {
      const achado = LINHA.exec(linha.texto);
      if (!achado) {
        continue;
      }
      const [, quando, descricao = '', menosAntes, numero = '', menosDepois] = achado;
      if (NAO_E_LANCAMENTO.test(descricao)) {
        continue;
      }
      const data = quando && quando.length > 5 ? dataCompleta(quando) : dataSemAno(quando ?? '', referencia);
      const valor = Math.abs(centavosDoTexto(numero) ?? 0);
      if (!data || !valor) {
        continue;
      }
      const comMenos = Boolean(menosAntes || menosDepois);
      // Fatura: sem sinal é compra. Conta: com sinal é saída.
      const saida = contexto.cartao ? !comMenos : comMenos;
      linhas.push({ data, descricao, valorCentavos: saida ? -valor : valor });
    }
  }
  if (linhas.length === 0) {
    throw new ErroDoLeitor('Não achei lançamentos neste PDF. Exporte o extrato em CSV pelo app do banco.');
  }
  return {
    csv: csvSimples(linhas),
    mapeamento: MAPEAMENTO_DO_CSV_SIMPLES,
    conferencias: [],
    avisos: ['Leitura genérica de PDF: confira a data, a descrição e o sinal de cada linha antes de importar.'],
  };
}

export const pdfGenerico: LeitorDeExtrato = {
  id: 'pdf-generico',
  nome: 'PDF de outro banco (leitura genérica)',
  formato: 'pdf',
  // Nota baixa: só fica com o arquivo quando nenhum leitor próprio o reconhece.
  reconhece: (arquivo) => (arquivo.formato === 'pdf' ? 1 : 0),
  preparar,
};
