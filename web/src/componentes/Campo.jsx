import { useId } from 'react';

// Rótulo + controle + dica + mensagem de erro, ligados por id para leitores de
// tela. A dica (ex.: regra da senha) aparece antes do erro, para a pessoa
// acertar de primeira. O controle é um <input> ou um componente do projeto
// passado em elemento (Seletor, SeletorDeData), que recebe também o id do
// rótulo em idDoRotulo. As demais props vão direto para o controle.
export default function Campo({ rotulo, dica, erro, elemento: Controle = 'input', ...propsDoControle }) {
  const id = useId();
  const idDoRotulo = `${id}-rotulo`;
  const idDaDica = `${id}-dica`;
  const idDoErro = `${id}-erro`;
  const descricao = [dica && idDaDica, erro && idDoErro].filter(Boolean).join(' ');
  const propsDoComponente = typeof Controle === 'string' ? {} : { idDoRotulo };

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
