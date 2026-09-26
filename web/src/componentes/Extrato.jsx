import Icone from './Icone';
import { iconeDaLinha } from '../olifine/regras/icones';
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

// "Ana R$ 100,00 · Bruno R$ 150,00": quem entrou no racha e com quanto.
const textoDoRacha = (pessoas) => pessoas.map((parte) => `${parte.pessoa} ${formatarBRL(parte.valor)}`).join(' · ');

// Os dias do extrato (agruparPorDia) com as linhas de cada um. mostrarSaldo
// desliga o "Saldo do dia" quando um filtro ou a busca esconde linhas.
// acoes(linha), se vier, desenha o menu de ações no fim da linha.
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
            <Icone nome={iconeDaLinha(lancamento, lancamento.cor ?? COR_DA_CATEGORIA[lancamento.categoria])} tamanho={16} />
          </span>
          <span className="descricao">
            <b>{lancamento.descricao}</b>
            <small>
              {[lancamento.categoria, lancamento.conta].filter(Boolean).join(' · ')}
              {lancamento.estornado && <span className="etiqueta">Estornado</span>}
            </small>
            {lancamento.pessoas?.length > 0 && (
              <small className="racha" title={textoDoRacha(lancamento.pessoas)}>
                <Icone nome="pessoas" tamanho={14} />
                <span className="texto-do-racha">
                  <span className="apenas-leitor">Dividido com: </span>
                  {textoDoRacha(lancamento.pessoas)}
                </span>
              </small>
            )}
          </span>
          <span className={`valor${lancamento.valor > 0 ? ' entrada' : lancamento.tipo === 'transferencia' ? '' : ' saida'}`}>
            {lancamento.estornado && <span className="apenas-leitor">Estornado: </span>}
            {formatarComSinal(lancamento.valor)}
          </span>
          {acoes && <span className="acao-da-linha">{acoes(lancamento)}</span>}
        </article>
      ))}
    </div>
  ));
}
