import { useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import AvisoFirebase from '../componentes/AvisoFirebase';
import Campo from '../componentes/Campo';
import { firebaseConfigurado } from '../firebase';
import { validarCadastro } from '../regras/cadastro';
import { mensagemDeErro } from '../regras/erros';
import { pedirNovaSenha } from '../servicos/contas';
import TopoDoAcesso from '../olifine/componentes/TopoDoAcesso';

// /auth/esqueci-a-senha: pede o link para criar uma senha nova. A resposta é a
// mesma com e sem conta para o e-mail (nada de "e-mail não cadastrado"): senão
// esta tela serviria para descobrir quem usa a OliFine.
export default function EsqueciASenha() {
  const { usuario } = useOutletContext();
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [erro, setErro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [enviadoPara, setEnviadoPara] = useState('');

  async function pedir(evento) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    setMensagem('');
    // Mesma regra de e-mail do cadastro.
    const problema = validarCadastro({ email }).email ?? '';
    setErro(problema);
    if (problema) {
      formulario.elements.email.focus();
      return;
    }

    setEnviando(true);
    try {
      await pedirNovaSenha(email);
      setEnviadoPara(email.trim());
    } catch (falha) {
      setMensagem(mensagemDeErro(falha.code));
    }
    setEnviando(false);
  }

  if (!firebaseConfigurado) {
    return <AvisoFirebase />;
  }

  return (
    <div className="acesso">
      <div className="acesso-coluna">
        <TopoDoAcesso />

        <section className="acesso-formulario" aria-labelledby="titulo-esqueci">
          <header className="acesso-cabecalho">
            <h1 id="titulo-esqueci">Esqueci minha senha</h1>
            <p className="discreto">Mandamos um link para você criar uma senha nova.</p>
          </header>

          {enviadoPara ? (
            <>
              <p className="mensagem info" role="status">
                Se houver uma conta com <b>{enviadoPara}</b>, o link chega em instantes. Confira também o spam. O link
                vale por tempo limitado e só uma vez.
              </p>
              <button type="button" className="secundario largo" onClick={() => setEnviadoPara('')}>
                Usar outro e-mail
              </button>
            </>
          ) : (
            <form onSubmit={pedir} noValidate>
              <Campo rotulo="E-mail da conta" type="email" name="email" autoComplete="username" inputMode="email"
                value={email} onChange={(evento) => setEmail(evento.target.value)} erro={erro} />

              <p className="mensagem erro" role="alert">
                {mensagem}
              </p>

              <button type="submit" className="largo" disabled={enviando} aria-busy={enviando}>
                {enviando ? 'Enviando…' : 'Mandar o link'}
              </button>
            </form>
          )}
        </section>

        <p className="rodape-do-formulario">
          Lembrou a senha? <Link to="/login">Entrar</Link>
        </p>
      </div>

      <aside className="vitrine" aria-label="Sobre a senha nova">
        <p className="frase">
          <span>Acontece.</span>
          <span>Um link resolve.</span>
        </p>
        <p className="apoio">
          O link chega no e-mail da conta e só funciona uma vez. A OliFine nunca pede a sua senha por e-mail, mensagem
          ou telefone.
        </p>
      </aside>
    </div>
  );
}
