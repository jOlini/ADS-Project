import type { ChangeEvent, FormEvent } from 'react';
import { mascararInteiro, mascararMoeda, podeDigitar, TECLADO, type TextoMascarado, type TipoDeMascara } from '../regras/mascaras';
import { limparDigitacao } from '../regras/sanitizacao';

export type AoMudar = (evento: ChangeEvent<HTMLInputElement>) => void;
export type AntesDeDigitar = (evento: FormEvent<HTMLInputElement>) => void;

export interface OpcoesDaMascara {
  onChange?: AoMudar;
  onBeforeInput?: AntesDeDigitar;
  // Algarismos do campo inteiro (padrão: 9).
  digitos?: number;
}

// O texto do campo depois da máscara e onde o cursor fica.
export function aplicarMascara(
  mascara: TipoDeMascara,
  valor: string,
  cursor: number,
  { teclaDigitada = null, colado = false, digitos }: { teclaDigitada?: string | null; colado?: boolean; digitos?: number } = {},
): TextoMascarado {
  switch (mascara) {
    case 'moeda':
    case 'moeda-com-sinal':
      return mascararMoeda(valor, cursor, { permitirNegativo: mascara === 'moeda-com-sinal', teclaDigitada, colado });
    case 'inteiro':
      return mascararInteiro(valor, cursor, { digitos });
    case 'texto':
      return { texto: limparDigitacao(valor), cursor: limparDigitacao(valor.slice(0, cursor)).length };
    default:
      // A data tem a máscara do SeletorDeData.
      return { texto: valor, cursor };
  }
}

// Props de um <input> com máscara: a tecla que não serve nem aparece
// (beforeinput) e o que entra por colar, arrastar ou pelo preenchimento
// automático passa pela máscara antes de chegar ao onChange de quem usa. O
// valor do campo é trocado no próprio elemento, com o cursor no lugar certo,
// e o onChange recebe o evento com o texto já mascarado em target.value.
export function propsDaMascara(mascara: TipoDeMascara, { onChange, onBeforeInput, digitos }: OpcoesDaMascara = {}) {
  return {
    inputMode: TECLADO[mascara],
    onBeforeInput(evento: FormEvent<HTMLInputElement>) {
      const tecla = (evento as FormEvent<HTMLInputElement> & { data?: string | null }).data;
      if (!podeDigitar(mascara, tecla)) {
        evento.preventDefault();
      }
      onBeforeInput?.(evento);
    },
    onChange(evento: ChangeEvent<HTMLInputElement>) {
      const campo = evento.target;
      const nativo = evento.nativeEvent as InputEvent;
      const tipo = nativo.inputType ?? '';
      const { texto, cursor } = aplicarMascara(mascara, campo.value, campo.selectionStart ?? campo.value.length, {
        teclaDigitada: tipo.startsWith('insert') ? (nativo.data ?? null) : null,
        colado: tipo === 'insertFromPaste' || tipo === 'insertFromDrop' || tipo === '',
        digitos,
      });
      if (texto !== campo.value) {
        campo.value = texto;
        if (campo.ownerDocument.activeElement === campo) {
          campo.setSelectionRange(cursor, cursor);
        }
      }
      onChange?.(evento);
    },
  };
}
