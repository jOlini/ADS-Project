import { Navigate, useOutletContext } from 'react-router-dom';
import AvisoFirebase from './AvisoFirebase';
import Esqueleto from './Esqueleto';
import { firebaseConfigurado } from '../firebase';
import CascaOliFine from '../olifine/CascaOliFine';
import ConfirmarEmail from '../paginas/ConfirmarEmail';
import { situacaoDaArea } from '../regras/sessao';

// Guarda das páginas que exigem sessão. A casca (barra lateral, topo e abas
// do celular) mora só aqui e só é montada com a sessão confirmada
// (regras/sessao.js): o login e o cadastro ficam fora desta rota e nunca a
// desenham. A conta sem o e-mail confirmado fica na tela de confirmação.
export default function AreaDoCliente() {
  const contexto = useOutletContext();
  const { usuario, confirmado, pessoa } = contexto;

  const situacao = situacaoDaArea({ firebaseConfigurado, usuario, confirmado, pessoa });
  if (situacao === 'sem-firebase') {
    return <AvisoFirebase />;
  }
  if (situacao === 'verificando') {
    return <Esqueleto forma="casca" rotulo="Conferindo a sua sessão" />;
  }
  if (situacao === 'sem-sessao') {
    return <Navigate to="/login" replace />;
  }
  if (situacao === 'sem-confirmacao') {
    return <ConfirmarEmail usuario={usuario} aoConferir={contexto.conferirEmail} aoSair={contexto.sairDaConta} />;
  }
  return <CascaOliFine contexto={contexto} />;
}
