import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCarga } from '../componentes/useCarga';
import { formatarBRL } from '../regras/dinheiro';
import { faturasAVencer } from '../regras/cartoes';
import { hojeIso } from '../regras/datas';
import { ehEmpresa, nomeDoEspaco } from '../regras/espacos';
import { familiaAtiva } from '../regras/familia';
import { guardarLateralRecolhida, lerLateralRecolhida } from '../servicos/lateral';
import { apiConfigurada, EVENTO_DOS_TRIBUTOS, listarCartoes, listarTributos } from '../servicos/livroCaixa';
import { alertasDosTributos, textoDaCompetencia } from './regras/impostos';
import Flutuante from './componentes/Flutuante';
import AlternadorDeTema from '../componentes/AlternadorDeTema';
import Icone from '../componentes/Icone';
import LimiteDeErro from '../componentes/LimiteDeErro';
import Logo from './componentes/Logo';
import SeletorDeEspaco from './componentes/SeletorDeEspaco';

// Itens do menu. Sem a API (site publicado), as telas que dependem dela ficam
// desligadas com a versão ao lado. Metas funciona sempre: fica no navegador
// até a API de metas (0.5).
const DA_API = [
  { para: '/lancamentos', icone: 'lancamentos', rotulo: 'Lançamentos', versao: '0.2' },
  { para: '/contas', icone: 'contas', rotulo: 'Contas & Cartões', versao: '0.2' },
  { para: '/categorias', icone: 'categorias', rotulo: 'Categorias', versao: '0.2' },
];

// Gestão da empresa, logo abaixo da Visão geral, só no espaço empresarial.
const DA_EMPRESA = [
  { grupo: 'Gestão' },
  { para: '/empresa/fluxo', icone: 'transferencia', rotulo: 'Fluxo de caixa', versao: '0.3' },
  { para: '/empresa/dre', icone: 'documento', rotulo: 'DRE', versao: '0.3' },
  { para: '/empresa/custos', icone: 'rosca', rotulo: 'Custos', versao: '0.3' },
  { para: '/empresa/sociedade', icone: 'pessoas', rotulo: 'Sociedade & aportes', versao: '0.3' },
  { para: '/empresa/impostos', icone: 'guia', rotulo: 'Impostos', versao: '0.3' },
  { para: '/empresa/pessoal', icone: 'cracha', rotulo: 'Pessoal (RH)', versao: '0.3' },
];

// A família, no fim do menu do espaço pessoal, só com o Modo Família ligado.
const DA_FAMILIA = [{ grupo: 'Família' }, { para: '/familia', icone: 'casa', rotulo: 'Pessoas da casa' }];

// O menu acompanha o espaço: no empresarial, a gestão da empresa antes do
// livro-caixa; no pessoal, o livro-caixa e, com o Modo Família, a família.
function itensDoMenu(empresa, familia) {
  const semApi = (item) => (apiConfigurada || !item.para ? item : { ...item, para: null });
  return [
    { para: '/principal', icone: 'resumo', rotulo: 'Visão geral' },
    ...(empresa ? [...DA_EMPRESA.map(semApi), { grupo: 'Livro-caixa' }] : []),
    ...DA_API.map(semApi),
    { para: '/metas', icone: 'broto', rotulo: 'Metas' },
    semApi({ para: '/relatorios', icone: 'relatorios', rotulo: 'Relatórios', versao: '0.3' }),
    ...(familia ? DA_FAMILIA : []),
  ];
}

// Título de um grupo do menu. Com a barra recolhida, vira um traço entre os
// ícones.
function GrupoDoMenu({ item }) {
  return (
    <p className="of-menu-grupo">
      <span>{item.grupo}</span>
    </p>
  );
}

const DIA_E_MES = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const dataCurta = (iso) => DIA_E_MES.format(new Date(`${iso}T12:00:00Z`)).replace('.', '');

