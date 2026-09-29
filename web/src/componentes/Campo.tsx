import { useId, type ElementType, type ReactNode } from 'react';
import Icone from './Icone';
import { propsDaMascara, type AntesDeDigitar, type AoMudar } from './mascara';
import type { TipoDeMascara } from '../regras/mascaras';

interface PropsDoCampo {
  rotulo: ReactNode;
  dica?: ReactNode;
  erro?: ReactNode;
  // Controle no lugar do <input>: Seletor, SeletorDeData.
  elemento?: ElementType;
  // Tipo de dado do <input>: moeda, moeda-com-sinal, inteiro ou texto (as
  // regras em regras/mascaras.ts). Sem máscara, o campo aceita qualquer texto.
  mascara?: TipoDeMascara;
  // Algarismos do campo inteiro.
  digitos?: number;
  [prop: string]: unknown;
}

// Rótulo + controle + dica + mensagem de erro, ligados por id para leitores de
// tela. A dica (ex.: regra da senha) aparece antes do erro, para a pessoa
// acertar de primeira. O controle é um <input> ou um componente do projeto
// passado em elemento (Seletor, SeletorDeData), que recebe também o id do
// rótulo em idDoRotulo. As demais props vão direto para o controle.
//
// A linha da mensagem de erro existe sempre, vazia até haver um erro: mostrar
// ou tirar a mensagem não empurra os campos de baixo nem desalinha o vizinho
// da mesma linha (estilos em index.css, .campo).
export default function Campo({ rotulo, dica, erro, elemento = 'input', mascara, digitos, ...propsDoControle }: PropsDoCampo) {
  const id = useId();
  const idDoRotulo = `${id}-rotulo`;
  const idDaDica = `${id}-dica`;
  const idDoErro = `${id}-erro`;
  const descricao = [dica && idDaDica, erro && idDoErro].filter(Boolean).join(' ');
  const Controle = elemento as ElementType<Record<string, unknown>>;
  const nativo = typeof elemento === 'string';
  const propsDoComponente = nativo ? {} : { idDoRotulo };
  const mascarado =
    nativo && mascara
      ? {
          ...propsDaMascara(mascara, {
            onChange: propsDoControle.onChange as AoMudar | undefined,
            onBeforeInput: propsDoControle.onBeforeInput as AntesDeDigitar | undefined,
            digitos,
          }),
          // O teclado pedido por quem usa vale mais que o da máscara.
          ...(propsDoControle.inputMode ? { inputMode: propsDoControle.inputMode } : {}),
          autoComplete: propsDoControle.autoComplete ?? 'off',
        }
      : {};

  return (
    <div className="campo">
      <label id={idDoRotulo} htmlFor={id}>
        {rotulo}
      </label>
      <Controle
        id={id}
        aria-invalid={Boolean(erro)}
        aria-describedby={descricao || undefined}
        {...propsDoComponente}
        {...propsDoControle}
        {...mascarado}
      />
      {dica && (
        <span id={idDaDica} className="dica-do-campo">
          {dica}
        </span>
      )}
      <span id={idDoErro} className="erro-do-campo">
        {erro && (
          <>
            <Icone nome="alerta" tamanho={14} />
            {erro}
          </>
        )}
      </span>
    </div>
  );
}
