// Link de confirmação do e-mail: quando mandar um novo sem a pessoa pedir e
// quanto falta para o "Reenviar" liberar.
//
// O cadastro manda o link só para a conta que ele acabou de criar. Chegam à
// tela de confirmação sem link nenhum: a conta criada antes da confirmação
// existir, a conta cujo envio falhou no cadastro e o dono de uma conta que
// tentou se cadastrar de novo com o mesmo e-mail (o cadastro não manda link
// para conta existente, senão revelaria quem tem cadastro). Por isso a tela
// manda o link sozinha quando este navegador não mandou um há pouco.

// Espera entre dois envios. O Firebase também limita do lado dele
// (auth/too-many-requests); a espera na tela evita chegar lá por clique
// repetido.
export const ESPERA_ENTRE_ENVIOS_EM_S = 60;

// Link mandado há menos tempo que isto ainda está a caminho ou na caixa de
// entrada: abrir a tela de novo (F5, login logo depois do cadastro) não manda
// outro.
export const VALIDADE_DO_ULTIMO_ENVIO_EM_MIN = 10;

const instanteValido = (ultimoEnvio, agora) => Number.isFinite(ultimoEnvio) && ultimoEnvio <= agora;

// ultimoEnvio: instante (ms) do último link mandado deste navegador, ou null.
export function precisaDeLinkNovo(ultimoEnvio, agora) {
  if (!instanteValido(ultimoEnvio, agora)) {
    return true;
  }
  return agora - ultimoEnvio >= VALIDADE_DO_ULTIMO_ENVIO_EM_MIN * 60 * 1000;
}

// Segundos até o "Reenviar" liberar (0 = liberado).
export function segundosParaReenviar(ultimoEnvio, agora) {
  if (!instanteValido(ultimoEnvio, agora)) {
    return 0;
  }
  const passados = Math.floor((agora - ultimoEnvio) / 1000);
  return Math.max(0, ESPERA_ENTRE_ENVIOS_EM_S - passados);
}
