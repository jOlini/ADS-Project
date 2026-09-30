// Aba Pessoal (RH) da empresa, sem interface: as pessoas da folha (CLT, PJ e
// sócio com pró-labore), o custo de cada uma, o resumo da folha de uma
// competência, o que falta lançar e o formulário. A folha lançada vira
// lançamentos na API (salário e benefícios de cada pessoa, sem duplicar a
// competência). Testado em folha.test.ts. Valores em centavos; competência
// em 'AAAA-MM'.

import { dataExiste } from '../../regras/datas';
import { lerValor } from '../../regras/dinheiro';
import { mesmaPessoa } from '../../regras/responsavel';
import { limparTexto } from '../../regras/sanitizacao';

export type Vinculo = 'CLT' | 'PJ' | 'PRO_LABORE';

export const VINCULOS: readonly { valor: Vinculo; rotulo: string; descricao: string }[] = [
  { valor: 'CLT', rotulo: 'CLT', descricao: 'Carteira assinada: salário na folha de pagamento' },
  { valor: 'PJ', rotulo: 'PJ', descricao: 'Prestador de serviço com contrato mensal' },
  { valor: 'PRO_LABORE', rotulo: 'Pró-labore', descricao: 'Sócio que trabalha na empresa' },
];

export interface Beneficio {
  nome: string;
  valor_centavos: number;
}

export interface Colaborador {
  id: string;
  nome: string;
  vinculo: Vinculo;
  cargo?: string | null;
  salario_centavos: number;
  beneficios: Beneficio[];
  dia_pagamento: number;
  admissao?: string | null;
  ativo: boolean;
  competencias_lancadas: string[];
}

// FGTS do empregador sobre o salário CLT (8%), e as provisões do 13º (1/12
// do salário por mês) e das férias com o terço (1/12 × 4/3). São estimativas
// para o planejamento; a folha de verdade tem mais regras (a contabilidade
// confere).
const FGTS = 0.08;

const ultimoDia = (competencia: string) => {
  const [ano = 0, mes = 1] = competencia.split('-').map(Number);
  return new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);
};

// 'AAAA-MM' de n meses antes (ou depois) de outro.
export function somarCompetencia(competencia: string, meses: number): string {
  const [ano = 0, mes = 1] = competencia.split('-').map(Number);
  const indice = ano * 12 + (mes - 1) + meses;
  return `${Math.floor(indice / 12)}-${String((indice % 12) + 1).padStart(2, '0')}`;
}

// Entra na folha quem está ativo e já tinha sido admitido até o fim da
// competência (a mesma regra da API).
export function ativoNaCompetencia(colaborador: Pick<Colaborador, 'ativo' | 'admissao'>, competencia: string): boolean {
  return colaborador.ativo && (!colaborador.admissao || colaborador.admissao <= ultimoDia(competencia));
}

export function totalDosBeneficios(colaborador: Pick<Colaborador, 'beneficios'>): number {
  return colaborador.beneficios.reduce((soma, beneficio) => soma + beneficio.valor_centavos, 0);
}

// O que sai do caixa por mês com a pessoa: salário (ou contrato, ou
// pró-labore) e benefícios.
export function custoMensal(colaborador: Pick<Colaborador, 'salario_centavos' | 'beneficios'>): number {
  return colaborador.salario_centavos + totalDosBeneficios(colaborador);
}

// Os salários CLT de quem está na folha da competência: a base dos tributos
// sobre a folha (FGTS, INSS) na aba Impostos.
export function folhaClt(colaboradores: readonly Colaborador[], competencia: string): number {
  return colaboradores
    .filter((pessoa) => pessoa.vinculo === 'CLT' && ativoNaCompetencia(pessoa, competencia))
    .reduce((soma, pessoa) => soma + pessoa.salario_centavos, 0);
}

export interface ResumoDaFolha {
  pessoas: number;
  porVinculo: Record<Vinculo, { pessoas: number; total: number }>;
  salarios: number;
  beneficios: number;
  // Salários + benefícios: o que a folha tira do caixa na competência.
  total: number;
  // Estimativas sobre os salários CLT, fora do caixa do mês.
  fgts: number;
  decimoTerceiro: number;
  ferias: number;
}

