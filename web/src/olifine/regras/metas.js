// Metas de economia e a árvore que cresce com os aportes. Funções puras,
// testadas em metas.test.js; quem grava é servicos/metasLocais.js.
//
// Uma meta é { id, nome, alvo, prazo, criadaEm, aportes: [{ id, valor, data }] },
// com alvo e valores em centavos inteiros (como o resto do app) e datas em
// texto ISO. Até a API de metas (release 0.5), elas ficam no navegador.

import { LIMITE_EM_CENTAVOS } from '../../regras/dinheiro';

// Fases da árvore, cada uma a partir de uma fração do alvo. O broto nasce no
// primeiro aporte, de qualquer valor; os frutos, só com a meta completa.
export const FASES = Object.freeze([
  { id: 'semente', nome: 'Semente', aPartirDe: 0 },
  { id: 'broto', nome: 'Broto', aPartirDe: 0 },
  { id: 'muda', nome: 'Muda', aPartirDe: 0.2 },
  { id: 'arvoreta', nome: 'Arvoreta', aPartirDe: 0.45 },
  { id: 'arvore', nome: 'Árvore', aPartirDe: 0.75 },
  { id: 'frutos', nome: 'Árvore com frutos', aPartirDe: 1 },
]);

export const TAMANHO_MAXIMO_DO_NOME = 60;

export function guardado(meta) {
  return meta.aportes.reduce((soma, aporte) => soma + aporte.valor, 0);
}

// De 0 a 1. Passar do alvo conta como completa.
export function progresso(meta) {
  if (meta.alvo <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, guardado(meta) / meta.alvo));
}

export function porcentagem(meta) {
  return Math.floor(progresso(meta) * 100);
}

export function concluida(meta) {
  return guardado(meta) >= meta.alvo;
}

// Valor em centavos a partir do qual uma fase começa nesta meta.
function inicioDaFase(meta, fase) {
  if (fase.id === 'broto') {
    return 1;
  }
  return Math.ceil(meta.alvo * fase.aPartirDe);
}

export function faseDaMeta(meta) {
  const valor = guardado(meta);
  let atual = FASES[0];
  for (const fase of FASES) {
    if (valor >= inicioDaFase(meta, fase) && (fase.id !== 'broto' || valor > 0)) {
      atual = fase;
    }
  }
  return atual;
}

// A próxima fase e quanto falta para ela, ou null com a meta completa.
export function proximaFase(meta) {
  const indice = FASES.findIndex((fase) => fase.id === faseDaMeta(meta).id);
  const seguinte = FASES[indice + 1];
  if (!seguinte) {
    return null;
  }
  return { fase: seguinte, faltam: Math.max(1, inicioDaFase(meta, seguinte) - guardado(meta)) };
}

export function faltaParaOAlvo(meta) {
  return Math.max(0, meta.alvo - guardado(meta));
}

// Semana contada a partir de uma segunda-feira fixa (2024-01-01), para
// comparar semanas sem depender do fuso.
function semanaDe(iso) {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return Math.floor((Date.UTC(ano, mes - 1, dia) - Date.UTC(2024, 0, 1)) / (7 * 24 * 60 * 60 * 1000));
}

// Semanas seguidas com pelo menos um aporte, terminando nesta semana. Se
// nesta ainda não houve aporte, a sequência da semana passada continua viva
// até domingo: a pessoa ainda pode regar.
export function sequenciaDeSemanas(aportes, hoje) {
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
function mesesAte(hoje, prazo) {
  const [anoHoje, mesHoje] = hoje.split('-').map(Number);
  const [anoPrazo, mesPrazo] = prazo.split('-').map(Number);
  return Math.max(1, (anoPrazo - anoHoje) * 12 + (mesPrazo - mesHoje) + 1);
}

// Quanto guardar por mês para chegar no prazo. Sem prazo, com o prazo
// vencido ou com a meta completa, não há plano.
export function planoMensal(meta, hoje) {
  const falta = faltaParaOAlvo(meta);
  if (!meta.prazo || falta === 0 || meta.prazo < hoje) {
    return null;
  }
  const meses = mesesAte(hoje, meta.prazo);
  return { meses, porMes: Math.ceil(falta / meses) };
}

// Números do card "Metas" da Visão geral.
export function resumoDasMetas(metas) {
  const concluidas = metas.filter(concluida).length;
  return { total: metas.length, concluidas, emAndamento: metas.length - concluidas };
}

// Erros de preenchimento de uma meta nova, por campo. alvo já em centavos
// (lido com lerValor) ou null quando o texto não é um valor.
export function validarMeta({ nome, alvo, prazo }, hoje) {
  const erros = {};
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
  if (prazo && prazo < hoje) {
    erros.prazo = 'O prazo precisa ser hoje ou depois.';
  }
  return erros;
}

export function validarAporte(valor) {
  if (valor === null || valor === undefined) {
    return 'Informe o valor do aporte.';
  }
  if (valor <= 0) {
    return 'O aporte precisa ser maior que zero.';
  }
  if (valor > LIMITE_EM_CENTAVOS) {
    return 'Valor acima do limite.';
  }
  return '';
}

export function novaMeta({ nome, alvo, prazo }, { id, hoje }) {
  return { id, nome: nome.trim(), alvo, prazo: prazo || null, criadaEm: hoje, aportes: [] };
}

export function comAporte(meta, aporte) {
  return { ...meta, aportes: [...meta.aportes, aporte] };
}

export function semAporte(meta, aporteId) {
  return { ...meta, aportes: meta.aportes.filter((aporte) => aporte.id !== aporteId) };
}

// Número estável a partir do id, para cada meta ter a sua árvore (o formato
// dos galhos não muda de uma visita para outra).
export function sementeDaMeta(id) {
  let hash = 2166136261;
  for (const letra of String(id)) {
    hash ^= letra.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
