// Visões do espaço de empresa, sem interface: o DRE simplificado e o fluxo de
// caixa operacional, a partir do livro-caixa que já existe (lançamentos com
// partidas dobradas, contas e categorias). Testado em empresa.test.ts. Valores
// em centavos; datas em texto ISO.

import { normalizarTexto } from '../../regras/texto';

// ------------------------------------------------------------- DRE

// Linhas do DRE simplificado, na ordem em que aparecem. FORA não é linha:
// é o dinheiro entre a empresa e os sócios (aporte de capital, distribuição
// de lucros), que não é receita nem despesa do negócio.
export type GrupoDaDre = 'RECEITA' | 'DEDUCAO' | 'CUSTO' | 'DESPESA_OPERACIONAL' | 'FINANCEIRO' | 'FORA';

export interface CategoriaDaEmpresa {
  id: string;
  nome: string;
  tipo: string;
  // Função da categoria na gestão da empresa (API): APORTE, DISTRIBUICAO,
  // PRO_LABORE, SALARIOS, BENEFICIOS, PRESTADORES, ENCARGOS, IMPOSTOS.
  funcao?: string | null;
  classe_de_custo?: string | null;
}

// Funções das categorias do dinheiro dos sócios, fora do resultado.
const FUNCOES_DOS_SOCIOS = ['APORTE', 'DISTRIBUICAO'];

export interface Partida {
  conta_id: string;
  valor_centavos: number;
}

export interface LancamentoDaEmpresa {
  data: string;
  tipo: string;
  valor_centavos: number;
  conta_id: string;
  conta_destino_id?: string | null;
  categoria_id?: string | null;
  // De quem é o lançamento (o sócio no aporte, a pessoa na folha).
  responsavel?: string | null;
  partidas: readonly Partida[];
}

export interface ContaDaEmpresa {
  id: string;
  tipo: string;
  saldo_centavos: number;
}

// Grupo das categorias iniciais do espaço de empresa (e de nomes parecidos),
// até a categoria ter o grupo gravado nela. Categoria de receita que não é
// financeira é receita bruta; despesa sem grupo reconhecido é operacional.
// Palavras inteiras, sem acento: "DAS" é o imposto do MEI, mas "Vendas" e
// "Comidas" não são.
const PALAVRAS: readonly [GrupoDaDre, RegExp][] = [
  ['FORA', /\b(aportes?|capital social|distribuicao de lucros?|dividendos?|lucros distribuidos)\b/],
  ['DEDUCAO', /\b(impostos?|das|simples nacional|icms|iss|pis|cofins|tributos?)\b/],
  ['CUSTO', /\b(fornecedor(es)?|insumos?|mercadorias?|materia[- ]prima|embalagens?|frete de compra)\b/],
  ['FINANCEIRO', /\b(tarifas?|juros|iof|rendimentos?|multas? bancarias?)\b/],
];

export function grupoDaCategoria(
  categoria: Pick<CategoriaDaEmpresa, 'nome' | 'tipo' | 'funcao'> | undefined,
  valor = 0,
): GrupoDaDre {
  if (!categoria) {
    return valor > 0 ? 'RECEITA' : 'DESPESA_OPERACIONAL';
  }
  // A função gravada pela gestão vale mais que o nome (renomear a categoria
  // "Aportes dos sócios" não a transforma em receita).
  if (categoria.funcao && FUNCOES_DOS_SOCIOS.includes(categoria.funcao)) {
    return 'FORA';
  }
  if (categoria.funcao === 'IMPOSTOS') {
    return 'DEDUCAO';
  }
  const nome = normalizarTexto(categoria.nome);
  for (const [grupo, palavras] of PALAVRAS) {
    if (palavras.test(nome)) {
      // Imposto e custo só fazem sentido como despesa; uma receita com esse
      // nome (devolução de imposto, por exemplo) continua receita.
      if (grupo === 'FINANCEIRO' || grupo === 'FORA' || categoria.tipo !== 'RECEITA') {
        return grupo;
      }
    }
  }
  return categoria.tipo === 'RECEITA' ? 'RECEITA' : 'DESPESA_OPERACIONAL';
}

export interface ValorDaCategoria {
  nome: string;
  valor: number;
}

export interface LinhaDaDre {
  // RECEITA: o que entrou; DEDUCAO, CUSTO e DESPESA_OPERACIONAL: o que saiu
  // (positivo); FINANCEIRO: o saldo (receitas financeiras − despesas).
  total: number;
  categorias: ValorDaCategoria[];
}

export interface Dre {
  grupos: Record<Exclude<GrupoDaDre, 'FORA'>, LinhaDaDre>;
  receitaBruta: number;
  deducoes: number;
  receitaLiquida: number;
  custos: number;
  lucroBruto: number;
  despesasOperacionais: number;
  resultadoOperacional: number;
  resultadoFinanceiro: number;
  lucroLiquido: number;
  // Sobre a receita bruta (0 a 100, inteiro), ou null sem receita.
  margemBruta: number | null;
  margemLiquida: number | null;
  lancamentos: number;
}

