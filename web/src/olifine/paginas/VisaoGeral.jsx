import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import CompraNoCartao from '../../componentes/CompraNoCartao';
import Esqueleto from '../../componentes/Esqueleto';
import FormularioDeCartao from '../../componentes/FormularioDeCartao';
import FormularioDeConta from '../../componentes/FormularioDeConta';
import FormularioDeLancamento from '../../componentes/FormularioDeLancamento';
import Menu from '../../componentes/Menu';
import Modal from '../../componentes/Modal';
import { useCarga } from '../../componentes/useCarga';
import { formatarBRL, formatarComSinal } from '../../regras/dinheiro';
import { formatarData, hojeIso } from '../../regras/datas';
import { normalizarTexto } from '../../regras/texto';
import {
  contasBancarias,
  estaNoMes,
  lancamentosDasContas,
  mesDe,
  paraExtrato,
  rotuloDoTipoDeConta,
  saldoTotal,
} from '../../regras/livroCaixa';
import {
  apiConfigurada,
  listarCartoes,
  listarCategorias,
  listarContas,
  listarLancamentos,
  listarPessoas,
  relatorioMensal,
} from '../../servicos/livroCaixa';
import Arvore from '../componentes/Arvore';
import GraficoDeSaldo from '../componentes/GraficoDeSaldo';
import Icone from '../../componentes/Icone';
import Rosca from '../componentes/Rosca';
import {
  CONTAS_DE_EXEMPLO,
  HOJE_DE_EXEMPLO,
  LANCAMENTOS_DE_EXEMPLO,
  MESES_DE_EXEMPLO,
  SALDO_DE_EXEMPLO,
} from '../dados/exemplo';
import { iconeDaLinha } from '../regras/icones';
import { parteInvestida, separarSaldos } from '../regras/saldos';
import { guardado, porcentagem, progresso, proximaFase, resumoDasMetas, sementeDaMeta } from '../regras/metas';
import { somarDias } from '../regras/serie';
import { leituraDaVariacao, textoDaVariacao } from '../regras/tendencia';
import { FAIXAS, fatiasDaRosca, montarVisao } from '../regras/visao';
import { useMetas } from '../useMetas';
import '../../estilos/cartoes.css';

const MES_POR_EXTENSO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const NOME_DO_MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });
const DIA_DA_LISTA = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const comoData = (iso) => new Date(`${iso}T12:00:00Z`);

// Títulos dos modais do "+ Novo".
const MODAIS = {
  lancamento: { titulo: 'Novo lançamento', descricao: 'PIX, débito, dinheiro ou TED: o que mexe no saldo das contas.' },
  compra: { titulo: 'Nova compra no crédito', descricao: 'Entra na fatura do cartão, à vista ou parcelada.' },
  conta: { titulo: 'Nova conta' },
  cartao: { titulo: 'Novo cartão' },
};

// "Hoje", "Ontem" ou "12 de setembro".
function rotuloDoDia(data, hoje) {
  if (data === hoje) {
    return 'Hoje';
  }
  if (data === somarDias(hoje, -1)) {
    return 'Ontem';
  }
  return DIA_DA_LISTA.format(comoData(data));
}

// Contas, categorias, os lançamentos dos últimos 30 dias (ou do mês, se ele
// começou antes) em diante, e o relatório de 12 meses. Sem o relatório (API
// antiga, erro), a tela abre do mesmo jeito, só sem a comparação. Os cartões
// trazem as faturas (sem eles, a tela abre do mesmo jeito); as pessoas dos
// rachas são só sugestão no formulário do "+ Novo".
async function carregarVisao(espacoId, hoje) {
  const inicioDoMes = `${hoje.slice(0, 7)}-01`;
  const trintaDias = somarDias(hoje, -29);
  const [contas, categorias, lancamentos, relatorio, cartoes, pessoas] = await Promise.all([
    listarContas(espacoId),
    listarCategorias(espacoId),
    listarLancamentos(espacoId, { de: inicioDoMes < trintaDias ? inicioDoMes : trintaDias }),
    relatorioMensal(espacoId).catch(() => null),
    listarCartoes(espacoId).catch(() => []),
    listarPessoas(espacoId).catch(() => []),
  ]);
  return { contas, categorias, lancamentos, relatorio, cartoes, pessoas };
}

