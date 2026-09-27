// Tema antes da primeira pintura. Carregado sem defer no <head> do
// index.html: sem ele, quem escolheu o modo escuro veria a tela clara piscar
// até o React carregar. Script clássico (não importa módulo), então repete a
// leitura de src/regras/tema.js, que é a regra testada.
(() => {
  let tema = null;
  try {
    tema = localStorage.getItem('olifine:tema');
  } catch {
    // Navegador sem acesso ao armazenamento: segue o sistema.
  }
  if (tema !== 'claro' && tema !== 'escuro') {
    tema = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
  }
  document.documentElement.dataset.tema = tema;
})();
