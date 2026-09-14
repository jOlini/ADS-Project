// Regra de negócio do login, separada da interface.

// As mensagens são exigidas pelo enunciado da Somativa 1 de Tecnologias de
// Desenvolvimento Web. Ficam como constantes exportadas para que o componente
// e os testes usem a mesma fonte, se o texto mudar num lugar, muda nos dois.
export const MENSAGEM_SUCESSO = 'Acessado com sucesso!';
export const MENSAGEM_ERRO = 'Usuário ou senha incorretos!';

export function validarCredenciais(email, senha, credencial) {
  // Primeiro descartamos o que nem chega a ser um e-mail.
  // Isso cobre campo vazio, null, undefined e texto sem arroba.
  if (!email || !email.includes('@')) {
    return MENSAGEM_ERRO;
  }

  // A mensagem é a mesma para e-mail errado e para senha errada, e isso é
  // proposital. Responder "senha incorreta" confirmaria para um atacante
  // que aquele e-mail existe no sistema. Isso se chama enumeração de
  // usuários, e é conteúdo de Sistemas Web Seguros.
  if (email !== credencial.email || senha !== credencial.senha) {
    return MENSAGEM_ERRO;
  }

  return MENSAGEM_SUCESSO;
}
