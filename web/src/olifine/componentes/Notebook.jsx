import { useState } from 'react';
import Icone from '../../componentes/Icone';
import { formatarBRL, formatarComSinal } from '../../regras/dinheiro';
import { rotuloDoTipoDeConta } from '../../regras/livroCaixa';
import { CONTAS_DE_EXEMPLO, LANCAMENTOS_DE_EXEMPLO, METAS_DE_EXEMPLO } from '../dados/exemplo';
import { desenhoDaMiniatura } from '../regras/curva';
import { iconeDaLinha } from '../regras/icones';
import { guardado, porcentagem, progresso, sementeDaMeta } from '../regras/metas';
import { leituraDaVariacao, textoDaVariacao } from '../regras/tendencia';
import { fatiasDaRosca } from '../regras/visao';
import Arvore from './Arvore';
import { MarcaOliFine } from './Logo';

// Telas da demonstração, na barra lateral da miniatura.
const TELAS = [
  { id: 'visao', rotulo: 'Visão geral', icone: 'resumo' },
  { id: 'lancamentos', rotulo: 'Lançamentos', icone: 'lancamentos' },
  { id: 'contas', rotulo: 'Contas', icone: 'contas' },
  { id: 'metas', rotulo: 'Metas', icone: 'broto' },
];

const FAIXAS = [
  { id: '7d', rotulo: '7 dias' },
  { id: '30d', rotulo: '30 dias' },
  { id: '12m', rotulo: '12 meses' },
];

const FILTROS = [
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'entradas', rotulo: 'Entradas' },
  { id: 'saidas', rotulo: 'Saídas' },
];

// Circunferência da rosca (r = 36).
const VOLTA = 226.2;
// Aporte do botão "Regar" da meta de exemplo (R$ 1.000: poucos cliques até
// as maçãs).
const REGA = 100000;

const DIA = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const MES = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const rotuloDoPonto = (data) =>
  (data.length === 7 ? MES.format(new Date(`${data}-01T12:00:00Z`)) : DIA.format(new Date(`${data}T12:00:00Z`)))
    .replace(' de ', ' ')
    .replace('.', '');

function Tendencia({ variacao, maiorEhMelhor = true }) {
  return <span className={`of-tendencia ${leituraDaVariacao(variacao, { maiorEhMelhor })}`}>{textoDaVariacao(variacao)}</span>;
}

// Evolução do saldo com as faixas e um cursor que lê o ponto sob o mouse
// (ou o dedo), como o gráfico do app.
function MiniGrafico({ series }) {
  const [faixa, setFaixa] = useState('12m');
  const [cursor, setCursor] = useState(null);
  const serie = series[faixa];
  const desenho = desenhoDaMiniatura(serie, 300, 90);
  const ponto = cursor === null ? null : desenho.pontos[cursor];

  function aoMover(evento) {
    const caixa = evento.currentTarget.getBoundingClientRect();
    const relativo = (evento.clientX - caixa.left) / Math.max(1, caixa.width);
    setCursor(Math.min(serie.length - 1, Math.max(0, Math.round(relativo * (serie.length - 1)))));
  }

  return (
    <div className="lp-mini-painel lp-mini-evolucao">
      <div className="lp-mini-painel-topo">
        <small>Evolução do saldo</small>
        <div className="lp-mini-faixas" role="group" aria-label="Período do gráfico">
          {FAIXAS.map((opcao) => (
            <button key={opcao.id} type="button" aria-pressed={faixa === opcao.id}
              onClick={() => {
                setFaixa(opcao.id);
                setCursor(null);
              }}>
              {opcao.rotulo}
            </button>
          ))}
        </div>
      </div>
      <p className="lp-mini-leitura" aria-live="polite">
        {cursor === null ? 'Passe o mouse no gráfico' : `${rotuloDoPonto(serie[cursor].data)}: ${formatarBRL(serie[cursor].saldo)}`}
      </p>
      <svg viewBox="0 0 300 90" preserveAspectRatio="none" aria-hidden="true" onPointerMove={aoMover} onPointerDown={aoMover}
        onPointerLeave={() => setCursor(null)}>
        <defs>
          <linearGradient id="lp-area-laptop" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#16a34a" stopOpacity="0.26" />
            <stop offset="1" stopColor="#16a34a" stopOpacity="0" />
          </linearGradient>
        </defs>
        <g key={faixa}>
          <path d={desenho.area} fill="url(#lp-area-laptop)" className="lp-area" />
          <path d={desenho.linha} className="lp-linha" pathLength="1" vectorEffect="non-scaling-stroke" />
        </g>
        {ponto && <line className="lp-mini-cursor" x1={ponto.x} x2={ponto.x} y1="0" y2="90" vectorEffect="non-scaling-stroke" />}
      </svg>
    </div>
  );
}

