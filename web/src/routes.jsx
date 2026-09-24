// Arquivo de rotas, separado do resto da aplicação como pede o enunciado de
// Tecnologias para Desenvolvimento Web. Toda URL que o app atende está aqui.
import { Navigate, Route, Routes } from 'react-router-dom';
import AreaDoCliente from './componentes/AreaDoCliente';
import Layout from './componentes/Layout';
import Cadastro from './paginas/Cadastro';
import Categorias from './paginas/Categorias';
import Contas from './paginas/Contas';
import Lancamentos from './paginas/Lancamentos';
import Login from './paginas/Login';
import Principal from './paginas/Principal';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/login" replace />} />
        <Route path="cadastro" element={<Cadastro />} />
        <Route path="login" element={<Login />} />
        {/* Área logada: só ela tem a barra lateral, montada depois de confirmar
            a sessão. Sem sessão, as páginas voltam para o login. */}
        <Route element={<AreaDoCliente />}>
          <Route path="principal" element={<Principal />} />
          <Route path="lancamentos" element={<Lancamentos />} />
          <Route path="contas" element={<Contas />} />
          <Route path="categorias" element={<Categorias />} />
        </Route>
        {/* Qualquer outro endereço volta para o login. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Route>
    </Routes>
  );
}
