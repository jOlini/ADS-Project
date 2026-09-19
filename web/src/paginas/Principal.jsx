import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AvisoFirebase from '../componentes/AvisoFirebase';
import { useToast } from '../componentes/toast/useToast';
import { firebaseConfigurado } from '../firebase';
import { formatarData } from '../regras/datas';
import { mensagemDeErro } from '../regras/erros';
import { buscarDadosPessoais, observarSessao, sair } from '../servicos/contas';

// Página 3: busca no Firestore e mostra nome, sobrenome e data de nascimento
// do usuário logado. Sem sessão, volta para o login.
export default function Principal() {
  const navigate = useNavigate();
  const toast = useToast();
  const [estado, setEstado] = useState({ carregando: true, dados: null, erro: '' });

  useEffect(() => {
    if (!firebaseConfigurado) {
      return undefined;
    }

    // O Firebase restaura a sessão de forma assíncrona depois de recarregar a
    // página; por isso espera o aviso em vez de ler auth.currentUser direto.
    return observarSessao(async (usuario) => {
      if (!usuario) {
        navigate('/login', { replace: true });
        return;
      }
      try {
        const dados = await buscarDadosPessoais(usuario.uid);
        setEstado({
          carregando: false,
          dados,
          erro: dados ? '' : 'Não há dados pessoais gravados para esta conta.',
        });
      } catch (erro) {
        setEstado({ carregando: false, dados: null, erro: mensagemDeErro(erro.code) });
      }
    });
  }, [navigate]);

  async function sairDaConta() {
    await sair();
    toast.info('Até a próxima!', { titulo: 'Você saiu da conta' });
    navigate('/login', { replace: true });
  }

  if (!firebaseConfigurado) {
    return <AvisoFirebase />;
  }

  if (estado.carregando) {
    return (
      <section className="cartao estreito carregando" aria-busy="true">
        <span className="esqueleto circulo" />
        <span className="esqueleto linha larga" />
        <span className="esqueleto linha" />
        <span className="esqueleto linha" />
      </section>
    );
  }

  const { dados } = estado;
  const iniciais = dados ? `${dados.nome[0] ?? ''}${dados.sobrenome[0] ?? ''}`.toUpperCase() : '?';

  return (
    <section className="cartao estreito">
      <header className="perfil">
        <span className="avatar" aria-hidden="true">
          {iniciais}
        </span>
        <div>
          <span className="rotulo">Página principal</span>
          <h1>{dados ? `Olá, ${dados.nome}!` : 'Olá!'}</h1>
        </div>
      </header>

      {dados && (
        <dl className="dados-pessoais">
          <div>
            <dt>Nome</dt>
            <dd>{dados.nome}</dd>
          </div>
          <div>
            <dt>Sobrenome</dt>
            <dd>{dados.sobrenome}</dd>
          </div>
          <div>
            <dt>Data de nascimento</dt>
            <dd>{formatarData(dados.dataNascimento)}</dd>
          </div>
        </dl>
      )}

      {estado.erro && (
        <p className="mensagem erro" role="alert">
          {estado.erro}
        </p>
      )}

      <button type="button" className="secundario" onClick={sairDaConta}>
        Sair
      </button>
    </section>
  );
}
