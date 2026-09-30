// Aba Custos da empresa, sem interface: a classe de cada despesa (variável,
// fixa, operacional ou fora dos custos), a margem de contribuição, o lucro e
// a margem de lucro do período e o ponto de equilíbrio. Mesma leitura do DRE
// (regras/empresa.ts): pelo mês de cada lançamento, compras no cartão na data
// da compra, transferências e o dinheiro dos sócios fora. Testado em
// custos.test.ts. Valores em centavos.

import { normalizarTexto } from '../../regras/texto';
import { grupoDaCategoria, type CategoriaDaEmpresa, type LancamentoDaEmpresa } from './empresa';

export type ClasseDeCusto = 'VARIAVEL' | 'FIXO' | 'OPERACIONAL' | 'FORA';

export const CLASSES: readonly { valor: ClasseDeCusto; rotulo: string; descricao: string }[] = [
  { valor: 'VARIAVEL', rotulo: 'Custos variáveis', descricao: 'Crescem com as vendas: fornecedores, insumos, impostos sobre a venda.' },
  { valor: 'FIXO', rotulo: 'Custos fixos', descricao: 'Não mudam com as vendas: aluguel, folha, pró-labore, contador.' },
  { valor: 'OPERACIONAL', rotulo: 'Despesas operacionais', descricao: 'O dia a dia da operação: marketing, tarifas, manutenção.' },
  { valor: 'FORA', rotulo: 'Fora dos custos', descricao: 'Não é custo do negócio: a distribuição de lucros aos sócios.' },
];

// Classe da função que a gestão grava na categoria (API).
const CLASSE_DA_FUNCAO: Record<string, ClasseDeCusto> = {
  IMPOSTOS: 'VARIAVEL',
  SALARIOS: 'FIXO',
  ENCARGOS: 'FIXO',
  BENEFICIOS: 'FIXO',
  PRO_LABORE: 'FIXO',
  PRESTADORES: 'FIXO',
  DISTRIBUICAO: 'FORA',
};

// Sugestão pelo nome, em palavras inteiras sem acento (como o DRE): a pessoa
// confirma ou troca na tela, e a escolha fica gravada na categoria.
const PALAVRAS: readonly [ClasseDeCusto, RegExp][] = [
  ['FORA', /\b(distribuicao de lucros?|dividendos?|lucros distribuidos)\b/],
  [
    'VARIAVEL',
    /\b(fornecedor(es)?|insumos?|mercadorias?|materia[- ]prima|embalagens?|fretes?|comiss(ao|oes)|impostos?|das|simples nacional|icms|iss|pis|cofins|tributos?|maquininha)\b/,
  ],
  [
    'FIXO',
    /\b(aluguel|condominio|folha|salarios?|pro[- ]labore|encargos|beneficios|contador|contabilidade|sistemas?|softwares?|assinaturas?|seguros?|internet|telefone|prestadores?)\b/,
  ],
];

export function classeSugerida(categoria: Pick<CategoriaDaEmpresa, 'nome' | 'funcao'>): ClasseDeCusto {
  if (categoria.funcao && CLASSE_DA_FUNCAO[categoria.funcao]) {
    return CLASSE_DA_FUNCAO[categoria.funcao] as ClasseDeCusto;
  }
  const nome = normalizarTexto(categoria.nome);
  return PALAVRAS.find(([, palavras]) => palavras.test(nome))?.[0] ?? 'OPERACIONAL';
}

// A classe que vale: a escolhida (gravada na categoria) ou a sugerida.
export function classeDaCategoria(categoria: Pick<CategoriaDaEmpresa, 'nome' | 'funcao' | 'classe_de_custo'>): ClasseDeCusto {
  const gravada = categoria.classe_de_custo as ClasseDeCusto | null | undefined;
  return gravada && CLASSES.some((classe) => classe.valor === gravada) ? gravada : classeSugerida(categoria);
}

export interface CustoDaCategoria {
  id: string;
  nome: string;
  valor: number;
  // A pessoa escolheu a classe (false: é a sugestão da tela).
  escolhida: boolean;
}

export interface GrupoDeCusto {
  total: number;
  // Parte da receita (0 a 100) ou null sem receita.
  parte: number | null;
  categorias: CustoDaCategoria[];
}

export interface Custos {
  receita: number;
  grupos: Record<ClasseDeCusto, GrupoDeCusto>;
  // Receita − custos variáveis: o que sobra de cada venda para pagar o resto.
  margemDeContribuicao: number;
  margemDeContribuicaoPct: number | null;
  // Receita − variáveis − fixos − operacionais.
  lucro: number;
  margemDeLucroPct: number | null;
  // Receita que paga os fixos e os operacionais com a margem de contribuição
  // de hoje; null sem receita ou com margem de contribuição zero ou negativa.
  pontoDeEquilibrio: number | null;
  lancamentos: number;
}

const porcento = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : null);

function valorNaOrigem(lancamento: LancamentoDaEmpresa): number {
  return lancamento.partidas.find((partida) => partida.conta_id === lancamento.conta_id)?.valor_centavos ?? 0;
}

