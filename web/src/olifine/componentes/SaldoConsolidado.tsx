import type { CSSProperties, ReactNode } from 'react';
import Icone from '../../componentes/Icone';
import { formatarData } from '../../regras/datas';
import { formatarBRL } from '../../regras/dinheiro';
import {
  leituraDoSaldoLivre,
  type EstadoDoSaldoLivre,
  type SaldoLivre,
  type SaudeDoMes,
} from '../regras/saldoLivre';
import Dica from './Dica';

interface Props {
  // Patrimônio total (a soma das contas, com o investido), ou null sem
  // números (sem contas, sem API): o card mostra "R$ —".
  saldo: number | null;
  // Saldo livre do mês (regras/saldoLivre.ts), com os mesmos números.
  resultado: SaldoLivre | null;
  // Total nas contas de investimento e a parte dele no patrimônio (0 a 100).
  investido: number;
  investida: number | null;
  // Tendência do patrimônio contra o mês anterior (ou o texto sem números).
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

const ICONE_DO_ESTADO: Record<EstadoDoSaldoLivre, string> = {
  positivo: 'certo',
  neutro: 'info',
  negativo: 'alerta',
};

// Sem números ainda: o mesmo lugar, com o convite no lugar da leitura.
const SEM_NUMEROS = {
  estado: 'neutro' as const,
  titulo: 'Sem números ainda',
  texto: 'Cadastre as suas contas para ver quanto dá para gastar até o fim do mês sem faltar dinheiro.',
};

// O card principal da Visão geral: o saldo livre em destaque (quanto dá para
// gastar até o fim do mês sem faltar para as contas), porque é ele que decide
// o que e quando gastar. Embaixo, a leitura em uma frase simples (verde e
// segura no positivo, vermelha e explicada no negativo) e três números de
// apoio: o patrimônio total, o investido e o fechamento previsto.
//
//   fechamento previsto = saldo de hoje + a receber − a pagar até o fim do mês
//   saldo livre         = fechamento previsto − investido
//
// A conta aberta fica no "i" (Dica), que flutua por cima da página. O card tem
// sempre as mesmas partes, com ou sem números, e altura fixa no CSS: nada
// aparece nem some depois de carregar, então o layout não pula.
export default function SaldoConsolidado({ saldo, resultado, investido, investida, rodape, children }: Props) {
  const ate = resultado ? formatarData(resultado.fimDoMes).slice(0, 5) : '';
  const leitura = resultado ? leituraDoSaldoLivre(resultado, formatarBRL, ate) : SEM_NUMEROS;
  const saude = resultado?.saude;
  const fechamento = saude ? FECHAMENTO[saude] : null;
  const comprometido = resultado ? Math.round(resultado.comprometido * 100) : 0;
  const ateQuando = ate ? `até ${ate}` : 'até o fim do mês';

  return (
    <article className={`of-kpi of-kpi-saldo of-consolidado ${leitura.estado}`} aria-labelledby="titulo-saldo-livre">
      <div className="of-kpi-topo">
        <h2 id="titulo-saldo-livre" className="of-kpi-rotulo">
          <span className="of-kpi-icone" aria-hidden="true">
            <Icone nome="alvo" tamanho={18} />
          </span>
          Saldo livre
        </h2>
        <Dica titulo="Saldo livre">
          <p>
            Quanto dá para gastar {ateQuando} sem faltar dinheiro para as contas que ainda vão chegar. O dinheiro
            investido fica de fora: ele é para não mexer.
          </p>
          {resultado && (
            <ContaDoMes resultado={resultado} investido={investido} ate={ate} comprometido={comprometido} estado={leitura.estado} />
          )}
        </Dica>
      </div>

      <p className="of-kpi-valor">{resultado ? formatarBRL(resultado.livreSemInvestido) : 'R$ —'}</p>

      <div className={`of-saldo-livre-leitura ${leitura.estado}`} role="status">
        <span className="of-saldo-livre-selo">
          <Icone nome={ICONE_DO_ESTADO[leitura.estado]} tamanho={14} />
          {leitura.titulo}
        </span>
        <p>{leitura.texto}</p>
      </div>

      <dl className="of-consolidado-metricas">
        <div className="of-metrica patrimonio">
          <dt>
            <Icone nome="contas" tamanho={15} />
            <span>Patrimônio total</span>
            <Dica titulo="Patrimônio total">
              <p>
                Tudo o que está nas suas contas hoje, somando o dinheiro investido. O cartão de crédito não entra: ele é
                dívida e aparece no painel dos cartões.
              </p>
            </Dica>
          </dt>
          <dd>{saldo === null ? 'R$ —' : formatarBRL(saldo)}</dd>
          <dd className="of-metrica-apoio">{rodape}</dd>
        </div>
        <div className="of-metrica investido">
          <dt>
            <Icone nome="crescimento" tamanho={15} />
            <span>Investido</span>
            <Dica titulo="Investido">
              <p>
                O dinheiro nas contas do tipo Investimento. Ele conta no patrimônio, mas fica fora do saldo livre para
                não ser gasto no dia a dia.
              </p>
            </Dica>
          </dt>
          <dd>{resultado ? formatarBRL(investido) : 'R$ —'}</dd>
          <dd className="of-metrica-apoio">
            <span>{investida === null || investido <= 0 ? 'nada aplicado' : `${investida}% do patrimônio`}</span>
          </dd>
        </div>
        <div className={`of-metrica fechamento ${saude ?? ''}`}>
          <dt>
            <Icone nome="calendario" tamanho={15} />
            <span>Fechamento</span>
            <Dica titulo="Fechamento previsto">
              <p>
                Como as contas terminam o mês: o saldo de hoje, mais o que ainda entra, menos o que ainda sai {ateQuando},
                com as faturas do cartão. Positivo, o mês fecha no azul.
              </p>
            </Dica>
          </dt>
          <dd>{resultado ? formatarBRL(resultado.livre) : 'R$ —'}</dd>
          <dd className="of-metrica-apoio">
            {fechamento ? (
              <span className="of-metrica-selo">
                <Icone nome={fechamento.icone} tamanho={12} />
                {fechamento.texto}
              </span>
            ) : null}
            <span>previsto {ateQuando}</span>
          </dd>
        </div>
      </dl>

      {children}
    </article>
  );
}

interface PropsDaConta {
  resultado: SaldoLivre;
  investido: number;
  ate: string;
  comprometido: number;
  estado: EstadoDoSaldoLivre;
}

// A conta dos números, de cima para baixo, dentro da dica do saldo livre.
function ContaDoMes({ resultado, investido, ate, comprometido, estado }: PropsDaConta) {
  return (
    <>
      <dl className="of-conta-do-mes">
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
      <div className="of-conta-do-mes-medidor">
        <span
          className={`of-conta-do-mes-barra ${estado}`}
          role="img"
          aria-label={`${comprometido}% do dinheiro do mês já tem destino`}
          style={{ '--p': `${comprometido}%` } as CSSProperties}
        >
          <i />
        </span>
        <small>{comprometido}% do dinheiro do mês já tem destino</small>
      </div>
    </>
  );
}