// Rosca das despesas: passar o mouse (ou o foco) numa categoria da legenda
// acende a fatia e mostra o valor no meio.
function MiniRosca({ categorias }) {
  const fatias = fatiasDaRosca(categorias, 5);
  const [foco, setFoco] = useState(null);
  const total = fatias.reduce((soma, fatia) => soma + fatia.valor, 0);
  const tamanhos = fatias.map((fatia) => (fatia.valor / total) * VOLTA);
  const inicio = (indice) => tamanhos.slice(0, indice).reduce((soma, tamanho) => soma + tamanho, 0);
  const escolhida = foco === null ? null : fatias[foco];
  return (
    <div className="lp-mini-painel lp-mini-despesas">
      <small>Despesas por categoria</small>
      <div className="lp-mini-rosca-corpo">
        <div className="lp-mini-rosca-palco">
          <svg viewBox="0 0 100 100" className="lp-mini-rosca" aria-hidden="true">
            <g transform="rotate(-90 50 50)">
              {fatias.map((fatia, indice) => (
                <circle key={fatia.categoria} cx="50" cy="50" r="36" fill="none" strokeWidth={foco === indice ? 17 : 13}
                  className={foco !== null && foco !== indice ? 'apagada' : ''}
                  style={{ stroke: `var(--cat-${fatia.cor})` }} strokeDasharray={`${Math.max(0.5, tamanhos[indice] - 2)} ${VOLTA}`}
                  strokeDashoffset={-inicio(indice)} onPointerEnter={() => setFoco(indice)} onPointerLeave={() => setFoco(null)} />
              ))}
            </g>
          </svg>
          <p className="lp-mini-rosca-centro" aria-hidden="true">
            <b>{formatarBRL(escolhida ? escolhida.valor : total)}</b>
            <small>{escolhida ? `${escolhida.fatia}%` : 'no mês'}</small>
          </p>
        </div>
        <ul className="lp-mini-legenda">
          {fatias.map((fatia, indice) => (
            <li key={fatia.categoria}>
              <button type="button" aria-pressed={foco === indice} onPointerEnter={() => setFoco(indice)}
                onPointerLeave={() => setFoco(null)} onFocus={() => setFoco(indice)} onBlur={() => setFoco(null)}
                aria-label={`${fatia.categoria}: ${formatarBRL(fatia.valor)}, ${fatia.fatia}%`}>
                <i style={{ background: `var(--cat-${fatia.cor})` }} />
                {fatia.categoria}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MiniVisao({ demo }) {
  return (
    <>
      <div className="lp-mini-kpis">
        {[
          ['Saldo total', demo.saldo, demo.variacao.saldo, true],
          ['Receitas', demo.totais.entradas, demo.variacao.receitas, true],
          ['Despesas', demo.totais.saidas, demo.variacao.despesas, false],
        ].map(([rotulo, valor, variacao, maiorEhMelhor]) => (
          <div key={rotulo}>
            <small>{rotulo}</small>
            <b>{formatarBRL(valor)}</b>
            <Tendencia variacao={variacao} maiorEhMelhor={maiorEhMelhor} />
          </div>
        ))}
      </div>
      <div className="lp-mini-paineis">
        <MiniGrafico series={demo.series} />
        <MiniRosca categorias={demo.categorias} />
      </div>
    </>
  );
}

function MiniLancamentos() {
  const [filtro, setFiltro] = useState('tudo');
  const linhas = LANCAMENTOS_DE_EXEMPLO.filter(
    (linha) => filtro === 'tudo' || (filtro === 'entradas' ? linha.valor > 0 : linha.valor < 0),
  ).slice(0, 6);
  return (
    <div className="lp-mini-painel">
      <div className="lp-mini-painel-topo">
        <small>Setembro de 2026</small>
        <div className="lp-mini-faixas" role="group" aria-label="Filtrar lançamentos">
          {FILTROS.map((opcao) => (
            <button key={opcao.id} type="button" aria-pressed={filtro === opcao.id} onClick={() => setFiltro(opcao.id)}>
              {opcao.rotulo}
            </button>
          ))}
        </div>
      </div>
      <ul className="lp-mini-lista">
        {linhas.map((linha) => (
          <li key={linha.id}>
            <span className="of-marca-categoria" style={{ '--cor-da-categoria': `var(--cat-${linha.cor})` }} aria-hidden="true">
              <Icone nome={iconeDaLinha(linha, linha.cor)} tamanho={12} />
            </span>
            <span className="lp-mini-lista-textos">
              <b>{linha.descricao}</b>
              <small>{linha.categoria}</small>
            </span>
            <b className={linha.valor > 0 ? 'entrada' : 'saida'}>{formatarComSinal(linha.valor)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniContas() {
  const total = CONTAS_DE_EXEMPLO.reduce((soma, conta) => soma + conta.saldo, 0);
  const [aberta, setAberta] = useState(null);
  return (
    <div className="lp-mini-painel">
      <div className="lp-mini-painel-topo">
        <small>Saldo nas contas</small>
        <b className="lp-mini-total">{formatarBRL(total)}</b>
      </div>
      <ul className="lp-mini-contas">
        {CONTAS_DE_EXEMPLO.map((conta) => (
          <li key={conta.nome}>
            <button type="button" aria-expanded={aberta === conta.nome} onClick={() => setAberta(aberta === conta.nome ? null : conta.nome)}>
              <span className="lp-mini-lista-textos">
                <b>{conta.nome}</b>
                {/* O tipo só quando o nome não é o próprio tipo ("Conta corrente"). */}
                {conta.nome.toLowerCase() !== rotuloDoTipoDeConta(conta.tipo).toLowerCase() && (
                  <small>{rotuloDoTipoDeConta(conta.tipo)}</small>
                )}
              </span>
              <b>{formatarBRL(conta.saldo)}</b>
            </button>
            {aberta === conta.nome && (
              <span className="lp-mini-conta-parte">
                <i style={{ width: `${Math.round((conta.saldo / total) * 100)}%` }} />
                {Math.round((conta.saldo / total) * 100)}% do patrimônio
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// A meta de exemplo com o botão de regar: cada clique é um aporte (só na
// página, nada é gravado) e a árvore cresce até dar maçãs.
function MiniMetas() {
  const base = METAS_DE_EXEMPLO[0];
  const [regas, setRegas] = useState(0);
  const falta = Math.max(0, base.alvo - guardado(base));
  const extra = Math.min(falta, regas * REGA);
  const meta = extra > 0 ? { ...base, aportes: [...base.aportes, { id: 'demo', valor: extra, data: '2026-09-26' }] } : base;
  const completa = porcentagem(meta) >= 100;
  return (
    <div className="lp-mini-painel lp-mini-meta">
      <div className="lp-mini-meta-arvore">
        <Arvore semente={sementeDaMeta(meta.id)} progresso={progresso(meta)} compacta rotulo="" />
      </div>
      <div className="lp-mini-meta-textos">
        <small>{meta.nome}</small>
        <b>{formatarBRL(guardado(meta))}</b>
        <span className="of-progresso" aria-hidden="true">
          <i style={{ '--p': `${porcentagem(meta)}%` }} />
        </span>
        <p aria-live="polite">{completa ? 'Meta completa: a árvore deu maçãs.' : `${porcentagem(meta)}% de ${formatarBRL(meta.alvo)}`}</p>
        {completa ? (
          <button type="button" className="lp-mini-botao contorno" onClick={() => setRegas(0)}>
            Começar de novo
          </button>
        ) : (
          <button type="button" className="lp-mini-botao" onClick={() => setRegas((atual) => atual + 1)}>
            <Icone nome="gota" tamanho={12} />
            Regar {formatarBRL(REGA).replace(',00', '')}
          </button>
        )}
      </div>
    </div>
  );
}

// Notebook da landing: a tampa abre com a rolagem (useNotebookPreso escreve
// --angulo-da-tampa na seção) e, aberta, a tela é o app de verdade em
// miniatura, com dados fictícios: as telas da barra lateral trocam, o gráfico
// lê o ponto sob o mouse, a rosca acende a categoria, os lançamentos filtram,
// as contas abrem e a meta de exemplo cresce a cada rega. Fechada ou abrindo,
// a tela fica inerte (nem mouse nem Tab entram nela).
export default function Notebook({ demo, aberto }) {
  const [tela, setTela] = useState('visao');
  return (
    <div className="lp-laptop">
      <div className="lp-laptop-corpo">
      <div className="lp-laptop-tampa">
        <div className="lp-laptop-costas" aria-hidden="true">
          <MarcaOliFine tamanho={44} />
        </div>
        <div className="lp-laptop-tela" role="group" aria-label="Demonstração do app com dados fictícios" inert={!aberto}>
          <nav className="lp-mini-lateral" aria-label="Telas da demonstração">
            <MarcaOliFine tamanho={18} />
            {TELAS.map((item) => (
              <button key={item.id} type="button" aria-pressed={tela === item.id} onClick={() => setTela(item.id)}>
                <Icone nome={item.icone} tamanho={13} />
                <span>{item.rotulo}</span>
              </button>
            ))}
          </nav>
          <div className="lp-mini-conteudo">
            <p className="lp-mini-ola">{TELAS.find((item) => item.id === tela).rotulo}</p>
            {tela === 'visao' && <MiniVisao demo={demo} />}
            {tela === 'lancamentos' && <MiniLancamentos />}
            {tela === 'contas' && <MiniContas />}
            {tela === 'metas' && <MiniMetas />}
          </div>
        </div>
      </div>
      {/* A base deitada, com o teclado e o touchpad: a tampa fecha sobre ela. */}
      <div className="lp-laptop-teclado" aria-hidden="true">
        <span className="lp-laptop-teclas" />
        <span className="lp-laptop-touchpad" />
      </div>
      </div>
    </div>
  );
}
