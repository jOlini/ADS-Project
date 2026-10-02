// O PDF do extrato lido no próprio navegador, com o pdf.js (Mozilla): só o
// texto e a posição de cada trecho, página a página (DocumentoPdf). O arquivo
// nunca sai do navegador; quem decide o que é lançamento é o leitor do banco
// (regras/extratos). O pdf.js é carregado só quando a pessoa escolhe um PDF
// (import dinâmico: fica fora do pacote principal do app), e o trabalho
// pesado roda no worker dele, empacotado pelo Vite como um .js do próprio
// site (a CSP só aceita script do próprio site, e o .js sai com o tipo certo
// no Pages e no nginx, o que um .mjs não garante).

import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api';
import { ErroDoLeitor, type DocumentoPdf, type PaginaDoPdf } from '../regras/extratos/tipos';

// Uma fatura ou um extrato de um mês tem poucas páginas; o teto barra o PDF
// enorme que travaria a aba.
export const MAXIMO_DE_PAGINAS = 30;

// O conteúdo da página mistura texto e marcas de estrutura: só o texto conta.
const ehTexto = (item: TextItem | TextMarkedContent): item is TextItem => 'str' in item;

export async function lerDocumentoPdf(bytes: Uint8Array): Promise<DocumentoPdf> {
  const [pdfjs, { default: WorkerDoPdf }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?worker'),
  ]);
  const worker = new WorkerDoPdf();
  pdfjs.GlobalWorkerOptions.workerPort = worker;

  // Sem fontes do sistema nem formulários XFA: só o texto interessa.
  const tarefa = pdfjs.getDocument({ data: bytes, disableFontFace: true, useSystemFonts: false, enableXfa: false });
  let pdf;
  try {
    pdf = await tarefa.promise;
  } catch (erro) {
    await tarefa.destroy();
    worker.terminate();
    if (erro instanceof pdfjs.PasswordException) {
      throw new ErroDoLeitor('Este PDF tem senha. Abra-o no app do banco, salve sem senha (ou exporte em CSV) e tente de novo.');
    }
    throw new ErroDoLeitor('Não consegui abrir este PDF. Ele pode estar corrompido: baixe de novo pelo app do banco.');
  }

  try {
    const paginas: PaginaDoPdf[] = [];
    for (let numero = 1; numero <= Math.min(pdf.numPages, MAXIMO_DE_PAGINAS); numero += 1) {
      const pagina = await pdf.getPage(numero);
      const vista = pagina.getViewport({ scale: 1 });
      const conteudo = await pagina.getTextContent();
      paginas.push({
        numero,
        largura: vista.width,
        altura: vista.height,
        trechos: conteudo.items.filter(ehTexto).map((item) => {
          // Posição na vista da página: origem no canto de cima, como a tela.
          const [, , , , x, y] = pdfjs.Util.transform(vista.transform, item.transform) as number[];
          return { texto: item.str, x: x ?? 0, y: y ?? 0, largura: item.width };
        }),
      });
      pagina.cleanup();
    }
    if (paginas.every((pagina) => pagina.trechos.length === 0)) {
      throw new ErroDoLeitor('Este PDF não tem texto (é uma imagem escaneada). Baixe a fatura ou o extrato pelo app do banco.');
    }
    return { paginas };
  } finally {
    // Libera a memória do documento e o worker (criado aqui, sai aqui).
    await tarefa.destroy();
    worker.terminate();
  }
}
