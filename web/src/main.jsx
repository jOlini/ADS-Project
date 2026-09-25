import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// Fonte Figtree (eixo de peso) hospedada junto com o app, sem chamar o
// Google Fonts. A mesma fonte está no painel (api/painel/fontes/).
import '@fontsource-variable/figtree';
// Ordem dos estilos: os tokens (todo valor visual), a base do app e os
// componentes próprios, que sobrepõem o botão e o campo da base.
import './estilos/tokens.css';
import './index.css';
import './estilos/componentes.css';
import ToastProvider from './componentes/toast/ToastProvider';
import AppRoutes from './routes';

// basename: no GitHub Pages o app vive em /ADS-Project/ (base do Vite) e,
// no container, na raiz. O BASE_URL já vem certo nos dois casos.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ToastProvider posicao="topo-direita">
        <AppRoutes />
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
