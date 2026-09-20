// Validação do formulário de cadastro, separada da interface para ser
// testada sem renderizar componente (mesma ideia da antiga validacao.js).
import { dataExiste, hojeIso } from './datas';

// O Firebase Authentication recusa senha com menos de 6 caracteres
// (auth/weak-password). Validar antes poupa uma ida à rede.
export const TAMANHO_MINIMO_SENHA = 6;

const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Devolve um objeto { campo: mensagem } só com os campos inválidos.
// Objeto vazio significa formulário válido.
export function validarCadastro(dados, agora = new Date()) {
  const { email, senha, nome, sobrenome, dataNascimento } = dados;
  const erros = {};

  if (!email?.trim()) {
    erros.email = 'Informe o e-mail.';
  } else if (!FORMATO_EMAIL.test(email.trim())) {
    erros.email = 'E-mail inválido.';
  }

  if (!senha) {
    erros.senha = 'Informe a senha.';
  } else if (senha.length < TAMANHO_MINIMO_SENHA) {
    erros.senha = `A senha precisa de pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`;
  }

  if (!nome?.trim()) {
    erros.nome = 'Informe o nome.';
  }

  if (!sobrenome?.trim()) {
    erros.sobrenome = 'Informe o sobrenome.';
  }

  if (!dataNascimento) {
    erros.dataNascimento = 'Informe a data de nascimento.';
  } else if (!dataExiste(dataNascimento) || dataNascimento < '1900-01-01') {
    erros.dataNascimento = 'Data de nascimento inválida.';
  } else if (dataNascimento > hojeIso(agora)) {
    erros.dataNascimento = 'A data de nascimento não pode estar no futuro.';
  }

  return erros;
}

// Ordem em que os campos aparecem na tela. Depois de um envio com erro, o
// foco vai para o primeiro campo inválido nessa ordem, e não para o botão.
export const ORDEM_DO_CADASTRO = ['email', 'senha', 'nome', 'sobrenome', 'dataNascimento'];

// Devolve o nome do primeiro campo com erro, na ordem dada, ou null.
export function primeiroCampoComErro(erros, ordem) {
  return ordem.find((campo) => Boolean(erros[campo])) ?? null;
}