function SeloDeTendencia({ variacao, maiorEhMelhor = true, referencia }) {
  const leitura = leituraDaVariacao(variacao, { maiorEhMelhor });
  if (!leitura) {
    return <p className="of-kpi-rodape">Sem mês anterior para comparar</p>;
  }
  return (
    <p className="of-kpi-rodape">
      <span className={`of-tendencia ${leitura}`}>{textoDaVariacao(variacao)}</span>
      em relação a {referencia}
    </p>
  );
}

// Visão geral da OliFine: os quatro números do mês com a tendência, a
// evolução do saldo, as despesas por categoria, as últimas transações, as
// metas e o compromisso nos cartões. Com a API, dados de verdade; sem ela
// (Pages), a tela vazia oferece o modo de exemplo, sempre marcado.
//
// O "+ Novo" do topo deixa a pessoa escolher o que criar (lançamento à
// vista, compra no crédito, conta ou cartão), cada um no seu modal, sem sair
// da tela.
export default function VisaoGeral() {
  const { usuario, pessoa, espaco } = useOutletContext();
  const [exemplo, setExemplo] = useState(
    () => !apiConfigurada && new URLSearchParams(window.location.search).has('exemplo'),
  );
  // Sem escolha da pessoa, abre nos 6 meses (a curva do saldo ao longo do
  // tempo); sem o relatório da API, nos 30 dias.
  const [faixaEscolhida, setFaixa] = useState(null);
  const [hojeReal] = useState(hojeIso);
  const hoje = exemplo ? HOJE_DE_EXEMPLO : hojeReal;
  const [modal, setModal] = useState(null);
  const [modalOcupado, setModalOcupado] = useState(false);

  const espacoId = espaco.dados?.id;
  const buscar = useMemo(
    () => (apiConfigurada && espacoId ? () => carregarVisao(espacoId, hojeReal) : null),
    [espacoId, hojeReal],
  );
  const livro = useCarga(buscar);
  const { metas } = useMetas(usuario?.uid, { exemplo });

  const visao = useMemo(() => {
    if (exemplo) {
      return {
        ...montarVisao({
          linhasDasContas: LANCAMENTOS_DE_EXEMPLO,
          linhasDoMes: LANCAMENTOS_DE_EXEMPLO,
          linhasRecentes: LANCAMENTOS_DE_EXEMPLO,
          saldo: SALDO_DE_EXEMPLO,
          meses: MESES_DE_EXEMPLO,
          hoje: HOJE_DE_EXEMPLO,
        }),
        contas: CONTAS_DE_EXEMPLO,
      };
    }
    if (!livro.dados) {
      return null;
    }
    const { contas, categorias, lancamentos, relatorio } = livro.dados;
    const mes = mesDe(comoData(hojeReal));
    const dasContas = paraExtrato(lancamentosDasContas(lancamentos, contas), contas, categorias);
    const comCartoes = paraExtrato(lancamentos, contas, categorias);
    return {
      ...montarVisao({
        linhasDasContas: dasContas,
        linhasDoMes: comCartoes.filter((linha) => estaNoMes(linha.data, mes) && linha.tipo !== 'pagamento'),
        linhasRecentes: comCartoes,
        saldo: saldoTotal(contas),
        meses: relatorio?.meses ?? null,
        hoje: hojeReal,
      }),
      // Contas com dinheiro (o cartão é dívida, com painel próprio), para o
      // saldo por conta: separarSaldos tira a desativada zerada.
      contas: contasBancarias(contas).map((conta) => ({
        id: conta.id,
        nome: conta.nome,
        tipo: conta.tipo,
        saldo: conta.saldo_centavos,
        ativa: conta.ativa,
      })),
    };
  }, [exemplo, livro.dados, hojeReal]);

  const real = apiConfigurada && !exemplo;
  const carregando = real && (espaco.carregando || (Boolean(espacoId) && livro.carregando && !livro.dados));
  if (pessoa.carregando || carregando) {
    return <Esqueleto />;
  }

  const dados = pessoa.dados;
  const erro = real ? espaco.erro || livro.erro?.message : '';
  const semContas = real && Boolean(livro.dados) && livro.dados.contas.length === 0;
  const comNumeros = Boolean(visao) && !semContas;
  const mesAnterior = NOME_DO_MES.format(comoData(somarDias(`${hoje.slice(0, 7)}-01`, -1)));
  const faixa = faixaEscolhida ?? (comNumeros && visao.series['6m'] ? '6m' : '30d');
  const serie = comNumeros ? visao.series[faixa] : null;
  const faixasDisponiveis = FAIXAS.filter((opcao) => !comNumeros || visao.series[opcao.id]);
  const resumo = resumoDasMetas(metas);
  const metasEmDestaque = [...metas]
    .filter((meta) => porcentagem(meta) < 100)
    .sort((a, b) => progresso(b) - progresso(a))
    .slice(0, 4);
  // A meta mais perto de mudar de fase: o convite para regar.
  const pertoDeCrescer = metasEmDestaque
    .map((meta) => ({ meta, proxima: proximaFase(meta) }))
    .filter((item) => item.proxima && item.proxima.fase.id !== 'broto')
    .sort((a, b) => a.proxima.faltam / a.meta.alvo - b.proxima.faltam / b.meta.alvo)[0];
  const diasDasUltimas = comNumeros
    ? visao.ultimas.reduce((grupos, linha) => {
        const ultimo = grupos.at(-1);
        if (ultimo?.data === linha.data) {
          ultimo.linhas.push(linha);
        } else {
          grupos.push({ data: linha.data, linhas: [linha] });
        }
        return grupos;
      }, [])
    : [];
  // Cartões e cadastros do "+ Novo": só com a API (o exemplo não tem cartão).
  const cadastros = real ? livro.dados : null;
  const cartoes = cadastros?.cartoes ?? [];
  const compromisso = {
    usado: cartoes.reduce((soma, cartao) => soma + Math.max(0, cartao.usado_centavos), 0),
    faturasAtuais: cartoes.reduce((soma, cartao) => soma + cartao.fatura_atual_centavos, 0),
    futuras: cartoes.reduce((soma, cartao) => soma + cartao.parcelamentos_futuros_centavos, 0),
  };
  const contasAtivas = cadastros ? contasBancarias(cadastros.contas).filter((conta) => conta.ativa) : [];
  // Disponível (corrente, carteira, poupança) x investido (regras/saldos.ts).
  const saldos = comNumeros ? separarSaldos(visao.contas) : null;
  const investida = saldos ? parteInvestida(saldos) : null;

  const opcoesDoNovo = [
    {
      id: 'lancamento',
      rotulo: 'Novo lançamento manual',
      descricao: 'PIX, débito, dinheiro ou TED, direto no saldo da conta.',
      icone: 'lancamentos',
      aoEscolher: () => setModal('lancamento'),
    },
    ...(cartoes.length > 0
      ? [
          {
            id: 'compra',
            rotulo: 'Nova compra no crédito',
            descricao: 'Entra na fatura do cartão, à vista ou parcelada.',
            icone: 'cartao',
            aoEscolher: () => setModal('compra'),
          },
        ]
      : []),
    { id: 'conta', rotulo: 'Cadastrar conta', descricao: 'Corrente, poupança, carteira ou investimento.', icone: 'contas', aoEscolher: () => setModal('conta') },
    { id: 'cartao', rotulo: 'Cadastrar cartão', descricao: 'Limite, fechamento, vencimento e a cor.', icone: 'cartao', aoEscolher: () => setModal('cartao') },
  ];

  function fecharModal() {
    setModal(null);
    setModalOcupado(false);
  }

  function aposCriar() {
    fecharModal();
    livro.recarregar();
  }

  return (
    <div className="of-visao">
      <header className="of-cabecalho">
        <div>
          <h1>{dados ? `Olá, ${dados.nome}!` : 'Olá!'}</h1>
          <p>
            Aqui está o resumo de <span className="of-mes-atual">{MES_POR_EXTENSO.format(comoData(hoje))}</span>.
          </p>
        </div>
        <div className="of-cabecalho-acoes">
          {exemplo && (
            <>
              <span className="selo-exemplo">
                <Icone nome="alerta" tamanho={14} />
                Dados de exemplo
              </span>
              <button type="button" className="secundario" onClick={() => setExemplo(false)}>
                <Icone nome="olhoFechado" tamanho={16} />
                Ocultar exemplo
              </button>
            </>
          )}
          {cadastros && <Menu texto="Novo" rotulo="Novo: escolher o que criar" itens={opcoesDoNovo} />}
        </div>
      </header>

      {(pessoa.erro || erro) && (
        <div className="cartao painel of-erro">
          <p className="mensagem erro" role="alert">
            <Icone nome="alerta" tamanho={16} />
            {erro || pessoa.erro}
          </p>
          <button type="button" className="secundario" onClick={() => window.location.reload()}>
            Tentar de novo
          </button>
        </div>
      )}

      <section className="of-kpis" aria-label="Números do mês">
        <article className="of-kpi of-kpi-saldo">
          <p className="of-kpi-rotulo">
            <span className="of-kpi-icone" aria-hidden="true">
              <Icone nome="contas" tamanho={18} />
            </span>
            Saldo total
          </p>
          <p className="of-kpi-valor">{comNumeros ? formatarBRL(visao.saldo) : 'R$ —'}</p>
          {saldos && (
            <p className="of-kpi-origem">
              {formatarBRL(saldos.disponivel.total)} disponível · {formatarBRL(saldos.investido.total)} investido
            </p>
          )}
          {comNumeros ? (
            <SeloDeTendencia variacao={visao.variacao.saldo} referencia={`${mesAnterior}`} />
          ) : (
            <p className="of-kpi-rodape">Soma das suas contas</p>
          )}
          <div className="of-atalhos" aria-label="Atalhos">
            {apiConfigurada && (
              <Link to="/lancamentos" className="of-atalho">
                <span aria-hidden="true">
                  <Icone nome="lancamentos" />
                </span>
                Lançar
              </Link>
            )}
            {apiConfigurada && (
              <Link to="/contas" className="of-atalho">
                <span aria-hidden="true">
                  <Icone nome="contas" />
                </span>
                Contas
              </Link>
            )}
            <Link to="/metas" className="of-atalho">
              <span aria-hidden="true">
                <Icone nome="broto" />
              </span>
              Metas
            </Link>
            {apiConfigurada && (
              <Link to="/categorias" className="of-atalho">
                <span aria-hidden="true">
                  <Icone nome="categorias" />
                </span>
                Categorias
              </Link>
            )}
          </div>
        </article>

        <article className="of-kpi">
          <p className="of-kpi-rotulo">
            <span className="of-kpi-icone entrada" aria-hidden="true">
              <Icone nome="entrada" tamanho={18} />
            </span>
            Receitas
          </p>
          <p className="of-kpi-valor">{comNumeros ? formatarBRL(visao.totais.entradas) : 'R$ —'}</p>
          {comNumeros ? (
            <SeloDeTendencia variacao={visao.variacao.receitas} referencia={mesAnterior} />
          ) : (
            <p className="of-kpi-rodape">O que entrou no mês</p>
          )}
        </article>

        <article className="of-kpi">
          <p className="of-kpi-rotulo">
            <span className="of-kpi-icone saida" aria-hidden="true">
              <Icone nome="saida" tamanho={18} />
            </span>
            Despesas
          </p>
          <p className="of-kpi-valor">{comNumeros ? formatarBRL(visao.totais.saidas) : 'R$ —'}</p>
          {comNumeros ? (
            <>
              {/* O que saiu das contas e o que foi para as faturas (o
                  pagamento da fatura não conta de novo). */}
              <p className="of-kpi-origem">
                {formatarBRL(visao.totais.aVista)} à vista · {formatarBRL(visao.totais.noCredito)} no crédito
              </p>
              <SeloDeTendencia variacao={visao.variacao.despesas} maiorEhMelhor={false} referencia={mesAnterior} />
            </>
          ) : (
            <p className="of-kpi-rodape">O que saiu no mês, à vista e no crédito</p>
          )}
        </article>

        <Link to="/metas" className="of-kpi of-kpi-link">
          <p className="of-kpi-rotulo">
            <span className="of-kpi-icone meta" aria-hidden="true">
              <Icone nome="broto" tamanho={18} />
            </span>
            Metas
          </p>
          <p className="of-kpi-valor">
            {resumo.total > 0 ? (
              <>
                {resumo.emAndamento} <small>de {resumo.total}</small>
              </>
            ) : (
              '0'
            )}
          </p>
          <p className="of-kpi-rodape">
            {resumo.total === 0 ? (
              'Plante a primeira meta'
            ) : (
              <>
                <span className="of-tendencia bom">em andamento</span>
                {resumo.concluidas > 0 && `${resumo.concluidas} concluída${resumo.concluidas > 1 ? 's' : ''}`}
              </>
            )}
          </p>
        </Link>
      </section>

      <div className="of-grade">
        <section className="cartao of-painel of-painel-grafico" aria-labelledby="titulo-evolucao">
          <div className="of-painel-cabecalho">
            <h2 id="titulo-evolucao">Evolução do saldo</h2>
            {comNumeros && (
              <div className="abas" role="group" aria-label="Período do gráfico">
                {faixasDisponiveis.map((opcao) => (
                  <button key={opcao.id} type="button" aria-pressed={faixa === opcao.id} onClick={() => setFaixa(opcao.id)}>
                    {opcao.rotulo}
                  </button>
                ))}
              </div>
            )}
          </div>
          {serie ? (
            <GraficoDeSaldo
              // Outra faixa: gráfico novo, com o cursor em repouso.
              key={faixa}
              serie={serie}
              variacao={faixa === '30d' || faixa === '12m' || faixa === '6m' ? visao.variacao.saldo : null}
              descricao={`Evolução do saldo em ${FAIXAS.find((opcao) => opcao.id === faixa).rotulo}: de ${formatarBRL(serie[0].saldo)} a ${formatarBRL(serie.at(-1).saldo)}`}
            />
          ) : (
            <VazioDaVisao semContas={semContas} real={real} aoVerExemplo={() => setExemplo(true)}
              aoCadastrarConta={() => setModal('conta')} />
          )}
        </section>

        <section className="cartao of-painel" aria-labelledby="titulo-categorias">
          <div className="of-painel-cabecalho">
            <h2 id="titulo-categorias">Despesas por categoria</h2>
            {comNumeros && <small>{NOME_DO_MES.format(comoData(hoje))}</small>}
          </div>
          {comNumeros && visao.categorias.length > 0 ? (
            <Rosca fatias={fatiasDaRosca(visao.categorias, 6)} total={visao.totais.saidas} rotuloDoTotal="gasto neste mês" />
          ) : (
            <p className="of-discreto">Quando houver despesas no mês, elas aparecem aqui divididas por categoria.</p>
          )}
        </section>

        <section className="cartao of-painel" aria-labelledby="titulo-ultimas">
          <div className="of-painel-cabecalho">
            <h2 id="titulo-ultimas">Últimas transações</h2>
            {real && comNumeros && (
              <Link to="/lancamentos" className="of-ver-mais">
                Ver todas
                <Icone nome="proximo" tamanho={14} />
              </Link>
            )}
          </div>
          {diasDasUltimas.length > 0 ? (
            <div className="of-transacoes">
              {diasDasUltimas.map((dia) => (
                <div key={dia.data} className="of-transacoes-dia">
                  <p className="of-transacoes-data">{rotuloDoDia(dia.data, hoje)}</p>
                  <ul>
                    {dia.linhas.map((linha) => (
                      <li key={linha.id ?? `${linha.data}-${linha.descricao}`}>
                        <span className="of-marca-categoria" style={{ '--cor-da-categoria': `var(--cat-${linha.cor ?? 'neutro'})` }} aria-hidden="true">
                          <Icone nome={iconeDaLinha(linha, linha.cor)} tamanho={16} />
                        </span>
                        <span className="of-transacao-textos">
                          <b>{linha.descricao}</b>
                          <small>{linha.categoria}</small>
                        </span>
                        <span className={`of-transacao-valor${linha.valor > 0 ? ' entrada' : linha.tipo === 'transferencia' ? '' : ' saida'}`}>
                          {formatarComSinal(linha.valor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="of-discreto">
              {comNumeros ? 'Nenhum lançamento até hoje neste período.' : 'Os lançamentos mais recentes aparecem aqui.'}
            </p>
          )}
        </section>

        <section className="cartao of-painel of-painel-metas" aria-labelledby="titulo-metas">
          <div className="of-painel-cabecalho">
            <h2 id="titulo-metas">Minhas metas</h2>
            <Link to="/metas" className="of-ver-mais">
              {metas.length > 0 ? 'Ver todas' : 'Criar meta'}
              <Icone nome="proximo" tamanho={14} />
            </Link>
          </div>
          {metasEmDestaque.length > 0 ? (
            <>
            <ul className="of-metas-resumo">
              {metasEmDestaque.map((meta) => (
                <li key={meta.id}>
                  <Link to={`/metas#${meta.id}`}>
                    <span className="of-metas-resumo-arvore">
                      <Arvore semente={sementeDaMeta(meta.id)} progresso={progresso(meta)} compacta rotulo="" />
                    </span>
                    <span className="of-metas-resumo-textos">
                      <b>{meta.nome}</b>
                      <small>
                        <span className="of-valor-guardado">{formatarBRL(guardado(meta))}</span> de {formatarBRL(meta.alvo)}
                      </small>
                      <span className="of-progresso" aria-hidden="true">
                        <i style={{ '--p': `${porcentagem(meta)}%` }} />
                      </span>
                    </span>
                    <span className="of-metas-resumo-porcento">{porcentagem(meta)}%</span>
                  </Link>
                </li>
              ))}
            </ul>
            {pertoDeCrescer && (
              <div className="of-regar-convite">
                <span className="of-regar-convite-icone" aria-hidden="true">
                  <Icone nome="gota" tamanho={18} />
                </span>
                <p>
                  Faltam <b>{formatarBRL(pertoDeCrescer.proxima.faltam)}</b> para {pertoDeCrescer.meta.nome} virar{' '}
                  {pertoDeCrescer.proxima.fase.id === 'frutos' ? 'árvore com maçãs' : pertoDeCrescer.proxima.fase.nome.toLowerCase()}.
                </p>
                <Link className="of-regar-convite-link" to={`/metas#${pertoDeCrescer.meta.id}`}>
                  Regar
                </Link>
              </div>
            )}
            </>
          ) : (
            <div className="of-metas-convite">
              <span className="of-metas-resumo-arvore grande">
                <Arvore semente={7} progresso={0} compacta rotulo="" />
              </span>
              <p>
                {metas.length > 0
                  ? 'Todas as suas metas estão completas. Que tal plantar a próxima?'
                  : 'Cada meta é uma árvore: cada aporte rega e faz crescer. Comece por uma reserva ou uma viagem.'}
              </p>
            </div>
          )}
        </section>

        <SaldoPorConta saldos={saldos} investida={investida} real={real} />

        {cartoes.length > 0 && (
          <section className="cartao of-painel of-painel-cartoes" aria-labelledby="titulo-dos-cartoes">
            <div className="of-painel-cabecalho">
              <h2 id="titulo-dos-cartoes">Cartões de crédito</h2>
              <Link to="/contas#cartoes" className="of-ver-mais">
                Ver todos
                <Icone nome="proximo" tamanho={14} />
              </Link>
            </div>
            {/* O que as faturas já comprometem, separado do saldo das contas. */}
            <div className="of-compromisso">
              <span>Compromisso nas faturas</span>
              <b>{formatarBRL(compromisso.usado)}</b>
              <small>
                {formatarBRL(compromisso.faturasAtuais)} nas faturas atuais · {formatarBRL(compromisso.futuras)} em
                parcelas futuras
              </small>
            </div>
            <ul className="of-cartoes">
              {cartoes.map((cartao) => (
                <li key={cartao.id} className={`cor-${cartao.cor ?? 'grafite'}`}>
                  <span className="of-cartoes-pastilha" aria-hidden="true" />
                  <Link to={`/contas/cartoes/${cartao.id}`}>{cartao.nome}</Link>
                  <span className="of-cartoes-valor">{formatarBRL(cartao.fatura_atual_centavos)}</span>
                  <small>fatura atual · vence {formatarData(cartao.fatura_atual.vencimento).slice(0, 5)}</small>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Dados do cadastro (Firestore), como pede a página Principal no
          enunciado de Tecnologias para Desenvolvimento Web. */}
      {dados && (
        <section className="cartao of-painel of-dados" aria-labelledby="titulo-dados">
          <div className="of-painel-cabecalho">
            <h2 id="titulo-dados">Seus dados</h2>
            <small>Do seu cadastro</small>
          </div>
          <dl className="of-dados-pessoais">
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
        </section>
      )}

      {cadastros && (
        <Modal aberta={Boolean(modal)} titulo={MODAIS[modal]?.titulo} descricao={MODAIS[modal]?.descricao}
          aoFechar={fecharModal} ocupado={modalOcupado}>
          {modal === 'lancamento' && (
            <FormularioDeLancamento espacoId={espacoId} contas={contasAtivas} temCartoes={cartoes.length > 0}
              categorias={cadastros.categorias} pessoasConhecidas={cadastros.pessoas} aoLancar={aposCriar}
              aoCancelar={fecharModal} aoMudarOcupado={setModalOcupado} />
          )}
          {modal === 'compra' && (
            <CompraNoCartao espacoId={espacoId} cartoes={cartoes} categorias={cadastros.categorias}
              pessoasConhecidas={cadastros.pessoas} aoComprar={aposCriar} aoCancelar={fecharModal}
              aoMudarOcupado={setModalOcupado} />
          )}
          {modal === 'conta' && (
            <FormularioDeConta espacoId={espacoId} aoSalvar={aposCriar} aoCancelar={fecharModal} aoMudarOcupado={setModalOcupado} />
          )}
          {modal === 'cartao' && (
            <FormularioDeCartao espacoId={espacoId} aoSalvar={aposCriar} aoCancelar={fecharModal} aoMudarOcupado={setModalOcupado} />
          )}
        </Modal>
      )}
    </div>
  );
}

// Saldo de cada conta, com o disponível (o dinheiro para usar: corrente,
// carteira e poupança) separado do investido (o patrimônio aplicado). A barra
// de cima mostra a divisão; cada conta tem a parte dela no seu grupo.
function SaldoPorConta({ saldos, investida, real }) {
  const grupos = saldos
    ? [
        { id: 'disponivel', titulo: 'Disponível para usar', icone: 'contas', grupo: saldos.disponivel, legenda: 'corrente, carteira e poupança' },
        {
          id: 'investido',
          titulo: 'Investido',
          icone: 'crescimento',
          grupo: saldos.investido,
          legenda: investida === null ? 'patrimônio aplicado' : `${investida}% do patrimônio`,
        },
      ]
    : [];
  return (
    <section className="cartao of-painel of-painel-saldos" aria-labelledby="titulo-saldos">
      <div className="of-painel-cabecalho">
        <h2 id="titulo-saldos">Saldo por conta</h2>
        {real && saldos && (
          <Link to="/contas" className="of-ver-mais">
            Ver contas
            <Icone nome="proximo" tamanho={14} />
          </Link>
        )}
      </div>
      {saldos ? (
        <div className="of-saldos-corpo">
          <div className="of-saldos-lado">
          <div className="of-saldos-resumo">
            {grupos.map(({ id, titulo, icone, grupo, legenda }) => (
              <div key={id} className={`of-saldo-grupo ${id}`}>
                <span className="of-saldo-grupo-titulo">
                  <Icone nome={icone} tamanho={16} />
                  {titulo}
                </span>
                <b>{formatarBRL(grupo.total)}</b>
                <small>{legenda}</small>
              </div>
            ))}
          </div>
          {investida !== null && (
            <span
              className="of-saldos-divisao"
              role="img"
              aria-label={`${100 - investida}% disponível e ${investida}% investido`}
              style={{ '--investido': `${investida}%` }}
            />
          )}
          {saldos.investido.contas.length === 0 && (
            <p className="of-discreto">
              Tem dinheiro aplicado? Uma conta do tipo Investimento separa o patrimônio do que está disponível para usar.
              {real && (
                <>
                  {' '}
                  <Link to="/contas?cadastrar=conta">Cadastrar conta</Link>
                </>
              )}
            </p>
          )}
          </div>
          <div className="of-saldos-lado">
          {grupos
            .filter(({ grupo }) => grupo.contas.length > 0)
            .map(({ id, grupo }) => (
              <div key={id} className="of-saldos-lista">
                <h3 className="of-saldos-lista-titulo">{id === 'disponivel' ? 'Contas' : 'Investimentos'}</h3>
                <ul>
                  {grupo.contas.map((conta) => (
                    <li key={conta.id ?? conta.nome}>
                      <span className="of-saldos-nome">
                        <b>{conta.nome}</b>
                        {/* O tipo só quando o nome não é o próprio tipo ("Conta corrente"). */}
                        {normalizarTexto(conta.nome) !== normalizarTexto(rotuloDoTipoDeConta(conta.tipo)) && (
                          <small>{rotuloDoTipoDeConta(conta.tipo)}</small>
                        )}
                      </span>
                      <span className={`of-saldos-valor${conta.saldo < 0 ? ' negativo' : ''}`}>{formatarBRL(conta.saldo)}</span>
                      <span className={`of-progresso ${id}`} aria-hidden="true">
                        <i style={{ '--p': `${Math.round(conta.fatia * 100)}%` }} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="of-discreto">
          Com as contas cadastradas, o saldo de cada uma aparece aqui, com o disponível separado do investido.
        </p>
      )}
    </section>
  );
}

// Gráfico vazio: sem contas, convida a cadastrar (no modal, sem sair da
// tela); sem API, oferece o exemplo.
function VazioDaVisao({ semContas, real, aoVerExemplo, aoCadastrarConta }) {
  if (semContas) {
    return (
      <div className="vazio">
        <span className="simbolo" aria-hidden="true">
          <Icone nome="contas" tamanho={20} />
        </span>
        <h3>Comece pelas suas contas</h3>
        <p>Cadastre onde o seu dinheiro está (conta corrente, poupança, carteira) com o saldo de hoje. O gráfico acompanha o saldo a partir daí.</p>
        <button type="button" onClick={aoCadastrarConta}>
          <Icone nome="mais" tamanho={16} />
          Cadastrar conta
        </button>
      </div>
    );
  }
  if (real) {
    return <p className="of-discreto">O gráfico aparece aqui quando o servidor responder.</p>;
  }
  return (
    <div className="vazio">
      <span className="simbolo" aria-hidden="true">
        <Icone nome="crescimento" tamanho={20} />
      </span>
      <h3>Seu saldo, dia a dia</h3>
      <p>
        Contas e lançamentos ficam na API do livro-caixa, que não está ligada a esta versão do site. Veja a tela com
        dados fictícios para conhecer cada parte.
      </p>
      <button type="button" onClick={aoVerExemplo}>
        <Icone nome="olho" tamanho={16} />
        Ver com dados de exemplo
      </button>
    </div>
  );
}