export function resumoDaFolha(colaboradores: readonly Colaborador[], competencia: string): ResumoDaFolha {
  const ativos = colaboradores.filter((pessoa) => ativoNaCompetencia(pessoa, competencia));
  const porVinculo: ResumoDaFolha['porVinculo'] = {
    CLT: { pessoas: 0, total: 0 },
    PJ: { pessoas: 0, total: 0 },
    PRO_LABORE: { pessoas: 0, total: 0 },
  };
  for (const pessoa of ativos) {
    porVinculo[pessoa.vinculo].pessoas += 1;
    porVinculo[pessoa.vinculo].total += custoMensal(pessoa);
  }
  const salarios = ativos.reduce((soma, pessoa) => soma + pessoa.salario_centavos, 0);
  const beneficios = ativos.reduce((soma, pessoa) => soma + totalDosBeneficios(pessoa), 0);
  const clt = folhaClt(colaboradores, competencia);
  return {
    pessoas: ativos.length,
    porVinculo,
    salarios,
    beneficios,
    total: salarios + beneficios,
    fgts: Math.round(clt * FGTS),
    decimoTerceiro: Math.round(clt / 12),
    ferias: Math.round(((clt / 12) * 4) / 3),
  };
}

export interface SituacaoDaFolha {
  competencia: string;
  ativos: Colaborador[];
  lancados: Colaborador[];
  pendentes: Colaborador[];
  // Quanto sai do caixa quando os pendentes forem lançados.
  totalPendente: number;
}

export function situacaoDaFolha(colaboradores: readonly Colaborador[], competencia: string): SituacaoDaFolha {
  const ativos = colaboradores.filter((pessoa) => ativoNaCompetencia(pessoa, competencia));
  const lancados = ativos.filter((pessoa) => pessoa.competencias_lancadas.includes(competencia));
  const pendentes = ativos.filter((pessoa) => !pessoa.competencias_lancadas.includes(competencia));
  return {
    competencia,
    ativos,
    lancados,
    pendentes,
    totalPendente: pendentes.reduce((soma, pessoa) => soma + custoMensal(pessoa), 0),
  };
}

// As competências que a tela oferece para lançar: o mês passado e o atual
// (a folha de um mês sai no começo do seguinte). A sugerida é a mais antiga
// com gente pendente; sem pendência, a atual.
export function competenciasParaLancar(colaboradores: readonly Colaborador[], hoje: string): { opcoes: string[]; sugerida: string } {
  const atual = hoje.slice(0, 7);
  const opcoes = [somarCompetencia(atual, -1), atual];
  const sugerida = opcoes.find((competencia) => situacaoDaFolha(colaboradores, competencia).pendentes.length > 0) ?? atual;
  return { opcoes, sugerida };
}

// O dia de pagamento da folha de uma competência: no mês seguinte a ela
// (29, 30 e 31 viram o último dia do mês curto), como a API faz.
export function dataDoPagamento(competencia: string, dia: number): string {
  const mes = somarCompetencia(competencia, 1);
  const limite = Number(ultimoDia(mes).slice(8));
  return `${mes}-${String(Math.min(dia, limite)).padStart(2, '0')}`;
}

// A próxima folha que ainda não saiu (para o fluxo de caixa): a competência
// com gente pendente, o primeiro dia de pagamento dela (no mês seguinte) e o
// total. null sem ninguém pendente.
export function proximaFolha(colaboradores: readonly Colaborador[], hoje: string): { competencia: string; data: string; total: number } | null {
  const { opcoes } = competenciasParaLancar(colaboradores, hoje);
  for (const competencia of opcoes) {
    const { pendentes, totalPendente } = situacaoDaFolha(colaboradores, competencia);
    if (pendentes.length > 0) {
      const dia = Math.min(...pendentes.map((pessoa) => pessoa.dia_pagamento));
      return { competencia, data: dataDoPagamento(competencia, dia), total: totalPendente };
    }
  }
  return null;
}

