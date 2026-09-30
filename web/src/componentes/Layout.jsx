import { useCallback, useEffect, useMemo, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { useToast } from './toast/useToast';
import { firebaseConfigurado } from '../firebase';
import { mensagemDeErro } from '../regras/erros';
import { escolherEspacoAtivo, espacoDoContexto } from '../regras/espacos';
import { emailConfirmado } from '../regras/sessao';
import { buscarDadosPessoais, conferirConfirmacao, observarSessao, sair } from '../servicos/contas';
import { guardarEspacoAtivo, guardarUltimaEmpresa, lerEspacoAtivo, lerUltimaEmpresa } from '../servicos/espacoAtivo';
import { apiConfigurada, listarEspacos } from '../servicos/livroCaixa';

const CARREGANDO = { carregando: true, dados: null, erro: '' };

// O espaço aberto fica guardado para a próxima visita; a empresa, também como
// a última usada, para a volta de Pessoal a Empresarial.
function guardar(uid, espaco) {
  guardarEspacoAtivo(uid, espaco.id);
  if (espaco.tipo === 'PJ') {
    guardarUltimaEmpresa(uid, espaco.id);
  }
}

// Moldura de todas as rotas, sem nada visível. A sessão, os dados pessoais
// (Firestore) e os espaços do livro-caixa (API) são buscados aqui uma vez e
// chegam às páginas pelo contexto da rota: "espaco" é o espaço ativo (o
// pessoal ou uma empresa do espaço empresarial, escolhidos no topo), "espacos"
// a lista, e trocarEspaco, trocarContexto e recarregarEspacos mudam os dois. A
// barra lateral não mora aqui: fica
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
  const [espacos, setEspacos] = useState(CARREGANDO);
  const [ativoId, setAtivoId] = useState(null);

  // Lista nova (primeiro acesso, espaço criado ou excluído): abre o preferido,
  // se ele existe, e guarda a escolha para a próxima visita.
  const aplicarLista = useCallback((uid, lista, preferido) => {
    const ativo = escolherEspacoAtivo(lista, preferido);
    setEspacos({ carregando: false, dados: lista, erro: '' });
    setAtivoId(ativo?.id ?? null);
    if (ativo) {
      guardar(uid, ativo);
    }
  }, []);

  // Perfil (Firestore) e espaço (API): só para a conta com o e-mail confirmado.
  const carregarDaConta = useCallback((atual) => {
    buscarDadosPessoais(atual.uid).then(
      (dados) =>
        setPessoa({ carregando: false, dados, erro: dados ? '' : 'Não há dados pessoais gravados para esta conta.' }),
      (erro) => setPessoa({ carregando: false, dados: null, erro: mensagemDeErro(erro.code) }),
    );
    if (apiConfigurada) {
      listarEspacos().then(
        (lista) => aplicarLista(atual.uid, lista, lerEspacoAtivo(atual.uid)),
        (erro) => setEspacos({ carregando: false, dados: null, erro: erro.message }),
      );
    }
  }, [aplicarLista]);

  useEffect(() => {
    if (!firebaseConfigurado) {
      return undefined;
    }
    return observarSessao(async (atual) => {
      setUsuario(atual);
      setConfirmado(emailConfirmado(atual));
      if (!atual) {
        setPessoa(CARREGANDO);
        setEspacos(CARREGANDO);
        setAtivoId(null);
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

  // O espaço ativo no mesmo formato de antes ({ carregando, dados, erro }):
  // as páginas leem espaco.dados.id e não sabem que existem outros.
  const espaco = useMemo(() => {
    if (espacos.carregando || espacos.erro) {
      return espacos;
    }
    return { carregando: false, dados: espacos.dados.find((item) => item.id === ativoId) ?? null, erro: '' };
  }, [espacos, ativoId]);

  function trocarEspaco(id) {
    setAtivoId(id);
    guardar(usuario.uid, espacos.dados?.find((item) => item.id === id) ?? { id });
  }

  // Pessoal ou Empresarial (o seletor do topo): abre o espaço pessoal ou a
  // última empresa usada. Sem empresa ainda, devolve false e nada muda.
  function trocarContexto(tipo) {
    const alvo = espacoDoContexto(espacos.dados ?? [], tipo, lerUltimaEmpresa(usuario.uid));
    if (alvo) {
      trocarEspaco(alvo.id);
    }
    return Boolean(alvo);
  }

  // Depois de criar, renomear ou excluir: busca a lista de novo e abre o
  // espaço pedido (o recém-criado), ou continua no atual.
  async function recarregarEspacos(abrir = ativoId) {
    aplicarLista(usuario.uid, await listarEspacos(), abrir);
  }

  // O botão Sair fica na barra lateral (AreaDoCliente) e chega por aqui.
  const contexto = {
    usuario,
    confirmado,
    pessoa,
    espaco,
    espacos: espacos.dados ?? [],
    trocarEspaco,
    trocarContexto,
    recarregarEspacos,
    sairDaConta,
    conferirEmail,
  };
  return <Outlet context={contexto} />;
}
