// Aba Impostos da empresa, sem interface: os tributos recorrentes (DAS, DARF,
// ISS, INSS, FGTS), a agenda de vencimentos de cada competência (paga,
// atrasada, vence logo, a vencer ou em andamento), a provisão sobre o
// faturamento (ou sobre a folha, ou o valor fixo) e os alertas do sino. As
// sugestões por regime são um ponto de partida: alíquotas e datas mudam com a
// faixa, o município e a lei, e a contabilidade confere. Testado em
// impostos.test.ts. Valores em centavos; alíquota em centésimos de ponto
// (600 = 6%); competência em 'AAAA-MM'.

import { lerValor } from '../../regras/dinheiro';
import { limparTexto } from '../../regras/sanitizacao';
import { grupoDaCategoria, type CategoriaDaEmpresa, type LancamentoDaEmpresa } from './empresa';
import { somarCompetencia } from './folha';

export type TipoDeTributo = 'DAS' | 'DARF' | 'ISS' | 'GPS' | 'FGTS' | 'OUTRO';
export type BaseDoTributo = 'FATURAMENTO' | 'FOLHA' | 'FIXO';
export type Periodicidade = 'MENSAL' | 'TRIMESTRAL';
export type SituacaoDaGuia = 'PAGA' | 'ATRASADA' | 'VENCE_LOGO' | 'A_VENCER' | 'EM_ANDAMENTO';

export interface PagamentoDoTributo {
  competencia: string;
  lancamento_id: string;
  valor_centavos: number;
  data: string;
}

export interface Tributo {
  id: string;
  nome: string;
  tipo: TipoDeTributo;
  base: BaseDoTributo;
  aliquota_centesimos: number | null;
  valor_fixo_centavos: number | null;
  dia_vencimento: number;
  periodicidade: Periodicidade;
  ativo: boolean;
  pagamentos: PagamentoDoTributo[];
}

export const TIPOS_DE_TRIBUTO: readonly { valor: TipoDeTributo; rotulo: string; descricao: string }[] = [
  { valor: 'DAS', rotulo: 'DAS', descricao: 'Simples Nacional e MEI' },
  { valor: 'DARF', rotulo: 'DARF', descricao: 'Federais: IRPJ, CSLL, PIS, COFINS' },
  { valor: 'ISS', rotulo: 'ISS', descricao: 'Municipal, sobre serviços' },
  { valor: 'GPS', rotulo: 'INSS', descricao: 'Previdência sobre a folha' },
  { valor: 'FGTS', rotulo: 'FGTS', descricao: 'Fundo de garantia dos CLT' },
  { valor: 'OUTRO', rotulo: 'Outro', descricao: 'Taxas e outros tributos' },
];

export const BASES: readonly { valor: BaseDoTributo; rotulo: string; descricao: string }[] = [
  { valor: 'FATURAMENTO', rotulo: 'Sobre o faturamento', descricao: 'Alíquota sobre a receita da competência' },
  { valor: 'FOLHA', rotulo: 'Sobre a folha', descricao: 'Alíquota sobre os salários CLT' },
  { valor: 'FIXO', rotulo: 'Valor fixo', descricao: 'O mesmo valor em toda competência' },
];

export const PERIODICIDADES: readonly { valor: Periodicidade; rotulo: string }[] = [
  { valor: 'MENSAL', rotulo: 'Mensal' },
  { valor: 'TRIMESTRAL', rotulo: 'Trimestral' },
];

export interface NovoTributo {
  nome: string;
  tipo: TipoDeTributo;
  base: BaseDoTributo;
  aliquota_centesimos: number | null;
  valor_fixo_centavos: number | null;
  dia_vencimento: number;
  periodicidade: Periodicidade;
}

const tributo = (
  nome: string,
  tipo: TipoDeTributo,
  base: BaseDoTributo,
  aliquota: number | null,
  dia: number,
  periodicidade: Periodicidade = 'MENSAL',
): NovoTributo => ({
  nome,
  tipo,
  base,
  aliquota_centesimos: aliquota,
  valor_fixo_centavos: null,
  dia_vencimento: dia,
  periodicidade,
});

// Pontos de partida por regime, para a pessoa confirmar os valores. O DAS do
// MEI vem sem valor: ele sai no PGMEI e muda com o salário mínimo.
export const SUGESTOES: Record<string, readonly NovoTributo[]> = {
  MEI: [tributo('DAS-MEI', 'DAS', 'FIXO', null, 20)],
  SIMPLES: [tributo('DAS', 'DAS', 'FATURAMENTO', 600, 20), tributo('FGTS', 'FGTS', 'FOLHA', 800, 20)],
  PRESUMIDO: [
    tributo('PIS', 'DARF', 'FATURAMENTO', 65, 25),
    tributo('COFINS', 'DARF', 'FATURAMENTO', 300, 25),
    tributo('IRPJ', 'DARF', 'FATURAMENTO', 480, 31, 'TRIMESTRAL'),
    tributo('CSLL', 'DARF', 'FATURAMENTO', 288, 31, 'TRIMESTRAL'),
    tributo('ISS', 'ISS', 'FATURAMENTO', 200, 10),
    tributo('INSS patronal', 'GPS', 'FOLHA', 2_000, 20),
    tributo('FGTS', 'FGTS', 'FOLHA', 800, 20),
  ],
  REAL: [tributo('INSS patronal', 'GPS', 'FOLHA', 2_000, 20), tributo('FGTS', 'FGTS', 'FOLHA', 800, 20)],
};

