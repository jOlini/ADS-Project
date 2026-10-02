// Leitor da fatura do cartão Bradesco em PDF (a "Fatura Mensal" do app e do
// site do banco). Testado em faturaBradescoPdf.test.ts, com uma fatura
// fictícia no mesmo desenho.
//
// O desenho da página dos lançamentos tem duas colunas lado a lado: à
// esquerda, os lançamentos (Data, Histórico, Cidade, US$, R$); à direita,
// limites e taxas. As duas têm linhas a 2 ou 3 pontos de altura uma da outra,
// então o leitor separa as colunas pela posição (x) antes de juntar as
// linhas, e só a da esquerda conta. As posições vêm do próprio cabeçalho da
// tabela ("Data", "Histórico de Lançamentos", "Cidade", "US$", "R$").
//
// O que a fatura traz e como entra:
// - "dd/mm" sem o ano: o ano sai do vencimento (dataSemAno).
// - Valor sem sinal é compra (saída); com "-" no fim, crédito ou pagamento
//   ("PAG BOLETO BANCARIO 475,98-"), que a conferência sugere descartar.
// - Parcelamento da fatura e os encargos dele ("PARC.FACIL 10/12",
//   "Encargos sobre parcelado 10/12") vêm sem data (o "10/12" é a parcela):
//   entram no último dia antes do fechamento, para ficarem nesta fatura.
// - Linhas de total ("Total para ...", "Total da fatura em real") e o nome do
//   titular do cartão ficam de fora.
// - A soma lida é conferida com o resumo da fatura ("(+)Compras/Débitos" e
//   "(-) Créditos/Pagamentos").

import { ErroDoLeitor, type ArquivoLido, type ContextoDaLeitura, type ExtratoPreparado, type LeitorDeExtrato, type LinhaLida, type PaginaDoPdf } from './tipos';
import {
  centavosDoTexto,
  csvSimples,
  dataDepoisDe,
  dataSemAno,
  linhasDaPagina,
  MAPEAMENTO_DO_CSV_SIMPLES,
  somarDias,
  textoDoDocumento,
  valorDepoisDe,
  VALOR_BR,
} from './pdfComum';

interface Colunas {
  // Onde começa cada coluna da tabela dos lançamentos (x, em pontos).
  historico: number;
  cidade: number | null;
  dolar: number | null;
  // Onde começa a coluna da direita (limites e taxas): nada dali entra.
  direita: number;
}

const DIA_E_MES = /^\d{2}\/\d{2}$/;
// O que abre a coluna da direita na página dos lançamentos.
const COLUNA_DA_DIREITA = /^(Limites|Total parcelados|Taxas mensais|Cr[ée]dito Rotativo|Novo teto|Taxa ao)/i;
// Linhas que não são lançamento, mesmo com valor.
const NAO_E_LANCAMENTO = /^(total\b|lan[çc]amentos\b|data\b|hist[óo]rico\b)/i;
// Folga de alinhamento entre o texto e o começo da coluna.
const FOLGA = 6;

function cabecalhoDaTabela(pagina: PaginaDoPdf): { y: number; colunas: Colunas } | null {
  for (const linha of linhasDaPagina(pagina)) {
    if (!/hist[óo]rico de lan[çc]amentos/i.test(linha.texto)) {
      continue;
    }
    const xDe = (padrao: RegExp) => linha.trechos.find((trecho) => padrao.test(trecho.texto.trim()))?.x ?? null;
    const historico = xDe(/^hist[óo]rico/i);
    if (historico === null) {
      continue;
    }
    const direita = Math.min(
      ...pagina.trechos.filter((trecho) => COLUNA_DA_DIREITA.test(trecho.texto.trim()) && trecho.x > historico).map((trecho) => trecho.x),
      pagina.largura * 0.62,
    );
    return { y: linha.y, colunas: { historico, cidade: xDe(/^cidade$/i), dolar: xDe(/^US\$$/i), direita } };
  }
  return null;
}

function reconhece(arquivo: ArquivoLido): number {
  if (arquivo.formato !== 'pdf') {
    return 0;
  }
  const texto = textoDoDocumento(arquivo.documento);
  if (!/bradesco/i.test(texto)) {
    return 0;
  }
  return /hist[óo]rico de lan[çc]amentos/i.test(texto) && /fatura/i.test(texto) ? 10 : 0;
}

