import Icone from './Icone';
import Menu from './Menu';

// Ações de uma linha do extrato (Editar, Estornar, Excluir) à vista, cada uma
// num botão com ícone e nome: a pessoa vê o que dá para fazer sem abrir nada.
// A frase de cada item (o que acontece ao clicar) fica no title do botão.
//
// Os dois desenhos vão para a página e o CSS escolhe pela largura da lista
// (container query em .extrato, estilos/lancamentos.css): de 768 px para
// cima, os botões; abaixo disso, onde eles apertariam a descrição, o menu
// de três pontinhos com as mesmas ações.
//
// itens: os mesmos do Menu ({ id, rotulo, descricao?, icone?, perigo?,
// desabilitado?, aoEscolher }). rotulo: o nome do menu para o leitor de tela
// ("Ações de Mercado"); nome: o que a linha é ("Mercado"), para cada botão
// dizer de qual linha é ("Excluir Mercado").
export default function AcoesDaLinha({ rotulo, nome, itens }) {
  return (
    <>
      <span className="acoes-explicitas" role="group" aria-label={rotulo}>
        {itens.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`acao-explicita${item.perigo ? ' perigo' : ''}`}
            disabled={item.desabilitado}
            title={item.descricao}
            aria-label={`${item.rotulo} ${nome}`}
            onClick={item.aoEscolher}
          >
            {item.icone && <Icone nome={item.icone} tamanho={16} />}
            <span className="rotulo-da-acao-explicita">{item.rotulo}</span>
          </button>
        ))}
      </span>
      <span className="acoes-no-menu">
        <Menu rotulo={rotulo} itens={itens} />
      </span>
    </>
  );
}