const PERCENTUAL = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

// 600 -> "6%"; 288 -> "2,88%".
export function textoDaAliquota(centesimos: number): string {
  return `${PERCENTUAL.format(centesimos / 100)}%`;
}

// "08/2026", ou "3º tri/2026" no trimestral.
export function textoDaCompetencia(competencia: string, periodicidade: Periodicidade = 'MENSAL'): string {
  const [ano, mes] = competencia.split('-');
  if (periodicidade === 'TRIMESTRAL') {
    return `${Math.ceil(Number(mes) / 3)}º tri/${ano}`;
  }
  return `${mes}/${ano}`;
}

// Os meses de uma competência: o próprio mês ou os três do trimestre.
export function mesesDaCompetencia(competencia: string, periodicidade: Periodicidade): string[] {
  return periodicidade === 'TRIMESTRAL' ? [-2, -1, 0].map((passo) => somarCompetencia(competencia, passo)) : [competencia];
}

// A competência que contém o mês pedido (trimestral: o fim do trimestre).
export function competenciaDoMes(mes: string, periodicidade: Periodicidade): string {
  if (periodicidade === 'MENSAL') {
    return mes;
  }
  const numero = Number(mes.slice(5, 7));
  return somarCompetencia(mes, Math.ceil(numero / 3) * 3 - numero);
}

// A guia vence no mês seguinte à competência, no dia do tributo (29, 30 e 31
// viram o último dia do mês curto; feriado e fim de semana ficam por conta
// da conferência).
export function vencimentoDe(tributo: Pick<Tributo, 'dia_vencimento'>, competencia: string): string {
  const mes = somarCompetencia(competencia, 1);
  const [ano = 0, numero = 1] = mes.split('-').map(Number);
  const ultimo = new Date(Date.UTC(ano, numero, 0)).getUTCDate();
  return `${mes}-${String(Math.min(tributo.dia_vencimento, ultimo)).padStart(2, '0')}`;
}

// Receita bruta de cada mês ('AAAA-MM'), como o DRE: vendas e serviços (as
// receitas do grupo RECEITA), sem aporte de sócio nem rendimento.
export function faturamentoPorMes(
  lancamentos: readonly LancamentoDaEmpresa[],
  categorias: readonly CategoriaDaEmpresa[],
): Map<string, number> {
  const categoriaPorId = new Map(categorias.map((categoria) => [categoria.id, categoria]));
  const porMes = new Map<string, number>();
  for (const lancamento of lancamentos) {
    if (lancamento.tipo !== 'RECEITA') {
      continue;
    }
    const valor = lancamento.partidas.find((partida) => partida.conta_id === lancamento.conta_id)?.valor_centavos ?? 0;
    const categoria = lancamento.categoria_id ? categoriaPorId.get(lancamento.categoria_id) : undefined;
    if (grupoDaCategoria(categoria, valor) !== 'RECEITA') {
      continue;
    }
    const mes = lancamento.data.slice(0, 7);
    porMes.set(mes, (porMes.get(mes) ?? 0) + valor);
  }
  return porMes;
}

export interface BasesDosTributos {
  faturamento: ReadonlyMap<string, number>;
  // Salários CLT de um mês (folha.folhaClt).
  folha: (mes: string) => number;
}

// O valor previsto da guia de uma competência: a alíquota sobre o faturamento
// ou a folha dos meses dela, ou o valor fixo. null quando não há como saber
// (valor fixo ainda não informado).
export function valorPrevisto(tributo: Tributo | NovoTributo, competencia: string, bases: BasesDosTributos): number | null {
  if (tributo.base === 'FIXO') {
    return tributo.valor_fixo_centavos;
  }
  const meses = mesesDaCompetencia(competencia, tributo.periodicidade);
  const base =
    tributo.base === 'FATURAMENTO'
      ? meses.reduce((soma, mes) => soma + Math.max(0, bases.faturamento.get(mes) ?? 0), 0)
      : meses.reduce((soma, mes) => soma + bases.folha(mes), 0);
  return Math.round((base * (tributo.aliquota_centesimos ?? 0)) / 10_000);
}

export interface GuiaDaAgenda {
  tributo: Tributo;
  competencia: string;
  vencimento: string;
  situacao: SituacaoDaGuia;
  // Dias até o vencimento (negativo: atrasada).
  dias: number;
  previsto: number | null;
  pagamento: PagamentoDoTributo | null;
}

// Guias a vencer em até 7 dias entram como "vence logo" (e no sino).
export const DIAS_DO_ALERTA = 7;

const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);

