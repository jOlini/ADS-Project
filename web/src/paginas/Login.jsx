import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AvisoFirebase from '../componentes/AvisoFirebase';
import Campo from '../componentes/Campo';
import { firebaseConfigurado } from '../firebase';
import { mensagemDeErro } from '../regras/erros';
import { entrar } from '../servicos/contas';

// Página 2: valida e-mail e senha no Firebase Authentication. Certo: vai para
// a Principal. Errado: mostra na tela que o usuário não está cadastrado.
export default function Login() {
  const navigate = useNavigate();
  // Aviso deixado pela página de cadastro ("Cadastro concluído!").
  const aviso = useLocation().state?.aviso;

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function acessar(evento) {
    evento.preventDefault();
    if (!email.trim() || !senha) {
      setErro('Informe e-mail e senha.');
      return;
    }

    setErro('');
    setEnviando(true);
    try {
      await entrar(email, senha);
      navigate('/principal');
    } catch (falha) {
      setErro(mensagemDeErro(falha.code));
      setEnviando(false);
    }
  }

  if (!firebaseConfigurado) {
    return <AvisoFirebase />;
  }

  return (
    <section className="cartao estreito">
      <h1>Login</h1>

      {aviso && !erro && <p className="mensagem sucesso">{aviso}</p>}

      <form onSubmit={acessar} noValidate>
        <Campo rotulo="E-mail" type="email" name="email" autoComplete="username"
          value={email} onChange={(evento) => setEmail(evento.target.value)} />
        <Campo rotulo="Senha" type="password" name="senha" autoComplete="current-password"
          value={senha} onChange={(evento) => setSenha(evento.target.value)} />

        <button type="submit" disabled={enviando}>
          {enviando ? 'Acessando…' : 'Acessar'}
        </button>

        <p className="mensagem erro" role="alert">
          {erro}
        </p>
      </form>

      <p className="rodape-do-cartao">
        Não tem conta? <Link to="/cadastro">Cadastre-se</Link>
      </p>
    </section>
  );
}
