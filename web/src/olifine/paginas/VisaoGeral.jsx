import { memo, useCallback, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import CompraNoCartao from '../../componentes/CompraNoCartao';
import { useConviteDoPlano } from '../../componentes/convite/useConviteDoPlano';
import Esqueleto from '../../componentes/Esqueleto';
import FiltroDePessoa from '../../componentes/FiltroDePessoa';
import FormularioDeCartao from '../../componentes/FormularioDeCartao';
import FormularioDeConta from '../../componentes/FormularioDeConta';
import FormularioDeLancamento from '../../componentes/FormularioDeLancamento';
import MiniaturaDoCartao from '../../componentes/MiniaturaDoCartao';
import Menu from '../../componentes/Menu';
import Modal from '../../componentes/Modal';
import { useCarga } from '../../componentes/useCarga';
import { useUsoDoPlano } from '../../componentes/useUsoDoPlano';
import { descontarAReceber, partesDoRacha, rachaPorPessoa, totaisDoRacha } from '../../regras/aReceber';
import { resumoDasFaturas, usoDoLimite } from '../../regras/cartoes';
import { corDaCategoria } from '../../regras/cores';
import { formatarBRL, formatarComSinal } from '../../regras/dinheiro';
import { formatarData, hojeIso } from '../../regras/datas';
import { donoDasMetas } from '../../regras/espacos';
import { comAFamilia, filtrarPorPessoa, gastoPorPessoa, pessoasDaFamilia, TITULAR, TODOS } from '../../regras/familia';
import { familiaLiberada, planoDoCliente } from '../../regras/planos';
import { normalizarTexto } from '../../regras/texto';
import {
  cartoesDe,
  contasBancarias,
  lancamentosDasContas,
  paraExtrato,
  rotuloDoTipoDeConta,
  saldoTotal,
} from '../../regras/livroCaixa';
import { somarPorOrigem } from '../../regras/resumo';
import {
  apiConfigurada,
  listarCartoes,
  listarCategorias,
  listarContas,
  listarLancamentos,
  listarPessoas,
  listarRachas,
  relatorioMensal,
} from '../../servicos/livroCaixa';
import Arvore from '../componentes/Arvore';
import FolhasEmVolta from '../componentes/FolhasEmVolta';
import GraficoDeSaldo from '../componentes/GraficoDeSaldo';
import Icone from '../../componentes/Icone';
import Rosca from '../componentes/Rosca';
import Dica from '../componentes/Dica';
import RachaPorPessoa from '../componentes/RachaPorPessoa';
import SaldoConsolidado from '../componentes/SaldoConsolidado';
import SimboloDoVazio from '../componentes/SimboloDoVazio';
import {
  CARTOES_DE_EXEMPLO,
  CONTAS_DE_EXEMPLO,
  HOJE_DE_EXEMPLO,
  LANCAMENTOS_DE_EXEMPLO,
  MESES_DE_EXEMPLO,
  PREVISTOS_DE_EXEMPLO,
  SALDO_DE_EXEMPLO,
} from '../dados/exemplo';
import { iconeDaLinha } from '../regras/icones';
import { inicioDaCarga, linhasDoMes, mesAnterior as mesQueVeioAntes } from '../regras/despesasDoMes';
import { calcularSaldoLivre, fimDoMes } from '../regras/saldoLivre';
import { liquidezDisponivel, parteInvestida, separarSaldos, sobreOTipo, textoDaFatia } from '../regras/saldos';
import { guardado, porcentagem, progresso, proximaFase, resumoDasMetas, sementeDaMeta } from '../regras/metas';
import { somarDias } from '../regras/serie';
import { leituraDaVariacao, textoDaVariacao, variacaoPercentual } from '../regras/tendencia';
import { FAIXAS, fatiasDaRosca, montarVisao } from '../regras/visao';
import { useMetas } from '../useMetas';
import '../../estilos/cartoes.css';
import '../estilos/familia.css';

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

// Contas, categorias, os lançamentos desde o primeiro dia de três meses
// atrás (o bastante para as compras das faturas que vencem neste mês e no
// anterior, despesasDoMes.ts) e o relatório de 12 meses. Sem o relatório (API
// antiga, erro), a tela abre do mesmo jeito, só sem a comparação das receitas.
// Os cartões trazem as faturas (sem eles, a tela abre do mesmo jeito); as
// pessoas dos rachas são só sugestão no formulário do "+ Novo". Os rachas
// (as despesas divididas de qualquer data) montam o "Gastos por pessoa"; sem
// eles (API antiga, erro), o painel fica vazio.
async function carregarVisao(espacoId, hoje) {
  const [contas, categorias, lancamentos, relatorio, cartoes, pessoas, rachas] = await Promise.all([
    listarContas(espacoId),
    listarCategorias(espacoId),
    listarLancamentos(espacoId, { de: inicioDaCarga(hoje.slice(0, 7)) }),
    relatorioMensal(espacoId).catch(() => null),
    listarCartoes(espacoId).catch(() => []),
    listarPessoas(espacoId).catch(() => []),
    listarRachas(espacoId).catch(() => []),
  ]);
  return { contas, categorias, lancamentos, relatorio, cartoes, pessoas, rachas };
}

// As últimas transações em grupos por dia, na ordem da lista.
function agruparPorDia(linhas) {
  return linhas.reduce((grupos, linha) => {
    const ultimo = grupos.at(-1);
    if (ultimo?.data === linha.data) {
      ultimo.linhas.push(linha);
    } else {
      grupos.push({ data: linha.data, linhas: [linha] });
    }
    return grupos;
  }, []);
}

// O resumo das metas, as que aparecem no card e no painel e a mais perto de
// mudar de fase (o convite para regar).
function destaquesDasMetas(metas) {
  const metasEmDestaque = [...metas]
    .filter((meta) => porcentagem(meta) < 100)
    .sort((a, b) => progresso(b) - progresso(a))
    .slice(0, 4);
  const pertoDeCrescer = metasEmDestaque
    .map((meta) => ({ meta, proxima: proximaFase(meta) }))
    .filter((item) => item.proxima && item.proxima.fase.id !== 'broto')
    .sort((a, b) => a.proxima.faltam / a.meta.alvo - b.proxima.faltam / b.meta.alvo)[0];
  return { resumo: resumoDasMetas(metas), metasEmDestaque, pertoDeCrescer };
}

// Gasto de cada pessoa da casa no mês (Modo Família, visão consolidada). O
// nome diz "da casa" para não confundir com o "Gastos por pessoa" do racha.
const GastoPorPessoa = memo(function GastoPorPessoa({ gastos, mes }) {
  const maior = gastos[0]?.valor ?? 0;
  return (
    <section className="cartao of-painel of-painel-gasto-por-pessoa" aria-labelledby="titulo-gasto-por-pessoa">
      <div className="of-painel-cabecalho">
        <h2 id="titulo-gasto-por-pessoa">Gasto da casa por pessoa</h2>
        <small>{mes}</small>
      </div>
      {gastos.length > 0 ? (
        <ol className="of-gasto-por-pessoa" aria-label="Gasto de cada pessoa da casa, do maior para o menor">
          {gastos.map((gasto) => (
            <li key={gasto.id} className={gasto.id === TITULAR ? 'pessoa-titular' : `pessoa-${gasto.cor ?? 'grafite'}`}>
              <span className="nome">
                <span className={`ponto-de-pessoa ${gasto.id === TITULAR ? 'titular' : (gasto.cor ?? 'grafite')}`} aria-hidden="true" />
                <span>{gasto.nome}</span>
              </span>
              <b>{formatarBRL(gasto.valor)}</b>
              <span className="fatia">{gasto.fatia}%</span>
              <span className="barra" aria-hidden="true">
                <i style={{ '--largura': `${maior > 0 ? Math.max(2, Math.round((gasto.valor / maior) * 100)) : 0}%` }} />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="of-discreto">Quando houver despesas no mês, o gasto de cada um aparece aqui.</p>
      )}
    </section>
  );
});

// "Gastos por pessoa" no Free: o que o racha com nome faz, e o convite do
// Plano Família (a divisão com o nome e a parte de cada pessoa é dele).
const ConviteDoRacha = memo(function ConviteDoRacha({ aoConhecer }) {
  return (
    <section className="cartao of-painel of-painel-racha bloqueado" aria-labelledby="titulo-racha">
      <div className="of-painel-cabecalho">
        <h2 id="titulo-racha">Gastos por pessoa</h2>
        <small>Plano Família</small>
      </div>
      <p className="of-discreto">
        Dividiu um jantar ou uma viagem? Com o nome e a parte de cada pessoa, o app separa o que é seu do que vão te
        devolver, com o prazo para pagar e o aviso de quem passou dele.
      </p>
      <button type="button" onClick={aoConhecer}>
        <Icone nome="pessoas" tamanho={16} />
        Conhecer o Plano Família
      </button>
    </section>
  );
});

// Uma linha só (o texto cortado com reticências no card estreito): a altura
// do card não muda com o tamanho do mês por extenso.
function SeloDeTendencia({ variacao, maiorEhMelhor = true, referencia }) {
  const leitura = leituraDaVariacao(variacao, { maiorEhMelhor });
  if (!leitura) {
    return (
      <p className="of-kpi-rodape">
        <span className="of-kpi-rodape-texto">Sem mês anterior</span>
      </p>
    );
  }
  return (
    <p className="of-kpi-rodape">
      <span className={`of-tendencia ${leitura}`}>{textoDaVariacao(variacao)}</span>
      <span className="of-kpi-rodape-texto">sobre {referencia}</span>
    </p>
  );
}

// Visão geral da OliFine: o saldo livre como card principal (com o
// patrimônio total, o investido e o fechamento previsto do mês; no vermelho,
// ele vira "Déficit de caixa"), o disponível em conta, as despesas do mês (só
// a parte de quem lançou: o racha fica a receber) e as metas, cada card com o
// "i" que explica o número; a evolução do saldo, as despesas por categoria,
// os gastos por pessoa (o racha, com a inadimplência), as últimas transações,
// as metas e o compromisso nos cartões. Com a API, dados de verdade; sem ela
// (Pages), a tela vazia oferece o modo de exemplo, sempre marcado.
//
// O "+ Novo" do topo deixa a pessoa escolher o que criar (lançamento à
// vista, compra no crédito, conta ou cartão), cada um no seu modal, sem sair
// da tela.
//
// Desempenho (sem engasgos): tudo o que sai dos dados é calculado em useMemo
// (só refaz quando os dados mudam, e não a cada abertura de modal ou troca
// de filtro), as ações passadas aos filhos são estáveis (useCallback) e os
// componentes de desenho (árvore, rosca, gráfico, miniatura do cartão, folhas)
// são memo. As listas daqui são curtas (5 transações, 4 metas): não pedem
// virtualização. Os custos grandes estavam no CSS (estilos/movimento.css,
// borda viva; olifine.css, grade dos cartões).
export default function VisaoGeral() {
  const { usuario, pessoa, espaco, espacos } = useOutletContext();
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
  // Modo Família: a casa toda (TODOS), o titular ou uma pessoa da família.
  const [filtroEscolhido, setFiltroDePessoa] = useState(TODOS);

  const espacoId = espaco.dados?.id;
  const buscar = useMemo(
    () => (apiConfigurada && espacoId ? () => carregarVisao(espacoId, hojeReal) : null),
    [espacoId, hojeReal],
  );
  const livro = useCarga(buscar);
  // O teto do Free no "+ Novo" e o convite do plano (racha com nome no Free).
  const plano = useUsoDoPlano(exemplo ? null : espacoId);
  const convite = useConviteDoPlano();
  const { metas } = useMetas(donoDasMetas(usuario?.uid, espaco?.dados), { exemplo });
  const pessoasDaCasa = useMemo(() => pessoasDaFamilia(espaco.dados), [espaco.dados]);
  // Pessoa tirada da família (ou modo desligado) volta o filtro para a casa toda.
  const filtroDePessoa =
    pessoasDaCasa.length > 0 && (filtroEscolhido === TITULAR || pessoasDaCasa.some((alvo) => alvo.id === filtroEscolhido))
      ? filtroEscolhido
      : TODOS;

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
        // Como na API, o saldo das contas já inclui o que tem data futura.
        projecao: {
          saldo: SALDO_DE_EXEMPLO + PREVISTOS_DE_EXEMPLO.reduce((soma, linha) => soma + linha.valor, 0),
          linhas: [...LANCAMENTOS_DE_EXEMPLO, ...PREVISTOS_DE_EXEMPLO],
          cartoes: CARTOES_DE_EXEMPLO,
        },
      };
    }
    if (!livro.dados) {
      return null;
    }
    const { contas, categorias, lancamentos, relatorio, cartoes } = livro.dados;
    const mes = hojeReal.slice(0, 7);
    const dasContas = paraExtrato(lancamentosDasContas(lancamentos, contas), contas, categorias);
    const comCartoes = paraExtrato(lancamentos, contas, categorias);
    // As despesas são só as suas: numa despesa dividida, a parte que outra
    // pessoa ainda vai pagar é um valor a receber e sai do mês; a vencida sem
    // pagamento volta (regras/aReceber.ts). O saldo e as últimas transações
    // continuam com o que mexeu de verdade nas contas.
    const soMinhaParte = descontarAReceber(comCartoes, hojeReal);
    // O mês: o à vista com data nele e as faturas dos cartões que vencem nele
    // (todas as compras delas, de qualquer data), sem o pagamento da fatura.
    const ciclos = cartoesDe(contas);
    const doMes = linhasDoMes(soMinhaParte, ciclos, mes);
    // Com uma pessoa escolhida, os números do mês, as categorias e as últimas
    // transações são só dela; o saldo e o gráfico continuam os das contas,
    // que são da casa toda.
    const daPessoa = (linhas) => filtrarPorPessoa(linhas, filtroDePessoa, pessoasDaCasa);
    const base = montarVisao({
      linhasDasContas: dasContas,
      linhasDoMes: daPessoa(doMes),
      linhasRecentes: daPessoa(comCartoes),
      saldo: saldoTotal(contas),
      meses: relatorio?.meses ?? null,
      hoje: hojeReal,
    });
    // As despesas do mês anterior pela mesma regra (à vista + faturas que
    // venceram nele), para a comparação não misturar duas contas diferentes.
    const anteriores = somarPorOrigem(daPessoa(linhasDoMes(soMinhaParte, ciclos, mesQueVeioAntes(mes))));
    const despesasAntes = anteriores.aVista + anteriores.noCredito;
    base.variacao = { ...base.variacao, despesas: despesasAntes > 0 ? variacaoPercentual(base.totais.saidas, despesasAntes) : null };
    return {
      ...base,
      gastoPorPessoa: pessoasDaCasa.length > 0 ? gastoPorPessoa(doMes, pessoasDaCasa) : [],
      // Contas com dinheiro (o cartão é dívida, com painel próprio), para o
      // saldo por conta: separarSaldos tira a desativada zerada.
      contas: contasBancarias(contas).map((conta) => ({
        id: conta.id,
        nome: conta.nome,
        tipo: conta.tipo,
        saldo: conta.saldo_centavos,
        ativa: conta.ativa,
      })),
      // O que o saldo livre do mês precisa: o extrato das contas com as datas
      // futuras (a listagem não tem data final) e as faturas dos cartões.
      projecao: { saldo: saldoTotal(contas), linhas: dasContas, cartoes },
    };
  }, [exemplo, livro.dados, hojeReal, filtroDePessoa, pessoasDaCasa]);

  const real = apiConfigurada && !exemplo;
  const semContas = real && Boolean(livro.dados) && livro.dados.contas.length === 0;
  const comNumeros = Boolean(visao) && !semContas;
  // O racha de cada pessoa (de qualquer data) e os totais: a receber,
  // recebido e assumido (regras/aReceber.ts).
  const racha = useMemo(() => {
    const partes = partesDoRacha(real ? (livro.dados?.rachas ?? []) : [], hojeReal);
    return { devedores: rachaPorPessoa(partes), totais: totaisDoRacha(partes, fimDoMes(hojeReal)) };
  }, [real, livro.dados, hojeReal]);

  // Tudo o que sai dos dados, calculado só quando eles mudam (e não a cada
  // abertura de modal, troca de filtro ou de período do gráfico).
  const { resumo, metasEmDestaque, pertoDeCrescer } = useMemo(() => destaquesDasMetas(metas), [metas]);
  const diasDasUltimas = useMemo(() => (comNumeros ? agruparPorDia(visao.ultimas) : []), [comNumeros, visao]);
  const fatiasDaCategoria = useMemo(() => (comNumeros ? fatiasDaRosca(visao.categorias, 6) : []), [comNumeros, visao]);
  // Cartões e cadastros do "+ Novo": só com a API (o exemplo não tem cartão).
  const cadastros = real ? livro.dados : null;
  const cartoes = useMemo(() => cadastros?.cartoes ?? [], [cadastros]);
  const faturas = useMemo(() => resumoDasFaturas(cartoes, hoje), [cartoes, hoje]);
  const contasAtivas = useMemo(
    () => (cadastros ? contasBancarias(cadastros.contas).filter((conta) => conta.ativa) : []),
    [cadastros],
  );
  // Disponível (corrente, carteira, poupança) x investido (regras/saldos.ts)
  // e quanto sobra até o fim do mês (regras/saldoLivre.ts), com o racha que
  // vence até lá entrando como dinheiro a receber.
  const { saldos, investida, livreDoMes, disponivel } = useMemo(() => {
    if (!comNumeros) {
      return { saldos: null, investida: null, livreDoMes: null, disponivel: null };
    }
    const separados = separarSaldos(visao.contas);
    return {
      saldos: separados,
      investida: parteInvestida(separados),
      disponivel: liquidezDisponivel(visao.contas),
      livreDoMes: calcularSaldoLivre({
        saldo: visao.projecao.saldo,
        linhasDasContas: visao.projecao.linhas,
        cartoes: visao.projecao.cartoes,
        investido: separados.investido.total,
        aReceberDoRacha: racha.totais.aReceberNoMes,
        hoje,
      }),
    };
  }, [comNumeros, visao, hoje, racha]);

  // Ações estáveis: o menu "+ Novo", os formulários e o vazio do gráfico não
  // redesenham só porque a Visão geral redesenhou.
  const { recarregar: recarregarLivro } = livro;
  const { recarregar: recarregarPlano, seCouber } = plano;
  const recarregar = useCallback(() => {
    recarregarLivro();
    recarregarPlano();
  }, [recarregarLivro, recarregarPlano]);
  const fecharModal = useCallback(() => {
    setModal(null);
    setModalOcupado(false);
  }, []);
  const aposCriar = useCallback(() => {
    fecharModal();
    recarregar();
  }, [fecharModal, recarregar]);
  // Lançamento e compra: o modal continua aberto para o próximo (os números
  // da tela atualizam por trás).
  const aposLancar = useCallback(() => recarregar(), [recarregar]);
  const verExemplo = useCallback(() => setExemplo(true), []);
  const conhecerRacha = useCallback(() => convite.abrir('racha'), [convite]);
  const cadastrarConta = useCallback(() => seCouber('contas', () => setModal('conta')), [seCouber]);
  const temCartoes = cartoes.length > 0;
  // No teto do Free, cada opção abre o convite do plano no lugar do modal.
  const opcoesDoNovo = useMemo(
    () => [
      {
        id: 'lancamento',
        rotulo: 'Novo lançamento manual',
        descricao: 'PIX, débito, dinheiro ou TED, direto no saldo da conta.',
        icone: 'lancamentos',
        aoEscolher: () => seCouber('lancamentos_do_mes', () => setModal('lancamento')),
      },
      ...(temCartoes
        ? [
            {
              id: 'compra',
              rotulo: 'Nova compra no crédito',
              descricao: 'Entra na fatura do cartão, à vista ou parcelada.',
              icone: 'cartao',
              aoEscolher: () => seCouber('lancamentos_do_mes', () => setModal('compra')),
            },
          ]
        : []),
      {
        id: 'conta',
        rotulo: 'Cadastrar conta',
        descricao: 'Corrente, poupança, carteira ou investimento.',
        icone: 'contas',
        aoEscolher: () => seCouber('contas', () => setModal('conta')),
      },
      {
        id: 'cartao',
        rotulo: 'Cadastrar cartão',
        descricao: 'Limite, fechamento, vencimento e a cor.',
        icone: 'cartao',
        aoEscolher: () => seCouber('contas', () => setModal('cartao')),
      },
    ],
    [temCartoes, seCouber],
  );

  const carregando = real && (espaco.carregando || (Boolean(espacoId) && livro.carregando && !livro.dados));
  if (pessoa.carregando || carregando) {
    return <Esqueleto />;
  }

  const dados = pessoa.dados;
  const erro = real ? espaco.erro || livro.erro?.message : '';
  const mesAnterior = NOME_DO_MES.format(comoData(somarDias(`${hoje.slice(0, 7)}-01`, -1)));
  const faixa = faixaEscolhida ?? (comNumeros && visao.series['6m'] ? '6m' : '30d');
  const serie = comNumeros ? visao.series[faixa] : null;
  const faixasDisponiveis = FAIXAS.filter((opcao) => !comNumeros || visao.series[opcao.id]);
  // O racha com nome e parte de cada pessoa é do Plano Família (a API confere).
  const divisaoPorPessoa = familiaLiberada(planoDoCliente(espacos));

  return (
    <div className="of-visao">
      {/* O banner das boas-vindas: do "Olá" ao "+ Novo" numa área com moldura
          (que acende com o foco dentro), com moedas e cédulas flutuando por
          trás, como o céu da landing. */}
      <header className="of-cabecalho com-folhas">
        <FolhasEmVolta arranjo="cabecalho" />
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

      {pessoasDaCasa.length > 0 && !exemplo && (
        <div className="of-filtro-da-familia">
          <FiltroDePessoa pessoas={pessoasDaCasa} valor={filtroDePessoa} aoMudar={setFiltroDePessoa} rotulo="Números de quem" />
          <p aria-live="polite">
            {filtroDePessoa === TODOS
              ? 'A casa toda.'
              : `Receitas e despesas do mês e últimas transações de ${filtroDePessoa === TITULAR ? 'você' : pessoasDaCasa.find((alvo) => alvo.id === filtroDePessoa)?.nome}; o disponível e o saldo são da casa toda.`}
          </p>
        </div>
      )}

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

      <section className="of-kpis of-kpis-da-visao" aria-label="Números do mês">
        <SaldoConsolidado
          saldo={comNumeros ? visao.saldo : null}
          resultado={livreDoMes}
          investido={saldos?.investido.total ?? 0}
          investida={investida}
          rodape={
            comNumeros ? (
              <SeloDeTendencia variacao={visao.variacao.saldo} referencia={mesAnterior} />
            ) : (
              <p className="of-kpi-rodape">
                <span className="of-kpi-rodape-texto">Soma das suas contas</span>
              </p>
            )
          }
        >
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
        </SaldoConsolidado>

        {/* Cada card tem sempre as mesmas linhas, com ou sem números: a
            altura fixa do CSS não precisa esconder nada que chegue depois. */}
        {/* Liquidez: o dinheiro que dá para usar agora, somado de todas as
            contas correntes, carteiras e poupanças, sem o investido
            (regras/saldos.ts, liquidezDisponivel). As receitas do mês ficam
            no rodapé, para a informação de antes não sumir. */}
        <article className="of-kpi of-kpi-disponivel">
          <div className="of-kpi-topo">
            <p className="of-kpi-rotulo">
              <span className="of-kpi-icone entrada" aria-hidden="true">
                <Icone nome="contas" tamanho={18} />
              </span>
              Disponível
            </p>
            <Dica titulo="Disponível em conta">
              <p>
                Todo o dinheiro que está agora nas suas contas correntes, carteiras e poupanças, somado. O investido fica
                de fora: é uma posição aplicada, não dinheiro à mão. O cartão de crédito também: ele é dívida.
              </p>
            </Dica>
          </div>
          <p className={`of-kpi-valor${disponivel !== null && disponivel < 0 ? ' negativo' : ''}`}>
            {disponivel === null ? 'R$ —' : formatarBRL(disponivel)}
          </p>
          <p className="of-kpi-origem">Em contas e carteiras, sem o investido</p>
          {comNumeros ? (
            <p className="of-kpi-rodape">
              <span className={`of-tendencia${visao.totais.entradas > 0 ? ' bom' : ''}`}>
                {visao.totais.entradas > 0 ? '+' : ''}
                {formatarBRL(visao.totais.entradas)}
              </span>
              <span className="of-kpi-rodape-texto">de receitas em {NOME_DO_MES.format(comoData(hoje))}</span>
            </p>
          ) : (
            <p className="of-kpi-rodape">
              <span className="of-kpi-rodape-texto">Sem números ainda</span>
            </p>
          )}
        </article>

        <article className="of-kpi">
          <div className="of-kpi-topo">
            <p className="of-kpi-rotulo">
              <span className="of-kpi-icone saida" aria-hidden="true">
                <Icone nome="saida" tamanho={18} />
              </span>
              Despesas
            </p>
            <Dica titulo="Despesas">
              <p>
                O que pesa no mês: o que saiu das contas à vista (PIX, débito, dinheiro) mais o total das faturas dos
                cartões que vencem neste mês, com todas as compras delas. O pagamento da fatura não conta de novo.
              </p>
              <p>
                Num gasto dividido, só a sua parte entra: a de cada pessoa fica a receber, em Gastos por pessoa. Se o
                prazo passar sem pagamento, ela volta para cá.
              </p>
            </Dica>
          </div>
          <p className="of-kpi-valor">{comNumeros ? formatarBRL(visao.totais.saidas) : 'R$ —'}</p>
          {/* O que saiu das contas e as faturas que vencem no mês (o
              pagamento da fatura não conta de novo). */}
          <p className="of-kpi-origem">
            <span>{comNumeros ? formatarBRL(visao.totais.aVista) : 'R$ —'} à vista ·</span>{' '}
            <span>{comNumeros ? formatarBRL(visao.totais.noCredito) : 'R$ —'} nas faturas</span>
          </p>
          {comNumeros ? (
            <SeloDeTendencia variacao={visao.variacao.despesas} maiorEhMelhor={false} referencia={mesAnterior} />
          ) : (
            <p className="of-kpi-rodape">
              <span className="of-kpi-rodape-texto">Sem números ainda</span>
            </p>
          )}
        </article>

        {/* Card só de leitura: sem clique, sem hover e sem levar à aba Metas
            (o painel "Minhas metas", mais abaixo, tem os atalhos). À
            esquerda, a contagem e a barra de todas as metas juntas; à
            direita (card largo), as mais adiantadas, cada uma com a sua
            barra. */}
        <article className="of-kpi of-kpi-largo of-kpi-metas">
          <div className="of-kpi-metas-corpo">
          <div className="of-kpi-metas-resumo">
            <div className="of-kpi-topo">
              <p className="of-kpi-rotulo">
                <span className="of-kpi-icone meta" aria-hidden="true">
                  <Icone nome="broto" tamanho={18} />
                </span>
                Metas
              </p>
              <Dica titulo="Metas">
                <p>
                  Quantas metas você está regando agora e quantas já concluiu. A barra soma todas: quanto já foi
                  guardado do total que você quer juntar. Cada meta é uma árvore: cada valor guardado a faz crescer.
                </p>
              </Dica>
            </div>
            <p className="of-kpi-valor">
              {resumo.total > 0 ? (
                <>
                  {resumo.emAndamento} <small>de {resumo.total} em andamento</small>
                </>
              ) : (
                '0'
              )}
            </p>
            <div className="of-kpi-metas-geral">
              <span className="of-progresso" aria-hidden="true">
                <i style={{ '--p': `${resumo.porcentagem}%` }} />
              </span>
              <small>
                {resumo.total > 0
                  ? `${formatarBRL(resumo.guardado)} de ${formatarBRL(resumo.alvo)} · ${resumo.porcentagem}%`
                  : 'Nada guardado ainda'}
              </small>
            </div>
            <p className="of-kpi-rodape">
              {resumo.total === 0 ? (
                <span className="of-kpi-rodape-texto">Plante a primeira meta</span>
              ) : resumo.concluidas > 0 ? (
                <>
                  <span className="of-tendencia bom">{`${resumo.concluidas} concluída${resumo.concluidas > 1 ? 's' : ''}`}</span>
                  <span className="of-kpi-rodape-texto">com frutos colhidos</span>
                </>
              ) : (
                <span className="of-kpi-rodape-texto">Nenhuma concluída ainda</span>
              )}
            </p>
          </div>
          <ul className="of-kpi-metas-lista" aria-label="Metas mais adiantadas">
            {metasEmDestaque.length > 0 ? (
              metasEmDestaque.slice(0, 3).map((meta) => (
                <li key={meta.id}>
                  <span className="of-kpi-metas-nome">{meta.nome}</span>
                  <b>{porcentagem(meta)}%</b>
                  <span className="of-progresso" aria-hidden="true">
                    <i style={{ '--p': `${porcentagem(meta)}%` }} />
                  </span>
                </li>
              ))
            ) : (
              <li className="of-kpi-metas-dica">
                Reserva, viagem, notebook: cada meta vira uma árvore que cresce a cada valor guardado.
              </li>
            )}
          </ul>
          </div>
        </article>
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
              descricao={`Evolução do saldo em ${FAIXAS.find((opcao) => opcao.id === faixa).rotulo}: de ${formatarBRL(serie[0].saldo)} a ${formatarBRL(serie.at(-1).saldo)}`}
            />
          ) : (
            <VazioDaVisao semContas={semContas} real={real} aoVerExemplo={verExemplo} aoCadastrarConta={cadastrarConta} />
          )}
        </section>

        <section className="cartao of-painel" aria-labelledby="titulo-categorias">
          <div className="of-painel-cabecalho">
            <h2 id="titulo-categorias">Despesas por categoria</h2>
            {comNumeros && <small>{NOME_DO_MES.format(comoData(hoje))}, com as faturas do mês</small>}
          </div>
          {comNumeros && visao.categorias.length > 0 ? (
            <Rosca fatias={fatiasDaCategoria} total={visao.totais.saidas} rotuloDoTotal="gasto neste mês" />
          ) : (
            <p className="of-discreto">Quando houver despesas no mês, elas aparecem aqui divididas por categoria.</p>
          )}
        </section>

        {comNumeros && pessoasDaCasa.length > 0 && filtroDePessoa === TODOS && !exemplo && (
          <GastoPorPessoa gastos={visao.gastoPorPessoa} mes={NOME_DO_MES.format(comoData(hoje))} />
        )}

        {/* O racha a receber, no espaço pessoal: com o Plano Família, quem te
            deve e quem já pagou; no Free, o convite do plano. */}
        {real && livro.dados && espaco.dados?.tipo === 'PF' &&
          (divisaoPorPessoa ? (
            <RachaPorPessoa espacoId={espacoId} devedores={racha.devedores} totais={racha.totais} contas={contasAtivas}
              aoMudar={recarregar} />
          ) : (
            <ConviteDoRacha aoConhecer={conhecerRacha} />
          ))}

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
                        <span className="of-marca-categoria" style={{ '--cor-da-categoria': corDaCategoria(linha.cor) }} aria-hidden="true">
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
              <div className="of-regar-convite borda-viva">
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
            {/* Primeiro o total das faturas (o que vai sair das contas), com o
                próximo vencimento; ao lado, o que ainda vem e o limite livre.
                Separado do saldo das contas: cartão é dívida. */}
            <div className="of-faturas-destaque borda-viva">
              <div className="of-faturas-total">
                <span className="of-faturas-rotulo">
                  <Icone nome="cartao" tamanho={16} />
                  Total das faturas
                  <Dica titulo="Total das faturas">
                    <p>
                      A soma das faturas de todos os cartões: as que já fecharam e ainda não foram pagas, mais a
                      fatura aberta de cada um. As parcelas dos meses seguintes ficam à parte.
                    </p>
                  </Dica>
                </span>
                <b>{formatarBRL(faturas.total)}</b>
                <small>
                  {formatarBRL(faturas.fechadas)} fechadas a pagar · {formatarBRL(faturas.abertas)} nas abertas
                </small>
                {faturas.proximo && (
                  <span className={`of-faturas-proximo${faturas.proximo.vencida ? ' vencida' : ''}`}>
                    <Icone nome={faturas.proximo.vencida ? 'alerta' : 'calendario'} tamanho={14} />
                    {faturas.proximo.vencida ? 'Venceu' : 'Próximo vencimento'} {formatarData(faturas.proximo.vencimento).slice(0, 5)}
                    {' · '}
                    {faturas.proximo.nome}, {formatarBRL(faturas.proximo.valor)}
                  </span>
                )}
              </div>
              <dl className="of-faturas-numeros">
                <div>
                  <dt>Parcelas futuras</dt>
                  <dd>{formatarBRL(faturas.futuras)}</dd>
                </div>
                <div>
                  <dt>Compromisso total</dt>
                  <dd>{formatarBRL(faturas.usado)}</dd>
                </div>
                <div>
                  <dt>Limite livre</dt>
                  <dd>{formatarBRL(faturas.disponivel)}</dd>
                </div>
              </dl>
            </div>
            <ul className="of-cartoes">
              {cartoes.map((cartao) => (
                <li key={cartao.id}>
                  <MiniaturaDoCartao cartao={cartao} titular={dados ? `${dados.nome} ${dados.sobrenome}`.trim() : ''} />
                  <span className="of-cartoes-legenda">
                    <Link to={`/contas/cartoes/${cartao.id}`}>{cartao.nome}</Link>
                    <span className="of-cartoes-valor">{formatarBRL(cartao.fatura_atual_centavos)}</span>
                    <span className="of-cartoes-limite">
                      <span className="of-progresso" aria-hidden="true">
                        <i style={{ '--p': `${usoDoLimite(cartao)}%` }} />
                      </span>
                      {usoDoLimite(cartao)}% do limite
                    </span>
                    <small>
                      fatura atual · vence {formatarData(cartao.fatura_atual.vencimento).slice(0, 5)}
                    </small>
                  </span>
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
              categorias={cadastros.categorias} pessoasConhecidas={comAFamilia(cadastros.pessoas, pessoasDaCasa)}
              familia={pessoasDaCasa} divisaoPorPessoa={divisaoPorPessoa} aoLancar={aposLancar}
              aoCancelar={fecharModal} aoMudarOcupado={setModalOcupado} />
          )}
          {modal === 'compra' && (
            <CompraNoCartao espacoId={espacoId} cartoes={cartoes} categorias={cadastros.categorias}
              pessoasConhecidas={comAFamilia(cadastros.pessoas, pessoasDaCasa)} familia={pessoasDaCasa}
              divisaoPorPessoa={divisaoPorPessoa} aoComprar={aposLancar} aoCancelar={fecharModal}
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

// Saldo de cada conta em cards no padrão dos KPIs do topo (ícone, nome,
// valor e uma linha que explica), com o disponível (o dinheiro para usar:
// corrente, carteira e poupança) separado do investido (o patrimônio
// aplicado). Os dois totais abrem a fileira, cada um com o "i"; cada conta diz
// o que ela é e quanto pesa no seu grupo, em texto, sem gráfico.
const SaldoPorConta = memo(function SaldoPorConta({ saldos, investida, real }) {
  const grupos = saldos
    ? [
        {
          id: 'disponivel',
          titulo: 'Disponível para usar',
          icone: 'contas',
          grupo: saldos.disponivel,
          legenda: investida === null ? 'Corrente, carteira e poupança' : `${100 - investida}% do patrimônio`,
          dica: 'O dinheiro que dá para usar a qualquer hora: conta corrente, carteira e poupança. É dele que sai o saldo livre do mês.',
        },
        {
          id: 'investido',
          titulo: 'Investido',
          icone: 'crescimento',
          grupo: saldos.investido,
          legenda: investida === null ? 'Patrimônio aplicado' : `${investida}% do patrimônio`,
          dica: 'O dinheiro nas contas do tipo Investimento. Ele conta no patrimônio, mas fica fora do saldo livre para não ser gasto no dia a dia.',
        },
      ]
    : [];
  const contas = grupos.flatMap(({ id, grupo }) => grupo.contas.map((conta) => ({ ...conta, grupo: id })));
  const contar = (quantidade) => `${quantidade} ${quantidade === 1 ? 'conta' : 'contas'}`;
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
        <>
          <ul className="of-saldos-cards" aria-label="Totais e saldo de cada conta">
            {grupos.map(({ id, titulo, icone, grupo, legenda, dica }) => (
              <li key={id} className={`of-kpi of-saldo-card total ${id}`}>
                <div className="of-kpi-topo">
                  <p className="of-kpi-rotulo">
                    <span className="of-kpi-icone" aria-hidden="true">
                      <Icone nome={icone} tamanho={16} />
                    </span>
                    {titulo}
                  </p>
                  <Dica titulo={titulo}>
                    <p>{dica}</p>
                  </Dica>
                </div>
                <p className={`of-kpi-valor${grupo.total < 0 ? ' negativo' : ''}`}>{formatarBRL(grupo.total)}</p>
                <p className="of-kpi-origem">{legenda}</p>
                <p className="of-kpi-rodape">
                  <span className="of-tendencia">{contar(grupo.contas.length)}</span>
                </p>
              </li>
            ))}
            {contas.map((conta) => {
              const sobre = sobreOTipo(conta.tipo);
              const tipo = rotuloDoTipoDeConta(conta.tipo);
              return (
                <li key={conta.id ?? conta.nome} className={`of-kpi of-saldo-card ${conta.grupo}`}>
                  <div className="of-kpi-topo">
                    <p className="of-kpi-rotulo">
                      <span className="of-kpi-icone" aria-hidden="true">
                        <Icone nome={sobre.icone} tamanho={16} />
                      </span>
                      <span className="of-saldo-card-nome" title={conta.nome}>
                        {conta.nome}
                      </span>
                    </p>
                    {/* O tipo só quando o nome não é o próprio tipo ("Conta corrente"). */}
                    {normalizarTexto(conta.nome) !== normalizarTexto(tipo) && <span className="of-saldo-card-tipo">{tipo}</span>}
                  </div>
                  <p className={`of-kpi-valor${conta.saldo < 0 ? ' negativo' : ''}`}>{formatarBRL(conta.saldo)}</p>
                  <p className="of-kpi-origem">{sobre.texto}</p>
                  <p className="of-kpi-rodape">
                    <span className={`of-tendencia${conta.saldo < 0 ? ' ruim' : ''}`}>{textoDaFatia(conta, conta.grupo)}</span>
                  </p>
                </li>
              );
            })}
          </ul>
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
        </>
      ) : (
        <p className="of-discreto">
          Com as contas cadastradas, o saldo de cada uma aparece aqui, com o disponível separado do investido.
        </p>
      )}
    </section>
  );
});

// Gráfico vazio: sem contas, convida a cadastrar (no modal, sem sair da
// tela); sem API, oferece o exemplo.
const VazioDaVisao = memo(function VazioDaVisao({ semContas, real, aoVerExemplo, aoCadastrarConta }) {
  if (semContas) {
    return (
      <div className="vazio">
        <SimboloDoVazio icone="contas" semente={17} />
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
      <SimboloDoVazio icone="crescimento" semente={43} />
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
});
