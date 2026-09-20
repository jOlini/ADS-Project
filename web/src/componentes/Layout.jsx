import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import Icone from './Icone';
import { useToast } from './toast/useToast';
import { firebaseConfigurado } from '../firebase';
import { buscarDadosPessoais, observarSessao, sair } from '../servicos/contas';

// Itens que só existem a partir da release 0.2: aparecem desligados, com a
// versão ao lado, para a pessoa saber o que vem — e não clicar em nada morto.
const ITENS_FUTUROS = [
  { icone: 'lancamentos', rotulo: 'Lançamentos', versao: '0.2' },
  { icone: 'contas', rotulo: 'Contas', versao: '0.2' },
  { icone: 'categorias', rotulo: 'Categorias', versao: '0.2' },
  { icone: 'relatorios', rotulo: 'Relatórios', versao: '0.3' },
];

// Moldura das rotas. Com sessão, o app ganha a barra lateral; sem sessão, a
// página de acesso ocupa a tela inteira (cada página desenha a sua vitrine).
export default function Layout() {
  const navigate = useNavigate();
  const toast = useToast();
  // undefined enquanto o Firebase ainda não disse se há sessão.
  const [usuario, setUsuario] = useState(firebaseConfigurado ? undefined : null);
  const [pessoa, setPessoa] = useState(null);

  useEffect(() => {
    if (!firebaseConfigurado) {
      return undefined;
    }
    return observarSessao(async (atual) => {
      setUsuario(atual);
      if (!atual) {
        setPessoa(null);
        return;
      }
      try {
        // O nome do espaço vem do cadastro; sem ele, o e-mail assume.
        setPessoa(await buscarDadosPessoais(atual.uid));
      } catch {
        setPessoa(null);
      }
    });
  }, []);

  async function sairDaConta() {
    await sair();
    toast.info('Até a próxima!', { titulo: 'Você saiu da conta' });
    navigate('/login', { replace: true });
  }

  if (!usuario) {
    return <Outlet />;
  }

  const nomeDoEspaco = pessoa ? `${pessoa.nome} ${pessoa.sobrenome}`.trim() : (usuario.email ?? '');
  const iniciais = pessoa
    ? `${pessoa.nome[0] ?? ''}${pessoa.sobrenome[0] ?? ''}`.toUpperCase()
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
        <Outlet />
      </main>
    </div>
  );
}
