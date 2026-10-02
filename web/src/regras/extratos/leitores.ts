// Registro dos leitores de extrato (padrão Strategy) e a escolha automática.
// Banco novo = um leitor novo nesta lista, com o reconhece() e o preparar()
// dele; a tela e a API não mudam. Testado em leitores.test.ts.
//
// Por que reconhecer sozinho em vez de pedir o banco antes: quem importa
// raramente sabe o "layout" do arquivo, e um seletor de banco obrigatório
// erra quando o banco muda o desenho ou quando o arquivo é de outra conta. O
// leitor mais específico que reconhece o arquivo fica com ele (o genérico só
// quando nenhum outro serve), a tela diz qual foi usado e a pessoa troca se
// ele errar.

import { csvDoBanco } from './csvDoBanco';
import { faturaBradescoPdf } from './faturaBradescoPdf';
import { pdfGenerico } from './pdfGenerico';
import type { ArquivoLido, FormatoDoArquivo, LeitorDeExtrato } from './tipos';

export const LEITORES: readonly LeitorDeExtrato[] = [faturaBradescoPdf, pdfGenerico, csvDoBanco];

export const LEITOR_AUTOMATICO = 'automatico';

export function leitoresDoFormato(formato: FormatoDoArquivo): LeitorDeExtrato[] {
  return LEITORES.filter((leitor) => leitor.formato === formato);
}

// O leitor pedido pela pessoa (se servir para o formato) ou o de maior nota no
// reconhece(). null quando nenhum lê o arquivo.
export function escolherLeitor(arquivo: ArquivoLido, preferido: string = LEITOR_AUTOMATICO): LeitorDeExtrato | null {
  const doFormato = leitoresDoFormato(arquivo.formato);
  const escolhido = doFormato.find((leitor) => leitor.id === preferido);
  if (escolhido) {
    return escolhido;
  }
  let melhor: LeitorDeExtrato | null = null;
  let nota = 0;
  for (const leitor of doFormato) {
    const desta = leitor.reconhece(arquivo);
    if (desta > nota) {
      melhor = leitor;
      nota = desta;
    }
  }
  return melhor;
}

// As opções do seletor "Leitor do arquivo": o automático e os do formato.
export function opcoesDeLeitor(formato: FormatoDoArquivo | null): { valor: string; rotulo: string; descricao?: string }[] {
  const automatico = { valor: LEITOR_AUTOMATICO, rotulo: 'Reconhecer sozinho', descricao: 'Recomendado: acha o banco pelo arquivo' };
  if (!formato) {
    return [automatico];
  }
  return [automatico, ...leitoresDoFormato(formato).map((leitor) => ({ valor: leitor.id, rotulo: leitor.nome }))];
}
