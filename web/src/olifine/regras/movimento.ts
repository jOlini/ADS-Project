// Dinheiro que a gestão da empresa lança numa conta (aporte, pró-labore,
// distribuição de lucros, guia de imposto), sem interface: a conferência do
// formulário e o corpo para a API. Testado em movimento.test.ts.

import { lerValor } from '../../regras/dinheiro';
import { dataExiste } from '../../regras/datas';
import { limparTexto } from '../../regras/sanitizacao';

export const ORDEM_DO_MOVIMENTO = ['conta_id', 'valor', 'data', 'descricao'] as const;
export const TAMANHO_DA_DESCRICAO = 120;

export interface FormularioDoMovimento {
  conta_id: string;
  valor: string;
  data: string;
  descricao?: string;
}

// entra: o dinheiro entra na conta (aporte); senão, sai dela.
export function validarMovimento(formulario: FormularioDoMovimento, { entra = false } = {}): Record<string, string> {
  const erros: Record<string, string> = {};
  if (!formulario.conta_id) {
    erros.conta_id = entra ? 'Escolha a conta em que o dinheiro entra.' : 'Escolha a conta de onde o dinheiro sai.';
  }
  const valor = lerValor(formulario.valor);
  if (!formulario.valor?.trim()) {
    erros.valor = 'Informe o valor.';
  } else if (valor === null) {
    erros.valor = 'Valor inválido. Use o formato 1.234,56.';
  } else if (valor === 0) {
    erros.valor = 'O valor precisa ser maior que zero.';
  }
  if (!dataExiste(formulario.data)) {
    erros.data = 'Informe uma data válida.';
  }
  if (limparTexto(formulario.descricao).length > TAMANHO_DA_DESCRICAO) {
    erros.descricao = `Use até ${TAMANHO_DA_DESCRICAO} caracteres.`;
  }
  return erros;
}

// Sem descrição, a API escreve a dela (ex.: "Aporte de capital · Ana").
export function corpoDoMovimento(formulario: FormularioDoMovimento) {
  const descricao = limparTexto(formulario.descricao);
  return {
    conta_id: formulario.conta_id,
    valor_centavos: lerValor(formulario.valor),
    data: formulario.data,
    ...(descricao ? { descricao } : {}),
  };
}
