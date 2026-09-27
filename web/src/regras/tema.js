// Tema claro ou escuro da área do cliente, escolhido pelo botão do topo.
//
// Sem escolha salva, vale o do sistema (prefers-color-scheme). A escolha fica
// no navegador (olifine:tema) e é a única preferência que sobrevive ao logout
// (regras/dadosLocais.js): não diz nada sobre a pessoa.
//
// A mesma leitura roda antes da primeira pintura em public/tema.js, um script
// clássico que não importa módulo; a regra testada é esta.

export const TEMAS = ['claro', 'escuro'];

export const temaValido = (tema) => TEMAS.includes(tema);

export function temaInicial(salvo, sistemaEscuro) {
  if (temaValido(salvo)) {
    return salvo;
  }
  return sistemaEscuro ? 'escuro' : 'claro';
}

export const outroTema = (tema) => (tema === 'escuro' ? 'claro' : 'escuro');

// Cor da barra do navegador no celular (<meta name="theme-color">): a mesma
// da barra do topo em cada tema (--superficie em estilos/tokens.css).
export const COR_DA_BARRA = { claro: '#ffffff', escuro: '#131c18' };
