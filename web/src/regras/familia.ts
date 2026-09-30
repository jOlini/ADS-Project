// Modo Família do espaço pessoal, sem interface. A família não é um espaço à
// parte: o titular liga o modo e cadastra as pessoas da casa (nome e cor), que
// são perfis dentro do espaço pessoal, sem login próprio. Um lançamento é de
// uma pessoa quando o "responsável" dele tem o nome dela (sem diferença de
// caixa e acento); sem responsável, é do titular. Daqui saem o filtro "de
// quem" das telas e o gasto por pessoa. Testado em familia.test.ts.
//
// Assinatura: uma só, a do titular, cobre a casa inteira (o titular e até
// maximo_de_pessoas pessoas). Ninguém da família precisa assinar.

import { mesmaPessoa } from './responsavel';
import { limparTexto } from './sanitizacao';
import type { CorDaPessoa, Espaco, PessoaDaFamilia } from './espacos';

// Valor do filtro para os lançamentos sem responsável (os do titular), como a
// API espera no parâmetro membro dos relatórios.
export const TITULAR = 'titular';
export const TODOS = 'todos';
export const TAMANHO_DO_NOME_DA_PESSOA = 60;
export const ORDEM_DA_PESSOA = ['nome', 'cor'] as const;

export const CORES_DA_FAMILIA: readonly { valor: CorDaPessoa; rotulo: string }[] = [
  { valor: 'azul', rotulo: 'Azul' },
  { valor: 'coral', rotulo: 'Coral' },
  { valor: 'roxo', rotulo: 'Roxo' },
  { valor: 'ambar', rotulo: 'Âmbar' },
  { valor: 'turquesa', rotulo: 'Turquesa' },
  { valor: 'rosa', rotulo: 'Rosa' },
  { valor: 'menta', rotulo: 'Menta' },
  { valor: 'grafite', rotulo: 'Grafite' },
];

// As pessoas que aparecem na tela: só com o modo ligado e no espaço pessoal.
export function pessoasDaFamilia(espaco: Pick<Espaco, 'tipo' | 'familia'> | null | undefined): PessoaDaFamilia[] {
  if (espaco?.tipo !== 'PF' || !espaco.familia?.ativa) {
    return [];
  }
  return espaco.familia.pessoas;
}

export function familiaAtiva(espaco: Pick<Espaco, 'tipo' | 'familia'> | null | undefined): boolean {
  return espaco?.tipo === 'PF' && Boolean(espaco.familia?.ativa);
}

// De quem é um lançamento: o id da pessoa da família, o titular (sem
// responsável) ou null (um responsável que não é da família, como alguém do
// racha escrito à mão).
export function deQuemE(responsavel: string | null | undefined, pessoas: readonly PessoaDaFamilia[]): string | null {
  if (!limparTexto(responsavel)) {
    return TITULAR;
  }
  return pessoas.find((pessoa) => mesmaPessoa(pessoa.nome, responsavel))?.id ?? null;
}

// As linhas de um filtro: todos, o titular ou uma pessoa da família.
export function filtrarPorPessoa<T extends { responsavel?: string | null }>(
  linhas: readonly T[],
  filtro: string,
  pessoas: readonly PessoaDaFamilia[],
): T[] {
  if (filtro === TODOS) {
    return [...linhas];
  }
  return linhas.filter((linha) => deQuemE(linha.responsavel, pessoas) === filtro);
}

// A cor de quem é responsável, para a marca no extrato (null: não é da família).
export function corDoResponsavel(responsavel: string | null | undefined, pessoas: readonly PessoaDaFamilia[]): CorDaPessoa | null {
  if (!limparTexto(responsavel)) {
    return null;
  }
  return pessoas.find((pessoa) => mesmaPessoa(pessoa.nome, responsavel))?.cor ?? null;
}

export interface GastoDaPessoa {
  id: string;
  nome: string;
  cor: CorDaPessoa | null;
  valor: number;
  // Porcentagem do total, arredondada.
  fatia: number;
}

// Quanto cada um gastou no período (despesas, com o estorno descontando), do
// maior para o menor: o titular ("Você"), cada pessoa da família e, se
// houver, "Outros" (responsáveis de fora da família). Quem não gastou nada
// fica de fora.
export function gastoPorPessoa(
  linhas: readonly { tipo: string; valor: number; responsavel?: string | null }[],
  pessoas: readonly PessoaDaFamilia[],
): GastoDaPessoa[] {
  const somas = new Map<string, number>();
  for (const linha of linhas) {
    if (linha.tipo !== 'despesa') {
      continue;
    }
    const quem = deQuemE(linha.responsavel, pessoas) ?? 'outros';
    somas.set(quem, (somas.get(quem) ?? 0) - linha.valor);
  }
  const total = [...somas.values()].reduce((soma, valor) => soma + Math.max(0, valor), 0);
  const nomeDe = (id: string) => pessoas.find((pessoa) => pessoa.id === id);
  return [...somas]
    .filter(([, valor]) => valor > 0)
    .map(([id, valor]) => {
      const pessoa = nomeDe(id);
      return {
        id,
        nome: id === TITULAR ? 'Você' : id === 'outros' ? 'Outros' : (pessoa?.nome ?? 'Outros'),
        cor: pessoa?.cor ?? null,
        valor,
        fatia: total > 0 ? Math.round((valor / total) * 100) : 0,
      };
    })
    .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));
}

// As pessoas da família primeiro nas sugestões do campo "Responsável", sem
// repetir quem já estava nos nomes usados.
export function comAFamilia(pessoasConhecidas: readonly string[], pessoas: readonly PessoaDaFamilia[]): string[] {
  const daFamilia = pessoas.map((pessoa) => pessoa.nome);
  return [...daFamilia, ...pessoasConhecidas.filter((nome) => !daFamilia.some((outro) => mesmaPessoa(outro, nome)))];
}

// Erros por campo da pessoa (nova ou editada). A API confere de novo.
export function validarPessoa(
  { nome, cor }: { nome: string; cor: string },
  pessoas: readonly PessoaDaFamilia[],
  ignorar: string | null = null,
): Record<string, string> {
  const erros: Record<string, string> = {};
  const limpo = limparTexto(nome);
  if (!limpo) {
    erros.nome = 'Dê o nome da pessoa.';
  } else if (limpo.length > TAMANHO_DO_NOME_DA_PESSOA) {
    erros.nome = `Use até ${TAMANHO_DO_NOME_DA_PESSOA} caracteres.`;
  } else if (mesmaPessoa(limpo, 'você') || mesmaPessoa(limpo, 'eu')) {
    erros.nome = '"Você" é o titular da conta. Use o nome da pessoa.';
  } else if (pessoas.some((pessoa) => pessoa.id !== ignorar && mesmaPessoa(pessoa.nome, limpo))) {
    erros.nome = 'Já existe uma pessoa com este nome na família.';
  }
  if (!CORES_DA_FAMILIA.some((opcao) => opcao.valor === cor)) {
    erros.cor = 'Escolha uma cor.';
  }
  return erros;
}

// A primeira cor que ninguém da família usa (a sugestão da pessoa nova).
export function proximaCor(pessoas: readonly PessoaDaFamilia[]): CorDaPessoa {
  const usadas = new Set(pessoas.map((pessoa) => pessoa.cor));
  return CORES_DA_FAMILIA.find((opcao) => !usadas.has(opcao.valor))?.valor ?? 'grafite';
}
