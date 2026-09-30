// Metas de economia e a árvore que cresce com os aportes. Funções puras,
// testadas em metas.test.ts; quem grava é servicos/metasLocais.js.
//
// Uma meta é { id, nome, alvo, prazo, criadaEm, aportes: [{ id, valor, data }] },
// com alvo e valores em centavos inteiros (como o resto do app) e datas em
// texto ISO. Até a API de metas (release 0.5), elas ficam no navegador.

import { dataExiste } from '../../regras/datas';
import { formatarBRL, LIMITE_EM_CENTAVOS } from '../../regras/dinheiro';

export interface Aporte {
  id: string;
  valor: number;
  data: string;
}

export interface Meta {
  id: string;
  nome: string;
  alvo: number;
  prazo: string | null;
  criadaEm: string;
  aportes: Aporte[];
}

export interface Fase {
  id: 'semente' | 'broto' | 'muda' | 'arvoreta' | 'arvore' | 'frutos';
  nome: string;
  aPartirDe: number;
}

// Fases da árvore, cada uma a partir de uma fração do alvo. O broto nasce no
// primeiro aporte, de qualquer valor; as maçãs, só com a meta completa.
export const FASES: readonly Fase[] = Object.freeze([
  { id: 'semente', nome: 'Semente', aPartirDe: 0 },
  { id: 'broto', nome: 'Broto', aPartirDe: 0 },
  { id: 'muda', nome: 'Muda', aPartirDe: 0.2 },
  { id: 'arvoreta', nome: 'Arvoreta', aPartirDe: 0.45 },
  { id: 'arvore', nome: 'Árvore', aPartirDe: 0.75 },
  { id: 'frutos', nome: 'Árvore com maçãs', aPartirDe: 1 },
]);

export const TAMANHO_MAXIMO_DO_NOME = 60;

// Valores rápidos de aporte ("regar com"), em centavos.
export const APORTES_RAPIDOS = [5000, 10000, 20000, 50000];

export function guardado(meta: Pick<Meta, 'aportes'>): number {
  return meta.aportes.reduce((soma, aporte) => soma + aporte.valor, 0);
}

// De 0 a 1. Passar do alvo conta como completa.
export function progresso(meta: Pick<Meta, 'alvo' | 'aportes'>): number {
  if (meta.alvo <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, guardado(meta) / meta.alvo));
}

export function porcentagem(meta: Pick<Meta, 'alvo' | 'aportes'>): number {
  return Math.floor(progresso(meta) * 100);
}

export function concluida(meta: Pick<Meta, 'alvo' | 'aportes'>): boolean {
  return guardado(meta) >= meta.alvo;
}

// Valor em centavos a partir do qual uma fase começa nesta meta.
function inicioDaFase(meta: Pick<Meta, 'alvo'>, fase: Fase): number {
  if (fase.id === 'broto') {
    return 1;
  }
  return Math.ceil(meta.alvo * fase.aPartirDe);
}

// A fase de um valor guardado (em centavos) numa meta com este alvo. É a fase
// da meta (faseDaMeta) e também a da barra enquanto ela anda até o valor novo.
export function faseDoValor(meta: Pick<Meta, 'alvo'>, valor: number): Fase {
  let atual = FASES[0] as Fase;
  for (const fase of FASES) {
    if (valor >= inicioDaFase(meta, fase) && (fase.id !== 'broto' || valor > 0)) {
      atual = fase;
    }
  }
  return atual;
}

export function faseDaMeta(meta: Pick<Meta, 'alvo' | 'aportes'>): Fase {
  return faseDoValor(meta, guardado(meta));
}

// A próxima fase e quanto falta para ela, ou null com a meta completa.
export function proximaFase(meta: Pick<Meta, 'alvo' | 'aportes'>): { fase: Fase; faltam: number } | null {
  const indice = FASES.findIndex((fase) => fase.id === faseDaMeta(meta).id);
  const seguinte = FASES[indice + 1];
  if (!seguinte) {
    return null;
  }
  return { fase: seguinte, faltam: Math.max(1, inicioDaFase(meta, seguinte) - guardado(meta)) };
}

