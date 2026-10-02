// Racha a receber, sem interface: o que cada pessoa deve das despesas
// divididas e o efeito disso nas despesas de quem lançou. Testado em
// aReceber.test.ts. Valores em centavos; datas em texto ISO (AAAA-MM-DD).
//
// Numa despesa dividida, a parte de cada pessoa é dinheiro de quem lançou nas
// mãos de outra pessoa: um valor a receber (ativo de curto prazo), e não uma
// despesa de quem lançou. Cada parte está num de três estados:
//
// - a receber: pendente e dentro do prazo (ou sem prazo). Sai das despesas de
//   quem lançou e entra no saldo livre previsto, se vence até o fim do mês;
// - recebido: a API lançou o reembolso numa conta (um estorno parcial da
//   despesa), que já desconta a categoria. Aqui não se desconta de novo;
// - inadimplente: marcada como não paga, ou pendente com o prazo vencido. A
//   parte volta a ser despesa de quem lançou (despesa assumida) e sai do que
//   está a receber. O prazo vencido muda o estado sozinho, sem gravar nada:
//   é a provisão de devedor duvidoso, no tamanho de uma casa.
//
// A API confere as mesmas regras (api/app/financeiro/regras.py, "Racha a receber").

import { normalizarTexto } from './texto';

export type SituacaoDaParte = 'PENDENTE' | 'RECEBIDO' | 'NAO_PAGO';
export type EstadoDaParte = 'a-receber' | 'recebido' | 'inadimplente';

export interface ParteDaApi {
  pessoa: string;
  valor_centavos: number;
  vencimento?: string | null;
  // Sem o campo (API anterior ao racha a receber): pendente.
  situacao?: SituacaoDaParte;
  recebido_em?: string | null;
  reembolso_id?: string | null;
}

export interface LancamentoDividido {
  id: string;
  tipo: string;
  descricao: string;
  data: string;
  divisao?: readonly ParteDaApi[];
  estorno_de?: string | null;
  estornado_por?: string | null;
  reembolso_de?: string | null;
}

export function estadoDaParte(parte: ParteDaApi, hoje: string): EstadoDaParte {
  if (parte.situacao === 'RECEBIDO') {
    return 'recebido';
  }
  if (parte.situacao === 'NAO_PAGO' || venceuSemPagar(parte, hoje)) {
    return 'inadimplente';
  }
  return 'a-receber';
}

// Pendente com o prazo já passado (o dia do vencimento ainda vale).
export function venceuSemPagar(parte: ParteDaApi, hoje: string): boolean {
  return (parte.situacao ?? 'PENDENTE') === 'PENDENTE' && Boolean(parte.vencimento) && String(parte.vencimento) < hoje;
}

// As partes deste lançamento são valores a receber: despesa dividida, que
// não é estorno, nem estornada (o estorno desfaz o racha), nem um reembolso.
export function temRacha(lancamento: LancamentoDividido): boolean {
  return (
    lancamento.tipo.toUpperCase() === 'DESPESA' &&
    !lancamento.estorno_de &&
    !lancamento.estornado_por &&
    !lancamento.reembolso_de &&
    (lancamento.divisao?.length ?? 0) > 0
  );
}

// Dias entre duas datas ISO, sem o fuso mexer no dia.
function diasEntre(de: string, ate: string): number {
  const emDias = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
  return Math.round(emDias(ate) - emDias(de));
}

export interface ParteDoRacha {
  lancamentoId: string;
  // Posição da parte na divisão: é o endereço dela na API.
  indice: number;
  descricao: string;
  data: string;
  pessoa: string;
  valor: number;
  vencimento: string | null;
  situacao: SituacaoDaParte;
  recebidoEm: string | null;
  estado: EstadoDaParte;
  // Quantos dias o prazo passou (0 dentro do prazo, sem prazo ou paga).
  diasDeAtraso: number;
}

// Cada parte das despesas divididas, com o estado de hoje.
export function partesDoRacha(lancamentos: readonly LancamentoDividido[], hoje: string): ParteDoRacha[] {
  return lancamentos.filter(temRacha).flatMap((lancamento) =>
    (lancamento.divisao ?? []).map((parte, indice) => ({
      lancamentoId: lancamento.id,
      indice,
      descricao: lancamento.descricao,
      data: lancamento.data,
      pessoa: parte.pessoa,
      valor: parte.valor_centavos,
      vencimento: parte.vencimento ?? null,
      situacao: parte.situacao ?? 'PENDENTE',
      recebidoEm: parte.recebido_em ?? null,
      estado: estadoDaParte(parte, hoje),
      diasDeAtraso: venceuSemPagar(parte, hoje) ? diasEntre(String(parte.vencimento), hoje) : 0,
    })),
  );
}

