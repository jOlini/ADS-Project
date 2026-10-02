// Lançamentos em sequência, sem interface. Depois de lançar, o modal fica
// aberto para o próximo gasto, até a pessoa fechar: some o que é de cada gasto
// (descrição, valor, divisão e o prazo dela) e fica o que costuma se repetir numa sequência
// (tipo, data, conta, categoria, meio e responsável), para lançar a semana do
// mercado ou a fatura de papel sem preencher tudo de novo. Testado em
// lancamentoEmSequencia.test.ts.

import { formatarBRL } from './dinheiro';

interface CamposDeCadaGasto {
  descricao: string;
  valor: string;
  divisao: unknown[];
  dividido_entre: string;
}

// O formulário à vista (FormularioDeLancamento) pronto para o próximo.
export function proximoLancamento<T extends CamposDeCadaGasto>(formulario: T): T {
  return { ...formulario, descricao: '', valor: '', divisao: [], dividido_entre: '', prazo_da_divisao: '' };
}

// O formulário da compra no cartão (FormularioDeCompra): as parcelas também
// voltam a "à vista", porque a próxima compra raramente é parcelada igual.
export function proximaCompra<T extends CamposDeCadaGasto & { parcelas: string }>(formulario: T): T {
  return { ...proximoLancamento(formulario), parcelas: '1' };
}

export interface Sequencia {
  quantos: number;
  total: number;
  ultimo: string | null;
}

export const SEQUENCIA_VAZIA: Sequencia = { quantos: 0, total: 0, ultimo: null };

// Soma mais um lançamento à sequência do modal aberto.
export function somarNaSequencia(sequencia: Sequencia, descricao: string, valor: number): Sequencia {
  return { quantos: sequencia.quantos + 1, total: sequencia.total + valor, ultimo: descricao };
}

// "3 lançamentos nesta sequência · R$ 120,00 · último: Padaria".
export function textoDaSequencia({ quantos, total, ultimo }: Sequencia, [singular, plural] = ['lançamento', 'lançamentos']): string {
  if (quantos === 0) {
    return '';
  }
  const contagem = `${quantos} ${quantos === 1 ? singular : plural} nesta sequência`;
  return [contagem, formatarBRL(total), ultimo ? `último: ${ultimo}` : ''].filter(Boolean).join(' · ');
}
