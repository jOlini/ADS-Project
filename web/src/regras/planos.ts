// Planos da OliFine, sem interface: o que cada um libera na tela e a tabela
// comparativa da landing. Testado em planos.test.ts.
//
// O plano mora no espaço pessoal (um por pessoa) e nasce Free. Só o
// back-office troca (sem checkout ainda), e a API confere cada recurso de
// novo: o que está aqui só decide o que a tela mostra. Esconder um botão
// nunca é a única trava.

import type { Espaco } from './espacos';

export type Plano = 'FREE' | 'FAMILIA' | 'EMPRESARIAL';

// Os mesmos da API: o Empresarial inclui tudo do Família.
const PLANOS_COM_FAMILIA: readonly Plano[] = ['FAMILIA', 'EMPRESARIAL'];

// O plano de um espaço pessoal. Sem o campo (API antiga) ou com um valor que
// não existe, Free: na dúvida, nada é liberado.
export function planoDoEspaco(espaco: Pick<Espaco, 'plano'> | null | undefined): Plano {
  const plano = espaco?.plano;
  return plano === 'FAMILIA' || plano === 'EMPRESARIAL' ? plano : 'FREE';
}

// O plano da pessoa, lido no espaço pessoal da lista (numa empresa, o espaço
// ativo não traz o plano).
export function planoDoCliente(espacos: readonly Pick<Espaco, 'tipo' | 'plano'>[] | null | undefined): Plano {
  return planoDoEspaco(espacos?.find((espaco) => espaco.tipo === 'PF'));
}

// Modo Família (pessoas da casa, filtro "de quem", gasto por pessoa) e a
// divisão do gasto com o nome e a parte de cada pessoa.
export function familiaLiberada(plano: Plano): boolean {
  return PLANOS_COM_FAMILIA.includes(plano);
}

// ------------------------------------------------------ Tabela da landing

// A escada dos planos na landing: a entrada, o intermediário e o principal
// (o que tem tudo), que leva o maior destaque visual.
export type NivelDoPlano = 'entrada' | 'intermediario' | 'principal';

export interface DescricaoDoPlano {
  id: Plano;
  nome: string;
  apoio: string;
  // Sem preço decidido ainda: "Em breve" no lugar (D-F6 no cofre).
  preco: string | null;
  nivel: NivelDoPlano;
  // O selo acima do nome (só no principal).
  selo?: string;
  destaque?: boolean;
}

export const PLANOS: readonly DescricaoDoPlano[] = [
  { id: 'FREE', nome: 'Free', apoio: 'O essencial para organizar o seu dinheiro.', preco: 'R$ 0', nivel: 'entrada' },
  {
    id: 'FAMILIA',
    nome: 'Família',
    apoio: 'O dinheiro da casa, com o gasto de cada pessoa separado.',
    preco: null,
    nivel: 'intermediario',
  },
  {
    id: 'EMPRESARIAL',
    nome: 'Empresarial',
    apoio: 'Tudo do Família, mais as suas empresas.',
    preco: null,
    nivel: 'principal',
    selo: 'O mais completo',
    destaque: true,
  },
];

// true: incluso; false: não incluso; texto: incluso com esse limite.
export type Oferta = boolean | string;

export interface RecursoDoPlano {
  id: string;
  nome: string;
  // O que o recurso faz, em uma ou duas frases simples (o "i" da tabela).
  dica: string;
  oferta: Record<Plano, Oferta>;
}

export interface GrupoDeRecursos {
  titulo: string;
  recursos: readonly RecursoDoPlano[];
}

const EM_TODOS: Record<Plano, Oferta> = { FREE: true, FAMILIA: true, EMPRESARIAL: true };
const DO_FAMILIA: Record<Plano, Oferta> = { FREE: false, FAMILIA: true, EMPRESARIAL: true };
const SO_EMPRESARIAL: Record<Plano, Oferta> = { FREE: false, FAMILIA: false, EMPRESARIAL: true };

export const RECURSOS_DOS_PLANOS: readonly GrupoDeRecursos[] = [
  {
    titulo: 'Para o seu dinheiro',
    recursos: [
      {
        id: 'contas',
        nome: 'Contas e cartões de crédito',
        dica: 'Cadastre onde o seu dinheiro está (conta, poupança, carteira) e os seus cartões, com a fatura de cada mês.',
        oferta: EM_TODOS,
      },
      {
        id: 'lancamentos',
        nome: 'Lançamentos com categoria',
        dica: 'Anote o que entra e o que sai. A categoria (mercado, aluguel, lazer) mostra para onde o dinheiro vai.',
        oferta: EM_TODOS,
      },
      {
        id: 'importacao',
        nome: 'Importação do extrato',
        dica: 'Traga o arquivo CSV do banco e os lançamentos entram de uma vez, sem digitar um por um.',
        oferta: EM_TODOS,
      },
      {
        id: 'saldo-livre',
        nome: 'Saldo livre do mês',
        dica: 'Quanto dá para gastar até o fim do mês sem faltar dinheiro para as contas que ainda vão chegar.',
        oferta: EM_TODOS,
      },
      {
        id: 'metas',
        nome: 'Metas com a árvore',
        dica: 'Cada meta é uma árvore: cada valor que você guarda rega e faz a árvore crescer até dar frutos.',
        oferta: EM_TODOS,
      },
      {
        id: 'dividir',
        nome: 'Dividir um gasto',
        dica: 'No Free, você anota em quantas pessoas a conta foi dividida. No Família, cada pessoa entra com o nome e a parte dela.',
        oferta: { FREE: 'Só o número', FAMILIA: 'Nome e valor', EMPRESARIAL: 'Nome e valor' },
      },
    ],
  },
  {
    titulo: 'Para a casa',
    recursos: [
      {
        id: 'pessoas',
        nome: 'Pessoas da casa',
        dica: 'Inclua quem mora com você (cada um com uma cor). Ninguém precisa criar conta nem pagar: a sua assinatura cobre todos.',
        oferta: { FREE: false, FAMILIA: 'Você + 5', EMPRESARIAL: 'Você + 5' },
      },
      {
        id: 'filtro',
        nome: 'Filtro "de quem" e gasto por pessoa',
        dica: 'Veja os números da casa toda ou só de uma pessoa, e quanto cada um gastou no mês.',
        oferta: DO_FAMILIA,
      },
    ],
  },
  {
    titulo: 'Para a empresa',
    recursos: [
      {
        id: 'empresas',
        nome: 'Espaço empresarial',
        dica: 'Cada empresa (com CNPJ e regime) tem o próprio caixa, separado do seu dinheiro pessoal.',
        oferta: SO_EMPRESARIAL,
      },
      {
        id: 'dre',
        nome: 'DRE e fluxo de caixa',
        dica: 'Mostra se a empresa deu lucro no mês e por onde o dinheiro entrou e saiu.',
        oferta: SO_EMPRESARIAL,
      },
      {
        id: 'gestao',
        nome: 'Custos, impostos, sócios e folha',
        dica: 'Separa custos fixos e variáveis, lembra dos impostos, registra os aportes dos sócios e paga a equipe.',
        oferta: SO_EMPRESARIAL,
      },
    ],
  },
];

// O que o leitor de tela ouve em cada célula da tabela.
export function textoDaOferta(oferta: Oferta): string {
  if (oferta === true) {
    return 'Incluso';
  }
  if (oferta === false) {
    return 'Não incluso';
  }
  return oferta;
}
