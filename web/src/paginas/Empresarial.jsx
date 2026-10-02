import { useEffect, useRef } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import Esqueleto from '../componentes/Esqueleto';
import FormularioDeEmpresa from '../componentes/FormularioDeEmpresa';
import { empresasDe } from '../regras/espacos';

// /empresarial: o endereço direto do espaço empresarial (só o Plano
// Empresarial chega aqui, pela GuardaDoPlano). Com empresa, abre a última
// usada na Visão geral, como a aba Empresarial do topo; sem empresa ainda,
// o cadastro da primeira, na própria página.
export default function Empresarial() {
  const { espacos, trocarContexto, recarregarEspacos } = useOutletContext();
  const navigate = useNavigate();
  const temEmpresa = empresasDe(espacos).length > 0;
  // trocarContexto muda a cada desenho do Layout: a troca acontece uma vez só,
  // quando a lista chega com empresa.
  const trocou = useRef(false);

  useEffect(() => {
    if (temEmpresa && !trocou.current && trocarContexto('PJ')) {
      trocou.current = true;
      navigate('/principal', { replace: true });
    }
  }, [temEmpresa, trocarContexto, navigate]);

  if (temEmpresa) {
    return <Esqueleto />;
  }

  async function aoSalvar(empresa) {
    await recarregarEspacos(empresa.id);
    navigate('/principal', { replace: true });
  }

  return (
    <section className="cartao painel pagina-empresarial" aria-labelledby="titulo-empresarial">
      <h1 id="titulo-empresarial">Sua primeira empresa</h1>
      <p className="discreto">
        O espaço empresarial reúne as suas empresas, cada uma com o próprio caixa, DRE, custos, impostos e folha,
        separado do seu dinheiro pessoal.
      </p>
      <FormularioDeEmpresa aoSalvar={aoSalvar} aoCancelar={() => navigate('/principal')} />
    </section>
  );
}
