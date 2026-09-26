import { Navigate, useOutletContext } from 'react-router-dom';
import AvisoFirebase from './AvisoFirebase';
import Esqueleto from './Esqueleto';
import { firebaseConfigurado } from '../firebase';
import CascaOliFine from '../olifine/CascaOliFine';
import { situacaoDaArea } from '../regras/sessao';

// Guarda das páginas que exigem sessão. A casca (barra lateral, topo e abas
// do celular) mora só aqui e só é montada com a sessão confirmada
// (regras/sessao.js): o login e o cadastro ficam fora desta rota e nunca a
// desenham.
export default function AreaDoCliente() {
  const contexto = useOutletContext();
  const { usuario, pessoa } = contexto;

  const situacao = situacaoDaArea({ firebaseConfigurado, usuario, pessoa });
  if (situacao === 'sem-firebase') {
    return <AvisoFirebase />;
  }
  if (situacao === 'verificando') {
    return <Esqueleto forma="casca" rotulo="Conferindo a sua sessão" />;
  }
  if (situacao === 'sem-sessao') {
    return <Navigate to="/login" replace />;
  }
  return <CascaOliFine contexto={contexto} />;
}