// O valor do lançamento na conta de onde ele saiu, com o sinal do que
// aconteceu nela (receita positiva, despesa negativa). O estorno tem as
// partidas trocadas e desconta sozinho do mesmo grupo.
function valorNaOrigem(lancamento: LancamentoDaEmpresa): number {
  return lancamento.partidas.find((partida) => partida.conta_id === lancamento.conta_id)?.valor_centavos ?? 0;
}

const porcento = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : null);

// DRE do período pelo mês de cada lançamento: receitas e despesas das contas
// e as compras no cartão na data da compra (a fatura paga depois é
// transferência e não conta de novo). Transferências e o dinheiro dos
// sócios (aporte, distribuição de lucros) ficam de fora.
export function montarDre(
  lancamentos: readonly LancamentoDaEmpresa[],
  categorias: readonly CategoriaDaEmpresa[],
  { de, ate }: { de: string; ate: string },
): Dre {
  const categoriaPorId = new Map(categorias.map((categoria) => [categoria.id, categoria]));
  const grupos: Record<Exclude<GrupoDaDre, 'FORA'>, Map<string, number>> = {
    RECEITA: new Map(),
    DEDUCAO: new Map(),
    CUSTO: new Map(),
    DESPESA_OPERACIONAL: new Map(),
    FINANCEIRO: new Map(),
  };
  let contados = 0;
  for (const lancamento of lancamentos) {
    if (lancamento.tipo === 'TRANSFERENCIA' || lancamento.data < de || lancamento.data > ate) {
      continue;
    }
    const valor = valorNaOrigem(lancamento);
    const categoria = lancamento.categoria_id ? categoriaPorId.get(lancamento.categoria_id) : undefined;
    const grupo = grupoDaCategoria(categoria, valor);
    if (grupo === 'FORA') {
      continue;
    }
    const nome = categoria?.nome ?? 'Sem categoria';
    grupos[grupo].set(nome, (grupos[grupo].get(nome) ?? 0) + valor);
    contados += 1;
  }

  // Receita e financeiro com o sinal do caixa; os outros como o que saiu.
  const linha = (grupo: Exclude<GrupoDaDre, 'FORA'>): LinhaDaDre => {
    const sinal = grupo === 'RECEITA' || grupo === 'FINANCEIRO' ? 1 : -1;
    const itens = [...grupos[grupo]]
      .map(([nome, valor]) => ({ nome, valor: valor * sinal }))
      .filter((item) => item.valor !== 0)
      .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor) || a.nome.localeCompare(b.nome, 'pt-BR'));
    return { total: itens.reduce((soma, item) => soma + item.valor, 0), categorias: itens };
  };
  const dre = {
    RECEITA: linha('RECEITA'),
    DEDUCAO: linha('DEDUCAO'),
    CUSTO: linha('CUSTO'),
    DESPESA_OPERACIONAL: linha('DESPESA_OPERACIONAL'),
    FINANCEIRO: linha('FINANCEIRO'),
  };
  const receitaBruta = dre.RECEITA.total;
  const receitaLiquida = receitaBruta - dre.DEDUCAO.total;
  const lucroBruto = receitaLiquida - dre.CUSTO.total;
  const resultadoOperacional = lucroBruto - dre.DESPESA_OPERACIONAL.total;
  const lucroLiquido = resultadoOperacional + dre.FINANCEIRO.total;
  return {
    grupos: dre,
    receitaBruta,
    deducoes: dre.DEDUCAO.total,
    receitaLiquida,
    custos: dre.CUSTO.total,
    lucroBruto,
    despesasOperacionais: dre.DESPESA_OPERACIONAL.total,
    resultadoOperacional,
    resultadoFinanceiro: dre.FINANCEIRO.total,
    lucroLiquido,
    margemBruta: porcento(lucroBruto, receitaBruta),
    margemLiquida: porcento(lucroLiquido, receitaBruta),
    lancamentos: contados,
  };
}

// ------------------------------------------------- Fluxo de caixa

// Onde o dinheiro da empresa está: o caixa da operação (corrente, poupança,
// carteira), o que está aplicado (investimento) e o cartão (dívida).
export type PapelDaConta = 'operacional' | 'investimento' | 'cartao';

export function papelDaConta(conta: Pick<ContaDaEmpresa, 'tipo'> | undefined): PapelDaConta | null {
  if (!conta) {
    return null;
  }
  if (conta.tipo === 'CARTAO_CREDITO') {
    return 'cartao';
  }
  return conta.tipo === 'INVESTIMENTO' ? 'investimento' : 'operacional';
}

