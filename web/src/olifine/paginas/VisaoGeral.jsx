import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import Esqueleto from '../../componentes/Esqueleto';
import { useCarga } from '../../componentes/useCarga';
import { formatarBRL, formatarComSinal } from '../../regras/dinheiro';
import { formatarData, hojeIso } from '../../regras/datas';
import { contasBancarias, estaNoMes, lancamentosDasContas, mesDe, paraExtrato, saldoTotal } from '../../regras/livroCaixa';
import {
  apiConfigurada,
  listarCategorias,
  listarContas,
  listarLancamentos,
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
import { guardado, porcentagem, progresso, proximaFase, resumoDasMetas, sementeDaMeta } from '../regras/metas';
import { somarDias } from '../regras/serie';
import { leituraDaVariacao, textoDaVariacao } from '../regras/tendencia';
import { FAIXAS, fatiasDaRosca, montarVisao } from '../regras/visao';
import { useMetas } from '../useMetas';

const MES_POR_EXTENSO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const NOME_DO_MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' });
const DIA_DA_LISTA = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const comoData = (iso) => new Date(`${iso}T12:00:00Z`);

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
// antiga, erro), a tela abre do mesmo jeito, só sem a comparação.
async function carregarVisao(espacoId, hoje) {
  const inicioDoMes = `${hoje.slice(0, 7)}-01`;
  const trintaDias = somarDias(hoje, -29);
  const [contas, categorias, lancamentos, relatorio] = await Promise.all([
    listarContas(espacoId),
    listarCategorias(espacoId),
    listarLancamentos(espacoId, { de: inicioDoMes < trintaDias ? inicioDoMes : trintaDias }),
    relatorioMensal(espacoId).catch(() => null),
  ]);
  return { contas, categorias, lancamentos, relatorio };
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
// evolução do saldo, as despesas por categoria, as últimas transações e as
// metas. Com a API, dados de verdade; sem ela (Pages), a tela vazia oferece o
// modo de exemplo, sempre marcado.
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
      contas: contasBancarias(contas)
        .filter((conta) => conta.ativa || conta.saldo_centavos !== 0)
        .map((conta) => ({ nome: conta.nome, saldo: conta.saldo_centavos })),
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
          {real && comNumeros && (
            <Link className="botao" to="/lancamentos">
              <Icone nome="mais" tamanho={16} />
              Novo lançamento
            </Link>
          )}
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
            <SeloDeTendencia variacao={visao.variacao.despesas} maiorEhMelhor={false} referencia={mesAnterior} />
          ) : (
            <p className="of-kpi-rodape">O que saiu no mês</p>
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
            <VazioDaVisao semContas={semContas} real={real} aoVerExemplo={() => setExemplo(true)} />
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
                  {pertoDeCrescer.proxima.fase.id === 'frutos' ? 'árvore com frutos' : pertoDeCrescer.proxima.fase.nome.toLowerCase()}.
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
    </div>
  );
}

// Gráfico vazio: sem contas, convida a cadastrar; sem API, oferece o exemplo.
function VazioDaVisao({ semContas, real, aoVerExemplo }) {
  if (semContas) {
    return (
      <div className="vazio">
        <span className="simbolo" aria-hidden="true">
          <Icone nome="contas" tamanho={20} />
        </span>
        <h3>Comece pelas suas contas</h3>
        <p>Cadastre onde o seu dinheiro está (conta corrente, poupança, carteira) com o saldo de hoje. O gráfico acompanha o saldo a partir daí.</p>
        <Link className="botao" to="/contas">
          <Icone nome="mais" tamanho={16} />
          Cadastrar conta
        </Link>
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