export function situacaoDaGuia(competencia: string, vencimento: string, pago: boolean, hoje: string): SituacaoDaGuia {
  if (pago) {
    return 'PAGA';
  }
  // A competência ainda corre: o valor é uma provisão parcial.
  if (hoje.slice(0, 7) <= competencia) {
    return 'EM_ANDAMENTO';
  }
  const dias = diasEntre(hoje, vencimento);
  if (dias < 0) {
    return 'ATRASADA';
  }
  return dias <= DIAS_DO_ALERTA ? 'VENCE_LOGO' : 'A_VENCER';
}

// A agenda dos tributos ativos: para cada um, as competências das últimas
// `quantas` (a em andamento e as anteriores), com o vencimento, o valor
// previsto, o pagamento (se houver) e a situação. Da mais urgente para a
// mais tranquila: atrasadas, vence logo, a vencer, em andamento, pagas.
export function agendaDosTributos(
  tributos: readonly Tributo[],
  hoje: string,
  bases: BasesDosTributos | null,
  quantas = 3,
): GuiaDaAgenda[] {
  const ordem: Record<SituacaoDaGuia, number> = { ATRASADA: 0, VENCE_LOGO: 1, A_VENCER: 2, EM_ANDAMENTO: 3, PAGA: 4 };
  const guias: GuiaDaAgenda[] = [];
  for (const tributo of tributos.filter((item) => item.ativo)) {
    const atual = competenciaDoMes(hoje.slice(0, 7), tributo.periodicidade);
    const passo = tributo.periodicidade === 'TRIMESTRAL' ? 3 : 1;
    for (let indice = quantas - 1; indice >= 0; indice -= 1) {
      const competencia = somarCompetencia(atual, -indice * passo);
      const vencimento = vencimentoDe(tributo, competencia);
      const pagamento = tributo.pagamentos.find((item) => item.competencia === competencia) ?? null;
      guias.push({
        tributo,
        competencia,
        vencimento,
        situacao: situacaoDaGuia(competencia, vencimento, Boolean(pagamento), hoje),
        dias: diasEntre(hoje, vencimento),
        previsto: bases ? valorPrevisto(tributo, competencia, bases) : null,
        pagamento,
      });
    }
  }
  return guias.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.vencimento.localeCompare(b.vencimento));
}

// Os alertas do sino: guias atrasadas e as que vencem em até 7 dias.
export function alertasDosTributos(tributos: readonly Tributo[], hoje: string): GuiaDaAgenda[] {
  return agendaDosTributos(tributos, hoje, null).filter((guia) => guia.situacao === 'ATRASADA' || guia.situacao === 'VENCE_LOGO');
}

// ---------------------------------------------------------- Formulário

export const ORDEM_DO_TRIBUTO = ['nome', 'tipo', 'base', 'aliquota', 'valor_fixo', 'dia_vencimento', 'periodicidade'] as const;

export interface FormularioDoTributo {
  nome: string;
  tipo: string;
  base: string;
  aliquota: string;
  valor_fixo: string;
  dia_vencimento: string;
  periodicidade: string;
  ativo: boolean;
}

export function validarTributo(formulario: FormularioDoTributo): Record<string, string> {
  const erros: Record<string, string> = {};
  const nome = limparTexto(formulario.nome);
  if (!nome) {
    erros.nome = 'Dê o nome do tributo.';
  } else if (nome.length > 60) {
    erros.nome = 'Use até 60 caracteres.';
  }
  if (!TIPOS_DE_TRIBUTO.some((opcao) => opcao.valor === formulario.tipo)) {
    erros.tipo = 'Escolha a guia.';
  }
  if (!BASES.some((opcao) => opcao.valor === formulario.base)) {
    erros.base = 'Escolha a base do cálculo.';
  } else if (formulario.base === 'FIXO') {
    if (!lerValor(formulario.valor_fixo)) {
      erros.valor_fixo = 'Informe o valor da guia.';
    }
  } else {
    const aliquota = lerValor(formulario.aliquota.replace('%', ''));
    if (!aliquota || aliquota > 10_000) {
      erros.aliquota = 'Use uma alíquota de 0,01 a 100, como 6 ou 4,8.';
    }
  }
  const dia = Number(formulario.dia_vencimento);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
    erros.dia_vencimento = 'Use um dia de 1 a 31.';
  }
  if (!PERIODICIDADES.some((opcao) => opcao.valor === formulario.periodicidade)) {
    erros.periodicidade = 'Escolha mensal ou trimestral.';
  }
  return erros;
}

export function corpoDoTributo(formulario: FormularioDoTributo) {
  const fixo = formulario.base === 'FIXO';
  return {
    nome: limparTexto(formulario.nome),
    tipo: formulario.tipo,
    base: formulario.base,
    aliquota_centesimos: fixo ? null : lerValor(formulario.aliquota.replace('%', '')),
    valor_fixo_centavos: fixo ? lerValor(formulario.valor_fixo) : null,
    dia_vencimento: Number(formulario.dia_vencimento),
    periodicidade: formulario.periodicidade,
    ativo: formulario.ativo,
  };
}
