import { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useCarga } from '../componentes/useCarga';
import { formatarBRL } from '../regras/dinheiro';
import { faturasAVencer } from '../regras/cartoes';
import { apiConfigurada, listarCartoes } from '../servicos/livroCaixa';
import Flutuante from './componentes/Flutuante';
import Icone from '../componentes/Icone';
import Logo from './componentes/Logo';

// Itens do menu. Sem a API (site publicado), as telas que dependem dela ficam
// desligadas com a versão ao lado. Metas funciona sempre: fica no navegador
// até a API de metas (0.5).
const DA_API = [
  { para: '/lancamentos', icone: 'lancamentos', rotulo: 'Lançamentos', versao: '0.2' },
  { para: '/contas', icone: 'contas', rotulo: 'Contas & Cartões', versao: '0.2' },
  { para: '/categorias', icone: 'categorias', rotulo: 'Categorias', versao: '0.2' },
];

function itensDoMenu() {
  const semApi = (item) => (apiConfigurada ? item : { ...item, para: null });
  return [
    { para: '/principal', icone: 'resumo', rotulo: 'Visão geral' },
    ...DA_API.map(semApi),
    { para: '/metas', icone: 'broto', rotulo: 'Metas' },
    semApi({ para: '/relatorios', icone: 'relatorios', rotulo: 'Relatórios', versao: '0.3' }),
  ];
}

const DIA_E_MES = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });
const dataCurta = (iso) => DIA_E_MES.format(new Date(`${iso}T12:00:00Z`)).replace('.', '');

function ItemDoMenu({ item, aoEscolher }) {
  if (!item.para) {
    return (
      <span className="of-menu-item futuro" aria-disabled="true">
        <Icone nome={item.icone} />
        <span>{item.rotulo}</span>
        <em>{item.versao}</em>
      </span>
    );
  }
  return (
    <NavLink to={item.para} className="of-menu-item" onClick={aoEscolher}>
      <Icone nome={item.icone} />
      <span>{item.rotulo}</span>
    </NavLink>
  );
}

// Casca da área logada na OliFine: barra lateral branca com o monograma,
// barra do topo com busca, avisos e conta, e no celular a barra de abas
// embaixo. Todas as páginas da área logada entram no <main className="area">.
export default function CascaOliFine({ contexto }) {
  const { usuario, pessoa, espaco, sairDaConta } = contexto;
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');

  const dados = pessoa.dados;
  const nome = dados ? `${dados.nome} ${dados.sobrenome}`.trim() : (usuario.email ?? 'Sua conta');
  const iniciais = dados
    ? `${dados.nome[0] ?? ''}${dados.sobrenome[0] ?? ''}`.toUpperCase()
    : (usuario.email ?? '').slice(0, 2).toUpperCase();

  // Avisos: faturas de cartão fechadas e não pagas, com o vencimento.
  const espacoId = espaco.dados?.id;
  const buscarCartoes = useMemo(() => (apiConfigurada && espacoId ? () => listarCartoes(espacoId) : null), [espacoId]);
  const cartoes = useCarga(buscarCartoes);
  const avisos = cartoes.dados ? faturasAVencer(cartoes.dados) : [];
  const itens = itensDoMenu();

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
        Espaço pessoal
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
    <div className="of-app">
      <aside className="of-lateral">
        <Link to="/principal" className="of-lateral-marca" aria-label="OliFine, Visão geral">
          <Logo tamanho={30} />
        </Link>

        <nav className="of-menu" aria-label="Navegação principal">
          {itens.map((item) => (
            <ItemDoMenu key={item.rotulo} item={item} />
          ))}
        </nav>

        <div className="of-lateral-pe">
          <p className="of-lateral-usuario">
            <span className="of-avatar" aria-hidden="true">
              {iniciais}
            </span>
            <span className="of-lateral-usuario-textos">
              <b title={nome}>{nome}</b>
              <small>Espaço pessoal</small>
            </span>
          </p>
          <button type="button" className="discreto-botao of-lateral-sair" onClick={sairDaConta}>
            <Icone nome="sair" tamanho={16} />
            Sair
          </button>
        </div>
      </aside>

      <div className="of-coluna">
        <header className="of-topo">
          <Link to="/principal" className="of-topo-marca" aria-label="OliFine, Visão geral">
            <Logo tamanho={28} />
          </Link>

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
            <Flutuante
              rotulo={avisos.length > 0 ? `Avisos: ${avisos.length} fatura(s) a pagar` : 'Avisos'}
              className="botao-icone of-sino"
              classeDoPainel="of-avisos"
              botao={
                <>
                  <Icone nome="sino" />
                  {avisos.length > 0 && <span className="of-sino-contador">{avisos.length}</span>}
                </>
              }
            >
              {(fechar) => (
                <>
                  <p className="of-flutuante-titulo">Avisos</p>
                  {avisos.length > 0 ? (
                    <ul>
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
                      Nenhuma fatura a pagar. Faturas de cartão fechadas aparecem aqui com o vencimento.
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
          <Outlet context={contexto} />
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
                .filter((item) => !['/principal', '/metas', apiConfigurada ? '/lancamentos' : ''].includes(item.para))
                .map((item) => (
                  <ItemDoMenu key={item.rotulo} item={item} aoEscolher={fechar} />
                ))}
            </nav>
          )}
        </Flutuante>
      </nav>
    </div>
  );
}
