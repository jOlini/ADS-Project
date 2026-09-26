import { Link } from 'react-router-dom';
import Logo from './Logo';

// Topo do login e do cadastro: o monograma, que leva à página de
// apresentação.
export default function TopoDoAcesso() {
  return (
    <div className="topo-do-acesso">
      <Link to="/" className="marca" aria-label="OliFine, início">
        <Logo tamanho={30} />
      </Link>
    </div>
  );
}
