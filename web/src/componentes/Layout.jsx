import { NavLink, Outlet } from 'react-router-dom';

// Moldura comum a todas as rotas: cabeçalho com a navegação e, abaixo, a
// página da rota atual (Outlet).
export default function Layout() {
  return (
    <>
      <header className="topo">
        <NavLink to="/login" className="marca">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="32" height="32" />
          <span>
            Pessoal <strong>Finance</strong>
          </span>
        </NavLink>

        <nav aria-label="Navegação principal">
          <NavLink to="/cadastro">Cadastro</NavLink>
          <NavLink to="/login">Login</NavLink>
          <NavLink to="/principal">Principal</NavLink>
        </nav>
      </header>

      <main className="conteudo">
        <Outlet />
      </main>
    </>
  );
}
