import { useEffect, useRef, useState } from 'react';
import Icone from '../componentes/Icone';
import { useToast } from '../componentes/toast/useToast';
import { ESPERA_ENTRE_ENVIOS_EM_S, precisaDeLinkNovo, segundosParaReenviar } from '../regras/confirmacao';
import { mensagemDeErro } from '../regras/erros';
import { reenviarConfirmacao, ultimoEnvioDoLink } from '../servicos/contas';
import TopoDoAcesso from '../olifine/componentes/TopoDoAcesso';

// Tela da conta logada que ainda não confirmou o e-mail (AreaDoCliente,
// situação "sem-confirmacao"). Nada da área logada é buscado antes da
// confirmação: nem o perfil no Firestore, nem o livro-caixa na API (que
// também recusa, com 403, o token sem email_verified).
export default function ConfirmarEmail({ usuario, aoConferir, aoSair }) {
  const toast = useToast();
  const [conferindo, setConferindo] = useState(false);
  const [mensagem, setMensagem] = useState('');
  // Login logo depois do cadastro: a contagem continua a do link já mandado.
  const [espera, setEspera] = useState(() => segundosParaReenviar(ultimoEnvioDoLink(usuario.uid), Date.now()));
  // O StrictMode roda o efeito duas vezes no desenvolvimento: um envio só.
  const envioAutomatico = useRef(false);

  // Conta que chega aqui sem link recente deste navegador recebe um sem
  // precisar pedir (regras/confirmacao.js explica quem são).
  useEffect(() => {
    if (envioAutomatico.current || !precisaDeLinkNovo(ultimoEnvioDoLink(usuario.uid), Date.now())) {
      return;
    }
    envioAutomatico.current = true;
    reenviarConfirmacao()
      .then(() => {
        setEspera(ESPERA_ENTRE_ENVIOS_EM_S);
        toast.info('Confira a caixa de entrada e o spam.', { titulo: 'Link enviado' });
      })
      .catch((erro) => setMensagem(mensagemDeErro(erro.code)));
  }, [usuario.uid, toast]);

  // Contagem regressiva do "Reenviar".
  useEffect(() => {
    if (espera <= 0) {
      return undefined;
    }
    const relogio = setTimeout(() => setEspera((atual) => atual - 1), 1000);
    return () => clearTimeout(relogio);
  }, [espera]);

  async function conferir() {
    setConferindo(true);
    setMensagem('');
    try {
      const confirmado = await aoConferir();
      if (confirmado) {
        toast.sucesso('Tudo certo com a sua conta.', { titulo: 'E-mail confirmado' });
        return;
      }
      setMensagem('Ainda não recebemos a confirmação. Abra o link do e-mail e tente de novo.');
    } catch (erro) {
      setMensagem(mensagemDeErro(erro.code));
    }
    setConferindo(false);
  }

  async function reenviar() {
    setMensagem('');
    try {
      await reenviarConfirmacao();
      setEspera(ESPERA_ENTRE_ENVIOS_EM_S);
      toast.info('Confira a caixa de entrada e o spam.', { titulo: 'Link reenviado' });
    } catch (erro) {
      setMensagem(mensagemDeErro(erro.code));
    }
  }

  return (
    <div className="acesso">
      <div className="acesso-coluna">
        <TopoDoAcesso />

        <section className="acesso-formulario" aria-labelledby="titulo-confirmacao">
          {/* O mesmo selo das páginas dos links (/auth/...): a pessoa sai daqui
              para o e-mail e volta para uma tela com a mesma cara. */}
          <span className="selo-da-acao" aria-hidden="true">
            <Icone nome="envelope" tamanho={26} />
          </span>
          <header className="acesso-cabecalho">
            <h1 id="titulo-confirmacao">Confirme o seu e-mail</h1>
            <p className="discreto">
              Enviamos um link de confirmação para <b>{usuario.email}</b>. Abra o link (vale também no celular) e
              volte aqui.
            </p>
          </header>

          <p className="mensagem erro" role="alert">
            {mensagem}
          </p>

          <div className="confirmacao-acoes">
            <button type="button" className="largo" onClick={conferir} disabled={conferindo} aria-busy={conferindo}>
              {conferindo ? 'Conferindo…' : 'Já confirmei'}
            </button>
            <button type="button" className="secundario largo" onClick={reenviar} disabled={espera > 0}>
              {espera > 0 ? `Reenviar em ${espera} s` : 'Reenviar o link'}
            </button>
          </div>
        </section>

        <p className="rodape-do-formulario">
          E-mail errado?{' '}
          <button type="button" className="link" onClick={aoSair}>
            Sair e usar outra conta
          </button>
        </p>
      </div>

      <aside className="vitrine" aria-label="Por que confirmar">
        <p className="frase">
          <span>Falta pouco.</span>
          <span>Um clique no e-mail.</span>
        </p>
        <p className="apoio">
          A confirmação prova que o endereço é seu. Assim ninguém cria uma conta no seu nome, e você recebe os avisos
          da sua conta no lugar certo.
        </p>
      </aside>
    </div>
  );
}
