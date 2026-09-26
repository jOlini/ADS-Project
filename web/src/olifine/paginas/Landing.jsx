import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { formatarBRL, formatarComSinal } from '../../regras/dinheiro';
import Arvore from '../componentes/Arvore';
import Icone from '../../componentes/Icone';
import Logo, { MarcaOliFine, SLOGAN } from '../componentes/Logo';
import { HOJE_DE_EXEMPLO, LANCAMENTOS_DE_EXEMPLO, MESES_DE_EXEMPLO, METAS_DE_EXEMPLO, SALDO_DE_EXEMPLO } from '../dados/exemplo';
import { caminhoSuave } from '../regras/curva';
import { iconeDaLinha } from '../regras/icones';
import { planoMensal, porcentagem } from '../regras/metas';
import { fatiasDaRosca, montarVisao } from '../regras/visao';
import { leituraDaVariacao, textoDaVariacao } from '../regras/tendencia';
import '../estilos/landing.css';

// Números fictícios da demonstração: os mesmos da Visão geral em modo de
// exemplo, montados pela mesma regra. A página sempre diz que são exemplo.
const DEMO = montarVisao({
  linhasDasContas: LANCAMENTOS_DE_EXEMPLO,
  linhasDoMes: LANCAMENTOS_DE_EXEMPLO,
  linhasRecentes: LANCAMENTOS_DE_EXEMPLO,
  saldo: SALDO_DE_EXEMPLO,
  meses: MESES_DE_EXEMPLO,
  hoje: HOJE_DE_EXEMPLO,
});

// A meta da demonstração de "Planeje", com o plano mensal calculado.
const META_DA_DEMO = METAS_DE_EXEMPLO[0];
const PLANO_DA_DEMO = planoMensal(META_DA_DEMO, HOJE_DE_EXEMPLO);
const MES_DO_PRAZO = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  .format(new Date(`${META_DA_DEMO.prazo}T12:00:00Z`))
  .replace('.', '')
  .replace(' de ', '/');

const FAIXAS_DO_CELULAR = [
  { id: '7d', rotulo: '7 dias' },
  { id: '30d', rotulo: '30 dias' },
  { id: '12m', rotulo: '12 meses' },
];

// Linha e área do gráfico em miniatura, num quadro de 300 × 110.
function desenhoDaSerie(serie, largura = 300, altura = 110) {
  const valores = serie.map((ponto) => ponto.saldo);
  const menor = Math.min(...valores);
  const maior = Math.max(...valores);
  const faixa = maior - menor || 1;
  const pontos = serie.map((ponto, indice) => ({
    x: (indice / Math.max(1, serie.length - 1)) * largura,
    y: 8 + (1 - (ponto.saldo - menor) / faixa) * (altura - 16),
  }));
  const linha = caminhoSuave(pontos);
  return { linha, area: `${linha}L${largura} ${altura}L0 ${altura}Z`, fim: pontos.at(-1) };
}

function Tendencia({ variacao, maiorEhMelhor = true }) {
  return <span className={`of-tendencia ${leituraDaVariacao(variacao, { maiorEhMelhor })}`}>{textoDaVariacao(variacao)}</span>;
}

