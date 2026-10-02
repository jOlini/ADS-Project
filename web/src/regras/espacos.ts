// Espaços do livro-caixa na área do cliente, sem interface. São dois, e só
// dois: o espaço pessoal (com o Modo Família dentro dele) e o espaço
// empresarial, que reúne as empresas da pessoa. Cada empresa é um livro-caixa
// próprio (tipo PJ na API): o seletor do topo troca entre Pessoal e
// Empresarial e, no empresarial, entre as empresas. Aqui ficam qual espaço
// abre, como chamar cada um, quem pode mexer, o formulário da empresa (nome,
// CNPJ, regime) e onde as metas de cada um ficam. Testado em espacos.test.ts.

import { planoDoEspaco, type Plano } from './planos';
import { limparTexto } from './sanitizacao';

export type TipoDeEspaco = 'PF' | 'PJ';
export type Regime = 'MEI' | 'SIMPLES' | 'PRESUMIDO' | 'REAL';
export type CorDaPessoa = 'menta' | 'azul' | 'roxo' | 'coral' | 'ambar' | 'rosa' | 'turquesa' | 'grafite';

export interface PessoaDaFamilia {
  id: string;
  nome: string;
  cor: CorDaPessoa;
}

export interface Familia {
  ativa: boolean;
  pessoas: PessoaDaFamilia[];
  maximo_de_pessoas: number;
}

export interface Espaco {
  id: string;
  tipo: TipoDeEspaco;
  nome: string;
  papel: string;
  // Só na empresa.
  cnpj?: string | null;
  regime?: Regime | null;
  // Só no pessoal: o Modo Família e o plano da pessoa (regras/planos.ts).
  familia?: Familia | null;
  plano?: Plano | null;
}

interface DescricaoDoTipo {
  rotulo: string;
  icone: string;
  descricao: string;
}

export const TIPOS_DE_ESPACO: Record<TipoDeEspaco, DescricaoDoTipo> = {
  PF: { rotulo: 'Pessoal', icone: 'usuario', descricao: 'O seu dinheiro e, com o Modo Família, o da casa.' },
  PJ: {
    rotulo: 'Empresarial',
    icone: 'empresa',
    descricao: 'As suas empresas, cada uma com o próprio caixa, DRE, impostos e folha.',
  },
};

export const REGIMES: readonly { valor: Regime; rotulo: string; descricao: string }[] = [
  { valor: 'MEI', rotulo: 'MEI', descricao: 'DAS fixo por mês' },
  { valor: 'SIMPLES', rotulo: 'Simples Nacional', descricao: 'DAS sobre o faturamento' },
  { valor: 'PRESUMIDO', rotulo: 'Lucro Presumido', descricao: 'PIS, COFINS, IRPJ e CSLL' },
  { valor: 'REAL', rotulo: 'Lucro Real', descricao: 'Tributos sobre o lucro apurado' },
];

export const TAMANHO_DO_NOME = 60;
export const ORDEM_DA_EMPRESA = ['nome', 'cnpj', 'regime'] as const;

// Nome mostrado na tela: o pessoal é sempre "Espaço pessoal" (o nome gravado
// é só "Pessoal"); a empresa, o nome que a pessoa deu.
export function nomeDoEspaco(espaco: Pick<Espaco, 'tipo' | 'nome'> | null | undefined): string {
  if (!espaco || espaco.tipo === 'PF') {
    return 'Espaço pessoal';
  }
  return espaco.nome;
}

// As empresas do espaço empresarial, na ordem em que foram cadastradas.
export function empresasDe(espacos: readonly Espaco[]): Espaco[] {
  return espacos.filter((espaco) => espaco.tipo === 'PJ');
}

// O espaço que abre: o último escolhido (se ainda existe), senão o pessoal,
// senão o primeiro da lista. Fora do Plano Empresarial, as empresas (de antes
// de mudar de plano) não abrem: o espaço empresarial é do Empresarial, e a
// API não deixa criar outra (regras/acessoPorPlano.ts). Os dados delas ficam
// guardados para quando o plano voltar.
export function escolherEspacoAtivo(espacos: readonly Espaco[], guardado: string | null | undefined): Espaco | null {
  const pessoal = espacos.find((espaco) => espaco.tipo === 'PF');
  const abriveis =
    pessoal && planoDoEspaco(pessoal) !== 'EMPRESARIAL' ? espacos.filter((espaco) => espaco.tipo !== 'PJ') : espacos;
  return abriveis.find((espaco) => espaco.id === guardado) ?? pessoal ?? abriveis[0] ?? null;
}

// O livro que abre ao trocar de Pessoal para Empresarial (ou o contrário): o
// pessoal, ou a última empresa usada (se ainda existe), senão a primeira.
// null quando não há empresa: a tela pede o cadastro da primeira.
export function espacoDoContexto(
  espacos: readonly Espaco[],
  tipo: TipoDeEspaco,
  ultimaEmpresa: string | null | undefined,
): Espaco | null {
  if (tipo === 'PF') {
    return espacos.find((espaco) => espaco.tipo === 'PF') ?? null;
  }
  const empresas = empresasDe(espacos);
  return empresas.find((empresa) => empresa.id === ultimaEmpresa) ?? empresas[0] ?? null;
}