// dica: com a barra recolhida, o nome aparece num balão ao lado do ícone (no
// mouse e no foco pelo teclado). O nome continua no link, escondido só da
// vista: o leitor de tela lê igual nos dois estados.
function ItemDoMenu({ item, aoEscolher, dica }) {
  if (!item.para) {
    return (
      <span className="of-menu-item futuro" aria-disabled="true" title={dica ? undefined : `${item.rotulo} (${item.versao})`}
        {...dica?.(`${item.rotulo} (${item.versao})`)}>
        <Icone nome={item.icone} />
        <span className="of-menu-rotulo">{item.rotulo}</span>
        <em>{item.versao}</em>
      </span>
    );
  }
  return (
    <NavLink to={item.para} className="of-menu-item" onClick={aoEscolher} {...dica?.(item.rotulo)}>
      <Icone nome={item.icone} />
      <span className="of-menu-rotulo">{item.rotulo}</span>
    </NavLink>
  );
}

// Casca da área logada na OliFine: barra lateral branca com o monograma,
// barra do topo com o seletor de espaço, busca, avisos e conta, e no celular
// a barra de abas embaixo. Todas as páginas da área logada entram no <main
// className="area">.
//
// A barra lateral recolhe para uma coluna só de ícones (o botão ao lado do
// logo), um pouco maiores para o alvo ficar bom, com o nome de cada aba num
// balão ao passar o mouse. A escolha fica no navegador (servicos/lateral.ts).
export default function CascaOliFine({ contexto }) {
  const { usuario, pessoa, espaco, espacos, trocarEspaco, trocarContexto, recarregarEspacos, sairDaConta } = contexto;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [busca, setBusca] = useState('');
  const [recolhida, setRecolhida] = useState(lerLateralRecolhida);
  // Balão do item sob o mouse (ou no foco): fica fora da barra, em posição
  // fixa, porque a barra rola e cortaria o que passa da borda dela.
  const [dica, setDica] = useState(null);

  function alternarLateral() {
    setDica(null);
    setRecolhida((atual) => {
      guardarLateralRecolhida(!atual);
      return !atual;
    });
  }

  // Props do balão para um item, ou nada com a barra aberta (o nome já está
  // à vista). No foco, só o do teclado: o clique não deixa balão preso.
  const dicaDoItem = recolhida
    ? (texto) => ({
        onPointerEnter: (evento) => mostrarDica(evento.currentTarget, texto),
        onPointerLeave: () => setDica(null),
        onFocus: (evento) => evento.currentTarget.matches(':focus-visible') && mostrarDica(evento.currentTarget, texto),
        onBlur: () => setDica(null),
      })
    : undefined;

  function mostrarDica(elemento, texto) {
    const caixa = elemento.getBoundingClientRect();
    setDica({ texto, x: caixa.right + 12, y: caixa.top + caixa.height / 2 });
  }

  const dados = pessoa.dados;
  const nome = dados ? `${dados.nome} ${dados.sobrenome}`.trim() : (usuario.email ?? 'Sua conta');
  const iniciais = dados
    ? `${dados.nome[0] ?? ''}${dados.sobrenome[0] ?? ''}`.toUpperCase()
    : (usuario.email ?? '').slice(0, 2).toUpperCase();

  // Avisos: faturas de cartão fechadas e não pagas, com o vencimento, e, na
  // empresa, as guias de imposto atrasadas ou que vencem em até 7 dias (lidas
  // de novo a cada tela e quando uma guia muda, para a paga sair do sino).
  const espacoId = espaco.dados?.id;
  const empresa = ehEmpresa(espaco.dados);
  const buscarCartoes = useMemo(() => (apiConfigurada && espacoId ? () => listarCartoes(espacoId) : null), [espacoId]);
  const cartoes = useCarga(buscarCartoes);
  const buscarTributos = useMemo(
    () => (apiConfigurada && espacoId && empresa ? () => listarTributos(espacoId).catch(() => []) : null),
    [espacoId, empresa],
  );
  const tributos = useCarga(buscarTributos);
  const { recarregar: lerTributosDeNovo } = tributos;
  const rotaAnterior = useRef(pathname);
  useEffect(() => {
    if (rotaAnterior.current !== pathname) {
      rotaAnterior.current = pathname;
      lerTributosDeNovo();
    }
  }, [pathname, lerTributosDeNovo]);
  useEffect(() => {
    globalThis.addEventListener(EVENTO_DOS_TRIBUTOS, lerTributosDeNovo);
    return () => globalThis.removeEventListener(EVENTO_DOS_TRIBUTOS, lerTributosDeNovo);
  }, [lerTributosDeNovo]);
  const avisos = cartoes.dados ? faturasAVencer(cartoes.dados) : [];
  const guias = empresa && tributos.dados ? alertasDosTributos(tributos.dados, hojeIso()) : [];
  const quantosAvisos = avisos.length + guias.length;
  const itens = itensDoMenu(empresa, familiaAtiva(espaco.dados));
  const nomeDoAtivo = nomeDoEspaco(espaco.dados);

  function buscar(evento) {
    evento.preventDefault();
    const termo = busca.trim();
    navigate(termo ? `/lancamentos?busca=${encodeURIComponent(termo)}` : '/lancamentos');
  }

  const conta = (fechar) => (
    <div className="of-conta">
      <p className="of-conta-cabecalho">
        <span className="of-avatar grande" aria-hidden="true">
          {iniciais}
        </span>
        <span>
          <b>{nome}</b>
          {usuario.email && <small>{usuario.email}</small>}
        </span>
      </p>
      <p className="of-conta-espaco">
        <span className="of-ponto-verde" aria-hidden="true" />
        {nomeDoAtivo}
      </p>
      <button
        type="button"
        className="of-conta-acao"
        onClick={() => {
          fechar();
          sairDaConta();
        }}
      >
        <Icone nome="sair" />
        Sair
      </button>
    </div>
  );

  return (
    <div className={`of-app${recolhida ? ' lateral-recolhida' : ''}`}>
      <aside className="of-lateral" id="barra-lateral">
        <div className="of-lateral-topo">
          <Link to="/principal" className="of-lateral-marca" aria-label="OliFine, Visão geral" {...dicaDoItem?.('Visão geral')}>
            <Logo tamanho={30} />
          </Link>
          <button
            type="button"
            className="botao-icone of-lateral-alternar"
            aria-pressed={recolhida}
            aria-controls="barra-lateral"
            aria-label="Recolher o menu"
            title={recolhida ? undefined : 'Recolher o menu'}
            onClick={alternarLateral}
            {...dicaDoItem?.('Abrir o menu')}
          >
            <Icone nome="lateral" />
          </button>
        </div>

        <nav className="of-menu" aria-label="Navegação principal">
          {itens.map((item) =>
            item.grupo ? <GrupoDoMenu key={item.grupo} item={item} /> : <ItemDoMenu key={item.rotulo} item={item} dica={dicaDoItem} />,
          )}
        </nav>

        <div className="of-lateral-pe">
          <p className="of-lateral-usuario" {...dicaDoItem?.(`${nome} · ${nomeDoAtivo}`)}>
            <span className="of-avatar" aria-hidden="true">
              {iniciais}
            </span>
            <span className="of-lateral-usuario-textos">
              <b title={nome}>{nome}</b>
              <small title={nomeDoAtivo}>{nomeDoAtivo}</small>
            </span>
          </p>
          <button type="button" className="discreto-botao of-lateral-sair" onClick={sairDaConta} {...dicaDoItem?.('Sair')}>
            <Icone nome="sair" tamanho={16} />
            <span className="of-menu-rotulo">Sair</span>
          </button>
        </div>
      </aside>

      {recolhida && dica && (
        <span className="of-dica-lateral" style={{ left: `${dica.x}px`, top: `${dica.y}px` }} aria-hidden="true">
          {dica.texto}
        </span>
      )}

      <div className="of-coluna">
        <header className="of-topo">
          <Link to="/principal" className="of-topo-marca" aria-label="OliFine, Visão geral">
            <Logo tamanho={28} />
          </Link>

          {apiConfigurada && espaco.dados && (
            <SeletorDeEspaco
              espacos={espacos}
              ativo={espaco.dados}
              trocarEspaco={trocarEspaco}
              trocarContexto={trocarContexto}
              recarregarEspacos={recarregarEspacos}
            />
          )}

          {apiConfigurada && (
            <form className="of-busca" role="search" onSubmit={buscar}>
              <Icone nome="busca" tamanho={16} />
              <input
                type="search"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                placeholder="Buscar lançamentos"
                aria-label="Buscar lançamentos do mês"
              />
            </form>
          )}

          <div className="of-topo-acoes">
            <AlternadorDeTema />
            <Flutuante
              rotulo={quantosAvisos > 0 ? `Avisos: ${quantosAvisos} conta(s) a pagar` : 'Avisos'}
              className="botao-icone of-sino"
              classeDoPainel="of-avisos"
              botao={
                <>
                  <Icone nome="sino" />
                  {quantosAvisos > 0 && <span className="of-sino-contador">{quantosAvisos}</span>}
                </>
              }
            >
              {(fechar) => (
                <>
                  <p className="of-flutuante-titulo">Avisos</p>
                  {quantosAvisos > 0 ? (
                    <ul>
                      {guias.map((guia) => (
                        <li key={`${guia.tributo.id}-${guia.competencia}`}>
                          <Link to="/empresa/impostos" onClick={fechar}>
                            <span className={`of-aviso-marca${guia.situacao === 'ATRASADA' ? ' vencida' : ''}`} aria-hidden="true">
                              <Icone nome="guia" tamanho={16} />
                            </span>
                            <span>
                              <b>
                                {guia.tributo.nome} de {textoDaCompetencia(guia.competencia, guia.tributo.periodicidade)}
                              </b>
                              <small>
                                {guia.situacao === 'ATRASADA' ? 'Venceu em' : 'Vence em'} {dataCurta(guia.vencimento)}
                              </small>
                            </span>
                          </Link>
                        </li>
                      ))}
                      {avisos.map((aviso) => (
                        <li key={aviso.id}>
                          <Link to={`/contas/cartoes/${aviso.id}`} onClick={fechar}>
                            <span className={`of-aviso-marca${aviso.vencida ? ' vencida' : ''}`} aria-hidden="true">
                              <Icone nome="cartao" tamanho={16} />
                            </span>
                            <span>
                              <b>{aviso.descricao}</b>
                              <small>
                                {aviso.vencida ? 'Venceu em' : 'Vence em'} {dataCurta(aviso.data)} · {formatarBRL(aviso.valor)}
                              </small>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="of-flutuante-vazio">
                      {empresa
                        ? 'Nada a pagar agora. Faturas de cartão fechadas e guias de imposto perto do vencimento aparecem aqui.'
                        : 'Nenhuma fatura a pagar. Faturas de cartão fechadas aparecem aqui com o vencimento.'}
                    </p>
                  )}
                </>
              )}
            </Flutuante>

            <Flutuante rotulo={`Conta de ${nome}`} className="of-avatar-botao" classeDoPainel="of-painel-conta" botao={<span className="of-avatar">{iniciais}</span>}>
              {conta}
            </Flutuante>
          </div>
        </header>

        <main className="area of-area">
          {/* Uma tela que falha ao desenhar troca só o conteúdo pelo aviso: o
              menu continua e abrir outra rota desenha a tela nova. */}
          <LimiteDeErro chave={pathname}>
            {/* Outro espaço, tela nova: nada do livro anterior (filtros,
                listas, seleção) sobra no estado da página. A tela nova
                chega por opacidade (movimento.css), sem piscar. */}
            <div key={espacoId ?? 'sem-espaco'} className="of-troca-de-espaco">
              <Outlet context={contexto} />
            </div>
          </LimiteDeErro>
        </main>
      </div>

      <nav className="of-abas" aria-label="Navegação principal">
        <NavLink to="/principal" className="of-aba">
          <Icone nome="resumo" />
          <span>Início</span>
        </NavLink>
        {apiConfigurada && (
          <NavLink to="/lancamentos" className="of-aba">
            <Icone nome="lancamentos" />
            <span>Lançamentos</span>
          </NavLink>
        )}
        <NavLink to="/metas" className="of-aba">
          <Icone nome="broto" />
          <span>Metas</span>
        </NavLink>
        <Flutuante
          rotulo="Mais opções"
          className="of-aba"
          classeDoPainel="of-painel-mais"
          botao={
            <>
              <Icone nome="menuLinhas" />
              <span>Mais</span>
            </>
          }
        >
          {(fechar) => (
            <nav className="of-mais" aria-label="Mais opções">
              {itens
                .filter((item) => item.grupo || !['/principal', '/metas', apiConfigurada ? '/lancamentos' : ''].includes(item.para))
                .map((item) =>
                  item.grupo ? (
                    <GrupoDoMenu key={item.grupo} item={item} />
                  ) : (
                    <ItemDoMenu key={item.rotulo} item={item} aoEscolher={fechar} />
                  ),
                )}
            </nav>
          )}
        </Flutuante>
      </nav>
    </div>
  );
}
