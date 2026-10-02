// Pessoa responsável por um lançamento (quem gastou, ou de quem é a receita),
// sem interface. Só o nome, com o valor inteiro: é o que antes exigia usar a
// divisão entre pessoas como contorno. Vazio = quem lançou. Só no Plano
// Família, e só uma pessoa cadastrada na família: a API confere o mesmo
// (api/app/financeiro/servicos.py, _responsavel_da_familia) e limpa o texto
// de novo. Testado em responsavel.test.ts.

import type { PessoaDaFamilia } from './espacos';
import { limparTexto } from './sanitizacao';
import { normalizarTexto } from './texto';

// Mesmo limite do nome de pessoa na API (modelos.Nome).
export const TAMANHO_DO_RESPONSAVEL = 60;

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

export interface OpcaoDeResponsavel {
  valor: string;
  rotulo: string;
  descricao?: string;
}

// As opções do campo: "Você" (vazio, o titular) e as pessoas da família, na
// ordem do cadastro. Um responsável antigo que não é da família (gravado antes
// da regra) aparece como a opção atual, para a edição não trocá-lo sem a
// pessoa ver; a API só confere quando ele muda.
export function opcoesDeResponsavel(familia: readonly PessoaDaFamilia[], atual = ''): OpcaoDeResponsavel[] {
  const opcoes: OpcaoDeResponsavel[] = [
    { valor: '', rotulo: 'Você', descricao: 'O lançamento fica com o titular' },
    ...familia.map((pessoa) => ({ valor: pessoa.nome, rotulo: pessoa.nome })),
  ];
  const limpo = limparTexto(atual);
  if (limpo && !familia.some((pessoa) => mesmaPessoa(pessoa.nome, limpo))) {
    opcoes.push({ valor: atual, rotulo: limpo, descricao: 'Não está na família' });
  }
  return opcoes;
}
