// Escolha de uma cor (a do cartão, a de uma pessoa da família): um grupo de
// opções (radio, setas trocam a cor) com a amostra de cada cor e o nome
// escrito ao lado, para a cor nunca aparecer sozinha. opcoes: [{ valor,
// rotulo }]; valor é o nome da cor. prefixo escolhe a paleta: "cor-" (as dos
// cartões) ou "pessoa-" (as da família).
export default function SeletorDeCor({ rotulo, name, valor, opcoes, aoMudar, prefixo = 'cor-' }) {
  return (
    <fieldset className="seletor-de-cor">
      <legend className="rotulo-do-campo">{rotulo}</legend>
      <div className="amostras-de-cor">
        {opcoes.map((opcao) => (
          <label key={opcao.valor} className={`amostra-de-cor ${prefixo}${opcao.valor}`}>
            <input type="radio" name={name} value={opcao.valor} checked={valor === opcao.valor} onChange={() => aoMudar(opcao.valor)} />
            <span className="pastilha" aria-hidden="true" />
            {opcao.rotulo}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