export function faltaParaOAlvo(meta: Pick<Meta, 'alvo' | 'aportes'>): number {
  return Math.max(0, meta.alvo - guardado(meta));
}

// Semana contada a partir de uma segunda-feira fixa (2024-01-01), para
// comparar semanas sem depender do fuso.
function semanaDe(iso: string): number {
  const [ano = 0, mes = 1, dia = 1] = iso.split('-').map(Number);
  return Math.floor((Date.UTC(ano, mes - 1, dia) - Date.UTC(2024, 0, 1)) / (7 * 24 * 60 * 60 * 1000));
}

// Semanas seguidas com pelo menos um aporte, terminando nesta semana. Se
// nesta ainda não houve aporte, a sequência da semana passada continua viva
// até domingo: a pessoa ainda pode regar.
export function sequenciaDeSemanas(aportes: Aporte[], hoje: string): number {
  const semanas = new Set(aportes.map((aporte) => semanaDe(aporte.data)));
  let semana = semanaDe(hoje);
  if (!semanas.has(semana)) {
    semana -= 1;
  }
  let sequencia = 0;
  while (semanas.has(semana)) {
    sequencia += 1;
    semana -= 1;
  }
  return sequencia;
}

// Quantos meses de hoje até o prazo, contando o mês do prazo (mínimo 1).
function mesesAte(hoje: string, prazo: string): number {
  const [anoHoje = 0, mesHoje = 1] = hoje.split('-').map(Number);
  const [anoPrazo = 0, mesPrazo = 1] = prazo.split('-').map(Number);
  return Math.max(1, (anoPrazo - anoHoje) * 12 + (mesPrazo - mesHoje) + 1);
}

// Quanto guardar por mês para chegar no prazo. Sem prazo, com o prazo
// vencido ou com a meta completa, não há plano.
export function planoMensal(meta: Meta, hoje: string): { meses: number; porMes: number } | null {
  const falta = faltaParaOAlvo(meta);
  if (!meta.prazo || falta === 0 || meta.prazo < hoje) {
    return null;
  }
  const meses = mesesAte(hoje, meta.prazo);
  return { meses, porMes: Math.ceil(falta / meses) };
}

// Números do card "Metas" da Visão geral.
export interface ResumoDasMetas {
  total: number;
  concluidas: number;
  emAndamento: number;
  // Somas de todas as metas, em centavos. O que passou do alvo de uma meta
  // não conta: a barra geral não enche com o excesso de uma só.
  guardado: number;
  alvo: number;
  // guardado / alvo, de 0 a 100 (arredondado para baixo, como porcentagem()).
  porcentagem: number;
}

// Os números do card de Metas da Visão geral: quantas em andamento, quantas
// concluídas e o progresso de todas juntas.
export function resumoDasMetas(metas: Meta[]): ResumoDasMetas {
  const concluidas = metas.filter(concluida).length;
  const alvo = metas.reduce((soma, meta) => soma + Math.max(0, meta.alvo), 0);
  const juntado = metas.reduce((soma, meta) => soma + Math.min(Math.max(0, meta.alvo), Math.max(0, guardado(meta))), 0);
  return {
    total: metas.length,
    concluidas,
    emAndamento: metas.length - concluidas,
    guardado: juntado,
    alvo,
    porcentagem: alvo > 0 ? Math.floor((juntado / alvo) * 100) : 0,
  };
}

