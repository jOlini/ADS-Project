import { Link } from 'react-router-dom';
import Icone from './Icone';
import { situacaoDoLimite, usoDoLimite } from '../regras/cartoes';
import { formatarBRL } from '../regras/dinheiro';

// Cartão de crédito desenhado como o plástico (estilo carteira): a cor
// escolhida, a faixa magnética, o chip, o nome, a fatura atual e o limite
// disponível. cartao é o painel da API (GET /cartoes).
//
// Com para, o cartão inteiro leva à tela dele: o link do nome se estica sobre
// o cartão, e a caixa de seleção (aoMarcar) e o botão de editar (aoEditar)
// ficam por cima dele, clicáveis à parte. Sem para, é só o desenho.
export default function CartaoVisual({ cartao, para, marcado = false, aoMarcar, aoEditar }) {
  const uso = usoDoLimite(cartao);
  const situacao = situacaoDoLimite(cartao);
  const classes = [
    'cartao-visual',
    `cor-${cartao.cor ?? 'grafite'}`,
    para ? 'clicavel' : '',
    cartao.ativa ? '' : 'desativado',
    marcado ? 'marcado' : '',
    situacao.nivel,
  ];

  return (
    <article className={classes.filter(Boolean).join(' ')}>
      <span className="faixa-magnetica" aria-hidden="true" />
      <div className="topo-do-plastico">
        {aoMarcar && (
          <input type="checkbox" className="marcar-cartao" checked={marcado} onChange={aoMarcar} aria-label={`Selecionar ${cartao.nome}`} />
        )}
        <span className="chip" aria-hidden="true" />
        <h3 className="nome-no-plastico">
          {para ? (
            <Link to={para} className="link-do-cartao">
              {cartao.nome}
            </Link>
          ) : (
            cartao.nome
          )}
        </h3>
        {aoEditar && (
          <button type="button" className="botao-icone sobre-o-plastico" onClick={aoEditar} aria-label={`Editar ${cartao.nome}`}>
            <Icone nome="editar" tamanho={16} />
          </button>
        )}
      </div>

      <dl className="numeros-do-plastico">
        <div>
          <dt>Fatura atual</dt>
          <dd>{formatarBRL(cartao.fatura_atual_centavos)}</dd>
        </div>
        <div>
          <dt>Disponível</dt>
          <dd>{formatarBRL(cartao.disponivel_centavos)}</dd>
        </div>
      </dl>

      <div className="limite-no-plastico">
        <div className="trilho" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uso} aria-label={`Limite usado: ${uso}%`}>
          <i style={{ width: `${uso}%` }} />
        </div>
        <small>
          {!cartao.ativa && <b>Desativado · </b>}
          {situacao.rotulo && (
            <b>
              <Icone nome="alerta" tamanho={12} />
              {situacao.rotulo} ·{' '}
            </b>
          )}
          {uso}% de {formatarBRL(cartao.limite_centavos)} · fecha dia {cartao.dia_fechamento}, vence dia {cartao.dia_vencimento}
        </small>
      </div>
    </article>
  );
}
