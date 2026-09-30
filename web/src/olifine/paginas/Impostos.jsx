import { useMemo, useState } from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import Confirmacao from '../../componentes/Confirmacao';
import Esqueleto from '../../componentes/Esqueleto';
import FormularioDeMovimento from '../../componentes/FormularioDeMovimento';
import FormularioDeTributo from '../../componentes/FormularioDeTributo';
import Icone from '../../componentes/Icone';
import Menu from '../../componentes/Menu';
import Modal from '../../componentes/Modal';
import { useToast } from '../../componentes/toast/useToast';
import { useCarga } from '../../componentes/useCarga';
import { formatarData, hojeIso } from '../../regras/datas';
import { formatarBRL } from '../../regras/dinheiro';
import { ehEmpresa, REGIMES } from '../../regras/espacos';
import { contasBancarias } from '../../regras/livroCaixa';
import {
  apiConfigurada,
  editarTributo,
  LIMITE_DE_LANCAMENTOS,
  listarCategorias,
  listarColaboradores,
  listarContas,
  listarLancamentos,
  listarTributos,
  pagarTributo,
  removerTributo,
} from '../../servicos/livroCaixa';
import SimboloDoVazio from '../componentes/SimboloDoVazio';
import { folhaClt, somarCompetencia } from '../regras/folha';
import {
  agendaDosTributos,
  BASES,
  faturamentoPorMes,
  SUGESTOES,
  textoDaAliquota,
  textoDaCompetencia,
  TIPOS_DE_TRIBUTO,
} from '../regras/impostos';
import '../estilos/gestao.css';

// Meses de lançamentos lidos para o faturamento: as três competências do
// trimestral (nove meses) mais a atual.
const MESES_LIDOS = 9;

const SITUACOES = {
  ATRASADA: { rotulo: 'Atrasada', classe: 'ruim' },
  VENCE_LOGO: { rotulo: 'Vence logo', classe: 'atencao' },
  A_VENCER: { rotulo: 'A vencer', classe: 'neutra' },
  EM_ANDAMENTO: { rotulo: 'Competência em curso', classe: 'neutra' },
  PAGA: { rotulo: 'Paga', classe: 'bom' },
};

const rotuloDoTipo = (tipo) => TIPOS_DE_TRIBUTO.find((opcao) => opcao.valor === tipo)?.rotulo ?? tipo;

function textoDaRegra(tributo) {
  const base = tributo.base === 'FIXO' ? formatarBRL(tributo.valor_fixo_centavos) : `${textoDaAliquota(tributo.aliquota_centesimos)} ${BASES.find((opcao) => opcao.valor === tributo.base)?.rotulo.toLowerCase()}`;
  const periodo = tributo.periodicidade === 'TRIMESTRAL' ? 'trimestral' : 'mensal';
  return `${base} · ${periodo}, vence dia ${tributo.dia_vencimento}`;
}

function textoDoPrazo(guia) {
  if (guia.situacao === 'PAGA') {
    return `Paga em ${formatarData(guia.pagamento.data)}`;
  }
  if (guia.situacao === 'EM_ANDAMENTO') {
    return `Vence em ${formatarData(guia.vencimento)}`;
  }
  if (guia.dias < 0) {
    return `Venceu há ${-guia.dias} dia${guia.dias === -1 ? '' : 's'} (${formatarData(guia.vencimento)})`;
  }
  return guia.dias === 0 ? 'Vence hoje' : `Vence em ${guia.dias} dia${guia.dias === 1 ? '' : 's'} (${formatarData(guia.vencimento)})`;
}

async function carregar(espacoId, hoje) {
  const inicio = `${somarCompetencia(hoje.slice(0, 7), -(MESES_LIDOS - 1))}-01`;
  const [tributos, colaboradores, categorias, contas, lancamentos] = await Promise.all([
    listarTributos(espacoId),
    listarColaboradores(espacoId),
    listarCategorias(espacoId),
    listarContas(espacoId),
    listarLancamentos(espacoId, { de: inicio, ate: hoje }),
  ]);
  return { tributos, colaboradores, categorias, contas, lancamentos };
}

function Numero({ rotulo, icone, valor, rodape, className = '' }) {
  return (
    <article className={`of-kpi ${className}`.trim()}>
      <p className="of-kpi-rotulo">
        <span className="of-kpi-icone" aria-hidden="true">
          <Icone nome={icone} tamanho={18} />
        </span>
        {rotulo}
      </p>
      <p className="of-kpi-valor">{valor}</p>
      <p className="of-kpi-rodape">{rodape}</p>
    </article>
  );
}