// O app de verdade num celular: as abas trocam o período do gráfico.
function Celular() {
  // Abre nos 12 meses: é a faixa em que o crescimento do saldo aparece.
  const [faixa, setFaixa] = useState('12m');
  const desenho = useMemo(() => desenhoDaSerie(DEMO.series[faixa]), [faixa]);
  return (
    <div className="lp-celular" aria-label="Demonstração do app com dados fictícios">
      <div className="lp-celular-tela">
        <p className="lp-celular-status" aria-hidden="true">
          <span>9:41</span>
          <span className="lp-celular-sinais" />
        </p>
        <div className="lp-celular-saldo">
          <p className="lp-celular-ola">Olá, Ana</p>
          <p className="lp-celular-rotulo">Saldo total</p>
          <p className="lp-celular-valor">{formatarBRL(DEMO.saldo)}</p>
          <p className="lp-celular-variacao">
            <Tendencia variacao={DEMO.variacao.saldo} /> em relação a agosto
          </p>
        </div>
        <div className="lp-celular-atalhos" aria-hidden="true">
          {[
            ['entrada', 'Receitas'],
            ['saida', 'Despesas'],
            ['broto', 'Metas'],
            ['relatorios', 'Relatórios'],
          ].map(([icone, rotulo]) => (
            <span key={rotulo}>
              <i>
                <Icone nome={icone} tamanho={16} />
              </i>
              {rotulo}
            </span>
          ))}
        </div>
        <div className="lp-celular-grafico">
          <p className="lp-celular-titulo">Visão geral</p>
          <div className="lp-abas" role="group" aria-label="Período do gráfico da demonstração">
            {FAIXAS_DO_CELULAR.map((opcao) => (
              <button key={opcao.id} type="button" aria-pressed={faixa === opcao.id} onClick={() => setFaixa(opcao.id)}>
                {opcao.rotulo}
              </button>
            ))}
          </div>
          <svg viewBox="0 0 300 110" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="lp-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#16a34a" stopOpacity="0.28" />
                <stop offset="1" stopColor="#16a34a" stopOpacity="0" />
              </linearGradient>
            </defs>
            <g key={faixa}>
              <path d={desenho.area} fill="url(#lp-area)" className="lp-area" />
              <path d={desenho.linha} className="lp-linha" pathLength="1" vectorEffect="non-scaling-stroke" />
            </g>
          </svg>
        </div>
        <ul className="lp-celular-lista">
          {DEMO.ultimas.slice(0, 2).map((linha) => (
            <li key={linha.id}>
              <span className="of-marca-categoria" style={{ '--cor-da-categoria': `var(--cat-${linha.cor})` }} aria-hidden="true">
                <Icone nome={iconeDaLinha(linha, linha.cor)} tamanho={14} />
              </span>
              <span>{linha.descricao}</span>
              <b className={linha.valor > 0 ? 'entrada' : 'saida'}>{formatarComSinal(linha.valor)}</b>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// Laptop com a Visão geral em miniatura, montada com os mesmos números.
function Laptop() {
  const desenho = desenhoDaSerie(DEMO.series['12m'], 300, 90);
  const fatias = fatiasDaRosca(DEMO.categorias, 5);
  const total = fatias.reduce((soma, fatia) => soma + fatia.valor, 0);
  const tamanhos = fatias.map((fatia) => (fatia.valor / total) * 226.2);
  const inicio = (indice) => tamanhos.slice(0, indice).reduce((soma, tamanho) => soma + tamanho, 0);
  return (
    <div className="lp-laptop" aria-label="Visão geral do app com dados fictícios">
      <div className="lp-laptop-tela">
        <aside className="lp-mini-lateral" aria-hidden="true">
          <MarcaOliFine tamanho={18} />
          {['Visão geral', 'Lançamentos', 'Contas & Cartões', 'Metas', 'Categorias'].map((item, indice) => (
            <span key={item} className={indice === 0 ? 'ativo' : ''}>
              {item}
            </span>
          ))}
        </aside>
        <div className="lp-mini-conteudo">
          <p className="lp-mini-ola">Olá, Ana!</p>
          <div className="lp-mini-kpis">
            {[
              ['Saldo total', DEMO.saldo, DEMO.variacao.saldo, true],
              ['Receitas', DEMO.totais.entradas, DEMO.variacao.receitas, true],
              ['Despesas', DEMO.totais.saidas, DEMO.variacao.despesas, false],
            ].map(([rotulo, valor, variacao, maiorEhMelhor]) => (
              <div key={rotulo}>
                <small>{rotulo}</small>
                <b>{formatarBRL(valor)}</b>
                <Tendencia variacao={variacao} maiorEhMelhor={maiorEhMelhor} />
              </div>
            ))}
          </div>
          <div className="lp-mini-paineis">
            <div>
              <small>Evolução do saldo</small>
              <svg viewBox="0 0 300 90" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="lp-area-laptop" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#16a34a" stopOpacity="0.26" />
                    <stop offset="1" stopColor="#16a34a" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path d={desenho.area} fill="url(#lp-area-laptop)" />
                <path d={desenho.linha} className="lp-linha estatica" vectorEffect="non-scaling-stroke" />
              </svg>
            </div>
            <div>
              <small>Despesas por categoria</small>
              <svg viewBox="0 0 100 100" className="lp-mini-rosca" aria-hidden="true">
                <g transform="rotate(-90 50 50)">
                  {fatias.map((fatia, indice) => (
                    <circle key={fatia.categoria} cx="50" cy="50" r="36" fill="none" strokeWidth="13"
                      style={{ stroke: `var(--cat-${fatia.cor})` }} strokeDasharray={`${Math.max(0.5, tamanhos[indice] - 2)} 226.2`}
                      strokeDashoffset={-inicio(indice)} />
                  ))}
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="lp-laptop-base" aria-hidden="true" />
    </div>
  );
}

const BENEFICIOS = [
  {
    id: 'organize',
    titulo: 'Organize',
    texto: 'Contas, cartões e cada lançamento num lugar só, com categoria e data.',
    demo: (
      <ul className="lp-demo-lista">
        {LANCAMENTOS_DE_EXEMPLO.slice(0, 3).map((linha) => (
          <li key={linha.id}>
            <span className="of-marca-categoria" style={{ '--cor-da-categoria': `var(--cat-${linha.cor})` }} aria-hidden="true">
              <Icone nome={iconeDaLinha(linha, linha.cor)} tamanho={13} />
            </span>
            <span>{linha.descricao}</span>
            <b>{formatarComSinal(linha.valor)}</b>
          </li>
        ))}
      </ul>
    ),
  },
  {
    id: 'entenda',
    titulo: 'Entenda',
    texto: 'Veja para onde o dinheiro vai, por categoria, e como o mês se compara ao anterior.',
    demo: (
      <div className="lp-demo-barras" aria-hidden="true">
        {fatiasDaRosca(DEMO.categorias, 4).map((fatia) => (
          <p key={fatia.categoria}>
            <span>{fatia.categoria}</span>
            <i style={{ width: `${Math.max(8, fatia.fatia)}%`, background: `var(--cat-${fatia.cor})` }} />
            <b>{fatia.fatia}%</b>
          </p>
        ))}
      </div>
    ),
  },
  {
    id: 'planeje',
    titulo: 'Planeje',
    texto: 'Crie metas com prazo e saiba quanto guardar por mês para chegar lá.',
    demo: (
      <div className="lp-demo-meta" aria-hidden="true">
        <p>
          <b>{META_DA_DEMO.nome}</b>
          <span>{porcentagem(META_DA_DEMO)}%</span>
        </p>
        <span className="of-progresso">
          <i style={{ '--p': `${porcentagem(META_DA_DEMO)}%` }} />
        </span>
        <small>
          Para chegar lá até {MES_DO_PRAZO}, guarde {formatarBRL(PLANO_DA_DEMO.porMes)} por mês.
        </small>
      </div>
    ),
  },
  {
    id: 'evolua',
    titulo: 'Evolua',
    texto: 'Cada aporte rega a árvore da meta. Você vê o dinheiro crescer, literalmente.',
    demo: (
      <div className="lp-demo-arvore" aria-hidden="true">
        <Arvore semente={2026} progresso={0.82} compacta rotulo="" />
      </div>
    ),
  },
];

const SEGURANCA = [
  {
    icone: 'cadeado',
    titulo: 'Privacidade',
    texto: 'Nada de ligar o app ao seu banco: você decide o que entra, lançando ou importando o extrato.',
  },
  {
    icone: 'escudo',
    titulo: 'Segurança',
    texto: 'Entrada protegida por conta e senha, e mensagens de erro que nunca revelam quem tem cadastro.',
  },
  {
    icone: 'documento',
    titulo: 'Transparência',
    texto: 'Cada número mostra de onde veio: o saldo dia a dia, lançamento por lançamento.',
  },
];

const RECURSOS_GRATUITOS = [
  'Contas e cartões de crédito com fatura',
  'Lançamentos com categoria e racha',
  'Importação do extrato em CSV',
  'Visão geral do mês com gráficos',
  'Metas com a árvore que cresce',
];

// Ondas orgânicas do fundo esmeralda: três faixas que deslizam devagar
// (param com prefers-reduced-motion).
// Contornos orgânicos atrás do conteúdo dos campos esmeralda: faixas largas
// em tons da própria esmeralda, que dão profundidade ao fundo e deslizam
// devagar junto com as ondas da borda.
function Contornos({ className = '' }) {
  return (
    <svg className={`lp-contornos ${className}`.trim()} viewBox="0 0 1440 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <path className="fundo" d="M-80 640C180 520 360 760 640 650S1040 420 1260 470 1520 600 1520 600V980H-80Z" />
      <path className="meio" d="M520 -40C700 120 640 300 860 380S1300 300 1520 460V-40Z" />
      <path className="claro" d="M760 -40C860 110 820 250 980 320S1330 300 1520 380V-40Z" />
      <path className="linha" d="M-80 470C220 360 420 560 700 470S1120 250 1520 330" />
      <path className="linha" d="M-80 540C240 430 440 640 720 540S1140 320 1520 400" />
    </svg>
  );
}

function Ondas() {
  const onda = 'M0 60C120 20 240 20 360 60S600 100 720 60 960 20 1080 60 1320 100 1440 60V160H0Z';
  return (
    <div className="lp-ondas" aria-hidden="true">
      <svg viewBox="0 0 1440 160" preserveAspectRatio="none" className="lp-onda um">
        <path d={onda} />
      </svg>
      <svg viewBox="0 0 1440 160" preserveAspectRatio="none" className="lp-onda dois">
        <path d={onda} />
      </svg>
      <svg viewBox="0 0 1440 160" preserveAspectRatio="none" className="lp-onda tres">
        <path d={onda} />
      </svg>
    </div>
  );
}

// Landing page institucional da OliFine (só com o tema OliFine; no tema
// anterior, "/" continua indo para o login). Sem preço, depoimento ou número
// inventado: o que aparece é o app, com dados fictícios marcados.
export default function Landing() {
  const contexto = useOutletContext();
  const logado = Boolean(contexto?.usuario);

  return (
    <div className="lp">
      <header className="lp-topo">
        <Contornos />
        <nav className="lp-nav" aria-label="Seções">
          <Link to="/" className="lp-nav-marca" aria-label="OliFine, início">
            <Logo tamanho={30} />
          </Link>
          <div className="lp-nav-links">
            <a href="#produto">Produto</a>
            <a href="#recursos">Recursos</a>
            <a href="#seguranca">Segurança</a>
            <a href="#planos">Planos</a>
          </div>
          <div className="lp-nav-acoes">
            {logado ? (
              <Link to="/principal" className="lp-botao">
                Ir para o app
                <Icone nome="setaDireita" tamanho={16} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="lp-nav-entrar">
                  Entrar
                </Link>
                <Link to="/cadastro" className="lp-botao">
                  Começar agora
                  <Icone nome="setaDireita" tamanho={16} />
                </Link>
              </>
            )}
          </div>
        </nav>

        <section className="lp-hero" id="produto" aria-labelledby="lp-titulo">
          <div className="lp-hero-texto">
            <h1 id="lp-titulo">
              Sua vida financeira.
              <br />
              Finalmente, <em>em um só lugar.</em>
            </h1>
            <p>
              Organize seus gastos, acompanhe suas metas e entenda para onde o seu dinheiro está indo, sem planilha e sem
              ligar o app ao banco.
            </p>
            <div className="lp-hero-acoes">
              <Link to={logado ? '/principal' : '/cadastro'} className="lp-botao grande">
                {logado ? 'Abrir o app' : 'Começar gratuitamente'}
                <Icone nome="setaDireita" tamanho={18} />
              </Link>
              <a href="#demonstracao" className="lp-botao contorno grande">
                Ver demonstração
              </a>
            </div>
            <ul className="lp-confianca">
              <li>
                <Icone nome="escudo" tamanho={16} />
                Seguro e privado
              </li>
              <li>
                <Icone nome="certo" tamanho={16} />
                Sem burocracia
              </li>
              <li>
                <Icone nome="broto" tamanho={16} />
                Do seu jeito
              </li>
            </ul>
          </div>

          <div className="lp-hero-app">
            {/* Os números do mês ficam numa coluna ao lado do celular (embaixo
                dele no celular de verdade): nunca por cima da tela do app. */}
            <div className="lp-chips" aria-hidden="true">
              <div className="lp-flutua despesas">
                <small>Despesas do mês</small>
                <b>{formatarBRL(DEMO.totais.saidas)}</b>
                <Tendencia variacao={DEMO.variacao.despesas} maiorEhMelhor={false} />
              </div>
              <div className="lp-flutua receitas">
                <small>Receitas do mês</small>
                <b>{formatarBRL(DEMO.totais.entradas)}</b>
                <Tendencia variacao={DEMO.variacao.receitas} />
              </div>
            </div>
            <Celular />
            <p className="lp-ficticio">Dados fictícios de demonstração</p>
          </div>
        </section>
        <Ondas />
      </header>

      <main>
        <section className="lp-secao lp-beneficios" id="recursos" aria-labelledby="lp-beneficios-titulo">
          <h2 id="lp-beneficios-titulo">
            Mais que controle.
            <br />É clareza para suas decisões.
          </h2>
          <div className="lp-beneficios-grade">
            {BENEFICIOS.map((beneficio) => (
              <article key={beneficio.id} className="lp-beneficio">
                <div className="lp-beneficio-demo">{beneficio.demo}</div>
                <h3>{beneficio.titulo}</h3>
                <p>{beneficio.texto}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-secao lp-demonstracao" id="demonstracao" aria-labelledby="lp-demo-titulo">
          <div className="lp-demonstracao-texto">
            <h2 id="lp-demo-titulo">Do número à decisão.</h2>
            <p>
              A Visão geral junta o que importa no mês: quanto você tem, quanto entrou e saiu comparado ao mês anterior,
              como o saldo evoluiu e para onde foi cada real.
            </p>
            <ul className="lp-lista-certa">
              <li>
                <Icone nome="certo" tamanho={16} />
                Tendência de cada número em relação ao mês anterior
              </li>
              <li>
                <Icone nome="certo" tamanho={16} />
                Saldo dia a dia ou mês a mês
              </li>
              <li>
                <Icone nome="certo" tamanho={16} />
                Despesas por categoria, com o valor de cada uma
              </li>
            </ul>
          </div>
          <Laptop />
        </section>

        <section className="lp-secao lp-seguranca" id="seguranca" aria-labelledby="lp-seguranca-titulo">
          <Contornos className="seguranca" />
          <div className="lp-seguranca-texto">
            <h2 id="lp-seguranca-titulo">
              Seu dinheiro é pessoal.
              <br />
              Seus dados também.
            </h2>
            <p>A OliFine foi pensada desde o início com privacidade e transparência.</p>
          </div>
          <div className="lp-seguranca-grade">
            {SEGURANCA.map((item) => (
              <article key={item.titulo}>
                <span className="lp-seguranca-icone" aria-hidden="true">
                  <Icone nome={item.icone} tamanho={22} />
                </span>
                <h3>{item.titulo}</h3>
                <p>{item.texto}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="lp-secao lp-planos" id="planos" aria-labelledby="lp-planos-titulo">
          <h2 id="lp-planos-titulo">Escolha o plano para a sua jornada.</h2>
          <p className="lp-secao-apoio">Comece de graça com tudo o que já existe hoje.</p>
          <div className="lp-planos-grade">
            <article className="lp-plano">
              <h3>Gratuito</h3>
              <p className="lp-plano-apoio">O essencial para organizar o seu dinheiro.</p>
              <p className="lp-plano-preco">
                <b>R$ 0</b>
                <small>sem cartão de crédito</small>
              </p>
              <ul className="lp-lista-certa">
                {RECURSOS_GRATUITOS.map((recurso) => (
                  <li key={recurso}>
                    <Icone nome="certo" tamanho={16} />
                    {recurso}
                  </li>
                ))}
              </ul>
              <Link to={logado ? '/principal' : '/cadastro'} className="lp-botao largo">
                {logado ? 'Abrir o app' : 'Começar gratuitamente'}
              </Link>
            </article>

            <article className="lp-plano destaque">
              <p className="lp-plano-selo">Em breve</p>
              <h3>Família</h3>
              <p className="lp-plano-apoio">Para organizar o dinheiro da casa junto com quem mora com você.</p>
              <div className="lp-plano-arvores" aria-hidden="true">
                <Arvore semente={11} progresso={0.9} compacta rotulo="" />
                <Arvore semente={29} progresso={0.55} compacta rotulo="" />
                <Arvore semente={47} progresso={0.3} compacta rotulo="" />
              </div>
              <p className="lp-plano-nota">Estamos preparando. Por enquanto, comece pelo Gratuito.</p>
            </article>
          </div>
        </section>

        <section className="lp-chamada" aria-labelledby="lp-chamada-titulo">
          <h2 id="lp-chamada-titulo">Comece hoje a entender melhor o seu dinheiro.</h2>
          <p>Sua próxima decisão financeira pode começar com uma visão mais clara.</p>
          <Link to={logado ? '/principal' : '/cadastro'} className="lp-botao grande">
            {logado ? 'Abrir o app' : 'Começar gratuitamente'}
            <Icone nome="setaDireita" tamanho={18} />
          </Link>
        </section>
      </main>

      <footer className="lp-rodape">
        <div>
          <Logo tamanho={26} />
          <p>{SLOGAN}.</p>
        </div>
        <nav aria-label="Rodapé">
          <a href="#recursos">Recursos</a>
          <a href="#planos">Planos</a>
          <Link to="/login">Entrar</Link>
          <Link to="/cadastro">Criar conta</Link>
        </nav>
        <p className="lp-rodape-direitos">© 2026 OliFine. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