export function montarCustos(
  lancamentos: readonly LancamentoDaEmpresa[],
  categorias: readonly CategoriaDaEmpresa[],
  { de, ate }: { de: string; ate: string },
): Custos {
  const categoriaPorId = new Map(categorias.map((categoria) => [categoria.id, categoria]));
  const somas: Record<ClasseDeCusto, Map<string, CustoDaCategoria>> = {
    VARIAVEL: new Map(),
    FIXO: new Map(),
    OPERACIONAL: new Map(),
    FORA: new Map(),
  };
  let receita = 0;
  let contados = 0;
  for (const lancamento of lancamentos) {
    if (lancamento.tipo === 'TRANSFERENCIA' || lancamento.data < de || lancamento.data > ate) {
      continue;
    }
    const valor = valorNaOrigem(lancamento);
    const categoria = lancamento.categoria_id ? categoriaPorId.get(lancamento.categoria_id) : undefined;
    const grupo = grupoDaCategoria(categoria, valor);
    if (lancamento.tipo === 'RECEITA') {
      // Só a receita do negócio (a dos sócios e a financeira ficam fora).
      if (grupo === 'RECEITA') {
        receita += valor;
        contados += 1;
      }
      continue;
    }
    // Despesa (o estorno volta com o sinal trocado e desconta da mesma).
    const classe = grupo === 'FORA' ? 'FORA' : categoria ? classeDaCategoria(categoria) : 'OPERACIONAL';
    const chave = categoria?.id ?? 'sem-categoria';
    const atual = somas[classe].get(chave) ?? {
      id: chave,
      nome: categoria?.nome ?? 'Sem categoria',
      valor: 0,
      escolhida: Boolean(categoria?.classe_de_custo),
    };
    atual.valor -= valor;
    somas[classe].set(chave, atual);
    contados += 1;
  }

  const grupo = (classe: ClasseDeCusto): GrupoDeCusto => {
    const itens = [...somas[classe].values()]
      .filter((item) => item.valor !== 0)
      .sort((a, b) => b.valor - a.valor || a.nome.localeCompare(b.nome, 'pt-BR'));
    const total = itens.reduce((soma, item) => soma + item.valor, 0);
    return { total, parte: porcento(total, receita), categorias: itens };
  };
  const grupos = { VARIAVEL: grupo('VARIAVEL'), FIXO: grupo('FIXO'), OPERACIONAL: grupo('OPERACIONAL'), FORA: grupo('FORA') };
  const margemDeContribuicao = receita - grupos.VARIAVEL.total;
  const estrutura = grupos.FIXO.total + grupos.OPERACIONAL.total;
  const lucro = margemDeContribuicao - estrutura;
  return {
    receita,
    grupos,
    margemDeContribuicao,
    margemDeContribuicaoPct: porcento(margemDeContribuicao, receita),
    lucro,
    margemDeLucroPct: porcento(lucro, receita),
    pontoDeEquilibrio:
      receita > 0 && margemDeContribuicao > 0 ? Math.round((estrutura * receita) / margemDeContribuicao) : null,
    lancamentos: contados,
  };
}

export interface FaixaDaVenda {
  classe: ClasseDeCusto | 'LUCRO';
  rotulo: string;
  // Parte da receita, 0 a 100 (somadas, até 100).
  parte: number;
}

// "Para onde vai cada R$ 100 vendidos": variáveis, fixos, operacionais e o
// lucro, em partes da receita que somam 100 (o prejuízo não tem faixa: a
// barra fica toda de custos). Sem receita, lista vazia.
export function faixasDaVenda(custos: Custos): FaixaDaVenda[] {
  if (custos.receita <= 0) {
    return [];
  }
  const faixas: FaixaDaVenda[] = [
    { classe: 'VARIAVEL', rotulo: 'Variáveis', parte: custos.grupos.VARIAVEL.total },
    { classe: 'FIXO', rotulo: 'Fixos', parte: custos.grupos.FIXO.total },
    { classe: 'OPERACIONAL', rotulo: 'Operacionais', parte: custos.grupos.OPERACIONAL.total },
    { classe: 'LUCRO', rotulo: 'Lucro', parte: custos.lucro },
  ];
  const partes = faixas.map((faixa) => ({ ...faixa, parte: Math.max(0, faixa.parte) }));
  const total = partes.reduce((soma, faixa) => soma + faixa.parte, 0);
  if (total <= 0) {
    return [];
  }
  // Maiores restos: as partes inteiras somam exatamente 100.
  const brutas = partes.map((faixa) => (faixa.parte / total) * 100);
  const inteiras = brutas.map(Math.floor);
  let falta = 100 - inteiras.reduce((soma, parte) => soma + parte, 0);
  const ordem = brutas.map((bruta, indice) => ({ indice, resto: bruta - Math.floor(bruta) })).sort((a, b) => b.resto - a.resto);
  for (const { indice } of ordem) {
    if (falta <= 0) {
      break;
    }
    inteiras[indice] = (inteiras[indice] ?? 0) + 1;
    falta -= 1;
  }
  return partes.map((faixa, indice) => ({ ...faixa, parte: inteiras[indice] ?? 0 })).filter((faixa) => faixa.parte > 0);
}
