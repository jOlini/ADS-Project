// Arquivo de rotas, separado do resto da aplicação como pede o enunciado de
// Tecnologias para Desenvolvimento Web. Toda URL que o app atende está aqui.
import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AreaDoCliente from './componentes/AreaDoCliente';
import Esqueleto from './componentes/Esqueleto';
import Layout from './componentes/Layout';
import LimiteDeErro from './componentes/LimiteDeErro';
import AcaoDaConta from './paginas/AcaoDaConta';
import Cadastro from './paginas/Cadastro';
import Cartao from './paginas/Cartao';
import Categorias from './paginas/Categorias';
import Contas from './paginas/Contas';
import EsqueciASenha from './paginas/EsqueciASenha';
import Lancamentos from './paginas/Lancamentos';
import Login from './paginas/Login';
import RedefinirSenha from './paginas/RedefinirSenha';
import VerificarEmail from './paginas/VerificarEmail';

// Páginas maiores, baixadas só quando abertas: a landing (quem entra logado
// não precisa dela) e as telas com gráficos e a árvore das metas.
const Landing = lazy(() => import('./olifine/paginas/Landing'));
const VisaoGeral = lazy(() => import('./olifine/paginas/VisaoGeral'));
const Metas = lazy(() => import('./olifine/paginas/Metas'));
const Relatorios = lazy(() => import('./paginas/Relatorios'));
const FluxoDeCaixa = lazy(() => import('./olifine/paginas/FluxoDeCaixa'));
const Dre = lazy(() => import('./olifine/paginas/Dre'));
const Familia = lazy(() => import('./olifine/paginas/Familia'));
const Custos = lazy(() => import('./olifine/paginas/Custos'));
const Sociedade = lazy(() => import('./olifine/paginas/Sociedade'));

// Enquanto o pedaço da página chega, o esqueleto dela ocupa o lugar.
const sobDemanda = (pagina, forma = 'pagina') => <Suspense fallback={<Esqueleto forma={forma} />}>{pagina}</Suspense>;

export default function AppRoutes() {
  const { pathname } = useLocation();
  // Último recurso: um erro fora da área logada (ou na própria casca) mostra
  // o aviso no lugar da tela, sem desmontar o app; trocar de endereço (voltar
  // no navegador) desenha a rota nova.
  return (
    <LimiteDeErro chave={pathname} acoes={<Link className="botao" to="/principal">Ir para o início</Link>}>
      <Routes>
        <Route element={<Layout />}>
          {/* A raiz é a página de apresentação; o app começa no login. */}
          <Route index element={sobDemanda(<Landing />, 'landing')} />
          <Route path="cadastro" element={<Cadastro />} />
          <Route path="login" element={<Login />} />
          {/* Links dos e-mails da conta, no lugar das páginas genéricas do
              Firebase. /auth/acao é a "URL de ação personalizada" do Console. */}
          <Route path="auth/acao" element={<AcaoDaConta />} />
          <Route path="auth/verificar-email" element={<VerificarEmail />} />
          <Route path="auth/redefinir-senha" element={<RedefinirSenha />} />
          <Route path="auth/esqueci-a-senha" element={<EsqueciASenha />} />
          {/* Área logada: só ela tem a barra lateral, montada depois de confirmar
              a sessão. Sem sessão, as páginas voltam para o login. */}
          <Route element={<AreaDoCliente />}>
            <Route path="principal" element={sobDemanda(<VisaoGeral />)} />
            <Route path="lancamentos" element={<Lancamentos />} />
            <Route path="contas" element={<Contas />} />
            {/* Dentro de /contas: o item "Contas & Cartões" do menu fica marcado. */}
            <Route path="contas/cartoes/:cartaoId" element={<Cartao />} />
            <Route path="categorias" element={<Categorias />} />
            {/* Metas ficam no navegador até a API de metas (release 0.5). */}
            <Route path="metas" element={sobDemanda(<Metas />)} />
            <Route path="relatorios" element={sobDemanda(<Relatorios />)} />
            {/* Modo Família do espaço pessoal: numa empresa, volta à Visão geral. */}
            <Route path="familia" element={sobDemanda(<Familia />)} />
            {/* Gestão da empresa: no espaço pessoal, volta à Visão geral. */}
            <Route path="empresa/fluxo" element={sobDemanda(<FluxoDeCaixa />)} />
            <Route path="empresa/dre" element={sobDemanda(<Dre />)} />
            <Route path="empresa/custos" element={sobDemanda(<Custos />)} />
            <Route path="empresa/sociedade" element={sobDemanda(<Sociedade />)} />
          </Route>
          {/* Qualquer outro endereço volta para o login. */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Route>
      </Routes>
    </LimiteDeErro>
  );
}
