// Decide o que as rotas mostram conforme a sessão do Firebase. Fica fora dos
// componentes para ser testada sem navegador (regras/sessao.test.js).
//
// Estados de "usuario" vindos do Layout:
//   undefined -> o Firebase ainda não respondeu se há sessão;
//   null      -> não há sessão;
//   objeto    -> há sessão (conta do Firebase Authentication).

// A conta só entra na área logada com o e-mail confirmado pelo link que o
// cadastro manda. "true" estrito: ausente conta como não confirmado.
export function emailConfirmado(usuario) {
  return usuario?.emailVerified === true;
}

// Área logada (barra lateral + páginas do cliente). A barra lateral só é
// montada em "liberada": com a sessão confirmada, o e-mail confirmado e o
// perfil já lido no Firestore. A leitura do perfil é a primeira ida ao
// servidor com o token da sessão restaurada; antes dela, nada da área logada
// aparece. Sem o e-mail confirmado ("sem-confirmacao"), a área nem busca o
// perfil: mostra só a tela que pede a confirmação.
export function situacaoDaArea({ firebaseConfigurado, usuario, confirmado, pessoa }) {
  if (!firebaseConfigurado) {
    return 'sem-firebase';
  }
  if (usuario === undefined) {
    return 'verificando';
  }
  if (!usuario) {
    return 'sem-sessao';
  }
  if (!confirmado) {
    return 'sem-confirmacao';
  }
  return pessoa?.carregando ? 'verificando' : 'liberada';
}
