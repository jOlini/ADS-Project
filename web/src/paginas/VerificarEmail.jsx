import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import AvisoFirebase from '../componentes/AvisoFirebase';
import Icone from '../componentes/Icone';
import { firebaseConfigurado } from '../firebase';
import { lerCodigo, motivoDaFalha } from '../regras/acaoDaConta';
import { aplicarConfirmacao } from '../servicos/contas';
import TopoDoAcesso from '../olifine/componentes/TopoDoAcesso';

// Textos de cada situação do link. O "invalido" cobre também o link já usado:
// o Firebase não distingue os dois, e quem clicou duas vezes já confirmou.
const TEXTOS = {
  conferindo: { selo: 'relogio', titulo: 'Confirmando o seu e-mail…', texto: 'Só um instante.' },
  confirmado: {
    selo: 'certo',
    titulo: 'E-mail confirmado',
    texto: 'Tudo certo: a sua conta está liberada.',
  },
  vencido: {
    selo: 'alerta',
    titulo: 'Este link venceu',
    texto: 'Entre com seu e-mail e senha: se ainda faltar confirmar, mandamos um link novo na hora.',
  },
  invalido: {
    selo: 'alerta',
    titulo: 'Este link não vale mais',
    texto: 'Ele já foi usado ou chegou incompleto. Se você já confirmou, é só entrar; se não, entre e pedimos outro.',
  },
  'sem-rede': {
    selo: 'alerta',
    titulo: 'Sem conexão',
    texto: 'Não conseguimos falar com o servidor de login. Confira a internet e tente de novo.',
  },
  desconhecido: {
    selo: 'alerta',
    titulo: 'Não deu para confirmar',
    texto: 'Algo falhou do nosso lado. Tente de novo em instantes.',
  },
};

// /auth/verificar-email: destino do link de confirmação do e-mail, no lugar
// da página genérica do Firebase. Aplica o código assim que abre.
export default function VerificarEmail() {
  const { hash, search, pathname } = useLocation();
  const navigate = useNavigate();
  const { usuario, confirmado, conferirEmail } = useOutletContext();
  // Lido uma vez: logo depois, o código sai do endereço (efeito abaixo).
  const [codigo] = useState(() => lerCodigo(hash, search));
  const [situacao, setSituacao] = useState(codigo ? 'conferindo' : 'invalido');
  const [tentativa, setTentativa] = useState(0);
  // O código vale uma vez só: o StrictMode, que roda o efeito duas vezes no
  // desenvolvimento, faria a segunda chamada falhar e mostrar "não vale mais".
  const aplicado = useRef(-1);
  const sessaoAtualizada = useRef(false);

  useEffect(() => {
    if (hash || search) {
      navigate(pathname, { replace: true });
    }
  }, [hash, search, pathname, navigate]);

  useEffect(() => {
    if (!codigo || !firebaseConfigurado || aplicado.current === tentativa) {
      return;
    }
    aplicado.current = tentativa;
    aplicarConfirmacao(codigo).then(
      () => setSituacao('confirmado'),
      (erro) => setSituacao(motivoDaFalha(erro.code)),
    );
  }, [codigo, tentativa]);

  // Link aberto na mesma aba em que a conta está logada: atualiza a sessão,
  // senão a área logada ainda mostraria "Confirme o seu e-mail".
  useEffect(() => {
    if (situacao === 'confirmado' && usuario && !confirmado && !sessaoAtualizada.current) {
      sessaoAtualizada.current = true;
      conferirEmail().catch(() => {
        // Sem rede agora: o "Já confirmei" da área logada resolve depois.
      });
    }
  }, [situacao, usuario, confirmado, conferirEmail]);

  if (!firebaseConfigurado) {
    return <AvisoFirebase />;
  }

  const { selo, titulo, texto } = TEXTOS[situacao];
  const falhou = !['conferindo', 'confirmado'].includes(situacao);
  const podeTentarDeNovo = situacao === 'sem-rede' || situacao === 'desconhecido';

  function tentarDeNovo() {
    setSituacao('conferindo');
    setTentativa((atual) => atual + 1);
  }

  return (
    <div className="acesso">
      <div className="acesso-coluna">
        <TopoDoAcesso />

        <section className="acesso-formulario" aria-labelledby="titulo-verificacao" aria-live="polite">
          <span className={`selo-da-acao ${falhou ? 'falhou' : ''}`} aria-hidden="true">
            <Icone nome={selo} tamanho={26} />
          </span>
          <header className="acesso-cabecalho">
            <h1 id="titulo-verificacao">{titulo}</h1>
            <p className="discreto">{texto}</p>
          </header>

          {situacao === 'confirmado' && (
            <Link className="botao largo" to={usuario ? '/principal' : '/login'}>
              {usuario ? 'Ir para a OliFine' : 'Entrar'}
            </Link>
          )}
          {podeTentarDeNovo && (
            <div className="confirmacao-acoes">
              <button type="button" className="largo" onClick={tentarDeNovo}>
                Tentar de novo
              </button>
            </div>
          )}
          {falhou && !podeTentarDeNovo && (
            <Link className="botao largo" to="/login">
              Entrar
            </Link>
          )}
        </section>

        <p className="rodape-do-formulario">
          Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
        </p>
      </div>

      <aside className="vitrine" aria-label="Sobre a confirmação">
        <p className="frase">
          <span>Endereço confirmado,</span>
          <span>conta protegida.</span>
        </p>
        <p className="apoio">
          A confirmação prova que o e-mail é seu. É por ele que chegam os avisos da conta e o link para criar uma senha
          nova.
        </p>
      </aside>
    </div>
  );
}
