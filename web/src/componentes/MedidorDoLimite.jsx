import Icone from './Icone';
import { situacaoDoLimite, usoDoLimite } from '../regras/cartoes';
import { formatarBRL } from '../regras/dinheiro';

// Quanto do limite do cartão está ocupado. A cor do preenchimento muda com a
// situação (normal, quase no fim, esgotado), e o texto ao lado diz o mesmo:
// a cor nunca aparece sozinha. O trilho é um tom claro da mesma cor.
export default function MedidorDoLimite({ cartao, compacto = false }) {
  const uso = usoDoLimite(cartao);
  const situacao = situacaoDoLimite(cartao);
  const disponivel = cartao.disponivel_centavos;

  return (
    <div className={`medidor-do-limite ${situacao.nivel}${compacto ? ' compacto' : ''}`}>
      <div className="trilho" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uso}
        aria-label={`Limite usado: ${uso}%`}>
        <i style={{ width: `${uso}%` }} />
      </div>
      <p>
        {situacao.rotulo && (
          <span className="situacao-do-limite">
            <Icone nome="alerta" tamanho={14} />
            {situacao.rotulo}
          </span>
        )}
        <span>
          {disponivel < 0
            ? `${formatarBRL(-disponivel)} além do limite de ${formatarBRL(cartao.limite_centavos)}`
            : `${formatarBRL(disponivel)} disponíveis de ${formatarBRL(cartao.limite_centavos)}`}
        </span>
      </p>
    </div>
  );
}