function preparar(arquivo: ArquivoLido, contexto: ContextoDaLeitura): ExtratoPreparado {
  if (arquivo.formato !== 'pdf') {
    throw new ErroDoLeitor('Este leitor é só para a fatura do Bradesco em PDF.');
  }
  if (!contexto.cartao) {
    throw new ErroDoLeitor('Esta é a fatura de um cartão. Abra o cartão em Contas & Cartões e use "Importar fatura".');
  }
  const texto = textoDoDocumento(arquivo.documento);
  const vencimento = dataDepoisDe(texto, /vencimento/i);
  if (!vencimento) {
    throw new ErroDoLeitor('Não achei o vencimento desta fatura do Bradesco. Exporte a fatura em CSV pelo app do banco.');
  }
  const fechamento = dataDepoisDe(texto, /dispon[íi]vel em/i) ?? dataDepoisDe(texto, /data do documento/i) ?? somarDias(vencimento, -15);
  // Último dia de compras desta fatura: o das linhas sem data.
  const semData = somarDias(fechamento, -1);
  const inicioDaJanela = somarDias(vencimento, -100);

  const linhas: LinhaLida[] = [];
  let semDataLidas = 0;
  let colunas: Colunas | null = null;
  for (const pagina of arquivo.documento.paginas) {
    const cabecalho = cabecalhoDaTabela(pagina);
    colunas = cabecalho?.colunas ?? colunas;
    if (!colunas) {
      // Antes da tabela (a página do resumo e do boleto): nada a ler.
      continue;
    }
    const { historico, cidade, dolar, direita } = colunas;
    const daEsquerda = linhasDaPagina(pagina, (trecho) => trecho.x < direita - 2);
    for (const linha of daEsquerda) {
      if (cabecalho && linha.y <= cabecalho.y + 1.5) {
        continue;
      }
      const trechos = linha.trechos;
      // O valor em reais: o último número da linha depois da coluna do dólar
      // ("475,98 -" vem num trecho só, com o espaço antes do sinal).
      const semEspaco = (texto: string) => texto.replace(/\s+/g, '');
      const indiceDoValor = trechos.findLastIndex(
        (trecho) => VALOR_BR.test(semEspaco(trecho.texto)) && trecho.x > (dolar ?? historico) + FOLGA * 4,
      );
      if (indiceDoValor === -1) {
        continue;
      }
      const trechoDoValor = trechos[indiceDoValor]!;
      const textoDoValor = semEspaco(trechoDoValor.texto);
      const credito = textoDoValor.endsWith('-') || semEspaco(trechos[indiceDoValor + 1]?.texto ?? '') === '-';
      const valor = Math.abs(centavosDoTexto(textoDoValor.replace(/-$/, '')) ?? 0);
      if (!valor) {
        continue;
      }
      const trechoDaData = trechos.find((trecho) => DIA_E_MES.test(trecho.texto.trim()) && trecho.x < historico - FOLGA);
      const descricao = trechos
        .filter(
          (trecho) =>
            trecho !== trechoDaData && trecho.x < trechoDoValor.x && (cidade === null || trecho.x < cidade - FOLGA / 2),
        )
        .map((trecho) => trecho.texto)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!descricao || NAO_E_LANCAMENTO.test(descricao)) {
        continue;
      }
      let data = trechoDaData ? dataSemAno(trechoDaData.texto, vencimento) : null;
      // "10/12" na coluna da data do parcelamento é a parcela, não uma data:
      // fora da janela da fatura, a linha fica sem data.
      if (data && (data < inicioDaJanela || data > vencimento)) {
        data = null;
      }
      if (!data) {
        semDataLidas += 1;
      }
      linhas.push({ data: data ?? semData, descricao, valorCentavos: credito ? valor : -valor });
    }
  }

  if (linhas.length === 0) {
    throw new ErroDoLeitor('Não achei lançamentos nesta fatura do Bradesco. Exporte a fatura em CSV pelo app do banco.');
  }

  const compras = linhas.filter((linha) => linha.valorCentavos < 0).reduce((soma, linha) => soma - linha.valorCentavos, 0);
  const creditos = linhas.filter((linha) => linha.valorCentavos > 0).reduce((soma, linha) => soma + linha.valorCentavos, 0);
  const conferencias = [
    { rotulo: 'Compras e débitos', esperadoCentavos: valorDepoisDe(texto, /\(\+\)\s*compras\/d[ée]bitos/i), lidoCentavos: compras },
    { rotulo: 'Créditos e pagamentos', esperadoCentavos: valorDepoisDe(texto, /\(-\)\s*cr[ée]ditos\/pagamentos/i), lidoCentavos: creditos },
  ].filter((item): item is { rotulo: string; esperadoCentavos: number; lidoCentavos: number } => item.esperadoCentavos !== null);

  const avisos =
    semDataLidas > 0
      ? [
          `${semDataLidas === 1 ? '1 linha sem data' : `${semDataLidas} linhas sem data`} (parcelamento da fatura, encargos) ${semDataLidas === 1 ? 'entra' : 'entram'} no último dia antes do fechamento, para ficar nesta fatura.`,
        ]
      : [];
  return { csv: csvSimples(linhas), mapeamento: MAPEAMENTO_DO_CSV_SIMPLES, conferencias, avisos };
}

export const faturaBradescoPdf: LeitorDeExtrato = {
  id: 'bradesco-fatura-pdf',
  nome: 'Fatura do cartão Bradesco (PDF)',
  formato: 'pdf',
  reconhece,
  preparar,
};
