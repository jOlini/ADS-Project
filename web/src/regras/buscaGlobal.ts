// Busca do topo, sem interface: acha, a cada letra, lançamentos das contas,
// compras nos cartões de crédito, contas e categorias, separados por aba.
// Cada resultado diz para onde levar (o mês do extrato ou a fatura do
// cartão). As regras de cada lançamento são as da busca do extrato
// (busca.js: descrição, valor, categoria, conta, responsável e pessoas do
// racha). Testado em buscaGlobal.test.ts.

import { combinaComABusca } from './busca';
import { referenciaDaData, type CicloDoCartao } from './faturas';
import { normalizarTexto } from './texto';

export type AbaDaBusca = 'lancamentos' | 'cartoes' | 'contas' | 'categorias';

export const ABAS_DA_BUSCA: readonly { id: AbaDaBusca; rotulo: string }[] = [
  { id: 'lancamentos', rotulo: 'Lançamentos' },
  { id: 'cartoes', rotulo: 'Cartões' },
  { id: 'contas', rotulo: 'Contas' },
  { id: 'categorias', rotulo: 'Categorias' },
];

// Uma linha do extrato (regras/livroCaixa.js, paraExtrato).
export interface LinhaDaBusca {
  id?: string;
  data: string;
  descricao: string;
  categoria: string;
  conta: string;
  valor: number;
  tipo: string;
  noCartao?: boolean;
  responsavel?: string | null;
  pessoas?: { pessoa: string }[];
  original?: { conta_id?: string };
}

export interface ContaDaBusca extends Partial<CicloDoCartao> {
  id: string;
  nome: string;
  tipo: string;
  ativa?: boolean;
}

export interface CategoriaDaBusca {
  id: string;
  nome: string;
  tipo: string;
  cor?: string | null;
}

export interface ResultadoDaBusca {
  chave: string;
  aba: AbaDaBusca;
  titulo: string;
  detalhe: string;
  // Lançamentos e compras: o valor com sinal e a data; cor da categoria.
  valor?: number;
  data?: string;
  cor?: string | null;
  // A rota que abre o resultado.
  para: string;
}

export type ResultadosDaBusca = Record<AbaDaBusca, ResultadoDaBusca[]>;

// Termo curto demais acharia quase tudo: a lista só aparece a partir daqui.
export const MINIMO_DA_BUSCA = 2;
// Quantos resultados cada aba mostra (o extrato e a fatura têm o resto).
export const LIMITE_POR_ABA = 8;

const DIA_E_MES = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dataCurta = (iso: string) => DIA_E_MES.format(new Date(`${iso}T12:00:00Z`)).replace('.', '');

const VAZIO = (): ResultadosDaBusca => ({ lancamentos: [], cartoes: [], contas: [], categorias: [] });

export function buscarEmTudo(
  termo: string,
  { linhas, contas, categorias }: { linhas: readonly LinhaDaBusca[]; contas: readonly ContaDaBusca[]; categorias: readonly CategoriaDaBusca[] },
  limite = LIMITE_POR_ABA,
): ResultadosDaBusca {
  const resultados = VAZIO();
  const busca = termo.trim();
  if (normalizarTexto(busca).length < MINIMO_DA_BUSCA) {
    return resultados;
  }
  const cartoes = new Map(contas.filter((conta) => conta.tipo === 'CARTAO_CREDITO').map((conta) => [conta.id, conta]));
  const textoDe = (texto: string) => normalizarTexto(texto);
  const palavras = textoDe(busca).split(' ');
  const combinaComONome = (nome: string) => palavras.every((palavra) => textoDe(nome).includes(palavra));

  // Do mais recente para o mais antigo; o pagamento da fatura aparece nas
  // contas (é de lá que o dinheiro sai).
  const achadas = linhas.filter((linha) => combinaComABusca(linha, busca)).sort((a, b) => b.data.localeCompare(a.data));
  for (const linha of achadas) {
    const cartao = linha.noCartao ? cartoes.get(linha.original?.conta_id ?? '') : undefined;
    const aba: AbaDaBusca = cartao ? 'cartoes' : 'lancamentos';
    if (resultados[aba].length >= limite) {
      continue;
    }
    const para = cartao
      ? `/contas/cartoes/${encodeURIComponent(cartao.id)}?fatura=${
          cartao.dia_fechamento && cartao.dia_vencimento
            ? referenciaDaData(cartao as CicloDoCartao, linha.data)
            : linha.data.slice(0, 7)
        }`
      : `/lancamentos?${new URLSearchParams({ mes: linha.data.slice(0, 7), busca: linha.descricao })}`;
    resultados[aba].push({
      chave: `${aba}-${linha.id ?? `${linha.data}-${linha.descricao}`}`,
      aba,
      titulo: linha.descricao,
      detalhe: `${dataCurta(linha.data)} · ${cartao ? cartao.nome : linha.categoria}`,
      valor: linha.valor,
      data: linha.data,
      para,
    });
  }

  for (const conta of contas) {
    if (resultados.contas.length < limite && conta.tipo !== 'CARTAO_CREDITO' && combinaComONome(conta.nome)) {
      resultados.contas.push({ chave: `conta-${conta.id}`, aba: 'contas', titulo: conta.nome, detalhe: 'Conta', para: '/contas' });
    }
  }
  // O cartão pelo nome também é achado na aba dos cartões, antes das compras.
  const cartoesPeloNome = [...cartoes.values()]
    .filter((cartao) => combinaComONome(cartao.nome))
    .map<ResultadoDaBusca>((cartao) => ({
      chave: `cartao-${cartao.id}`,
      aba: 'cartoes',
      titulo: cartao.nome,
      detalhe: 'Cartão de crédito',
      para: `/contas/cartoes/${encodeURIComponent(cartao.id)}`,
    }));
  resultados.cartoes = [...cartoesPeloNome, ...resultados.cartoes].slice(0, limite);

  for (const categoria of categorias) {
    if (resultados.categorias.length < limite && combinaComONome(categoria.nome)) {
      resultados.categorias.push({
        chave: `categoria-${categoria.id}`,
        aba: 'categorias',
        titulo: categoria.nome,
        detalhe: categoria.tipo === 'RECEITA' ? 'Categoria de receita' : 'Categoria de despesa',
        cor: categoria.cor ?? null,
        para: '/categorias',
      });
    }
  }
  return resultados;
}

export function totalDaBusca(resultados: ResultadosDaBusca): number {
  return ABAS_DA_BUSCA.reduce((soma, aba) => soma + resultados[aba.id].length, 0);
}
