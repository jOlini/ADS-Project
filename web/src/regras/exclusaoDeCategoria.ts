// Exclusão de categoria com lançamentos, sem interface: para qual categoria
// os lançamentos vão antes de ela sair (a API move e só então exclui,
// DELETE /categorias/{id}?mover_para=). Testado em exclusaoDeCategoria.test.ts.

import { normalizarTexto } from './texto';

export interface CategoriaDaExclusao {
  id: string;
  nome: string;
  tipo: 'DESPESA' | 'RECEITA';
  ativa: boolean;
  cor?: string | null;
}

export interface CategoriaEmUso {
  categoria: CategoriaDaExclusao;
  // Quantos lançamentos estão nela (o 409 da API diz), quando se sabe.
  lancamentos: number | null;
}

// Destinos possíveis: do mesmo tipo (despesa continua despesa), ativas e fora
// do grupo que está saindo (não dá para mover para quem também sai).
export function destinosPossiveis(
  categorias: readonly CategoriaDaExclusao[],
  categoria: CategoriaDaExclusao,
  saindo: ReadonlySet<string>,
): CategoriaDaExclusao[] {
  return categorias
    .filter((outra) => outra.tipo === categoria.tipo && outra.ativa && !saindo.has(outra.id))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

const NOMES_DE_SOBRA = { DESPESA: 'outras despesas', RECEITA: 'outras receitas' } as const;

// A sugestão já marcada: "Outras despesas" (ou "Outras receitas"), que é o
// lugar natural do que perdeu a categoria; sem ela, a primeira possível.
export function destinoSugerido(possiveis: readonly CategoriaDaExclusao[], categoria: CategoriaDaExclusao): string {
  const sobra = possiveis.find((outra) => normalizarTexto(outra.nome) === NOMES_DE_SOBRA[categoria.tipo]);
  return (sobra ?? possiveis[0])?.id ?? '';
}

// Erro de cada categoria em uso sem destino escolhido ({ [id]: mensagem }).
export function validarDestinos(emUso: readonly CategoriaEmUso[], destinos: Readonly<Record<string, string>>): Record<string, string> {
  const erros: Record<string, string> = {};
  for (const { categoria } of emUso) {
    if (!destinos[categoria.id]) {
      erros[categoria.id] = 'Escolha para onde vão os lançamentos.';
    }
  }
  return erros;
}

// "3 lançamentos" ou "lançamentos" (sem a contagem).
export function textoDosLancamentos(quantidade: number | null): string {
  if (quantidade === null) {
    return 'lançamentos';
  }
  return quantidade === 1 ? '1 lançamento' : `${quantidade} lançamentos`;
}