export interface MesDoFluxo {
  // 'AAAA-MM'
  mes: string;
  // Receitas que entraram no caixa da operação.
  entradas: number;
  // Despesas pagas pelo caixa da operação, com as faturas do cartão pagas.
  saidas: number;
  // entradas − saídas: o caixa que a operação gerou (ou consumiu).
  geracao: number;
  // Dinheiro que foi do caixa para as aplicações, e o que voltou delas.
  aplicado: number;
  resgatado: number;
  // aplicado − resgatado: quanto a empresa investiu no mês (negativo =
  // resgatou mais do que aplicou).
  investido: number;
  // Dinheiro dos sócios: aportes que entraram menos lucros distribuídos
  // (financiamento, fora da operação).
  socios: number;
  // O que mudou no caixa da operação: geração − investido + sócios.
  variacaoDoCaixa: number;
}

const mesDaData = (data: string) => data.slice(0, 7);

function mesVazio(mes: string): MesDoFluxo {
  return { mes, entradas: 0, saidas: 0, geracao: 0, aplicado: 0, resgatado: 0, investido: 0, socios: 0, variacaoDoCaixa: 0 };
}

// Fluxo de caixa operacional por mês (regime de caixa de verdade): só o que
// passou pelas contas da operação. A compra no cartão entra quando a fatura é
// paga; a transferência entre contas da operação não muda o caixa; ir para a
// conta de investimento (ou voltar dela) é investimento, não operação; o
// aporte do sócio e a distribuição de lucros são financiamento (sócios), não
// operação. O que foi lançado com data depois de hoje ainda não aconteceu e
// fica de fora.
export function fluxoDeCaixa(
  lancamentos: readonly LancamentoDaEmpresa[],
  contas: readonly ContaDaEmpresa[],
  { meses, hoje, categorias = [] }: { meses: readonly string[]; hoje: string; categorias?: readonly CategoriaDaEmpresa[] },
): MesDoFluxo[] {
  const dosSocios = new Set(
    categorias.filter((categoria) => grupoDaCategoria(categoria) === 'FORA').map((categoria) => categoria.id),
  );
  const papel = new Map(contas.map((conta) => [conta.id, papelDaConta(conta)]));
  const porMes = new Map(meses.map((mes) => [mes, mesVazio(mes)]));
  const partida = (lancamento: LancamentoDaEmpresa, conta: string | null | undefined) =>
    lancamento.partidas.find((item) => item.conta_id === conta)?.valor_centavos ?? 0;

  for (const lancamento of lancamentos) {
    const mes = porMes.get(mesDaData(lancamento.data));
    if (!mes || lancamento.data > hoje) {
      continue;
    }
    const origem = papel.get(lancamento.conta_id) ?? null;
    if (lancamento.tipo === 'TRANSFERENCIA') {
      const destino = papel.get(lancamento.conta_destino_id ?? '') ?? null;
      if (origem === 'operacional' && destino === 'cartao') {
        mes.saidas -= partida(lancamento, lancamento.conta_id);
      } else if (origem === 'operacional' && destino === 'investimento') {
        mes.aplicado -= partida(lancamento, lancamento.conta_id);
      } else if (origem === 'investimento' && destino === 'operacional') {
        mes.resgatado += partida(lancamento, lancamento.conta_destino_id);
      }
      continue;
    }
    if (origem !== 'operacional') {
      continue;
    }
    // Receita soma o que entrou; despesa, o que saiu. O estorno tem a
    // partida trocada e desconta do mesmo lado.
    const valor = partida(lancamento, lancamento.conta_id);
    if (lancamento.categoria_id && dosSocios.has(lancamento.categoria_id)) {
      mes.socios += valor;
    } else if (lancamento.tipo === 'RECEITA') {
      mes.entradas += valor;
    } else {
      mes.saidas -= valor;
    }
  }

  return meses.map((chave) => {
    const mes = porMes.get(chave) ?? mesVazio(chave);
    const geracao = mes.entradas - mes.saidas;
    const investido = mes.aplicado - mes.resgatado;
    return { ...mes, geracao, investido, variacaoDoCaixa: geracao - investido + mes.socios };
  });
}

// Saldo de hoje por papel: o caixa da operação e o que está aplicado.
export function saldosDaEmpresa(contas: readonly ContaDaEmpresa[]): { caixa: number; investido: number } {
  return contas.reduce(
    (soma, conta) => {
      const qual = papelDaConta(conta);
      if (qual === 'operacional') {
        soma.caixa += conta.saldo_centavos;
      } else if (qual === 'investimento') {
        soma.investido += conta.saldo_centavos;
      }
      return soma;
    },
    { caixa: 0, investido: 0 },
  );
}

// Os últimos n meses até o de hoje, do mais antigo ao atual ('AAAA-MM').
export function ultimosMeses(hoje: string, quantos: number): string[] {
  const [ano = 0, mes = 1] = hoje.split('-').map(Number);
  return Array.from({ length: Math.max(0, quantos) }, (_, indice) => {
    const data = new Date(Date.UTC(ano, mes - 1 - (quantos - 1 - indice), 1));
    return data.toISOString().slice(0, 7);
  });
}
