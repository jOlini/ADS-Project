import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AvisoFirebase from '../componentes/AvisoFirebase';
import Campo from '../componentes/Campo';
import Icone from '../componentes/Icone';
import { useToast } from '../componentes/toast/useToast';
import { firebaseConfigurado } from '../firebase';
import { lerCodigo, motivoDaFalha, validarSenhaNova } from '../regras/acaoDaConta';
import { TAMANHO_MINIMO_SENHA } from '../regras/cadastro';
import { mensagemDeErro } from '../regras/erros';
import { emailDoCodigoDeSenha, salvarSenhaNova } from '../servicos/contas';
import { zerarTentativas } from '../servicos/tentativasDeLogin';
import TopoDoAcesso from '../olifine/componentes/TopoDoAcesso';

const FALHAS = {
  vencido: 'Este link venceu. Peça outro: ele chega em instantes.',
  invalido: 'Este link não vale mais: ele já foi usado ou chegou incompleto. Peça outro.',
  'sem-rede': 'Não conseguimos falar com o servidor de login. Confira a internet e abra o link de novo.',
  desconhecido: 'Algo falhou do nosso lado. Abra o link de novo em instantes ou peça outro.',
};

// /auth/redefinir-senha: destino do link de "Esqueci minha senha", no lugar da
// página genérica do Firebase. Confere o código, pede a senha nova duas vezes
// e salva.
export default function RedefinirSenha() {
  const { hash, search, pathname } = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [codigo] = useState(() => lerCodigo(hash, search));
  // conferindo | formulario | falhou
  const [situacao, setSituacao] = useState(codigo ? 'conferindo' : 'falhou');
  const [falha, setFalha] = useState(codigo ? '' : FALHAS.invalido);
  const [email, setEmail] = useState('');
  const [dados, setDados] = useState({ senha: '', repeticao: '' });
  const [erros, setErros] = useState({});
  const [mensagem, setMensagem] = useState('');
  const [salvando, setSalvando] = useState(false);

  // O código sai do endereço: não fica no histórico nem em quem olhar a tela.
  useEffect(() => {
    if (hash || search) {
      navigate(pathname, { replace: true });
    }
  }, [hash, search, pathname, navigate]);

  // Conferir o código não o gasta (é só leitura): o StrictMode pode repetir.
  useEffect(() => {
    if (!codigo || !firebaseConfigurado) {
      return;
    }
    emailDoCodigoDeSenha(codigo).then(
      (dono) => {
        setEmail(dono);
        setSituacao('formulario');
      },
      (erro) => {
        setFalha(FALHAS[motivoDaFalha(erro.code)]);
        setSituacao('falhou');
      },
    );
  }, [codigo]);

  function alterar(evento) {
    const { name, value } = evento.target;
    setDados((atuais) => ({ ...atuais, [name]: value }));
  }

  async function salvar(evento) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    setMensagem('');
    const encontrados = validarSenhaNova(dados);
    setErros(encontrados);
    const primeiro = ['senha', 'repeticao'].find((campo) => encontrados[campo]);
    if (primeiro) {
      formulario.elements[primeiro].focus();
      return;
    }

    setSalvando(true);
    try {
      await salvarSenhaNova(codigo, dados.senha);
      // As senhas erradas contadas neste navegador eram da senha antiga.
      zerarTentativas(email);
      toast.sucesso('Entre com a senha nova.', { titulo: 'Senha nova salva' });
      navigate('/login', { replace: true });
    } catch (erro) {
      const motivo = motivoDaFalha(erro.code);
      if (motivo === 'vencido' || motivo === 'invalido') {
        setFalha(FALHAS[motivo]);
        setSituacao('falhou');
        return;
      }
      setMensagem(mensagemDeErro(erro.code));
      setSalvando(false);
    }
  }

  if (!firebaseConfigurado) {
    return <AvisoFirebase />;
  }

  return (
    <div className="acesso">
      <div className="acesso-coluna">
        <TopoDoAcesso />

        {situacao === 'formulario' ? (
          <section className="acesso-formulario" aria-labelledby="titulo-senha-nova">
            <header className="acesso-cabecalho">
              <h1 id="titulo-senha-nova">Criar senha nova</h1>
              <p className="discreto">
                Para a conta <b>{email}</b>.
              </p>
            </header>

            <form onSubmit={salvar} noValidate>
              {/* Campo escondido com o e-mail: o gerenciador de senhas do navegador
                  sabe de qual conta é a senha nova e oferece para atualizar. */}
              <input type="email" name="usuario" autoComplete="username" value={email} readOnly hidden />
              <Campo rotulo="Senha nova" type="password" name="senha" autoComplete="new-password"
                dica={`Pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`}
                value={dados.senha} onChange={alterar} erro={erros.senha} />
              <Campo rotulo="Repita a senha nova" type="password" name="repeticao" autoComplete="new-password"
                value={dados.repeticao} onChange={alterar} erro={erros.repeticao} />

              <p className="mensagem erro" role="alert">
                {mensagem}
              </p>

              <button type="submit" className="largo" disabled={salvando} aria-busy={salvando}>
                {salvando ? 'Salvando…' : 'Salvar senha nova'}
              </button>
            </form>
          </section>
        ) : (
          <section className="acesso-formulario" aria-labelledby="titulo-senha-nova" aria-live="polite">
            <span className={`selo-da-acao ${situacao === 'falhou' ? 'falhou' : ''}`} aria-hidden="true">
              <Icone nome={situacao === 'falhou' ? 'alerta' : 'cadeado'} tamanho={26} />
            </span>
            <header className="acesso-cabecalho">
              <h1 id="titulo-senha-nova">{situacao === 'falhou' ? 'Não deu para usar este link' : 'Conferindo o link…'}</h1>
              <p className="discreto">{situacao === 'falhou' ? falha : 'Só um instante.'}</p>
            </header>
            {situacao === 'falhou' && (
              <Link className="botao largo" to="/auth/esqueci-a-senha">
                Pedir outro link
              </Link>
            )}
          </section>
        )}

        <p className="rodape-do-formulario">
          Lembrou a senha? <Link to="/login">Entrar</Link>
        </p>
      </div>

      <aside className="vitrine" aria-label="Sobre a senha nova">
        <p className="frase">
          <span>Senha nova,</span>
          <span>mesma conta.</span>
        </p>
        <p className="apoio">
          Seus lançamentos, contas e metas continuam onde estavam. Só a senha muda, e as outras sessões abertas precisam
          entrar de novo.
        </p>
      </aside>
    </div>
  );
}
