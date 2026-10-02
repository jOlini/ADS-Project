import { useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import AvisoApi from '../componentes/AvisoApi';
import BarraDeSelecao from '../componentes/BarraDeSelecao';
import Confirmacao from '../componentes/Confirmacao';
import DestinoDasCategorias from '../componentes/DestinoDasCategorias';
import Esqueleto from '../componentes/Esqueleto';
import FormularioDeCategoria from '../componentes/FormularioDeCategoria';
import Icone from '../componentes/Icone';
import Modal from '../componentes/Modal';
import { useToast } from '../componentes/toast/useToast';
import { useCarga } from '../componentes/useCarga';
import { useSelecao } from '../componentes/useSelecao';
import { corDaCategoria } from '../regras/cores';
import { textoDosLancamentos } from '../regras/exclusaoDeCategoria';
import { TIPOS_DE_CATEGORIA } from '../regras/livroCaixa';
import { apiConfigurada, excluirCategoria, listarCategorias } from '../servicos/livroCaixa';

const GRUPOS = [
  { tipo: 'DESPESA', titulo: 'Despesas', icone: 'saida' },
  { tipo: 'RECEITA', titulo: 'Receitas', icone: 'entrada' },
];

const contar = (quantidade, singular, plural) => `${quantidade} ${quantidade === 1 ? singular : plural}`;
// "Mercado", "Mercado e Lazer", "Mercado, Lazer e Saúde".
const juntar = (nomes) => (nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}` : nomes[0]);

// Categorias: o "para onde foi" das despesas e o "de onde veio" das receitas.
// O espaço já nasce com as mais comuns; aqui a pessoa cria, renomeia,
// recolore, desativa ou remove, sempre num modal. O tipo não muda depois de
// criado. Categoria com lançamentos só sai com um destino: a API responde 409
// na primeira tentativa, a tela pergunta para qual categoria os lançamentos
// vão (DestinoDasCategorias) e a API os move antes de excluir. Desativar
// continua sendo a saída que não mexe em nada. Um atalho de outra tela chega
// com ?cadastrar=DESPESA (ou RECEITA) e já abre o modal com o tipo escolhido.
export default function Categorias() {
  const { espaco } = useOutletContext();
  const toast = useToast();
  const [parametros, setParametros] = useSearchParams();
  const tipoDoAtalho = TIPOS_DE_CATEGORIA.find((item) => item.valor === parametros.get('cadastrar'))?.valor;
  // { emEdicao } com o modal aberto; senão, null.
  const [modal, setModal] = useState(() => (tipoDoAtalho ? { emEdicao: null } : null));
  const [modalOcupado, setModalOcupado] = useState(false);
  const [aRemover, setARemover] = useState(null);
  const [removendo, setRemovendo] = useState(false);
  // Categorias em uso esperando o destino dos lançamentos: [{ categoria, lancamentos }].
  const [emUso, setEmUso] = useState(null);

  const espacoId = espaco.dados?.id;
  const buscarCategorias = useMemo(() => (espacoId ? () => listarCategorias(espacoId) : null), [espacoId]);
  const categorias = useCarga(buscarCategorias);
  const lista = useMemo(() => categorias.dados ?? [], [categorias.dados]);
  // Na ordem da tela: despesas e depois receitas.
  const ids = useMemo(
    () => GRUPOS.flatMap((grupo) => lista.filter((categoria) => categoria.tipo === grupo.tipo).map((categoria) => categoria.id)),
    [lista],
  );
  const selecao = useSelecao(ids);

  if (!apiConfigurada) {
    return (
      <>
        <header className="cabecalho-da-pagina">
          <h1>Categorias</h1>
        </header>
        <AvisoApi />
      </>
    );
  }
  if (espaco.carregando || (espacoId && categorias.carregando && !categorias.dados)) {
    return <Esqueleto forma="lista" />;
  }
  const falha = espaco.erro || categorias.erro?.message;
  if (falha) {
    return (
      <div className="cartao painel">
        <p className="mensagem erro" role="alert">
          <Icone nome="alerta" tamanho={16} />
          {falha}
        </p>
        <button type="button" className="secundario" onClick={() => window.location.reload()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  function fecharModal() {
    setModal(null);
    setModalOcupado(false);
    if (tipoDoAtalho) {
      setParametros({}, { replace: true });
    }
  }

  function aposSalvar() {
    fecharModal();
    categorias.recarregar();
  }

  // Uma por uma. A sem lançamentos sai na hora; a em uso (409) vai para a
  // etapa do destino, com a quantidade que a API contou. Outro erro para
  // tudo, e as anteriores já saíram.
  async function confirmarRemocao() {
    setRemovendo(true);
    const removidas = [];
    const pendentes = [];
    try {
      for (const categoria of aRemover) {
        try {
          await excluirCategoria(espacoId, categoria.id);
          removidas.push(categoria.nome);
        } catch (erro) {
          if (erro.status !== 409) {
            throw erro;
          }
          pendentes.push({ categoria, lancamentos: erro.detalhes?.lancamentos ?? null });
        }
      }
      if (removidas.length > 0) {
        toast.sucesso(`${juntar(removidas)}.`, { titulo: contar(removidas.length, 'categoria removida', 'categorias removidas') });
      }
      if (pendentes.length > 0) {
        setEmUso(pendentes);
      }
    } catch (erro) {
      toast.erro(erro.message, { titulo: 'Remoção interrompida' });
    } finally {
      setRemovendo(false);
      setARemover(null);
      selecao.limpar();
      categorias.recarregar();
    }
  }

  // Etapa do destino: cada categoria em uso sai levando os lançamentos para a
  // escolhida. A que falhar fica na lista, com o motivo no aviso.
  async function moverEExcluir(destinos) {
    setRemovendo(true);
    const nomeDe = (id) => lista.find((categoria) => categoria.id === id)?.nome ?? 'a categoria escolhida';
    const restantes = [];
    for (const item of emUso) {
      const destino = destinos[item.categoria.id];
      try {
        const { lancamentos_movidos: movidos } = await excluirCategoria(espacoId, item.categoria.id, destino);
        toast.sucesso(`${textoDosLancamentos(movidos)} ${movidos === 1 ? 'passou' : 'passaram'} para ${nomeDe(destino)}.`, {
          titulo: `Categoria "${item.categoria.nome}" removida`,
        });
      } catch (erro) {
        restantes.push(item);
        toast.erro(erro.campos?.mover_para ?? erro.message, { titulo: `"${item.categoria.nome}" não saiu` });
      }
    }
    setRemovendo(false);
    setEmUso(restantes.length > 0 ? restantes : null);
    categorias.recarregar();
  }

  function pedirRemocao(idsEscolhidos) {
    const itens = lista.filter((categoria) => idsEscolhidos.includes(categoria.id));
    if (itens.length > 0) {
      setARemover(itens);
    }
  }

  return (
    <>
      <header className="cabecalho-da-pagina">
        <h1>Categorias</h1>
        <div className="acoes-da-pagina">
          <button type="button" onClick={() => setModal({ emEdicao: null })}>
            <Icone nome="mais" tamanho={18} />
            Nova categoria
          </button>
        </div>
      </header>

      <section className="cartao lista pagina-de-categorias" aria-label="Categorias">
        <BarraDeSelecao ids={ids} selecao={selecao} nomes={['categoria', 'categorias']} aoRemover={pedirRemocao} ocupado={removendo} />
        {GRUPOS.map((grupo) => {
          const doGrupo = lista.filter((categoria) => categoria.tipo === grupo.tipo);
          return (
            <div key={grupo.tipo}>
              <h2 className="dia">
                <span>{grupo.titulo}</span>
                <span>{doGrupo.length}</span>
              </h2>
              {doGrupo.length === 0 ? (
                <p className="item discreto">Nenhuma categoria de {grupo.titulo.toLowerCase()}.</p>
              ) : (
                <ul className="itens">
                  {doGrupo.map((categoria) => (
                    <li
                      key={categoria.id}
                      className={`item com-selecao${categoria.ativa ? '' : ' desativado'}${selecao.marcado(categoria.id) ? ' marcado' : ''}`}
                    >
                      <input type="checkbox" className="marcar-linha" checked={selecao.marcado(categoria.id)}
                        onChange={() => selecao.alternar(categoria.id)} aria-label={`Selecionar ${categoria.nome}`} />
                      {/* Só o círculo na cor da categoria: o nome da cor
                          não diz nada a quem lê, e a hexadecimal menos ainda. */}
                      <span className="circulo-da-categoria" style={{ '--cor-da-categoria': corDaCategoria(categoria.cor) }} aria-hidden="true" />
                      <span className="descricao">
                        <b>{categoria.nome}</b>
                        {!categoria.ativa && (
                          <small>
                            <span className="etiqueta">Desativada</span>
                          </small>
                        )}
                      </span>
                      <button type="button" className="discreto-botao" onClick={() => setModal({ emEdicao: categoria })}>
                        <Icone nome="editar" tamanho={16} />
                        <span className="rotulo-da-acao">Editar</span>
                        <span className="apenas-leitor">: {categoria.nome}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </section>

      <Modal aberta={Boolean(modal)} titulo={modal?.emEdicao ? 'Editar categoria' : 'Nova categoria'} descricao={modal?.emEdicao?.nome}
        aoFechar={fecharModal} ocupado={modalOcupado}>
        {modal && (
          <FormularioDeCategoria espacoId={espacoId} emEdicao={modal.emEdicao} tipoInicial={tipoDoAtalho ?? 'DESPESA'}
            aoSalvar={aposSalvar} aoCancelar={fecharModal} aoMudarOcupado={setModalOcupado} />
        )}
      </Modal>

      <Modal aberta={Boolean(emUso)} titulo="Para onde vão os lançamentos?" aoFechar={() => setEmUso(null)} ocupado={removendo}
        descricao={emUso ? `${juntar(emUso.map(({ categoria }) => categoria.nome))} ${emUso.length === 1 ? 'está' : 'estão'} em lançamentos.` : ''}>
        {emUso && (
          <DestinoDasCategorias emUso={emUso} categorias={lista} ocupado={removendo} aoConfirmar={moverEExcluir}
            aoCancelar={() => setEmUso(null)} />
        )}
      </Modal>

      <Confirmacao
        aberta={Boolean(aRemover)}
        titulo={aRemover ? `Remover ${contar(aRemover.length, 'categoria', 'categorias')}?` : ''}
        rotuloDeConfirmar="Remover"
        perigo
        ocupado={removendo}
        aoConfirmar={confirmarRemocao}
        aoCancelar={() => !removendo && setARemover(null)}
      >
        {aRemover && (
          <>
            <p>{juntar(aRemover.map((categoria) => categoria.nome))}.</p>
            <p>
              Categoria sem lançamentos some de vez. Se alguma estiver em lançamentos, você escolhe em seguida para qual
              categoria eles vão antes de ela sair. Para só tirar das opções sem mexer no histórico, desative em Editar.
            </p>
          </>
        )}
      </Confirmacao>
    </>
  );
}
