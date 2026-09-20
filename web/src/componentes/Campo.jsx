import { useId } from 'react';

// Rótulo + input + dica + mensagem de erro, ligados por id para leitores de
// tela. A dica (ex.: regra da senha) aparece antes do erro, para a pessoa
// acertar de primeira. As demais props vão direto para o input.
export default function Campo({ rotulo, dica, erro, ...propsDoInput }) {
  const id = useId();
  const idDaDica = `${id}-dica`;
  const idDoErro = `${id}-erro`;
  const descricao = [dica && idDaDica, erro && idDoErro].filter(Boolean).join(' ');

  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        aria-invalid={Boolean(erro)}
        aria-describedby={descricao || undefined}
        {...propsDoInput}
      />
      {dica && (
        <span id={idDaDica} className="dica-do-campo">
          {dica}
        </span>
      )}
      {erro && (
        <span id={idDoErro} className="erro-do-campo">
          {erro}
        </span>
      )}
    </div>
  );
}
