// Arquivo de rotas, separado do resto da aplicação como pede o enunciado de
// Tecnologias para Desenvolvimento Web. Toda URL que o app atende está aqui.
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './componentes/Layout';
import Cadastro from './paginas/Cadastro';
import Login from './paginas/Login';
import Principal from './paginas/Principal';

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/login" replace />} />
        <Route path="cadastro" element={<Cadastro />} />
        <Route path="login" element={<Login />} />
        <Route path="principal" element={<Principal />} />
        {/* Qualquer outro endereço volta para o login. */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Route>
    </Routes>
  );
}