// ---------------------------------------------------------- Formulário

export const ORDEM_DO_COLABORADOR = ['nome', 'vinculo', 'cargo', 'salario', 'dia_pagamento', 'admissao'] as const;
export const TAMANHO_DO_NOME = 60;
export const MAXIMO_DE_BENEFICIOS = 10;

export interface FormularioDoColaborador {
  nome: string;
  vinculo: string;
  cargo: string;
  salario: string;
  dia_pagamento: string;
  admissao: string;
  ativo: boolean;
  beneficios: { nome: string; valor: string }[];
}

export function validarColaborador(
  formulario: FormularioDoColaborador,
  colaboradores: readonly Pick<Colaborador, 'id' | 'nome'>[],
  ignorar: string | null = null,
): Record<string, string> {
  const erros: Record<string, string> = {};
  const nome = limparTexto(formulario.nome);
  if (!nome) {
    erros.nome = 'Dê o nome da pessoa.';
  } else if (nome.length > TAMANHO_DO_NOME) {
    erros.nome = `Use até ${TAMANHO_DO_NOME} caracteres.`;
  } else if (colaboradores.some((pessoa) => pessoa.id !== ignorar && mesmaPessoa(pessoa.nome, nome))) {
    erros.nome = 'Já existe alguém com este nome na folha.';
  }
  if (!VINCULOS.some((opcao) => opcao.valor === formulario.vinculo)) {
    erros.vinculo = 'Escolha o vínculo.';
  }
  if (limparTexto(formulario.cargo).length > TAMANHO_DO_NOME) {
    erros.cargo = `Use até ${TAMANHO_DO_NOME} caracteres.`;
  }
  const salario = lerValor(formulario.salario);
  if (!formulario.salario?.trim()) {
    erros.salario = 'Informe o valor mensal.';
  } else if (!salario) {
    erros.salario = 'Use um valor maior que zero, no formato 1.234,56.';
  }
  const dia = Number(formulario.dia_pagamento);
  if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
    erros.dia_pagamento = 'Use um dia de 1 a 31.';
  }
  if (formulario.admissao && !dataExiste(formulario.admissao)) {
    erros.admissao = 'Data inválida.';
  }
  formulario.beneficios.forEach((beneficio, indice) => {
    if (!limparTexto(beneficio.nome)) {
      erros[`beneficios.${indice}.nome`] = 'Dê o nome do benefício.';
    }
    if (!lerValor(beneficio.valor)) {
      erros[`beneficios.${indice}.valor`] = 'Valor maior que zero.';
    }
  });
  return erros;
}

export function corpoDoColaborador(formulario: FormularioDoColaborador) {
  const cargo = limparTexto(formulario.cargo);
  return {
    nome: limparTexto(formulario.nome),
    vinculo: formulario.vinculo,
    salario_centavos: lerValor(formulario.salario),
    dia_pagamento: Number(formulario.dia_pagamento),
    cargo: cargo || null,
    admissao: formulario.admissao || null,
    ativo: formulario.ativo,
    beneficios: formulario.beneficios.map((beneficio) => ({
      nome: limparTexto(beneficio.nome),
      valor_centavos: lerValor(beneficio.valor),
    })),
  };
}

// O corpo do PUT a partir de uma pessoa já cadastrada, com as mudanças (ex.:
// tirar da folha sem abrir o formulário).
export function corpoDaPessoa(pessoa: Colaborador, mudancas: { ativo?: boolean } = {}) {
  return {
    nome: pessoa.nome,
    vinculo: pessoa.vinculo,
    salario_centavos: pessoa.salario_centavos,
    dia_pagamento: pessoa.dia_pagamento,
    cargo: pessoa.cargo ?? null,
    admissao: pessoa.admissao ?? null,
    ativo: pessoa.ativo,
    beneficios: pessoa.beneficios.map(({ nome, valor_centavos }) => ({ nome, valor_centavos })),
    ...mudancas,
  };
}
