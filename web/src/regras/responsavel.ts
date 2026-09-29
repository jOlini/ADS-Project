// Pessoa responsável por um lançamento (quem gastou, ou de quem é a receita),
// sem interface. Só o nome, com o valor inteiro: é o que antes exigia usar a
// divisão entre pessoas como contorno. Vazio = quem lançou. A API confere o
// mesmo (api/app/financeiro/regras.py) e limpa o texto de novo. Testado em
// responsavel.test.ts.

import { limparTexto } from './sanitizacao';
import { normalizarTexto } from './texto';

// Mesmo limite do nome de pessoa na API (modelos.Nome).
export const TAMANHO_DO_RESPONSAVEL = 60;
// Pessoas já usadas que aparecem como atalho embaixo do campo.
export const SUGESTOES_DO_RESPONSAVEL = 6;

// Mensagem do campo, ou '' quando pode enviar. Vazio vale: é quem lançou.
export function erroDoResponsavel(nome: string | null | undefined, tipo?: string): string {
  const limpo = limparTexto(nome);
  if (!limpo) {
    return '';
  }
  if (tipo === 'TRANSFERENCIA') {
    return 'Transferência entre contas próprias não tem responsável.';
  }
  if (limpo.length > TAMANHO_DO_RESPONSAVEL) {
    return `Use no máximo ${TAMANHO_DO_RESPONSAVEL} caracteres.`;
  }
  return '';
}

// O nome como vai para a API, ou null quando o campo ficou vazio.
export function responsavelParaApi(nome: string | null | undefined): string | null {
  return limparTexto(nome) || null;
}

// "ana " e "Ána" são a mesma pessoa (caixa, acento e espaços não contam).
export function mesmaPessoa(a: string | null | undefined, b: string | null | undefined): boolean {
  return normalizarTexto(a) === normalizarTexto(b);
}

// Atalhos embaixo do campo: as pessoas já usadas no espaço, sem repetir a
// mesma pessoa escrita de outro jeito. A lista não muda enquanto a pessoa
// digita: um atalho sumindo a cada letra empurraria o formulário.
export function sugestoesDeResponsavel(conhecidas: readonly string[], limite = SUGESTOES_DO_RESPONSAVEL): string[] {
  const vistas = new Set<string>();
  const sugestoes: string[] = [];
  for (const nome of conhecidas) {
    const chave = normalizarTexto(nome);
    if (chave && !vistas.has(chave)) {
      vistas.add(chave);
      sugestoes.push(limparTexto(nome));
    }
  }
  return sugestoes.slice(0, limite);
}
