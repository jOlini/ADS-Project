import { Link } from 'react-router-dom';
import Icone from '../Icone';
import { conviteDe, PAGINA_DOS_PLANOS } from '../../regras/acessoPorPlano';
import { PLANOS } from '../../regras/planos';

// O convite amigável para conhecer um plano: o que a pessoa tentou fazer, o
// plano que resolve (com o selo dele) e o que muda, sem tom de erro. A ação
// leva à seção Planos da landing; "Agora não" volta para onde estava. É o
// mesmo convite na guarda das rotas da empresa e no teto do Free.
export default function ConviteDoPlano({ motivo, maximo, aoFechar }) {
  const convite = conviteDe(motivo, maximo);
  const plano = PLANOS.find((item) => item.id === convite.plano);
  return (
    <div className="convite-do-plano">
      <p className={`convite-do-plano-selo ${convite.plano.toLowerCase()}`}>
        <Icone nome={convite.plano === 'EMPRESARIAL' ? 'empresa' : 'pessoas'} tamanho={16} />
        Plano {plano?.nome}
        {plano?.selo && <small>{plano.selo.texto}</small>}
      </p>
      <p>{convite.texto}</p>
      <ul className="convite-do-plano-ganhos" aria-label={`O que o Plano ${plano?.nome} traz`}>
        {convite.ganhos.map((ganho) => (
          <li key={ganho}>
            <Icone nome="certo" tamanho={16} />
            {ganho}
          </li>
        ))}
      </ul>
      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoFechar}>
          Agora não
        </button>
        <Link to={PAGINA_DOS_PLANOS} className="botao" onClick={aoFechar}>
          Conhecer os planos
          <Icone nome="setaDireita" tamanho={16} />
        </Link>
      </div>
    </div>
  );
}
