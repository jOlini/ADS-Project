import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AvisoFirebase from '../componentes/AvisoFirebase';
import { firebaseConfigurado } from '../firebase';
import { formatarData } from '../regras/datas';
import { mensagemDeErro } from '../regras/erros';
import { buscarDadosPessoais, observarSessao, sair } from '../servicos/contas';

// Página 3: busca no Firestore e mostra nome, sobrenome e data de nascimento
// do usuário logado. Sem sessão, volta para o login.
export default function Principal() {
  const navigate = useNavigate();
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
    navigate('/login', { replace: true });
  }

  if (!firebaseConfigurado) {
    return <AvisoFirebase />;
  }

  if (estado.carregando) {
    return <p className="discreto">Carregando seus dados…</p>;
  }

  const { dados } = estado;

  return (
    <section className="cartao estreito">
      <h1>{dados ? `Olá, ${dados.nome}!` : 'Página principal'}</h1>

      {dados && (
        <dl className="dados-pessoais">
          <dt>Nome</dt>
          <dd>{dados.nome}</dd>
          <dt>Sobrenome</dt>
          <dd>{dados.sobrenome}</dd>
          <dt>Data de nascimento</dt>
          <dd>{formatarData(dados.dataNascimento)}</dd>
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
