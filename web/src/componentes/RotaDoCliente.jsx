import { Navigate, useOutletContext } from 'react-router-dom';
import AvisoFirebase from './AvisoFirebase';
import Carregando from './Carregando';
import { firebaseConfigurado } from '../firebase';

// Guarda das páginas que exigem sessão. A sessão vem do Layout (contexto da
// rota): enquanto o Firebase não responde, mostra o esqueleto; sem sessão,
// volta para o login, como a Principal já fazia.
export default function RotaDoCliente({ children }) {
  const { usuario } = useOutletContext();

  if (!firebaseConfigurado) {
    return <AvisoFirebase />;
  }
  if (usuario === undefined) {
    return <Carregando />;
  }
  if (!usuario) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
