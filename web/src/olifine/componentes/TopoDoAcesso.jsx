import { Link } from 'react-router-dom';
import AlternadorDeTema from '../../componentes/AlternadorDeTema';
import Logo from './Logo';

// Topo do login, do cadastro e da confirmação do e-mail: o monograma, que
// leva à página de apresentação, e o botão de tema.
export default function TopoDoAcesso() {
  return (
    <div className="topo-do-acesso">
      <Link to="/" className="marca" aria-label="OliFine, início">
        <Logo tamanho={30} />
      </Link>
      <AlternadorDeTema />
    </div>
  );
}
