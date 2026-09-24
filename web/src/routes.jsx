// Arquivo de rotas, separado do resto da aplicação como pede o enunciado de
// Tecnologias para Desenvolvimento Web. Toda URL que o app atende está aqui.
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './componentes/Layout';
import RotaDoCliente from './componentes/RotaDoCliente';
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
        {/* Páginas da área logada: sem sessão, voltam para o login. */}
        <Route path="principal" element={<RotaDoCliente><Principal /></RotaDoCliente>} />
        <Route path="lancamentos" element={<RotaDoCliente><Lancamentos /></RotaDoCliente>} />
        <Route path="contas" element={<RotaDoCliente><Contas /></RotaDoCliente>} />
        <Route path="categorias" element={<RotaDoCliente><Categorias /></RotaDoCliente>} />
        {/* Qualquer outro endereço volta para o login. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Route>
    </Routes>
  );
}
