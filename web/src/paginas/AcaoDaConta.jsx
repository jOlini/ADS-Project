import { Navigate, useLocation } from 'react-router-dom';
import { lerCodigo, paginaDaAcao } from '../regras/acaoDaConta';

// /auth/acao: endereço único para a "URL de ação personalizada" do Console do
// Firebase (Authentication > Modelos). O Firebase manda todos os links para
// ele com ?mode=...&oobCode=...; aqui cada modo segue para a página própria,
// com o código no fragmento e sem ele na consulta (replace: o endereço com o
// código não fica no histórico).
export default function AcaoDaConta() {
  const { search, hash } = useLocation();
  const pagina = paginaDaAcao(new URLSearchParams(search).get('mode'));
  const codigo = lerCodigo(hash, search);
  if (!pagina) {
    return <Navigate to="/login" replace />;
  }
  return <Navigate to={{ pathname: pagina, hash: codigo ? `oobCode=${encodeURIComponent(codigo)}` : '' }} replace />;
}
