import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { CAMINHO_DO_PROXY } from './src/servicos/enderecoDaApi.js'

const BASE = '/ADS-Project/';
const PREFIXO_DA_API = `${BASE}${CAMINHO_DO_PROXY}`;
const ROTAS_DO_CLIENTE = `^${PREFIXO_DA_API}/espacos(?:[/?]|$)`;

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const { VITE_API_URL } = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react()],
    base: BASE,
    // Só vale no servidor de desenvolvimento (npm run dev e subir-app.py), não
    // no build do GitHub Pages.
    server: {
      // O túnel da Cloudflare chega com o Host <nome>.trycloudflare.com, que o
      // Vite recusa por padrão (proteção contra DNS rebinding). Os outros
      // hosts continuam recusados.
      allowedHosts: ['.trycloudflare.com'],
      // Pelo túnel, a página chama a API em /ADS-Project/api/... (veja
      // src/servicos/enderecoDaApi.js). Só as rotas do cliente (/espacos)
      // passam: painel administrativo, login do back-office e Swagger ficam
      // fora do endereço público.
      proxy: {
        [ROTAS_DO_CLIENTE]: {
          target: (VITE_API_URL || 'http://localhost:8081').replace(/\/+$/, ''),
          changeOrigin: true,
          // "/espacos/../auth/login" casa com o prefixo, mas chegaria à API
          // como "/auth/login". Confere o caminho já resolvido ("..", "%2e%2e")
          // e responde 404 ao que sai de /espacos.
          bypass: (req) => (new RegExp(ROTAS_DO_CLIENTE).test(new URL(req.url, 'http://vite').pathname) ? undefined : false),
          rewrite: (caminho) => caminho.slice(PREFIXO_DA_API.length),
        },
      },
    },
  };
});
