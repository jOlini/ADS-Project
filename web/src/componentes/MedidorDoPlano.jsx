import { Link } from 'react-router-dom';
import { PAGINA_DOS_PLANOS, situacaoDoLimite, textoDoUso } from '../regras/acessoPorPlano';

// Quanto do Plano Free já foi usado ("Plano Free · 37 de 100 lançamentos este
// mês"), com a barra. Só aparece com teto (no Free); perto do teto, fica âmbar
// e oferece os planos; no teto, o convite abre no lugar do formulário
// (useUsoDoPlano). Nos outros planos, nada.
export default function MedidorDoPlano({ uso, recurso }) {
  const doRecurso = uso?.[recurso];
  if (!doRecurso || doRecurso.maximo === null || doRecurso.maximo === undefined) {
    return null;
  }
  const situacao = situacaoDoLimite(doRecurso);
  const parte = Math.min(100, Math.round((doRecurso.usado / Math.max(1, doRecurso.maximo)) * 100));
  return (
    <p className={`medidor-do-plano ${situacao}`}>
      <span className="medidor-do-plano-barra" aria-hidden="true">
        <i style={{ '--p': `${parte}%` }} />
      </span>
      <span>Plano Free · {textoDoUso(recurso, doRecurso)}</span>
      {situacao !== 'livre' && <Link to={PAGINA_DOS_PLANOS}>Conhecer os planos</Link>}
    </p>
  );
}
