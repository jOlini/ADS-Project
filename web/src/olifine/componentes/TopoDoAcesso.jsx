import { Link } from 'react-router-dom';
import AlternadorDeTema from '../../componentes/AlternadorDeTema';
import Logo from './Logo';

// Topo do login, do cadastro, da confirmação do e-mail e das páginas dos
// links (/auth/...): o monograma com o nome e o slogan, como no cabeçalho dos
// e-mails da conta (quem clica no link chega a uma tela com a mesma
// assinatura), que leva à página de apresentação, e o botão de tema.
export default function TopoDoAcesso() {
  return (
    <div className="topo-do-acesso">
      <Link to="/" className="marca" aria-label="OliFine, início">
        <Logo tamanho={30} slogan />
      </Link>
      <AlternadorDeTema />
    </div>
  );
}
