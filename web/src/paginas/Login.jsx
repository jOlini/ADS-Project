import { useState } from 'react';
import { Link, Navigate, useNavigate, useOutletContext } from 'react-router-dom';
import AvisoFirebase from '../componentes/AvisoFirebase';
import Campo from '../componentes/Campo';
import { useToast } from '../componentes/toast/useToast';
import { firebaseConfigurado } from '../firebase';
import { mensagemDeErro } from '../regras/erros';
import { entrar } from '../servicos/contas';

// Página 2: valida e-mail e senha no Firebase Authentication. Certo: vai para
// a Principal. Errado: mostra na tela que o usuário não está cadastrado.
export default function Login() {
  const navigate = useNavigate();
  const toast = useToast();
  const { usuario } = useOutletContext();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [faltando, setFaltando] = useState({});
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function acessar(evento) {
    evento.preventDefault();
    const formulario = evento.currentTarget;

    // Campo vazio é marcado no próprio campo, e o foco vai até ele.
    const vazios = {
      ...(email.trim() ? {} : { email: 'Informe o e-mail.' }),
      ...(senha ? {} : { senha: 'Informe a senha.' }),
    };
    setFaltando(vazios);
    const primeiro = Object.keys(vazios)[0];
    if (primeiro) {
      setErro('');
      formulario.elements[primeiro].focus();
      return;
    }

    setErro('');
    setEnviando(true);
    try {
      await entrar(email, senha);
      toast.sucesso('Sessão iniciada.', { titulo: 'Login realizado' });
      // replace: o botão Voltar não traz o formulário de login de volta.
      navigate('/principal', { replace: true });
    } catch (falha) {
      // A mensagem fica fixa no formulário, como pede o enunciado.
      setErro(mensagemDeErro(falha.code));
      setEnviando(false);
    }
  }

  if (!firebaseConfigurado) {
    return <AvisoFirebase />;
  }
  // Sessão ainda aberta nesta aba (recarga da página): vai direto para a área
  // logada, sem mostrar o formulário.
  if (usuario) {
    return <Navigate to="/principal" replace />;
  }

  return (
    <div className="acesso">
      <div className="acesso-coluna">
        <Link to="/login" className="marca">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
          <span>Pessoal Finance</span>
        </Link>

        <section className="acesso-formulario" aria-labelledby="titulo-login">
          <header className="acesso-cabecalho">
            <h1 id="titulo-login">Entrar</h1>
            <p className="discreto">Use o e-mail e a senha da sua conta.</p>
          </header>

          <form onSubmit={acessar} noValidate>
            <Campo rotulo="E-mail" type="email" name="email" autoComplete="username" inputMode="email"
              value={email} onChange={(evento) => setEmail(evento.target.value)} erro={faltando.email} />
            <Campo rotulo="Senha" type="password" name="senha" autoComplete="current-password"
              value={senha} onChange={(evento) => setSenha(evento.target.value)} erro={faltando.senha} />

            <p className="mensagem erro" role="alert">
              {erro}
            </p>

            <button type="submit" className="largo" disabled={enviando} aria-busy={enviando}>
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>
        </section>

        <p className="rodape-do-formulario">
          Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
        </p>
      </div>

      <aside className="vitrine" aria-label="Sobre o Pessoal Finance">
        <p className="frase">
          <span>Quanto entra,</span>
          <span>quanto sai,</span>
          <span>quanto sobra.</span>
        </p>
        <p className="apoio">
          Seu dinheiro em um lugar só, sem planilha e sem ligar o aplicativo ao banco.
        </p>
        <div className="amostra" aria-hidden="true">
          <header>
            <span>Extrato de setembro</span>
            <span>exemplo</span>
          </header>
          <div>
            <span>Salário</span>
            <b>+ R$ 6.800,00</b>
          </div>
          <div>
            <span>Aluguel</span>
            <b>− R$ 1.850,00</b>
          </div>
          <div>
            <span>Supermercado</span>
            <b>− R$ 214,37</b>
          </div>
        </div>
      </aside>
    </div>
  );
}