// Erros de preenchimento de uma meta nova, por campo. alvo já em centavos
// (lido com lerValor) ou null quando o texto não é um valor.
export function validarMeta(
  { nome, alvo, prazo }: { nome?: string | null; alvo?: number | null; prazo?: unknown },
  hoje: string,
): Record<string, string> {
  const erros: Record<string, string> = {};
  const limpo = (nome ?? '').trim();
  if (!limpo) {
    erros.nome = 'Dê um nome para a meta.';
  } else if (limpo.length > TAMANHO_MAXIMO_DO_NOME) {
    erros.nome = `Use até ${TAMANHO_MAXIMO_DO_NOME} caracteres.`;
  }
  if (alvo === null || alvo === undefined) {
    erros.alvo = 'Informe quanto você quer juntar.';
  } else if (alvo <= 0) {
    erros.alvo = 'O valor precisa ser maior que zero.';
  } else if (alvo > LIMITE_EM_CENTAVOS) {
    erros.alvo = 'Valor acima do limite.';
  }
  // O prazo só entra como data ISO que existe: qualquer outra coisa (texto
  // incompleto, objeto) quebraria o plano mensal ao desenhar a meta.
  if (prazo && (typeof prazo !== 'string' || !dataExiste(prazo))) {
    erros.prazo = 'Data inválida.';
  } else if (typeof prazo === 'string' && prazo && prazo < hoje) {
    erros.prazo = 'O prazo precisa ser hoje ou depois.';
  }
  return erros;
}

// Erro do aporte, ou ''. Com a meta, o aporte não passa do que falta para o
// alvo: a meta completa com exatamente 100%, e a árvore não "passa" das maçãs.
export function validarAporte(valor: number | null | undefined, meta?: Pick<Meta, 'alvo' | 'aportes'>): string {
  if (valor === null || valor === undefined) {
    return 'Informe o valor do aporte.';
  }
  if (valor <= 0) {
    return 'O aporte precisa ser maior que zero.';
  }
  if (valor > LIMITE_EM_CENTAVOS) {
    return 'Valor acima do limite.';
  }
  if (meta) {
    const falta = faltaParaOAlvo(meta);
    if (falta === 0) {
      return 'Esta meta já está completa.';
    }
    if (valor > falta) {
      return `Passa do que falta. Com ${formatarBRL(falta)}, a meta fica completa.`;
    }
  }
  return '';
}

export interface AporteRapido {
  valor: number;
  // O que completa a meta (o que falta, quando não é um dos valores fixos).
  completa: boolean;
}

// Botões de "regar com": os valores fixos que cabem no que falta e, quando o
// que falta não é um deles, um botão com o valor exato que completa a meta.
export function aportesRapidos(meta: Pick<Meta, 'alvo' | 'aportes'>, valores: number[] = APORTES_RAPIDOS): AporteRapido[] {
  const falta = faltaParaOAlvo(meta);
  if (falta === 0) {
    return [];
  }
  const cabem = valores.filter((valor) => valor < falta).map((valor) => ({ valor, completa: false }));
  return [...cabem, { valor: falta, completa: true }];
}

export function novaMeta(
  { nome, alvo, prazo }: { nome: string; alvo: number; prazo?: unknown },
  { id, hoje }: { id: string; hoje: string },
): Meta {
  return { id, nome: nome.trim(), alvo, prazo: prazoValido(prazo), criadaEm: hoje, aportes: [] };
}

// Prazo como a meta guarda: data ISO que existe ou null.
export function prazoValido(prazo: unknown): string | null {
  return typeof prazo === 'string' && dataExiste(prazo) ? prazo : null;
}

export function comAporte(meta: Meta, aporte: Aporte): Meta {
  return { ...meta, aportes: [...meta.aportes, aporte] };
}

export function semAporte(meta: Meta, aporteId: string): Meta {
  return { ...meta, aportes: meta.aportes.filter((aporte) => aporte.id !== aporteId) };
}

// Número estável a partir do id, para cada meta ter a sua árvore (o formato
// dos galhos não muda de uma visita para outra).
export function sementeDaMeta(id: string): number {
  let hash = 2166136261;
  for (const letra of String(id)) {
    hash ^= letra.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
