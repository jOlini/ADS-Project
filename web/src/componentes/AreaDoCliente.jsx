import { Link, Navigate, NavLink, Outlet, useOutletContext } from 'react-router-dom';
import AvisoFirebase from './AvisoFirebase';
import Carregando from './Carregando';
import Icone from './Icone';
import { firebaseConfigurado } from '../firebase';
import { situacaoDaArea } from '../regras/sessao';
import { apiConfigurada } from '../servicos/livroCaixa';

// Telas do livro-caixa. Sem a API (versão publicada no Pages), aparecem
// desligadas, com a versão ao lado, como antes.
const ITENS_DO_LIVRO_CAIXA = [
  { para: '/lancamentos', icone: 'lancamentos', rotulo: 'Lançamentos' },
  { para: '/contas', icone: 'contas', rotulo: 'Contas' },
  { para: '/categorias', icone: 'categorias', rotulo: 'Categorias' },
];
const ITENS_FUTUROS = [
  ...(apiConfigurada ? [] : ITENS_DO_LIVRO_CAIXA.map((item) => ({ ...item, versao: '0.2' }))),
  { icone: 'relatorios', rotulo: 'Relatórios', versao: '0.3' },
];

// Guarda e moldura das páginas que exigem sessão. A barra lateral mora só
// aqui, e só é montada com a sessão confirmada (regras/sessao.js): o login e
// o cadastro ficam fora desta rota e nunca a desenham. Antes, a moldura de
// todas as rotas desenhava a barra sempre que havia sessão, e ela aparecia
// junto com a tela de login ao reabrir o app.
export default function AreaDoCliente() {
  const contexto = useOutletContext();
  const { usuario, pessoa, sairDaConta } = contexto;

  const situacao = situacaoDaArea({ firebaseConfigurado, usuario, pessoa });
  if (situacao === 'sem-firebase') {
    return <AvisoFirebase />;
  }
  if (situacao === 'verificando') {
    return <Carregando />;
  }
  if (situacao === 'sem-sessao') {
    return <Navigate to="/login" replace />;
  }

  const dados = pessoa.dados;
  const nomeDoEspaco = dados ? `${dados.nome} ${dados.sobrenome}`.trim() : (usuario.email ?? '');
  const iniciais = dados
    ? `${dados.nome[0] ?? ''}${dados.sobrenome[0] ?? ''}`.toUpperCase()
    : (usuario.email ?? '').slice(0, 2).toUpperCase();

  return (
    <div className="app">
      <aside className="barra-lateral">
        <Link to="/principal" className="marca">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
          <span>Pessoal Finance</span>
        </Link>

        <div className="espaco">
          <span className="avatar" aria-hidden="true">
            {iniciais || <Icone nome="resumo" tamanho={16} />}
          </span>
          <span className="textos">
            <b>Espaço pessoal</b>
            {nomeDoEspaco && <small title={nomeDoEspaco}>{nomeDoEspaco}</small>}
          </span>
        </div>

        <nav className="menu" aria-label="Navegação principal">
          <NavLink to="/principal">
            <Icone nome="resumo" />
            <span className="rotulo-do-item">Resumo</span>
          </NavLink>
          {apiConfigurada &&
            ITENS_DO_LIVRO_CAIXA.map((item) => (
              <NavLink key={item.para} to={item.para}>
                <Icone nome={item.icone} />
                <span className="rotulo-do-item">{item.rotulo}</span>
              </NavLink>
            ))}
          {ITENS_FUTUROS.map((item) => (
            <span key={item.rotulo} className="futuro-item" aria-disabled="true">
              <Icone nome={item.icone} />
              <span className="rotulo-do-item">{item.rotulo}</span>
              <em>{item.versao}</em>
            </span>
          ))}
        </nav>

        <div className="espacos">
          <p className="titulo-do-menu">Espaços</p>
          <div>
            <span className="ponto" aria-hidden="true" />
            Pessoal
          </div>
          <div className="futuro">
            <span className="ponto" aria-hidden="true" />
            Empresa <em>0.7</em>
          </div>
        </div>

        <div className="rodape">
          <button type="button" className="secundario largo" onClick={sairDaConta}>
            <Icone nome="sair" />
            Sair
          </button>
        </div>
      </aside>

      <main className="area">
        <Outlet context={contexto} />
      </main>
    </div>
  );
}
