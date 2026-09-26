// Arquivo de rotas, separado do resto da aplicação como pede o enunciado de
// Tecnologias para Desenvolvimento Web. Toda URL que o app atende está aqui.
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import AreaDoCliente from './componentes/AreaDoCliente';
import Esqueleto from './componentes/Esqueleto';
import Layout from './componentes/Layout';
import Cadastro from './paginas/Cadastro';
import Cartao from './paginas/Cartao';
import Categorias from './paginas/Categorias';
import Contas from './paginas/Contas';
import Lancamentos from './paginas/Lancamentos';
import Login from './paginas/Login';

// Páginas maiores, baixadas só quando abertas: a landing (quem entra logado
// não precisa dela) e as telas com gráficos e a árvore das metas.
const Landing = lazy(() => import('./olifine/paginas/Landing'));
const VisaoGeral = lazy(() => import('./olifine/paginas/VisaoGeral'));
const Metas = lazy(() => import('./olifine/paginas/Metas'));

// Enquanto o pedaço da página chega, o esqueleto dela ocupa o lugar.
const sobDemanda = (pagina, forma = 'pagina') => <Suspense fallback={<Esqueleto forma={forma} />}>{pagina}</Suspense>;

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* A raiz é a página de apresentação; o app começa no login. */}
        <Route index element={sobDemanda(<Landing />, 'landing')} />
        <Route path="cadastro" element={<Cadastro />} />
        <Route path="login" element={<Login />} />
        {/* Área logada: só ela tem a barra lateral, montada depois de confirmar
            a sessão. Sem sessão, as páginas voltam para o login. */}
        <Route element={<AreaDoCliente />}>
          <Route path="principal" element={sobDemanda(<VisaoGeral />)} />
          <Route path="lancamentos" element={<Lancamentos />} />
          <Route path="contas" element={<Contas />} />
          {/* Dentro de /contas: o item "Contas & Cartões" do menu fica marcado. */}
          <Route path="contas/cartoes/:cartaoId" element={<Cartao />} />
          <Route path="categorias" element={<Categorias />} />
          {/* Metas ficam no navegador até a API de metas (release 0.5). */}
          <Route path="metas" element={sobDemanda(<Metas />)} />
        </Route>
        {/* Qualquer outro endereço volta para o login. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Route>
    </Routes>
  );
}
