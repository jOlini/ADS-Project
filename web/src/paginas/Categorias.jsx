import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import AvisoApi from '../componentes/AvisoApi';
import Campo from '../componentes/Campo';
import Carregando from '../componentes/Carregando';
import Icone from '../componentes/Icone';
import Seletor from '../componentes/Seletor';
import { useToast } from '../componentes/toast/useToast';
import { useCarga } from '../componentes/useCarga';
import { primeiroCampoComErro } from '../regras/cadastro';
import { CORES_DE_CATEGORIA, errosDaApi, ORDEM_DA_CATEGORIA, validarCategoria } from '../regras/livroCaixa';
import { apiConfigurada, atualizarCategoria, criarCategoria, listarCategorias } from '../servicos/livroCaixa';

const NOVA = { nome: '', tipo: 'DESPESA', cor: 'neutro', ativa: true };

const TIPOS_DE_CATEGORIA = [
  { valor: 'DESPESA', rotulo: 'Despesa', descricao: 'Dinheiro que sai' },
  { valor: 'RECEITA', rotulo: 'Receita', descricao: 'Dinheiro que entra' },
];

const GRUPOS = [
  { tipo: 'DESPESA', titulo: 'Despesas', icone: 'saida' },
  { tipo: 'RECEITA', titulo: 'Receitas', icone: 'entrada' },
];

const rotuloDaCor = (cor) => CORES_DE_CATEGORIA.find((item) => item.valor === cor)?.rotulo ?? cor;

// Categorias: o "para onde foi" das despesas e o "de onde veio" das receitas.
// O espaço já nasce com as mais comuns; aqui a pessoa cria, renomeia,
// recolore ou desativa. O tipo não muda depois de criado.
export default function Categorias() {
  const { espaco } = useOutletContext();
  const toast = useToast();
  const [emEdicao, setEmEdicao] = useState(null);
  const [formulario, setFormulario] = useState(NOVA);
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);

  const espacoId = espaco.dados?.id;
  const buscarCategorias = useMemo(() => (espacoId ? () => listarCategorias(espacoId) : null), [espacoId]);
  const categorias = useCarga(buscarCategorias);

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
    return <Carregando />;
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

  const lista = categorias.dados ?? [];

  function mudar(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  function editar(categoria) {
    setEmEdicao(categoria);
    setFormulario({ nome: categoria.nome, tipo: categoria.tipo, cor: categoria.cor, ativa: categoria.ativa });
    setErros({});
    requestAnimationFrame(() => document.getElementById('formulario-da-categoria')?.elements.nome?.focus());
  }

  function cancelar() {
    setEmEdicao(null);
    setFormulario(NOVA);
    setErros({});
  }

  async function enviar(evento) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements;
    const encontrados = validarCategoria(formulario);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DA_CATEGORIA);
    if (primeiro) {
      elementos[primeiro]?.focus();
      return;
    }

    setEnviando(true);
    try {
      const nome = formulario.nome.trim();
      const salva = emEdicao
        ? await atualizarCategoria(espacoId, emEdicao.id, { nome, cor: formulario.cor, ativa: formulario.ativa })
        : await criarCategoria(espacoId, { nome, tipo: formulario.tipo, cor: formulario.cor });
      toast.sucesso(emEdicao ? 'Os lançamentos dela mostram o nome novo.' : 'Já aparece no formulário de lançamento.', {
        titulo: `Categoria "${salva.nome}" ${emEdicao ? 'salva' : 'criada'}`,
      });
      cancelar();
      categorias.recarregar();
    } catch (erro) {
      setErros(errosDaApi(erro.campos));
      toast.erro(erro.message, { titulo: 'Categoria não salva' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <header className="cabecalho-da-pagina">
        <h1>Categorias</h1>
      </header>

      <div className="corpo-do-resumo pagina-de-cadastro">
        <section className="cartao lista" aria-label="Categorias">
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
                      <li key={categoria.id} className={`item${categoria.ativa ? '' : ' desativado'}`}
                        aria-current={emEdicao?.id === categoria.id || undefined}>
                        <span className="marca-da-categoria" style={{ '--cor-da-categoria': `var(--cat-${categoria.cor})` }} aria-hidden="true">
                          <Icone nome={grupo.icone} tamanho={16} />
                        </span>
                        <span className="descricao">
                          <b>{categoria.nome}</b>
                          <small>
                            {rotuloDaCor(categoria.cor)}
                            {!categoria.ativa && <span className="etiqueta">Desativada</span>}
                          </small>
                        </span>
                        <button type="button" className="discreto-botao" onClick={() => editar(categoria)}>
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

        <div className="lado">
          <section className="cartao painel" aria-labelledby="titulo-formulario-da-categoria">
            <div className="cabecalho-do-painel">
              <h2 id="titulo-formulario-da-categoria">{emEdicao ? 'Editar categoria' : 'Nova categoria'}</h2>
            </div>
            <form id="formulario-da-categoria" onSubmit={enviar} noValidate>
              <Campo rotulo="Nome" name="nome" autoComplete="off" maxLength={60} placeholder="Ex.: Pets"
                value={formulario.nome} onChange={(evento) => mudar('nome', evento.target.value)} erro={erros.nome} />

              {emEdicao ? (
                <p className="dica-do-campo">
                  Categoria de {emEdicao.tipo === 'DESPESA' ? 'despesa' : 'receita'}. O tipo não muda depois de criado.
                </p>
              ) : (
                <Campo elemento={Seletor} rotulo="Tipo" name="tipo" value={formulario.tipo} opcoes={TIPOS_DE_CATEGORIA}
                  onChange={(evento) => mudar('tipo', evento.target.value)} erro={erros.tipo} />
              )}

              <Campo elemento={Seletor} rotulo="Cor" name="cor" value={formulario.cor}
                opcoes={CORES_DE_CATEGORIA.map((cor) => ({ ...cor, cor: cor.valor }))}
                onChange={(evento) => mudar('cor', evento.target.value)} erro={erros.cor} />

              {emEdicao && (
                <label className="caixa-de-marcar">
                  <input type="checkbox" name="ativa" checked={formulario.ativa}
                    onChange={(evento) => mudar('ativa', evento.target.checked)} />
                  <span>
                    <b>Categoria ativa</b>
                    <small>Desativada, sai das opções de novos lançamentos e mantém o histórico.</small>
                  </span>
                </label>
              )}

              <div className="acoes-do-formulario">
                {emEdicao && (
                  <button type="button" className="secundario" onClick={cancelar} disabled={enviando}>
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={enviando} aria-busy={enviando}>
                  {enviando ? 'Salvando…' : emEdicao ? 'Salvar' : 'Criar categoria'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