export interface DevedorDoRacha {
  // O nome como apareceu primeiro ("Bruno" e "bruno " são a mesma pessoa).
  pessoa: string;
  aReceber: number;
  recebido: number;
  inadimplente: number;
  // A receber primeiro (o que pede ação), depois as inadimplentes e as pagas;
  // dentro de cada grupo, a mais nova primeiro.
  partes: ParteDoRacha[];
}

const ORDEM_DO_ESTADO: Record<EstadoDaParte, number> = { 'a-receber': 0, inadimplente: 1, recebido: 2 };

// O racha de cada pessoa, de quem deve mais para quem deve menos (a receber
// mais o inadimplente), e quem já pagou tudo por último.
export function rachaPorPessoa(partes: readonly ParteDoRacha[]): DevedorDoRacha[] {
  const porPessoa = new Map<string, DevedorDoRacha>();
  for (const parte of partes) {
    const chave = normalizarTexto(parte.pessoa);
    const devedor = porPessoa.get(chave) ?? { pessoa: parte.pessoa.trim(), aReceber: 0, recebido: 0, inadimplente: 0, partes: [] };
    if (parte.estado === 'a-receber') {
      devedor.aReceber += parte.valor;
    } else if (parte.estado === 'recebido') {
      devedor.recebido += parte.valor;
    } else {
      devedor.inadimplente += parte.valor;
    }
    devedor.partes.push(parte);
    porPessoa.set(chave, devedor);
  }
  const emAberto = (devedor: DevedorDoRacha) => devedor.aReceber + devedor.inadimplente;
  return [...porPessoa.values()]
    .map((devedor) => ({
      ...devedor,
      partes: [...devedor.partes].sort(
        (a, b) => ORDEM_DO_ESTADO[a.estado] - ORDEM_DO_ESTADO[b.estado] || b.data.localeCompare(a.data),
      ),
    }))
    .sort((a, b) => emAberto(b) - emAberto(a) || a.pessoa.localeCompare(b.pessoa, 'pt-BR'));
}

export interface TotaisDoRacha {
  // Ativo de curto prazo: o que ainda vai voltar para quem lançou.
  aReceber: number;
  // A parte do a receber com prazo até o fim do mês: entra no saldo livre.
  aReceberNoMes: number;
  recebido: number;
  // Despesa assumida: não pago ou com o prazo vencido.
  inadimplente: number;
}

export function totaisDoRacha(partes: readonly ParteDoRacha[], fimDoMes: string): TotaisDoRacha {
  return partes.reduce<TotaisDoRacha>(
    (totais, parte) => {
      if (parte.estado === 'a-receber') {
        totais.aReceber += parte.valor;
        if (parte.vencimento && parte.vencimento <= fimDoMes) {
          totais.aReceberNoMes += parte.valor;
        }
      } else if (parte.estado === 'recebido') {
        totais.recebido += parte.valor;
      } else {
        totais.inadimplente += parte.valor;
      }
      return totais;
    },
    { aReceber: 0, aReceberNoMes: 0, recebido: 0, inadimplente: 0 },
  );
}

// Quanto da despesa ainda é de outras pessoas (as partes a receber).
export function aReceberDoLancamento(lancamento: LancamentoDividido, hoje: string): number {
  if (!temRacha(lancamento)) {
    return 0;
  }
  return (lancamento.divisao ?? [])
    .filter((parte) => estadoDaParte(parte, hoje) === 'a-receber')
    .reduce((soma, parte) => soma + parte.valor_centavos, 0);
}

// As linhas do extrato com as despesas só na parte de quem lançou: a parte a
// receber de cada pessoa sai do valor (que é negativo na despesa). Daí saem o
// card Despesas, a rosca por categoria e o gasto por pessoa. A parte recebida
// já foi descontada pelo reembolso, e a inadimplente volta a pesar.
export function descontarAReceber<T extends { tipo: string; valor: number; original?: LancamentoDividido }>(
  linhas: readonly T[],
  hoje: string,
): T[] {
  return linhas.map((linha) => {
    const aReceber = linha.tipo === 'despesa' && linha.original ? aReceberDoLancamento(linha.original, hoje) : 0;
    return aReceber > 0 ? { ...linha, valor: Math.min(0, linha.valor + aReceber) } : linha;
  });
}

// O prazo sugerido para o racha: 30 dias depois da data da despesa.
export const PRAZO_PADRAO_EM_DIAS = 30;

export function prazoSugerido(data: string): string {
  const [ano = 0, mes = 1, dia = 1] = data.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + PRAZO_PADRAO_EM_DIAS)).toISOString().slice(0, 10);
}