// Editar e excluir: só a empresa que a pessoa cadastrou. O pessoal é fixo.
export function podeGerenciar(espaco: Pick<Espaco, 'tipo' | 'papel'> | null | undefined): boolean {
  return espaco?.tipo === 'PJ' && espaco.papel === 'DONO';
}

// As visões e a gestão da empresa (fluxo, DRE, custos, sociedade, impostos,
// pessoal) aparecem sozinhas no menu quando o espaço ativo é uma empresa.
export function ehEmpresa(espaco: Pick<Espaco, 'tipo'> | null | undefined): boolean {
  return espaco?.tipo === 'PJ';
}

// ------------------------------------------------------------------- CNPJ

// O CNPJ só com os 14 caracteres (numérico ou o alfanumérico da Receita
// Federal, de julho de 2026 em diante), em maiúsculas.
export function limparCnpj(texto: string | null | undefined): string {
  return (texto ?? '').replace(/[.\-/\s]/g, '').toUpperCase();
}

// Os dígitos verificadores: cada caractere vale o código dele menos 48 (os
// dígitos continuam 0 a 9), com os pesos de sempre. A API confere o mesmo.
export function cnpjValido(texto: string | null | undefined): boolean {
  const cnpj = limparCnpj(texto);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj) || new Set(cnpj).size === 1) {
    return false;
  }
  const valores = [...cnpj].map((caractere) => caractere.charCodeAt(0) - 48);
  return [12, 13].every((tamanho) => {
    const pesos = Array.from({ length: tamanho }, (_, indice) => (indice % 8) + 2).reverse();
    const resto = pesos.reduce((soma, peso, indice) => soma + peso * (valores[indice] ?? 0), 0) % 11;
    return valores[tamanho] === (resto < 2 ? 0 : 11 - resto);
  });
}

// 11222333000181 -> 11.222.333/0001-81. Texto que não é um CNPJ completo
// volta como está (a pessoa ainda está digitando).
export function formatarCnpj(texto: string | null | undefined): string {
  const cnpj = limparCnpj(texto);
  if (cnpj.length !== 14) {
    return texto ?? '';
  }
  return `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
}

// ------------------------------------------------------ Formulário da empresa

export interface DadosDaEmpresa {
  nome: string;
  cnpj: string;
  regime: string;
}

// Erros por campo do cadastro da empresa. A API confere de novo; aqui a
// pessoa fica sabendo antes de enviar. CNPJ é opcional; o regime, pedido
// porque decide os tributos sugeridos na aba Impostos.
export function validarEmpresa({ nome, cnpj, regime }: DadosDaEmpresa): Record<string, string> {
  const erros: Record<string, string> = {};
  const limpo = limparTexto(nome);
  if (!limpo) {
    erros.nome = 'Dê um nome à empresa.';
  } else if (limpo.length > TAMANHO_DO_NOME) {
    erros.nome = `Use até ${TAMANHO_DO_NOME} caracteres.`;
  }
  if (limparCnpj(cnpj) && !cnpjValido(cnpj)) {
    erros.cnpj = 'CNPJ inválido. Confira os 14 caracteres.';
  }
  if (!REGIMES.some((opcao) => opcao.valor === regime)) {
    erros.regime = 'Escolha o regime tributário.';
  }
  return erros;
}

// O corpo para a API: CNPJ vazio vai como null (sem CNPJ).
export function corpoDaEmpresa({ nome, cnpj, regime }: DadosDaEmpresa) {
  return { nome: limparTexto(nome), cnpj: limparCnpj(cnpj) || null, regime };
}

// ------------------------------------------------------------ Navegação

// Trocando de espaço, a tela volta ao começo da seção em que estava: o
// cartão ou o filtro abertos eram do livro anterior e não existem no novo.
// As telas da empresa (/empresa/fluxo, /empresa/custos...) são seções
// inteiras; num espaço que não é de empresa, a própria tela volta à Visão
// geral (e a da família, numa empresa).
export function secaoDaRota(caminho: string): string {
  const partes = caminho.split('?')[0]?.split('/').filter(Boolean) ?? [];
  if (partes[0] === 'empresa' && partes[1]) {
    return `/empresa/${partes[1]}`;
  }
  return partes[0] ? `/${partes[0]}` : '/principal';
}

// Metas ficam no navegador até a API de metas: as do pessoal continuam na
// chave de sempre (só o uid), e cada empresa tem a sua lista.
export function donoDasMetas(uid: string | undefined, espaco: Pick<Espaco, 'id' | 'tipo'> | null | undefined): string | undefined {
  if (!uid || !espaco || espaco.tipo === 'PF') {
    return uid;
  }
  return `${uid}:${espaco.id}`;
}
