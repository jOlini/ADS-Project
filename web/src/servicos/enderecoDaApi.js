// Endereço da API do livro-caixa visto do navegador.
//
// No web/.env, VITE_API_URL costuma ser http://localhost:8081. Aberto pela rede
// local (http://10.0.0.5:5173 no celular, com o "python subir-app.py up"),
// "localhost" seria o próprio celular, e a API não seria encontrada. Nesse
// caso o endereço passa a usar o IP de onde a página veio: a API roda na mesma
// máquina que serve a página. Um endereço que não é local (API hospedada)
// fica como está.
//
// Aberto pelo túnel da Cloudflare (https://<nome>.trycloudflare.com, com o
// "python subir-app.py tunnel start"), só a porta do Vite fica pública. A API
// passa pelo proxy do próprio Vite (vite.config.js), no mesmo endereço da
// página: mesma origem, sem CORS e sem abrir a porta 8081.
const LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);
const DOMINIO_DO_TUNEL = '.trycloudflare.com';
export const CAMINHO_DO_PROXY = 'api';

export function enderecoDaApi(configurado, hostDaPagina, base = '/') {
  const limpo = (configurado ?? '').replace(/\/+$/, '');
  if (!limpo || !hostDaPagina || LOCAIS.has(hostDaPagina)) {
    return limpo;
  }
  let url;
  try {
    url = new URL(limpo);
  } catch {
    return limpo;
  }
  if (!LOCAIS.has(url.hostname)) {
    return limpo;
  }
  if (hostDaPagina.endsWith(DOMINIO_DO_TUNEL)) {
    return `${base.replace(/\/+$/, '')}/${CAMINHO_DO_PROXY}`;
  }
  url.hostname = hostDaPagina;
  return url.toString().replace(/\/+$/, '');
}
