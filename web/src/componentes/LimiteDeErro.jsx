import { Component } from 'react';
import Icone from './Icone';

// Error Boundary do app. Sem ele, um erro ao desenhar qualquer tela faz o
// React desmontar a raiz: a página fica em branco e nenhuma rota abre sem
// recarregar. Com ele, só a parte envolvida troca pelo aviso.
//
// chave: quando muda (outra rota, outra meta), o limite desenha os filhos de
// novo. acoes: botões extras do aviso (ex.: excluir a meta que não abre).
//
// O detalhe do erro vai só para o console (o React registra sozinho), nunca
// para a tela: nada de pilha nem caminho interno à vista (Sistemas Web Seguros).
export default class LimiteDeErro extends Component {
  constructor(props) {
    super(props);
    this.state = { erro: null, chave: props.chave };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  static getDerivedStateFromProps(props, state) {
    return props.chave !== state.chave ? { erro: null, chave: props.chave } : null;
  }

  tentarDeNovo = () => this.setState({ erro: null });

  render() {
    const { children, titulo = 'Esta tela não abriu', descricao, acoes } = this.props;
    if (!this.state.erro) {
      return children;
    }
    return (
      <section className="cartao vazio limite-de-erro" role="alert">
        <span className="simbolo" aria-hidden="true">
          <Icone nome="alerta" tamanho={20} />
        </span>
        <h2>{titulo}</h2>
        <p>{descricao ?? 'Algo deu errado ao mostrar esta parte. O menu e as outras telas continuam funcionando.'}</p>
        <div className="acoes-do-formulario">
          <button type="button" className={acoes ? 'secundario' : undefined} onClick={this.tentarDeNovo}>
            Tentar de novo
          </button>
          {acoes}
        </div>
      </section>
    );
  }
}