// Aba Impostos da empresa: os tributos recorrentes (DAS, DARF, ISS, INSS,
// FGTS), a agenda das guias das últimas competências (atrasada, vence logo, a
// vencer, em curso, paga), a provisão do mês sobre o faturamento (ou a folha,
// ou o valor fixo) e o pagamento de cada guia, que vira despesa marcada com a
// competência (não se paga duas vezes). As sugestões do regime da empresa
// ajudam a começar. A conta está em regras/impostos.ts. No espaço pessoal,
// volta à Visão geral.
export default function Impostos() {
  const { espaco } = useOutletContext();
  const toast = useToast();
  const [hoje] = useState(hojeIso);
  const [janela, setJanela] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const espacoId = espaco.dados?.id;
  const daEmpresa = ehEmpresa(espaco.dados);
  const buscar = useMemo(
    () => (apiConfigurada && espacoId && daEmpresa ? () => carregar(espacoId, hoje) : null),
    [espacoId, daEmpresa, hoje],
  );
  const livro = useCarga(buscar);

  if (!apiConfigurada || (!espaco.carregando && espaco.dados && !daEmpresa)) {
    return <Navigate to="/principal" replace />;
  }
  if (espaco.carregando || (livro.carregando && !livro.dados)) {
    return <Esqueleto />;
  }

  const erro = espaco.erro || livro.erro?.message;
  const dados = livro.dados;
  const tributos = dados?.tributos ?? [];
  const contas = dados ? contasBancarias(dados.contas).filter((conta) => conta.ativa) : [];
  const bases = dados
    ? { faturamento: faturamentoPorMes(dados.lancamentos, dados.categorias), folha: (mes) => folhaClt(dados.colaboradores, mes) }
    : null;
  const agenda = dados ? agendaDosTributos(tributos, hoje, bases) : [];
  const soma = (situacoes) =>
    agenda.filter((guia) => situacoes.includes(guia.situacao)).reduce((total, guia) => total + (guia.previsto ?? 0), 0);
  const quantas = (situacao) => agenda.filter((guia) => guia.situacao === situacao).length;
  const pagoNoAno = tributos
    .flatMap((tributo) => tributo.pagamentos)
    .filter((pagamento) => pagamento.data.startsWith(hoje.slice(0, 4)))
    .reduce((total, pagamento) => total + pagamento.valor_centavos, 0);
  const regime = espaco.dados?.regime;
  const nomeDoRegime = REGIMES.find((opcao) => opcao.valor === regime)?.rotulo;
  const sugestoes = (SUGESTOES[regime] ?? []).filter(
    (sugestao) => !tributos.some((tributo) => tributo.nome.toLowerCase() === sugestao.nome.toLowerCase()),
  );
  const noLimite = dados && dados.lancamentos.length >= LIMITE_DE_LANCAMENTOS;

  function fechar() {
    setJanela(null);
    setOcupado(false);
  }

  function aposSalvar() {
    fechar();
    livro.recarregar();
  }

  async function pagar(guia, corpo) {
    const pago = await pagarTributo(espacoId, guia.tributo.id, { competencia: guia.competencia, ...corpo });
    toast.sucesso(`${formatarBRL(pago.valor_centavos)} saíram da conta como ${pago.descricao}.`, { titulo: 'Guia paga' });
    aposSalvar();
  }

  async function alternarAtivo(tributo) {
    try {
      await editarTributo(espacoId, tributo.id, {
        nome: tributo.nome,
        tipo: tributo.tipo,
        base: tributo.base,
        aliquota_centesimos: tributo.aliquota_centesimos,
        valor_fixo_centavos: tributo.valor_fixo_centavos,
        dia_vencimento: tributo.dia_vencimento,
        periodicidade: tributo.periodicidade,
        ativo: !tributo.ativo,
      });
      toast.sucesso(tributo.ativo ? 'Saiu da agenda; os pagamentos ficam.' : 'Voltou para a agenda.', {
        titulo: `${tributo.nome} ${tributo.ativo ? 'desativado' : 'reativado'}`,
      });
      livro.recarregar();
    } catch (falha) {
      toast.erro(falha.message, { titulo: 'Tributo não mudou' });
    }
  }

  async function confirmarRemocao(tributo) {
    setOcupado(true);
    try {
      await removerTributo(espacoId, tributo.id);
      toast.sucesso('Os pagamentos já lançados continuam no extrato.', { titulo: `${tributo.nome} excluído` });
      aposSalvar();
    } catch (falha) {
      toast.erro(falha.message, { titulo: 'Tributo não excluído' });
      setOcupado(false);
    }
  }

  return (
    <div className="of-empresa of-gestao">
      <header className="of-cabecalho">
        <div>
          <h1>Impostos</h1>
          <p>As guias da empresa com o vencimento de cada uma e quanto separar do faturamento.</p>
        </div>
        <div className="of-cabecalho-acoes">
          <button type="button" onClick={() => setJanela({ tipo: 'tributo' })}>
            <Icone nome="mais" tamanho={16} />
            Novo tributo
          </button>
        </div>
      </header>

      {erro && (
        <div className="cartao painel of-erro">
          <p className="mensagem erro" role="alert">
            <Icone nome="alerta" tamanho={16} />
            {erro}
          </p>
          <button type="button" className="secundario" onClick={livro.recarregar}>
            Tentar de novo
          </button>
        </div>
      )}

      {dados && (
        <section className="of-kpis of-empresa-numeros" aria-label="Resumo dos impostos">
          <Numero rotulo="Em atraso" icone="alerta" valor={formatarBRL(soma(['ATRASADA']))}
            className={quantas('ATRASADA') > 0 ? 'negativo' : ''}
            rodape={quantas('ATRASADA') > 0 ? `${quantas('ATRASADA')} guia(s) vencida(s) sem pagamento` : 'Nenhuma guia vencida'} />
          <Numero rotulo="Vence em 7 dias" icone="calendario" valor={formatarBRL(soma(['VENCE_LOGO']))}
            rodape={`${quantas('VENCE_LOGO')} guia(s) para pagar logo`} />
          <Numero rotulo="Provisão do mês" icone="guia" valor={formatarBRL(soma(['EM_ANDAMENTO']))}
            rodape="A separar do faturamento até agora" />
          <Numero rotulo={`Pago em ${hoje.slice(0, 4)}`} icone="certo" valor={formatarBRL(pagoNoAno)} rodape="Guias pagas no ano" />
        </section>
      )}

      {dados && tributos.length === 0 && (
        <section className="cartao vazio">
          <SimboloDoVazio icone="guia" semente={67} />
          <h3>Nenhum tributo cadastrado</h3>
          <p>
            Cadastre as guias que a empresa paga todo mês (ou todo trimestre): a agenda mostra o vencimento e quanto separar
            do faturamento.
          </p>
        </section>
      )}

      {dados && sugestoes.length > 0 && (
        <section className="cartao of-painel" aria-labelledby="titulo-sugestoes">
          <div className="of-painel-cabecalho">
            <h2 id="titulo-sugestoes">Sugestões para o {nomeDoRegime}</h2>
            <small>Ponto de partida: confira os valores</small>
          </div>
          <ul className="of-sugestoes-de-tributo">
            {sugestoes.map((sugestao) => (
              <li key={sugestao.nome}>
                <span>
                  <b>{sugestao.nome}</b>
                  <small>
                    {sugestao.base === 'FIXO'
                      ? 'Valor fixo por mês (o do seu PGMEI)'
                      : `${textoDaAliquota(sugestao.aliquota_centesimos)} ${BASES.find((opcao) => opcao.valor === sugestao.base)?.rotulo.toLowerCase()}`}
                    {' · '}vence dia {sugestao.dia_vencimento}
                    {sugestao.periodicidade === 'TRIMESTRAL' && ', trimestral'}
                  </small>
                </span>
                <button type="button" className="secundario compacto" onClick={() => setJanela({ tipo: 'tributo', inicial: sugestao })}>
                  <Icone nome="mais" tamanho={14} />
                  Adicionar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {agenda.length > 0 && (
        <section className="cartao of-painel" aria-labelledby="titulo-agenda">
          <div className="of-painel-cabecalho">
            <h2 id="titulo-agenda">Agenda das guias</h2>
            <small>Últimas competências de cada tributo</small>
          </div>
          <ul className="of-agenda">
            {agenda.map((guia) => {
              const situacao = SITUACOES[guia.situacao];
              return (
                <li key={`${guia.tributo.id}-${guia.competencia}`} className={guia.situacao.toLowerCase()}>
                  <span className="of-agenda-marca" aria-hidden="true">
                    <Icone nome="guia" tamanho={18} />
                  </span>
                  <span className="of-agenda-textos">
                    <b>
                      {guia.tributo.nome} · {textoDaCompetencia(guia.competencia, guia.tributo.periodicidade)}
                    </b>
                    <small>{textoDoPrazo(guia)}</small>
                  </span>
                  <span className="of-agenda-valor">
                    <b>{formatarBRL(guia.pagamento?.valor_centavos ?? guia.previsto ?? 0)}</b>
                    <small>{guia.pagamento ? 'pago' : guia.situacao === 'EM_ANDAMENTO' ? 'provisão até hoje' : 'previsto'}</small>
                  </span>
                  <span className={`of-situacao ${situacao.classe}`}>{situacao.rotulo}</span>
                  <span className="of-agenda-acao">
                    {guia.situacao !== 'PAGA' && guia.situacao !== 'EM_ANDAMENTO' && (
                      <button type="button" className="secundario compacto" onClick={() => setJanela({ tipo: 'pagar', guia })}>
                        Pagar
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="of-discreto">
            A provisão é a alíquota sobre o faturamento (vendas e serviços, sem aportes) ou sobre os salários CLT da
            competência. Pagar lança a guia como despesa em Impostos (ou Encargos da folha), marcada com a competência:
            para refazer, exclua o pagamento no extrato.
            {noLimite && ` Mostrando os ${LIMITE_DE_LANCAMENTOS} lançamentos mais recentes para o faturamento.`}
          </p>
        </section>
      )}

      {tributos.length > 0 && (
        <section className="cartao of-painel" aria-labelledby="titulo-tributos">
          <div className="of-painel-cabecalho">
            <h2 id="titulo-tributos">Tributos da empresa</h2>
            <small>{tributos.filter((tributo) => tributo.ativo).length} ativos</small>
          </div>
          <ul className="of-tributos">
            {tributos.map((tributo) => (
              <li key={tributo.id} className={tributo.ativo ? undefined : 'inativo'}>
                <span className="of-tributo-guia">{rotuloDoTipo(tributo.tipo)}</span>
                <span className="of-agenda-textos">
                  <b>{tributo.nome}</b>
                  <small>{textoDaRegra(tributo)}</small>
                </span>
                {!tributo.ativo && <span className="of-situacao neutra">Desativado</span>}
                <Menu
                  rotulo={`Ações de ${tributo.nome}`}
                  itens={[
                    { id: 'editar', rotulo: 'Editar', icone: 'editar', aoEscolher: () => setJanela({ tipo: 'tributo', emEdicao: tributo }) },
                    {
                      id: 'ativo',
                      rotulo: tributo.ativo ? 'Desativar' : 'Reativar',
                      descricao: tributo.ativo ? 'Sai da agenda; os pagamentos ficam.' : 'Volta para a agenda.',
                      icone: tributo.ativo ? 'olhoFechado' : 'olho',
                      aoEscolher: () => alternarAtivo(tributo),
                    },
                    {
                      id: 'excluir',
                      rotulo: 'Excluir',
                      descricao: 'Os pagamentos já lançados continuam no extrato.',
                      icone: 'excluir',
                      perigo: true,
                      aoEscolher: () => setJanela({ tipo: 'excluir', tributo }),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        aberta={janela?.tipo === 'tributo'}
        titulo={janela?.emEdicao ? 'Editar tributo' : 'Novo tributo'}
        descricao={janela?.emEdicao ? janela.emEdicao.nome : 'A guia, como calcular e quando vence.'}
        ocupado={ocupado}
        aoFechar={fechar}
      >
        {janela?.tipo === 'tributo' && (
          <FormularioDeTributo espacoId={espacoId} inicial={janela.inicial ?? null} emEdicao={janela.emEdicao ?? null}
            aoSalvar={aposSalvar} aoCancelar={fechar} aoMudarOcupado={setOcupado} />
        )}
      </Modal>

      <Modal
        aberta={janela?.tipo === 'pagar'}
        titulo={janela?.tipo === 'pagar' ? `Pagar ${janela.guia.tributo.nome}` : ''}
        descricao={janela?.tipo === 'pagar' ? `Competência ${textoDaCompetencia(janela.guia.competencia, janela.guia.tributo.periodicidade)}, vencimento ${formatarData(janela.guia.vencimento)}.` : ''}
        ocupado={ocupado}
        aoFechar={fechar}
      >
        {janela?.tipo === 'pagar' && (
          <FormularioDeMovimento
            contas={contas}
            valorSugerido={janela.guia.previsto ?? 0}
            comDescricao={false}
            rotuloDoBotao="Pagar guia"
            tituloDoErro="Guia não paga"
            dica="O valor vem da provisão: ajuste com juros, multa ou o valor exato da guia."
            aoEnviar={(corpo) => pagar(janela.guia, corpo)}
            aoCancelar={fechar}
            aoMudarOcupado={setOcupado}
          />
        )}
      </Modal>

      <Confirmacao
        aberta={janela?.tipo === 'excluir'}
        titulo={janela?.tipo === 'excluir' ? `Excluir ${janela.tributo.nome}?` : ''}
        rotuloDeConfirmar="Excluir tributo"
        perigo
        ocupado={ocupado}
        aoConfirmar={() => janela?.tipo === 'excluir' && confirmarRemocao(janela.tributo)}
        aoCancelar={() => !ocupado && fechar()}
      >
        O tributo sai da agenda e do cadastro. Os pagamentos já lançados continuam no extrato, na categoria deles.
      </Confirmacao>
    </div>
  );
}
