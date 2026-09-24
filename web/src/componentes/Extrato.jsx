import Icone from './Icone';
import { formatarBRL, formatarComSinal } from '../regras/dinheiro';
import { COR_DA_CATEGORIA } from '../regras/exemplo';

const DIA_LONGO = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });

// 'AAAA-MM-DD' vira Date sem o fuso mudar o dia (o Date do ISO puro é UTC).
const comoData = (iso) => new Date(`${iso}T12:00:00`);

// A linha da API já traz a cor; a de exemplo usa a tabela por nome.
function corDoLancamento(lancamento) {
  const cor = lancamento.cor ?? COR_DA_CATEGORIA[lancamento.categoria] ?? 'neutro';
  return `var(--cat-${cor})`;
}

function iconeDoLancamento(lancamento) {
  if (lancamento.estorno) {
    return 'estornar';
  }
  if (lancamento.tipo === 'transferencia') {
    return 'transferencia';
  }
  return lancamento.valor > 0 ? 'entrada' : 'saida';
}

// Os dias do extrato (agruparPorDia) com as linhas de cada um. mostrarSaldo
// desliga o "Saldo do dia" quando um filtro esconde linhas. acoes(linha),
// se vier, desenha um botão no fim da linha (ex.: Estornar).
export default function Extrato({ dias, mostrarSaldo = true, acoes }) {
  return dias.map((dia) => (
    <div key={dia.data}>
      <p className="dia">
        <span>{DIA_LONGO.format(comoData(dia.data))}</span>
        {mostrarSaldo && <span>Saldo do dia {formatarBRL(dia.saldo)}</span>}
      </p>
      {dia.lancamentos.map((lancamento) => (
        <article
          className={`lancamento${acoes ? ' com-acoes' : ''}${lancamento.estornado ? ' estornado' : ''}`}
          key={lancamento.id ?? `${lancamento.data}-${lancamento.descricao}`}
        >
          <span className="marca-da-categoria" style={{ '--cor-da-categoria': corDoLancamento(lancamento) }} aria-hidden="true">
            <Icone nome={iconeDoLancamento(lancamento)} tamanho={16} />
          </span>
          <span className="descricao">
            <b>{lancamento.descricao}</b>
            <small>
              {lancamento.categoria} · {lancamento.conta}
              {lancamento.estornado && <span className="etiqueta">Estornado</span>}
            </small>
          </span>
          <span className={`valor${lancamento.valor > 0 ? ' entrada' : ''}`}>
            {lancamento.estornado && <span className="apenas-leitor">Estornado: </span>}
            {formatarComSinal(lancamento.valor)}
          </span>
          {acoes && <span className="acao-da-linha">{acoes(lancamento)}</span>}
        </article>
      ))}
    </div>
  ));
}
