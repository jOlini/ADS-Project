// Espaços do livro-caixa na área do cliente, sem interface: qual abrir, como
// chamar cada um, quem pode mexer, o formulário de um espaço novo e onde as
// metas de cada um ficam. Cada espaço é um livro-caixa separado (pessoal,
// família, empresa), e trocar de espaço é trocar de livro. Testado em
// espacos.test.ts.

import { limparTexto } from './sanitizacao';

export type TipoDeEspaco = 'PF' | 'FAMILIA' | 'PJ';

export interface Espaco {
  id: string;
  tipo: TipoDeEspaco;
  nome: string;
  papel: string;
}

interface DescricaoDoTipo {
  rotulo: string;
  icone: string;
  descricao: string;
}

export const TIPOS_DE_ESPACO: Record<TipoDeEspaco, DescricaoDoTipo> = {
  PF: { rotulo: 'Pessoal', icone: 'usuario', descricao: 'O seu dinheiro, só seu.' },
  FAMILIA: {
    rotulo: 'Família',
    icone: 'casa',
    descricao: 'As contas da casa, separadas do pessoal de cada um.',
  },
  PJ: {
    rotulo: 'Empresa',
    icone: 'empresa',
    descricao: 'O caixa do negócio: vendas, serviços, impostos e fornecedores.',
  },
};

// O pessoal nasce sozinho no primeiro acesso; estes a pessoa cria.
export const TIPOS_QUE_SE_CRIAM: readonly TipoDeEspaco[] = ['FAMILIA', 'PJ'];
export const TAMANHO_DO_NOME = 60;
export const ORDEM_DO_ESPACO = ['tipo', 'nome'] as const;

// Nome mostrado na tela: o pessoal é sempre "Espaço pessoal" (o nome gravado
// é só "Pessoal"); os outros, o nome que a pessoa deu.
export function nomeDoEspaco(espaco: Pick<Espaco, 'tipo' | 'nome'> | null | undefined): string {
  if (!espaco || espaco.tipo === 'PF') {
    return 'Espaço pessoal';
  }
  return espaco.nome;
}

// No botão do topo, onde o celular tem pouco espaço: o pessoal vira só
// "Pessoal" (a marca ao lado já diz que é um espaço).
export function nomeCurto(espaco: Pick<Espaco, 'tipo' | 'nome'> | null | undefined): string {
  return !espaco || espaco.tipo === 'PF' ? TIPOS_DE_ESPACO.PF.rotulo : espaco.nome;
}

// O espaço que abre: o último escolhido (se ainda existe), senão o pessoal,
// senão o primeiro da lista.
export function escolherEspacoAtivo(espacos: readonly Espaco[], guardado: string | null | undefined): Espaco | null {
  return (
    espacos.find((espaco) => espaco.id === guardado) ??
    espacos.find((espaco) => espaco.tipo === 'PF') ??
    espacos[0] ??
    null
  );
}

// Renomear e excluir: só os espaços que a pessoa criou. O pessoal é fixo.
export function podeGerenciar(espaco: Pick<Espaco, 'tipo' | 'papel'> | null | undefined): boolean {
  return Boolean(espaco) && espaco?.tipo !== 'PF' && espaco?.papel === 'DONO';
}

export interface NovoEspaco {
  tipo: string;
  nome: string;
}

// Erros por campo do formulário de espaço (novo ou renomeado). A API confere
// de novo; aqui a pessoa fica sabendo antes de enviar.
export function validarEspaco({ tipo, nome }: NovoEspaco, { renomeando = false } = {}): Record<string, string> {
  const erros: Record<string, string> = {};
  if (!renomeando && !TIPOS_QUE_SE_CRIAM.includes(tipo as TipoDeEspaco)) {
    erros.tipo = 'Escolha família ou empresa.';
  }
  const limpo = limparTexto(nome);
  if (!limpo) {
    erros.nome = 'Dê um nome ao espaço.';
  } else if (limpo.length > TAMANHO_DO_NOME) {
    erros.nome = `Use até ${TAMANHO_DO_NOME} caracteres.`;
  }
  return erros;
}

// Sugestão de nome para o espaço novo, a partir do sobrenome da pessoa.
export function nomeSugerido(tipo: string, sobrenome = ''): string {
  const ultimo = limparTexto(sobrenome).split(' ').filter(Boolean).at(-1);
  if (tipo === 'FAMILIA') {
    return ultimo ? `Família ${ultimo}` : 'Família';
  }
  return '';
}

// Trocando de espaço, a tela volta ao começo da seção em que estava: o
// cartão ou o filtro abertos eram do livro anterior e não existem no novo.
// As visões da empresa (/empresa/fluxo, /empresa/dre) são seções inteiras;
// num espaço que não é de empresa, a própria tela volta à Visão geral.
export function secaoDaRota(caminho: string): string {
  const partes = caminho.split('?')[0]?.split('/').filter(Boolean) ?? [];
  if (partes[0] === 'empresa' && partes[1]) {
    return `/empresa/${partes[1]}`;
  }
  return partes[0] ? `/${partes[0]}` : '/principal';
}

// As visões próprias do espaço de empresa (DRE e fluxo de caixa) aparecem
// sozinhas no menu quando o espaço ativo é de empresa.
export function ehEmpresa(espaco: Pick<Espaco, 'tipo'> | null | undefined): boolean {
  return espaco?.tipo === 'PJ';
}

// Metas ficam no navegador até a API de metas: as do pessoal continuam na
// chave de sempre (só o uid), e cada outro espaço tem a sua lista.
export function donoDasMetas(uid: string | undefined, espaco: Pick<Espaco, 'id' | 'tipo'> | null | undefined): string | undefined {
  if (!uid || !espaco || espaco.tipo === 'PF') {
    return uid;
  }
  return `${uid}:${espaco.id}`;
}
