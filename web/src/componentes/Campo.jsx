import { useId } from 'react';

// Rótulo + input + mensagem de erro, ligados por id para leitores de tela.
// As demais props (type, name, value, onChange...) vão direto para o input.
export default function Campo({ rotulo, erro, ...propsDoInput }) {
  const id = useId();
  const idDoErro = `${id}-erro`;

  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo}</label>
      <input
        id={id}
        aria-invalid={Boolean(erro)}
        aria-describedby={erro ? idDoErro : undefined}
        {...propsDoInput}
      />
      {erro && (
        <span id={idDoErro} className="erro-do-campo">
          {erro}
        </span>
      )}
    </div>
  );
}
