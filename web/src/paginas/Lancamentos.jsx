import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import AvisoApi from '../componentes/AvisoApi';
import Campo from '../componentes/Campo';
import Carregando from '../componentes/Carregando';
import Confirmacao from '../componentes/Confirmacao';
import Extrato from '../componentes/Extrato';
import Icone from '../componentes/Icone';
import ImportarExtrato from '../componentes/ImportarExtrato';
import { useToast } from '../componentes/toast/useToast';
import { useCarga } from '../componentes/useCarga';
import { primeiroCampoComErro } from '../regras/cadastro';
import { formatarBRL, lerValor } from '../regras/dinheiro';
import { formatarData, hojeIso } from '../regras/datas';
import { dataMaisRecente } from '../regras/importacao';
import {
  corpoDoLancamento,
  errosDaApi,
  estaNoMes,
  intervaloDoMes,
  mesDe,
  mudarMes,
  ORDEM_DO_LANCAMENTO,
  paraExtrato,
  saldoTotal,
  TIPOS_DE_LANCAMENTO,
  validarLancamento,
} from '../regras/livroCaixa';
import { agruparPorDia, filtrarDias, saldoAntesDe, somarMes } from '../regras/resumo';
import {
  apiConfigurada,
  estornar,
  lancar,
  LIMITE_DE_LANCAMENTOS,
  listarCategorias,
  listarContas,
  listarLancamentos,
} from '../servicos/livroCaixa';

const FILTROS = [
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'entradas', rotulo: 'Entradas' },
  { id: 'saidas', rotulo: 'Saídas' },
];

const MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const nomeDoMes = ({ ano, mes }) => MES.format(new Date(ano, mes - 1, 1));

const formularioVazio = (tipo = 'DESPESA', contaId = '') => ({
  tipo,
  descricao: '',
  valor: '',
  data: hojeIso(),
  conta_id: contaId,
  categoria_id: '',
  conta_destino_id: '',
});

// Contas e categorias do espaço (para os nomes no extrato e as opções do
// formulário).
async function carregarCadastros(espacoId) {
  const [contas, categorias] = await Promise.all([listarContas(espacoId), listarCategorias(espacoId)]);
  return { contas, categorias };
}

// Lançamentos do mês e, à parte, os que vieram depois dele: estes só servem
// para achar o saldo do fim do mês a partir do saldo de hoje.
async function carregarMes(espacoId, mes) {
  const [doMes, depois] = await Promise.all([
    listarLancamentos(espacoId, intervaloDoMes(mes)),
    listarLancamentos(espacoId, { de: intervaloDoMes(mudarMes(mes, 1)).de }),
  ]);
  return { doMes, depois };
}

