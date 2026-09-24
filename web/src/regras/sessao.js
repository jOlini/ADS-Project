// Decide o que as rotas mostram conforme a sessão do Firebase. Fica fora dos
// componentes para ser testada sem navegador (regras/sessao.test.js).
//
// Estados de "usuario" vindos do Layout:
//   undefined -> o Firebase ainda não respondeu se há sessão;
//   null      -> não há sessão;
//   objeto    -> há sessão (conta do Firebase Authentication).

// Área logada (barra lateral + páginas do cliente). A barra lateral só é
// montada em "liberada": com a sessão confirmada e o perfil já lido no
// Firestore. A leitura do perfil é a primeira ida ao servidor com o token da
// sessão restaurada; antes dela, nada da área logada aparece.
export function situacaoDaArea({ firebaseConfigurado, usuario, pessoa }) {
  if (!firebaseConfigurado) {
    return 'sem-firebase';
  }
  if (usuario === undefined || (usuario && pessoa?.carregando)) {
    return 'verificando';
  }
  return usuario ? 'liberada' : 'sem-sessao';
}
