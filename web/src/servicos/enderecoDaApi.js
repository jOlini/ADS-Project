// Endereço da API do livro-caixa visto do navegador.
//
// No web/.env, VITE_API_URL costuma ser http://localhost:8081. Aberto pela rede
// local (http://10.0.0.5:5173 no celular, com o "python subir-app.py up"),
// "localhost" seria o próprio celular, e a API não seria encontrada. Nesse
// caso o endereço passa a usar o IP de onde a página veio: a API roda na mesma
// máquina que serve a página. Um endereço que não é local (API hospedada)
// fica como está.
const LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function enderecoDaApi(configurado, hostDaPagina) {
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
  url.hostname = hostDaPagina;
  return url.toString().replace(/\/+$/, '');
}