// Lançamentos: extrato de um mês por vez, formulário para lançar receita,
// despesa ou transferência, importação do extrato do banco (CSV) e estorno de
// um lançamento (a correção do livro-caixa: nada é editado nem apagado).
export default function Lancamentos() {
  const { espaco } = useOutletContext();
  const toast = useToast();
  const [mes, setMes] = useState(() => mesDe(new Date()));
  const [filtro, setFiltro] = useState('tudo');
  const [formulario, setFormulario] = useState(() => formularioVazio());
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [aEstornar, setAEstornar] = useState(null);
  const [estornando, setEstornando] = useState(false);

  const espacoId = espaco.dados?.id;
  const buscarCadastros = useMemo(() => (espacoId ? () => carregarCadastros(espacoId) : null), [espacoId]);
  const buscarMes = useMemo(() => (espacoId ? () => carregarMes(espacoId, mes) : null), [espacoId, mes]);
  const cadastros = useCarga(buscarCadastros);
  const extrato = useCarga(buscarMes);

  const contas = useMemo(() => cadastros.dados?.contas ?? [], [cadastros.dados]);
  const categorias = useMemo(() => cadastros.dados?.categorias ?? [], [cadastros.dados]);
  const contasAtivas = contas.filter((conta) => conta.ativa);
  const categoriasDoTipo = categorias.filter((categoria) => categoria.ativa && categoria.tipo === formulario.tipo);

  const visao = useMemo(() => {
    if (!cadastros.dados || !extrato.dados) {
      return null;
    }
    const linhasDoMes = paraExtrato(extrato.dados.doMes, contas, categorias);
    const depois = paraExtrato(extrato.dados.depois, contas, categorias);
    const saldoNoFimDoMes = saldoAntesDe(depois, saldoTotal(contas));
    return {
      totais: somarMes(linhasDoMes),
      dias: agruparPorDia(linhasDoMes, saldoNoFimDoMes),
      // No teto da consulta pode faltar lançamento: o saldo do dia sai da tela.
      saldoConfiavel: extrato.dados.depois.length < LIMITE_DE_LANCAMENTOS && extrato.dados.doMes.length < LIMITE_DE_LANCAMENTOS,
    };
  }, [cadastros.dados, extrato.dados, contas, categorias]);

  if (!apiConfigurada) {
    return (
      <>
        <header className="cabecalho-da-pagina">
          <h1>Lançamentos</h1>
        </header>
        <AvisoApi />
      </>
    );
  }
  if (espaco.carregando || (espacoId && cadastros.carregando && !cadastros.dados)) {
    return <Carregando />;
  }
  const falha = espaco.erro || cadastros.erro?.message;
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

  function mudar(campo, valor) {
    setFormulario((atual) => {
      const novo = { ...atual, [campo]: valor };
      // Trocar o tipo apaga a categoria escolhida: despesa e receita têm listas próprias.
      if (campo === 'tipo') {
        novo.categoria_id = '';
        novo.conta_destino_id = '';
      }
      return novo;
    });
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  async function enviar(evento) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements;
    const encontrados = validarLancamento(formulario);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DO_LANCAMENTO);
    if (primeiro) {
      elementos[primeiro]?.focus();
      return;
    }

    setEnviando(true);
    try {
      const criado = await lancar(espacoId, corpoDoLancamento(formulario));
      toast.sucesso(`${criado.descricao} · ${formatarBRL(lerValor(formulario.valor))}`, { titulo: 'Lançamento registrado' });
      // Mantém tipo, conta e data: quem lança várias despesas seguidas não
      // precisa escolher tudo de novo.
      setFormulario((atual) => ({ ...atual, descricao: '', valor: '' }));
      if (!estaNoMes(criado.data, mes)) {
        setMes(mesDe(criado.data));
      }
      cadastros.recarregar();
      extrato.recarregar();
      elementos.descricao?.focus();
    } catch (erro) {
      const campos = errosDaApi(erro.campos);
      setErros(campos);
      toast.erro(erro.message, { titulo: 'Lançamento não registrado' });
      const campoComErro = primeiroCampoComErro(campos, ORDEM_DO_LANCAMENTO);
      if (campoComErro) {
        elementos[campoComErro]?.focus();
      }
    } finally {
      setEnviando(false);
    }
  }

  async function confirmarEstorno() {
    setEstornando(true);
    try {
      const estorno = await estornar(espacoId, aEstornar.id);
      toast.sucesso(`Entrou em ${formatarData(estorno.data)}, com o valor no sentido contrário.`, {
        titulo: 'Lançamento estornado',
      });
      setAEstornar(null);
      cadastros.recarregar();
      extrato.recarregar();
    } catch (erro) {
      toast.erro(erro.message, { titulo: 'Estorno não registrado' });
    } finally {
      setEstornando(false);
    }
  }

  // Depois da importação, o extrato abre no mês do lançamento mais recente
  // que entrou, se ele não for o mês na tela.
  function aposImportar(resposta) {
    const ultima = dataMaisRecente(resposta.linhas);
    if (ultima && !estaNoMes(ultima, mes)) {
      setMes(mesDe(ultima));
    }
    cadastros.recarregar();
    extrato.recarregar();
  }

  const transferencia = formulario.tipo === 'TRANSFERENCIA';
  const diasVisiveis = filtrarDias(visao?.dias ?? [], filtro);

  return (
    <>
      <header className="cabecalho-da-pagina">
        <h1>Lançamentos</h1>
        <div className="navegacao-do-mes" role="group" aria-label="Mês do extrato">
          <button type="button" className="discreto-botao" onClick={() => setMes(mudarMes(mes, -1))} aria-label="Mês anterior">
            <Icone nome="anterior" tamanho={16} />
          </button>
          <span className="mes" aria-live="polite">
            <Icone nome="calendario" tamanho={16} />
            {nomeDoMes(mes)}
          </span>
          <button type="button" className="discreto-botao" onClick={() => setMes(mudarMes(mes, 1))} aria-label="Próximo mês">
            <Icone nome="proximo" tamanho={16} />
          </button>
        </div>
      </header>

      <div className="corpo-do-resumo pagina-de-lancamentos">
        <section className="cartao extrato" aria-labelledby="titulo-extrato">
          <div className="cabecalho-do-painel">
            <h2 id="titulo-extrato">Extrato</h2>
            {visao && (visao.dias.length > 0 || filtro !== 'tudo') && (
              <div className="abas" role="group" aria-label="Filtrar o extrato">
                {FILTROS.map((opcao) => (
                  <button key={opcao.id} type="button" aria-pressed={filtro === opcao.id} onClick={() => setFiltro(opcao.id)}>
                    {opcao.rotulo}
                  </button>
                ))}
              </div>
            )}
          </div>
          {visao && visao.dias.length > 0 && (
            <p className="totais-do-mes">
              <span>
                Entradas <b className="entrada">{formatarBRL(visao.totais.entradas)}</b>
              </span>
              <span>
                Saídas <b>{formatarBRL(visao.totais.saidas)}</b>
              </span>
            </p>
          )}

          {extrato.erro ? (
            <p className="mensagem erro" role="alert">
              <Icone nome="alerta" tamanho={16} />
              {extrato.erro.message}
            </p>
          ) : !visao ? (
            <Carregando rotulo="Carregando o extrato" />
          ) : diasVisiveis.length > 0 ? (
            <Extrato
              dias={diasVisiveis}
              mostrarSaldo={filtro === 'tudo' && visao.saldoConfiavel}
              acoes={(linha) =>
                !linha.estorno && !linha.estornado ? (
                  <button type="button" className="discreto-botao" onClick={() => setAEstornar(linha)}>
                    <Icone nome="estornar" tamanho={16} />
                    <span className="rotulo-da-acao">Estornar</span>
                    <span className="apenas-leitor">: {linha.descricao}</span>
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="vazio">
              <span className="simbolo" aria-hidden="true">
                <Icone nome="lancamentos" tamanho={20} />
              </span>
              <h3>{filtro === 'tudo' ? `Nenhum lançamento em ${nomeDoMes(mes)}` : 'Nada com esse filtro'}</h3>
              <p>
                {filtro !== 'tudo'
                  ? 'Troque o filtro para ver os outros lançamentos do mês.'
                  : contasAtivas.length === 0
                    ? 'Os lançamentos aparecem aqui depois que você cadastrar uma conta.'
                    : 'Use o formulário para registrar o que entrou, o que saiu ou o que mudou de conta.'}
              </p>
            </div>
          )}
        </section>

        <div className="lado">
          <section className="cartao painel" aria-labelledby="titulo-novo-lancamento">
            <div className="cabecalho-do-painel">
              <h2 id="titulo-novo-lancamento">Novo lançamento</h2>
            </div>

            {contasAtivas.length === 0 ? (
              <div className="vazio compacto">
                <p>Cadastre uma conta antes de lançar: todo lançamento sai de uma conta ou entra nela.</p>
                <Link className="botao" to="/contas">
                  <Icone nome="mais" tamanho={16} />
                  Cadastrar conta
                </Link>
              </div>
            ) : (
              <form onSubmit={enviar} noValidate>
                <div className="abas largas" role="group" aria-label="Tipo de lançamento">
                  {TIPOS_DE_LANCAMENTO.map((tipo) => (
                    <button
                      key={tipo.valor}
                      type="button"
                      aria-pressed={formulario.tipo === tipo.valor}
                      onClick={() => mudar('tipo', tipo.valor)}
                    >
                      {tipo.rotulo}
                    </button>
                  ))}
                </div>

                <Campo rotulo="Descrição" name="descricao" autoComplete="off" maxLength={120}
                  placeholder={transferencia ? 'Ex.: Para a poupança' : 'Ex.: Supermercado'}
                  value={formulario.descricao} onChange={(evento) => mudar('descricao', evento.target.value)} erro={erros.descricao} />

                <Campo rotulo="Valor (R$)" name="valor" inputMode="decimal" autoComplete="off" placeholder="0,00"
                  value={formulario.valor} onChange={(evento) => mudar('valor', evento.target.value)} erro={erros.valor} />
                <Campo rotulo="Data" type="date" name="data"
                  value={formulario.data} onChange={(evento) => mudar('data', evento.target.value)} erro={erros.data} />

                <Campo elemento="select" rotulo={transferencia ? 'Sai da conta' : 'Conta'} name="conta_id"
                  value={formulario.conta_id} onChange={(evento) => mudar('conta_id', evento.target.value)} erro={erros.conta_id}>
                  <option value="">Escolha a conta</option>
                  {contasAtivas.map((conta) => (
                    <option key={conta.id} value={conta.id}>
                      {conta.nome}
                    </option>
                  ))}
                </Campo>

                {transferencia ? (
                  <Campo elemento="select" rotulo="Entra na conta" name="conta_destino_id"
                    value={formulario.conta_destino_id} onChange={(evento) => mudar('conta_destino_id', evento.target.value)}
                    erro={erros.conta_destino_id}>
                    <option value="">Escolha a conta de destino</option>
                    {contasAtivas.map((conta) => (
                      <option key={conta.id} value={conta.id}>
                        {conta.nome}
                      </option>
                    ))}
                  </Campo>
                ) : (
                  <Campo elemento="select" rotulo="Categoria" name="categoria_id"
                    value={formulario.categoria_id} onChange={(evento) => mudar('categoria_id', evento.target.value)}
                    erro={erros.categoria_id}
                    dica={categoriasDoTipo.length === 0 ? 'Nenhuma categoria ativa deste tipo. Crie uma em Categorias.' : undefined}>
                    <option value="">Escolha a categoria</option>
                    {categoriasDoTipo.map((categoria) => (
                      <option key={categoria.id} value={categoria.id}>
                        {categoria.nome}
                      </option>
                    ))}
                  </Campo>
                )}

                <button type="submit" className="largo" disabled={enviando} aria-busy={enviando}>
                  {enviando ? 'Lançando…' : 'Lançar'}
                </button>
              </form>
            )}
          </section>

          {contasAtivas.length > 0 && (
            <ImportarExtrato espacoId={espacoId} contas={contasAtivas} categorias={categorias} aoImportar={aposImportar} />
          )}
        </div>
      </div>

      <Confirmacao
        aberta={Boolean(aEstornar)}
        titulo={aEstornar ? `Estornar "${aEstornar.descricao}"?` : ''}
        rotuloDeConfirmar="Estornar"
        ocupado={estornando}
        aoConfirmar={confirmarEstorno}
        aoCancelar={() => !estornando && setAEstornar(null)}
      >
        {aEstornar && (
          <p>
            Entra hoje um lançamento de {formatarBRL(Math.abs(aEstornar.valor))} no sentido contrário, e o saldo volta ao que
            era. O original continua no extrato, marcado como estornado. Um lançamento só pode ser estornado uma vez.
          </p>
        )}
      </Confirmacao>
    </>
  );
}
