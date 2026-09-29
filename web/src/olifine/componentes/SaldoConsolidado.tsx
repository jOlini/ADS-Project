import type { CSSProperties, ReactNode } from 'react';
import Icone from '../../componentes/Icone';
import { formatarData } from '../../regras/datas';
import { formatarBRL } from '../../regras/dinheiro';
import { leituraDoSaldoLivre, type SaldoLivre, type SaudeDoMes } from '../regras/saldoLivre';

interface Props {
  // Saldo total das contas (o patrimônio), ou null sem números (sem contas,
  // sem API): o widget mostra "R$ —" e o convite do rodapé.
  saldo: number | null;
  // Saldo livre do mês (regras/saldoLivre.ts), com os mesmos números.
  resultado: SaldoLivre | null;
  // Total nas contas de investimento e a parte dele no patrimônio (0 a 100).
  investido: number;
  investida: number | null;
  // Tendência do saldo contra o mês anterior (ou o texto sem números).
  rodape: ReactNode;
  // Atalhos do celular (Lançar, Contas, Metas, Categorias).
  children?: ReactNode;
}

// O indicador do fechamento: o sinal diz positivo ou negativo, a saúde do
// mês dá a cor (verde com folga, âmbar pedindo atenção, vermelho).
const FECHAMENTO: Record<SaudeDoMes, { texto: string; icone: string }> = {
  folga: { texto: 'Positivo', icone: 'certo' },
  atencao: { texto: 'Positivo', icone: 'alerta' },
  negativo: { texto: 'Negativo', icone: 'alerta' },
};

// Saldo total como widget de consolidação da Visão geral: o patrimônio em
// destaque e, logo abaixo, as três leituras do mês que antes ficavam num card
// solto (o saldo livre): quanto está livre para usar, quanto está investido e
// como o mês fecha. A conta aberta (de onde vem cada número) fica recolhida
// em "Ver a conta do mês", para o widget não virar um extrato.
//
//   fechamento previsto = saldo de hoje + a receber − a pagar até o fim do mês
//   saldo livre         = fechamento previsto − investido
//
// O saldo livre é o fechamento sem o dinheiro aplicado: o que dá para usar
// sem resgatar nada. A conta está em regras/saldoLivre.ts.
export default function SaldoConsolidado({ saldo, resultado, investido, investida, rodape, children }: Props) {
  const saude = resultado?.saude;
  const ate = resultado ? formatarData(resultado.fimDoMes).slice(0, 5) : '';
  const comprometido = resultado ? Math.round(resultado.comprometido * 100) : 0;
  const fechamento = saude ? FECHAMENTO[saude] : null;
  // A frase só quando pede cuidado: no mês com folga, os números bastam.
  const leitura = resultado && (saude !== 'folga' || resultado.folgaAparente) ? leituraDoSaldoLivre(resultado, formatarBRL) : '';

  return (
    <article className={`of-kpi of-kpi-saldo of-consolidado${saude ? ` ${saude}` : ''}`} aria-labelledby="titulo-saldo-total">
      <div className="of-consolidado-topo">
        <h2 id="titulo-saldo-total" className="of-kpi-rotulo">
          <span className="of-kpi-icone" aria-hidden="true">
            <Icone nome="contas" tamanho={18} />
          </span>
          Saldo total
        </h2>
        {resultado && <small className="of-consolidado-apoio">Patrimônio em todas as contas</small>}
      </div>
      <p className="of-kpi-valor">{saldo === null ? 'R$ —' : formatarBRL(saldo)}</p>
      {rodape}

      {resultado && fechamento && (
        <>
          <dl className="of-consolidado-metricas">
            <div className={`of-metrica livre${resultado.livreSemInvestido < 0 ? ' negativa' : ''}`}>
              <dt>
                <Icone nome="alvo" tamanho={15} />
                Saldo livre
              </dt>
              <dd>{formatarBRL(resultado.livreSemInvestido)}</dd>
              <dd className="of-metrica-apoio">para usar até {ate}</dd>
            </div>
            <div className="of-metrica investido">
              <dt>
                <Icone nome="crescimento" tamanho={15} />
                Investido
              </dt>
              <dd>{formatarBRL(investido)}</dd>
              <dd className="of-metrica-apoio">
                {investida === null || investido <= 0 ? 'nada aplicado' : `${investida}% do patrimônio`}
              </dd>
            </div>
            <div className={`of-metrica fechamento ${saude}`}>
              <dt>
                <Icone nome="calendario" tamanho={15} />
                Fechamento
              </dt>
              <dd>{formatarBRL(resultado.livre)}</dd>
              <dd className="of-metrica-apoio">
                <span className="of-metrica-selo">
                  <Icone nome={fechamento.icone} tamanho={12} />
                  {fechamento.texto}
                </span>
                previsto em {ate}
              </dd>
            </div>
          </dl>

          {leitura && (
            <p className="of-consolidado-leitura" role="status">
              <Icone nome="alerta" tamanho={15} />
              {leitura}
            </p>
          )}

          {/* A conta dos três números, de cima para baixo. */}
          <details className="of-consolidado-conta">
            <summary>
              Ver a conta do mês
              <Icone nome="seta" tamanho={14} />
            </summary>
            <dl>
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
                  <span aria-hidden="true">=</span> Fechamento previsto
                </dt>
                <dd>{formatarBRL(resultado.livre)}</dd>
              </div>
              <div className="subtrai">
                <dt>
                  <span aria-hidden="true">−</span> Investido
                </dt>
                <dd>{formatarBRL(Math.max(0, investido))}</dd>
              </div>
              <div className="resultado">
                <dt>
                  <span aria-hidden="true">=</span> Saldo livre
                </dt>
                <dd>{formatarBRL(resultado.livreSemInvestido)}</dd>
              </div>
            </dl>
            <div className="of-consolidado-medidor">
              <span
                className="of-consolidado-barra"
                role="img"
                aria-label={`${comprometido}% do dinheiro do mês já tem destino`}
                style={{ '--p': `${comprometido}%` } as CSSProperties}
              >
                <i />
              </span>
              <small>{comprometido}% do dinheiro do mês já tem destino</small>
            </div>
          </details>
        </>
      )}

      {children}
    </article>
  );
}
