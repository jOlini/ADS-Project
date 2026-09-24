import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import Icone from './Icone';
import { useToast } from './toast/useToast';
import { firebaseConfigurado } from '../firebase';
import { mensagemDeErro } from '../regras/erros';
import { buscarDadosPessoais, observarSessao, sair } from '../servicos/contas';
import { apiConfigurada, espacoPessoal } from '../servicos/livroCaixa';

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

const CARREGANDO = { carregando: true, dados: null, erro: '' };

// Moldura das rotas. Com sessão, o app ganha a barra lateral; sem sessão, a
// página de acesso ocupa a tela inteira (cada página desenha a sua vitrine).
// A sessão, os dados pessoais (Firestore) e o espaço do livro-caixa (API)
// são buscados aqui uma vez e chegam às páginas pelo contexto da rota.
export default function Layout() {
  const navigate = useNavigate();
  const toast = useToast();
  // undefined enquanto o Firebase ainda não disse se há sessão.
  const [usuario, setUsuario] = useState(firebaseConfigurado ? undefined : null);
  const [pessoa, setPessoa] = useState(CARREGANDO);
  const [espaco, setEspaco] = useState(CARREGANDO);

  useEffect(() => {
    if (!firebaseConfigurado) {
      return undefined;
    }
    return observarSessao(async (atual) => {
      setUsuario(atual);
      if (!atual) {
        setPessoa(CARREGANDO);
        setEspaco(CARREGANDO);
        return;
      }
      buscarDadosPessoais(atual.uid).then(
        (dados) =>
          setPessoa({ carregando: false, dados, erro: dados ? '' : 'Não há dados pessoais gravados para esta conta.' }),
        (erro) => setPessoa({ carregando: false, dados: null, erro: mensagemDeErro(erro.code) }),
      );
      if (apiConfigurada) {
        espacoPessoal().then(
          (dados) => setEspaco({ carregando: false, dados, erro: '' }),
          (erro) => setEspaco({ carregando: false, dados: null, erro: erro.message }),
        );
      }
    });
  }, []);

  async function sairDaConta() {
    await sair();
    toast.info('Até a próxima!', { titulo: 'Você saiu da conta' });
    navigate('/login', { replace: true });
  }

  const contexto = { usuario, pessoa, espaco };

  if (!usuario) {
    return <Outlet context={contexto} />;
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
