import Icone from '../../componentes/Icone';
import FolhasEmVolta from './FolhasEmVolta';

interface Props {
  icone: string;
  // Cada tela com a sua semente: as órbitas não ficam iguais entre si.
  semente?: number;
}

// Símbolo dos estados vazios (.vazio .simbolo), com as folhas e moedas da
// landing em órbita em volta do ícone: a tela sem dados ainda parece viva.
export default function SimboloDoVazio({ icone, semente }: Props) {
  return (
    <span className="simbolo" aria-hidden="true">
      <Icone nome={icone} tamanho={20} />
      <FolhasEmVolta arranjo="vazio" semente={semente} />
    </span>
  );
}
