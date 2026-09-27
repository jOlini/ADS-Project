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
import { enderecoSemBaseAntiga } from './regras/enderecoDoApp';
import AppRoutes from './routes';
import { iniciarTema } from './servicos/tema';

// Tema claro ou escuro (escolha salva ou o do sistema) e a cor da barra do
// celular, antes do primeiro render.
iniciarTema();

// Clickjacking: o GitHub Pages não deixa mandar X-Frame-Options, e a CSP em
// <meta> não aceita frame-ancestors. Aberto numa moldura (<iframe>) de outro
// site, o app não se desenha: mostra só o link para abrir em aba própria. No
// desenvolvimento fica livre (ferramentas de prévia usam moldura).
const emMoldura = import.meta.env.PROD && window.top !== window.self;

// Link antigo com o caminho do GitHub Pages (/ADS-Project/...) aberto no app
// publicado em outro caminho (domínio próprio): o endereço é trocado antes de
// o roteador ler, sem recarregar e sem perder o #oobCode= dos e-mails.
const semBaseAntiga = enderecoSemBaseAntiga(window.location, import.meta.env.BASE_URL);
if (semBaseAntiga) {
  window.history.replaceState(window.history.state, '', semBaseAntiga);
}

// basename: no GitHub Pages o app vive em /ADS-Project/ e, num domínio próprio
// ou no container, na raiz (VITE_BASE do build). O BASE_URL já vem certo.
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
