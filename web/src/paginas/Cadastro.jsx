import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AvisoFirebase from '../componentes/AvisoFirebase';
import Campo from '../componentes/Campo';
import { useToast } from '../componentes/toast/useToast';
import { firebaseConfigurado } from '../firebase';
import { validarCadastro } from '../regras/cadastro';
import { mensagemDeErro } from '../regras/erros';
import { cadastrar } from '../servicos/contas';

const FORMULARIO_VAZIO = { email: '', senha: '', nome: '', sobrenome: '', dataNascimento: '' };

// Página 1: cria o usuário no Firebase Authentication (e-mail/senha) e grava
// nome, sobrenome, data de nascimento e uid no Firestore.
export default function Cadastro() {
  const navigate = useNavigate();
  const toast = useToast();
  const [dados, setDados] = useState(FORMULARIO_VAZIO);
  const [erros, setErros] = useState({});
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);

  function alterar(evento) {
    const { name, value } = evento.target;
    setDados((atuais) => ({ ...atuais, [name]: value }));
  }

  async function cadastrarUsuario(evento) {
    evento.preventDefault();
    setMensagem('');

    const encontrados = validarCadastro(dados);
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) {
      return;
    }

    setEnviando(true);
    try {
      await cadastrar(dados);
      toast.sucesso('Entre com seu e-mail e senha para acessar a página principal.', {
        titulo: 'Cadastro concluído',
      });
      navigate('/login');
    } catch (erro) {
      const texto = mensagemDeErro(erro.code);
      setMensagem(texto);
      toast.erro(texto, { titulo: 'Cadastro não concluído' });
      setEnviando(false);
    }
  }

  if (!firebaseConfigurado) {
    return <AvisoFirebase />;
  }

  return (
    <section className="cartao estreito">
      <header className="cabecalho-do-cartao">
        <span className="rotulo">Área do cliente</span>
        <h1>Criar conta</h1>
        <p className="discreto">Seus dados ficam no Firebase, protegidos pelas regras do Firestore.</p>
      </header>

      <form onSubmit={cadastrarUsuario} noValidate>
        <Campo rotulo="E-mail" type="email" name="email" autoComplete="email"
          value={dados.email} onChange={alterar} erro={erros.email} />
        <Campo rotulo="Senha" type="password" name="senha" autoComplete="new-password"
          value={dados.senha} onChange={alterar} erro={erros.senha} />
        <div className="duas-colunas">
          <Campo rotulo="Nome" name="nome" autoComplete="given-name"
            value={dados.nome} onChange={alterar} erro={erros.nome} />
          <Campo rotulo="Sobrenome" name="sobrenome" autoComplete="family-name"
            value={dados.sobrenome} onChange={alterar} erro={erros.sobrenome} />
        </div>
        <Campo rotulo="Data de nascimento" type="date" name="dataNascimento" autoComplete="bday"
          value={dados.dataNascimento} onChange={alterar} erro={erros.dataNascimento} />

        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Cadastrando…' : 'Cadastrar'}
        </button>

        <p className="mensagem erro" role="alert">
          {mensagem}
        </p>
      </form>

      <p className="rodape-do-cartao">
        Já tem conta? <Link to="/login">Entrar</Link>
      </p>
    </section>
  );
}
