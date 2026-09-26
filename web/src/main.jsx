import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// Fonte Geist (eixo de peso) hospedada junto com o app, sem chamar o Google
// Fonts nem outro terceiro.
import '@fontsource-variable/geist';
// Ordem dos estilos: os tokens (todo valor visual), a base do app, os
// componentes próprios (sobrepõem o botão e o campo da base), a identidade
// OliFine (casca, Visão geral, Metas) e, por último, o movimento comum a
// todos, que soma deslocamento e sombra às transições de cada um.
import './estilos/tokens.css';
import './index.css';
import './estilos/componentes.css';
import './olifine/estilos/marca.css';
import './olifine/estilos/olifine.css';
import './estilos/movimento.css';
import ToastProvider from './componentes/toast/ToastProvider';
import AppRoutes from './routes';

// Clickjacking: o GitHub Pages não deixa mandar X-Frame-Options, e a CSP em
// <meta> não aceita frame-ancestors. Aberto numa moldura (<iframe>) de outro
// site, o app não se desenha: mostra só o link para abrir em aba própria. No
// desenvolvimento fica livre (ferramentas de prévia usam moldura).
const emMoldura = import.meta.env.PROD && window.top !== window.self;

// basename: no GitHub Pages o app vive em /ADS-Project/ (base do Vite) e,
// no container, na raiz. O BASE_URL já vem certo nos dois casos.
createRoot(document.getElementById('root')).render(
  emMoldura ? (
    <main className="fora-da-moldura">
      <p>Por segurança, o OliFine só abre em uma aba própria.</p>
      <a className="botao" href={window.location.href} target="_top">
        Abrir o OliFine
      </a>
    </main>
  ) : (
    <StrictMode>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ToastProvider posicao="base-direita">
          <AppRoutes />
        </ToastProvider>
      </BrowserRouter>
    </StrictMode>
  ),
);
