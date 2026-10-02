import { Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import ConviteDoPlano from './convite/ConviteDoPlano';
import Esqueleto from './Esqueleto';
import { conviteDe, decidirRota } from '../regras/acessoPorPlano';
import { planoDoCliente } from '../regras/planos';
import { apiConfigurada } from '../servicos/livroCaixa';

// Guarda das rotas do espaço empresarial (/empresarial e /empresa/...): só o
// Plano Empresarial abre. Fora dele, o endereço digitado direto (ou um link
// antigo) mostra o convite do plano no lugar da página, com o caminho para a
// seção Planos, sem nada da página por trás. A decisão está em
// regras/acessoPorPlano.ts; a trava de verdade é a API (criar empresa fora do
// Empresarial é 403).
//
// Enquanto os espaços não chegam, o esqueleto: o plano ainda não é conhecido,
// e o convite piscaria para quem é Empresarial. Sem a API (site publicado), a
// página segue, com o aviso dela.
export default function GuardaDoPlano() {
  const contexto = useOutletContext();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { espaco, espacos } = contexto;

  if (apiConfigurada && espaco.carregando) {
    return <Esqueleto />;
  }
  if (apiConfigurada && decidirRota(pathname, planoDoCliente(espacos)) === 'convite') {
    const convite = conviteDe('empresarial');
    return (
      <section className="cartao painel convite-na-rota" aria-labelledby="titulo-do-convite">
        <h1 id="titulo-do-convite">{convite.titulo}</h1>
        <ConviteDoPlano motivo="empresarial" aoFechar={() => navigate('/principal', { replace: true })} />
      </section>
    );
  }
  return <Outlet context={contexto} />;
}
