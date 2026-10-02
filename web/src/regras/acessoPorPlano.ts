// Acesso por plano na área logada, sem interface: as rotas que só o Plano
// Empresarial abre (a guarda das rotas) e os limites do Free (o convite para
// conhecer os planos). Testado em acessoPorPlano.test.ts.
//
// A trava de verdade é a API: criar empresa fora do Empresarial é 403, e no
// teto do Free criar conta, lançar e comprar também (o corpo traz o membro
// "limite"). Daqui sai só o que a tela mostra antes, para a pessoa não
// preencher um formulário que vai ser recusado.

import type { Plano } from './planos';

// ------------------------------------------------------ Guarda das rotas

// O espaço empresarial (/empresarial) e a gestão de cada empresa
// (/empresa/fluxo, /empresa/dre...).
const ROTAS_DO_EMPRESARIAL = new Set(['empresarial', 'empresa']);

export function empresarialLiberado(plano: Plano): boolean {
  return plano === 'EMPRESARIAL';
}

export function rotaDoEmpresarial(caminho: string): boolean {
  const primeira = caminho.split(/[?#]/)[0]?.split('/').find(Boolean) ?? '';
  return ROTAS_DO_EMPRESARIAL.has(primeira);
}

// 'liberada': a página abre. 'convite': no lugar dela, o convite do Plano
// Empresarial (com o caminho para a página dos planos).
export type DecisaoDaRota = 'liberada' | 'convite';

export function decidirRota(caminho: string, plano: Plano): DecisaoDaRota {
  return rotaDoEmpresarial(caminho) && !empresarialLiberado(plano) ? 'convite' : 'liberada';
}

// Onde a pessoa conhece e escolhe o plano: a seção Planos da landing (sem
// checkout ainda, a troca é feita pelo back-office).
export const PAGINA_DOS_PLANOS = '/#planos';

// ------------------------------------------------------ Limites do Free

export type RecursoLimitado = 'contas' | 'lancamentos_do_mes';

export interface UsoDoRecurso {
  usado: number;
  // null: o plano não tem teto.
  maximo: number | null;
}

export interface UsoDoPlano {
  plano: Plano;
  contas: UsoDoRecurso;
  lancamentos_do_mes: UsoDoRecurso;
}

// A partir daqui o uso aparece em destaque, avisando antes do teto.
export const PERTO_DO_LIMITE = 0.8;

export type SituacaoDoLimite = 'livre' | 'perto' | 'atingido';

export function situacaoDoLimite(uso: UsoDoRecurso | null | undefined): SituacaoDoLimite {
  if (!uso || uso.maximo === null) {
    return 'livre';
  }
  if (uso.usado >= uso.maximo) {
    return 'atingido';
  }
  return uso.usado >= uso.maximo * PERTO_DO_LIMITE ? 'perto' : 'livre';
}

// Sem o uso (carregando, API antiga), pode tentar: a API decide.
export function podeCriar(uso: UsoDoPlano | null | undefined, recurso: RecursoLimitado): boolean {
  return situacaoDoLimite(uso?.[recurso]) !== 'atingido';
}

export interface LimiteAtingido {
  recurso: RecursoLimitado;
  usado: number;
  maximo: number;
  plano: Plano;
}

// O limite de um 403 da API (detalhes.limite), ou null se o erro é outro.
export function limiteDoErro(erro: unknown): LimiteAtingido | null {
  const falha = erro as { status?: number; detalhes?: { limite?: Partial<LimiteAtingido> } | null } | null;
  const limite = falha?.status === 403 ? falha.detalhes?.limite : null;
  if (!limite || (limite.recurso !== 'contas' && limite.recurso !== 'lancamentos_do_mes')) {
    return null;
  }
  return {
    recurso: limite.recurso,
    usado: Number(limite.usado ?? 0),
    maximo: Number(limite.maximo ?? 0),
    plano: limite.plano ?? 'FREE',
  };
}

const NOMES: Record<RecursoLimitado, [string, string]> = {
  contas: ['conta ou cartão', 'contas e cartões'],
  lancamentos_do_mes: ['lançamento', 'lançamentos'],
};

// "37 de 100 lançamentos este mês", "5 de 5 contas e cartões". Sem teto, só
// a contagem.
export function textoDoUso(recurso: RecursoLimitado, uso: UsoDoRecurso): string {
  const [um, varios] = NOMES[recurso];
  const quando = recurso === 'lancamentos_do_mes' ? ' este mês' : '';
  if (uso.maximo === null) {
    return `${uso.usado} ${uso.usado === 1 ? um : varios}${quando}`;
  }
  return `${uso.usado} de ${uso.maximo} ${varios}${quando}`;
}

// ------------------------------------------------------ O convite

export type MotivoDoConvite = 'empresarial' | RecursoLimitado | 'racha';

export interface Convite {
  titulo: string;
  texto: string;
  // O plano que resolve, em destaque no convite.
  plano: Exclude<Plano, 'FREE'>;
  // O que muda com ele, em itens curtos.
  ganhos: readonly string[];
}

export function conviteDe(motivo: MotivoDoConvite, maximo?: number | null): Convite {
  if (motivo === 'empresarial') {
    return {
      titulo: 'O espaço empresarial é do Plano Empresarial',
      texto:
        'O caixa de cada empresa fica separado do seu dinheiro pessoal, com DRE, fluxo de caixa, custos, impostos e folha. O Plano Empresarial inclui tudo do Família.',
      plano: 'EMPRESARIAL',
      ganhos: ['Caixa de cada empresa (CNPJ)', 'DRE e fluxo de caixa', 'Custos, impostos, sócios e folha'],
    };
  }
  if (motivo === 'racha') {
    return {
      titulo: 'Cobrar o racha é do Plano Família',
      texto:
        'Com o nome e a parte de cada pessoa, o app separa o que é seu do que vão te devolver e avisa quando alguém passa do prazo.',
      plano: 'FAMILIA',
      ganhos: ['Valor a receber de cada pessoa', 'Prazo e aviso de inadimplência', 'Gasto por pessoa da casa'],
    };
  }
  const teto = maximo ?? (motivo === 'contas' ? 5 : 100);
  return motivo === 'contas'
    ? {
        titulo: 'Você chegou ao limite de contas do Free',
        texto: `O Plano Free guarda até ${teto} contas e cartões. Para organizar mais contas, cartões e a casa toda, conheça o Família ou o Empresarial.`,
        plano: 'FAMILIA',
        ganhos: ['Contas e cartões sem limite', 'Lançamentos sem limite', 'Até 5 pessoas da casa'],
      }
    : {
        titulo: 'Você chegou ao limite de lançamentos do mês',
        texto: `O Plano Free faz até ${teto} lançamentos à mão por mês. O extrato importado continua entrando; para lançar sem limite, conheça o Família ou o Empresarial.`,
        plano: 'FAMILIA',
        ganhos: ['Lançamentos sem limite', 'Racha com valor a receber', 'Gasto por pessoa da casa'],
      };
}
