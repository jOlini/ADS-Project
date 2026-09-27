// Onde o app é publicado. O mesmo código roda no GitHub Pages de projeto
// (https://jolini.github.io/ADS-Project/) e na raiz de um domínio próprio ou
// do container (https://<domínio>/). Quem escolhe é a variável VITE_BASE do
// build (vite.config.js); o React Router, os arquivos e os links seguem o
// BASE_URL que o Vite grava no bundle, sem caminho escrito à mão no código.
export const BASE_DO_PAGES = '/ADS-Project/';

// "/", "app", "/app" e "/app/" viram "/" e "/app/": o Vite exige a barra nas
// duas pontas. Vazio fica com o caminho do Pages, que é o site publicado hoje.
// Endereço completo, letra de disco (o Git Bash do Windows troca "/" por
// "C:/Program Files/Git/"), espaço, "..", "?" ou "#" param o build: a base
// errada publicaria um site em branco (os arquivos seriam procurados em outro
// lugar).
export function normalizarBase(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) {
    return BASE_DO_PAGES;
  }
  if (/[?#\\:\s]|(^|\/)\.\.?(\/|$)/.test(texto)) {
    throw new Error(`VITE_BASE inválido: "${texto}". Use um caminho, como / ou /ADS-Project/.`);
  }
  const partes = texto.split('/').filter(Boolean);
  return partes.length ? `/${partes.join('/')}/` : '/';
}

// Link com o caminho do Pages (e-mail já enviado, favorito, redirecionamento
// do Pages para o domínio próprio) aberto num app publicado em outro caminho:
// devolve o mesmo endereço sem o /ADS-Project do começo, com a consulta e o
// fragmento (o #oobCode= dos links de e-mail) intactos. null quando não há o
// que trocar.
export function enderecoSemBaseAntiga({ pathname, search = '', hash = '' }, base) {
  const antiga = BASE_DO_PAGES.slice(0, -1);
  if (base === BASE_DO_PAGES || (pathname !== antiga && !pathname.startsWith(BASE_DO_PAGES))) {
    return null;
  }
  // Base dentro do caminho antigo (/ADS-Project/app/): o endereço já é dela.
  if (base !== '/' && pathname.startsWith(base)) {
    return null;
  }
  return `${base}${pathname.slice(BASE_DO_PAGES.length)}${search}${hash}`;
}
