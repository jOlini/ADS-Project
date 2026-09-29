import type { CSSProperties } from 'react';
import Icone from '../../componentes/Icone';
import { formatarData } from '../../regras/datas';
import { formatarBRL } from '../../regras/dinheiro';
import { leituraDoSaldoLivre, type SaldoLivre as Resultado, type SaudeDoMes } from '../regras/saldoLivre';

interface Props {
  // null enquanto não há números (sem contas, sem API): o card não aparece.
  resultado: Resultado | null;
  investido: number;
}

const SELO: Record<SaudeDoMes, { texto: string; icone: string }> = {
  folga: { texto: 'Mês com folga', icone: 'certo' },
  atencao: { texto: 'Atenção', icone: 'alerta' },
  negativo: { texto: 'Mês no vermelho', icone: 'alerta' },
};

// "Quanto está sobrando": o saldo livre até o fim do mês, em destaque no topo
// da Visão geral, com a conta aberta ao lado (saldo de hoje + a receber − a
// pagar) para a pessoa ver de onde vem o número. A cor e o selo dizem a saúde
// do mês; no vermelho, a leitura avisa mesmo com o saldo de hoje positivo.
// A conta está em regras/saldoLivre.ts.
export default function SaldoLivre({ resultado, investido }: Props) {
  if (!resultado) {
    return null;
  }
  const selo = SELO[resultado.saude];
  const ate = formatarData(resultado.fimDoMes).slice(0, 5);
  const comprometido = Math.round(resultado.comprometido * 100);
  return (
    <section className={`cartao of-saldo-livre ${resultado.saude}`} aria-labelledby="titulo-saldo-livre">
      <div className="of-saldo-livre-principal">
        <div className="of-saldo-livre-topo">
          <h2 id="titulo-saldo-livre">
            <span className="of-kpi-icone" aria-hidden="true">
              <Icone nome="alvo" tamanho={18} />
            </span>
            Saldo livre até {ate}
          </h2>
          <span className="of-saldo-livre-selo">
            <Icone nome={selo.icone} tamanho={14} />
            {selo.texto}
          </span>
        </div>
        <p className="of-saldo-livre-valor">{formatarBRL(resultado.livre)}</p>
        <p className="of-saldo-livre-leitura">{leituraDoSaldoLivre(resultado, formatarBRL)}</p>
        {investido > 0 && resultado.livre >= 0 && (
          <p className="of-saldo-livre-nota">
            Sem contar o investido ({formatarBRL(investido)}): {formatarBRL(resultado.livreSemInvestido)}.
          </p>
        )}
      </div>

      {/* A conta do número grande, de cima para baixo. */}
      <dl className="of-saldo-livre-conta">
        <div>
          <dt>Saldo de hoje</dt>
          <dd>{formatarBRL(resultado.saldoDeHoje)}</dd>
        </div>
        <div className="soma">
          <dt>
            <span aria-hidden="true">+</span> A receber até {ate}
          </dt>
          <dd>{formatarBRL(resultado.aReceber)}</dd>
        </div>
        <div className="subtrai">
          <dt>
            <span aria-hidden="true">−</span> A pagar até {ate}
            <small>
              {formatarBRL(resultado.aPagarNasContas)} nas contas · {formatarBRL(resultado.faturas)} nas faturas
            </small>
          </dt>
          <dd>{formatarBRL(resultado.aPagar)}</dd>
        </div>
        <div className="resultado">
          <dt>
            <span aria-hidden="true">=</span> Livre
          </dt>
          <dd>{formatarBRL(resultado.livre)}</dd>
        </div>
      </dl>

      <div className="of-saldo-livre-medidor">
        <span
          className="of-saldo-livre-barra"
          role="img"
          aria-label={`${comprometido}% do dinheiro do mês já tem destino`}
          style={{ '--p': `${comprometido}%` } as CSSProperties}
        >
          <i />
        </span>
        <small>{comprometido}% do dinheiro do mês já tem destino</small>
      </div>
    </section>
  );
}
