// Aba Sociedade & Aportes da empresa, sem interface: o quadro societário (a
// participação de cada sócio), os aportes de capital, o pró-labore e a
// apuração dos dividendos do período (o lucro distribuível repartido pela
// participação, menos o que cada um já recebeu). Aporte, pró-labore e
// distribuição são lançamentos com o sócio como responsável, nas categorias
// da função de cada um (APORTE, PRO_LABORE, DISTRIBUICAO). Testado em
// sociedade.test.ts. Valores em centavos; participação em centésimos de ponto
// (10000 = 100%).

import { lerValor } from '../../regras/dinheiro';
import { mesmaPessoa } from '../../regras/responsavel';
import { limparTexto } from '../../regras/sanitizacao';
import type { CategoriaDaEmpresa, LancamentoDaEmpresa } from './empresa';

export const CEM_POR_CENTO = 10_000;
export const TAMANHO_DO_NOME_DO_SOCIO = 60;
export const ORDEM_DO_SOCIO = ['nome', 'participacao'] as const;

export interface Socio {
  id: string;
  nome: string;
  participacao_centesimos: number;
}

const PERCENTUAL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// 3333 -> "33,33%"; 5000 -> "50%".
export function textoDoPercentual(centesimos: number): string {
  return `${PERCENTUAL.format(centesimos / 100)}%`;
}

// "33,33" (ou "33.33", "50") -> 3333; texto que não é um percentual -> null.
export function lerPercentual(texto: string | null | undefined): number | null {
  const valor = lerValor(String(texto ?? '').replace('%', ''));
  return valor === null || valor > CEM_POR_CENTO ? null : valor;
}

// Erros por campo do sócio (novo ou editado). A soma do quadro vai até 100%.
export function validarSocio(
  { nome, participacao }: { nome: string; participacao: string },
  socios: readonly Socio[],
  ignorar: string | null = null,
): Record<string, string> {
  const erros: Record<string, string> = {};
  const limpo = limparTexto(nome);
  if (!limpo) {
    erros.nome = 'Dê o nome do sócio.';
  } else if (limpo.length > TAMANHO_DO_NOME_DO_SOCIO) {
    erros.nome = `Use até ${TAMANHO_DO_NOME_DO_SOCIO} caracteres.`;
  } else if (socios.some((socio) => socio.id !== ignorar && mesmaPessoa(socio.nome, limpo))) {
    erros.nome = 'Já existe alguém com este nome aqui.';
  }
  const centesimos = lerPercentual(participacao);
  const outras = socios.filter((socio) => socio.id !== ignorar).reduce((soma, socio) => soma + socio.participacao_centesimos, 0);
  if (centesimos === null) {
    erros.participacao = 'Use um percentual de 0 a 100, como 50 ou 33,33.';
  } else if (outras + centesimos > CEM_POR_CENTO) {
    erros.participacao = `A soma passaria de 100%. Cabem até ${textoDoPercentual(CEM_POR_CENTO - outras)}.`;
  }
  return erros;
}

export type PeriodoDaSociedade = 'mes' | 'ano' | '12m';

export const PERIODOS_DA_SOCIEDADE: readonly { id: PeriodoDaSociedade; rotulo: string }[] = [
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'ano', rotulo: 'Este ano' },
  { id: '12m', rotulo: '12 meses' },
];

// { de, ate } em 'AAAA-MM-DD' (hoje em 'AAAA-MM-DD'): o mês, o ano ou os 12
// meses até hoje.
export function periodoDaSociedade(id: PeriodoDaSociedade, hoje: string): { de: string; ate: string } {
  const [ano = 0, mes = 1] = hoje.split('-').map(Number);
  if (id === 'mes') {
    return { de: `${hoje.slice(0, 7)}-01`, ate: hoje };
  }
  if (id === 'ano') {
    return { de: `${ano}-01-01`, ate: hoje };
  }
  const inicio = new Date(Date.UTC(ano, mes - 12, 1));
  return { de: inicio.toISOString().slice(0, 10), ate: hoje };
}

export interface ApuracaoDoSocio {
  socio: Socio;
  aportes: number;
  proLabore: number;
  distribuido: number;
  // Lucro distribuível × participação.
  direito: number;
  // O que falta distribuir: direito − distribuído (nunca negativo).
  aDistribuir: number;
}

export interface Apuracao {
  totalDaParticipacao: number;
  completa: boolean;
  lucroDistribuivel: number;
  socios: ApuracaoDoSocio[];
  aportes: number;
  proLabore: number;
  distribuido: number;
  aDistribuir: number;
  // Movimentos de sócio com um responsável que não está no quadro (ou sem
  // ninguém): aparecem na tela para a pessoa conferir.
  semSocio: number;
}

// Apuração do período: aportes, pró-labore e distribuições de cada sócio (os
// lançamentos das categorias da função, pelo responsável) e os dividendos a
// que cada um tem direito sobre o lucro (o da aba Custos, que já desconta o
// pró-labore como custo fixo). Prejuízo não se distribui.
export function apurarSociedade(
  socios: readonly Socio[],
  lancamentos: readonly LancamentoDaEmpresa[],
  categorias: readonly CategoriaDaEmpresa[],
  { de, ate }: { de: string; ate: string },
  lucro: number,
): Apuracao {
  const funcaoDe = new Map(categorias.map((categoria) => [categoria.id, categoria.funcao ?? null]));
  const somas = new Map(socios.map((socio) => [socio.id, { aportes: 0, proLabore: 0, distribuido: 0 }]));
  let semSocio = 0;
  for (const lancamento of lancamentos) {
    if (lancamento.data < de || lancamento.data > ate || !lancamento.categoria_id) {
      continue;
    }
    const funcao = funcaoDe.get(lancamento.categoria_id);
    if (funcao !== 'APORTE' && funcao !== 'PRO_LABORE' && funcao !== 'DISTRIBUICAO') {
      continue;
    }
    // Com o sinal do caixa: aporte entra (+), pró-labore e distribuição saem (−).
    const valor = lancamento.partidas.find((partida) => partida.conta_id === lancamento.conta_id)?.valor_centavos ?? 0;
    const socio = socios.find((item) => mesmaPessoa(item.nome, lancamento.responsavel));
    const soma = socio ? somas.get(socio.id) : undefined;
    if (!soma) {
      semSocio += Math.abs(valor);
      continue;
    }
    if (funcao === 'APORTE') {
      soma.aportes += valor;
    } else if (funcao === 'PRO_LABORE') {
      soma.proLabore -= valor;
    } else {
      soma.distribuido -= valor;
    }
  }

  const lucroDistribuivel = Math.max(0, lucro);
  const porSocio = socios.map((socio) => {
    const soma = somas.get(socio.id) ?? { aportes: 0, proLabore: 0, distribuido: 0 };
    const direito = Math.floor((lucroDistribuivel * socio.participacao_centesimos) / CEM_POR_CENTO);
    return { socio, ...soma, direito, aDistribuir: Math.max(0, direito - soma.distribuido) };
  });
  const total = (campo: 'aportes' | 'proLabore' | 'distribuido' | 'aDistribuir') =>
    porSocio.reduce((soma, item) => soma + item[campo], 0);
  const totalDaParticipacao = socios.reduce((soma, socio) => soma + socio.participacao_centesimos, 0);
  return {
    totalDaParticipacao,
    completa: totalDaParticipacao === CEM_POR_CENTO,
    lucroDistribuivel,
    socios: porSocio,
    aportes: total('aportes'),
    proLabore: total('proLabore'),
    distribuido: total('distribuido'),
    aDistribuir: total('aDistribuir'),
    semSocio,
  };
}
