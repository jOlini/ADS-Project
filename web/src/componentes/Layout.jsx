import { useCallback, useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useToast } from './toast/useToast';
import { firebaseConfigurado } from '../firebase';
import { mensagemDeErro } from '../regras/erros';
import { emailConfirmado } from '../regras/sessao';
import { buscarDadosPessoais, conferirConfirmacao, observarSessao, sair } from '../servicos/contas';
import { apiConfigurada, espacoPessoal } from '../servicos/livroCaixa';

const CARREGANDO = { carregando: true, dados: null, erro: '' };

// Moldura de todas as rotas, sem nada visível. A sessão, os dados pessoais
// (Firestore) e o espaço do livro-caixa (API) são buscados aqui uma vez e
// chegam às páginas pelo contexto da rota. A barra lateral não mora aqui: fica
// na AreaDoCliente, que só a monta com a sessão confirmada, e o login e o
// cadastro ocupam a tela inteira (cada página desenha a sua vitrine).
export default function Layout() {
  const navigate = useNavigate();
  const toast = useToast();
  // undefined enquanto o Firebase ainda não disse se há sessão.
  const [usuario, setUsuario] = useState(firebaseConfigurado ? undefined : null);
  // Guardado à parte: depois do clique no link, o objeto da sessão é o mesmo
  // (o reload() muda o emailVerified por dentro) e o React não perceberia.
  const [confirmado, setConfirmado] = useState(false);
  const [pessoa, setPessoa] = useState(CARREGANDO);
  const [espaco, setEspaco] = useState(CARREGANDO);

  // Perfil (Firestore) e espaço (API): só para a conta com o e-mail confirmado.
  const carregarDaConta = useCallback((atual) => {
    buscarDadosPessoais(atual.uid).then(
      (dados) =>
        setPessoa({ carregando: false, dados, erro: dados ? '' : 'Não há dados pessoais gravados para esta conta.' }),
      (erro) => setPessoa({ carregando: false, dados: null, erro: mensagemDeErro(erro.code) }),
    );
    if (apiConfigurada) {
      espacoPessoal().then(
        (dados) => setEspaco({ carregando: false, dados, erro: '' }),
        (erro) => setEspaco({ carregando: false, dados: null, erro: erro.message }),
      );
    }
  }, []);

  useEffect(() => {
    if (!firebaseConfigurado) {
      return undefined;
    }
    return observarSessao(async (atual) => {
      setUsuario(atual);
      setConfirmado(emailConfirmado(atual));
      if (!atual) {
        setPessoa(CARREGANDO);
        setEspaco(CARREGANDO);
        return;
      }
      if (emailConfirmado(atual)) {
        carregarDaConta(atual);
      }
    });
  }, [carregarDaConta]);

  // "Já confirmei": busca o estado novo no Firebase e, confirmado, abre a área.
  async function conferirEmail() {
    const ok = await conferirConfirmacao();
    if (ok) {
      setConfirmado(true);
      carregarDaConta(usuario);
    }
    return ok;
  }

  async function sairDaConta() {
    try {
      await sair();
    } catch {
      // Sem rede, o signOut pode falhar; os dados do navegador já saíram
      // (contas.sair) e a tela volta ao login do mesmo jeito.
    }
    toast.info('Até a próxima! Os dados do app saíram deste navegador.', { titulo: 'Você saiu da conta' });
    navigate('/login', { replace: true });
  }

  // O botão Sair fica na barra lateral (AreaDoCliente) e chega por aqui.
  const contexto = { usuario, confirmado, pessoa, espaco, sairDaConta, conferirEmail };
  return <Outlet context={contexto} />;
}
