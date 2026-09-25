import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AvisoFirebase from '../componentes/AvisoFirebase';
import Campo from '../componentes/Campo';
import SeletorDeData from '../componentes/SeletorDeData';
import { useToast } from '../componentes/toast/useToast';
import { firebaseConfigurado } from '../firebase';
import { ORDEM_DO_CADASTRO, TAMANHO_MINIMO_SENHA, primeiroCampoComErro, validarCadastro } from '../regras/cadastro';
import { hojeIso } from '../regras/datas';
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
    const formulario = evento.currentTarget;
    setMensagem('');

    const encontrados = validarCadastro(dados);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DO_CADASTRO);
    if (primeiro) {
      formulario.elements[primeiro].focus();
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
    <div className="acesso">
      <div className="acesso-coluna">
        <Link to="/login" className="marca">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="28" height="28" />
          <span>Pessoal Finance</span>
        </Link>

        <section className="acesso-formulario" aria-labelledby="titulo-cadastro">
          <header className="acesso-cabecalho">
            <h1 id="titulo-cadastro">Criar conta</h1>
            <p className="discreto">Todos os campos são obrigatórios.</p>
          </header>

          <form onSubmit={cadastrarUsuario} noValidate>
            <Campo rotulo="E-mail" type="email" name="email" autoComplete="email" inputMode="email"
              value={dados.email} onChange={alterar} erro={erros.email} />
            <Campo rotulo="Senha" type="password" name="senha" autoComplete="new-password"
              dica={`Pelo menos ${TAMANHO_MINIMO_SENHA} caracteres.`}
              value={dados.senha} onChange={alterar} erro={erros.senha} />
            <div className="duas-colunas">
              <Campo rotulo="Nome" name="nome" autoComplete="given-name" maxLength={100}
                value={dados.nome} onChange={alterar} erro={erros.nome} />
              <Campo rotulo="Sobrenome" name="sobrenome" autoComplete="family-name" maxLength={100}
                value={dados.sobrenome} onChange={alterar} erro={erros.sobrenome} />
            </div>
            <Campo elemento={SeletorDeData} rotulo="Data de nascimento" name="dataNascimento" autoComplete="bday"
              min="1900-01-01" max={hojeIso()} visaoInicial="anos"
              value={dados.dataNascimento} onChange={alterar} erro={erros.dataNascimento} />

            <p className="mensagem erro" role="alert">
              {mensagem}
            </p>

            <button type="submit" className="largo" disabled={enviando} aria-busy={enviando}>
              {enviando ? 'Criando conta…' : 'Criar conta'}
            </button>
          </form>
        </section>

        <p className="rodape-do-formulario">
          Já tem conta? <Link to="/login">Entrar</Link>
        </p>
      </div>

      <aside className="vitrine" aria-label="O que você vai ver depois de entrar">
        <p className="frase">
          <span>Seus dados,</span>
          <span>só para você.</span>
        </p>
        <p className="apoio">
          Nome, sobrenome e data de nascimento aparecem na sua página principal. Só a sua conta tem acesso a eles.
        </p>
        <div className="amostra" aria-hidden="true">
          <header>
            <span>Resumo de setembro</span>
            <span>exemplo</span>
          </header>
          <div>
            <span>Entradas</span>
            <b>R$ 7.350,00</b>
          </div>
          <div>
            <span>Saídas</span>
            <b>R$ 4.912,48</b>
          </div>
          <div>
            <span>Sobra do mês</span>
            <b>R$ 2.437,52</b>
          </div>
        </div>
      </aside>
    </div>
  );
}
