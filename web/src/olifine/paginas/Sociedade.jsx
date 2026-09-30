import { useMemo, useState } from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import Confirmacao from '../../componentes/Confirmacao';
import Esqueleto from '../../componentes/Esqueleto';
import FormularioDeMovimento from '../../componentes/FormularioDeMovimento';
import FormularioDeSocio from '../../componentes/FormularioDeSocio';
import Icone from '../../componentes/Icone';
import Menu from '../../componentes/Menu';
import Modal from '../../componentes/Modal';
import { useToast } from '../../componentes/toast/useToast';
import { useCarga } from '../../componentes/useCarga';
import { hojeIso } from '../../regras/datas';
import { formatarBRL, formatarComSinal } from '../../regras/dinheiro';
import { ehEmpresa } from '../../regras/espacos';
import { contasBancarias } from '../../regras/livroCaixa';
import {
  apiConfigurada,
  LIMITE_DE_LANCAMENTOS,
  lancarMovimentoDoSocio,
  listarCategorias,
  listarContas,
  listarLancamentos,
  listarSocios,
  removerSocio,
} from '../../servicos/livroCaixa';
import SimboloDoVazio from '../componentes/SimboloDoVazio';
import { montarCustos } from '../regras/custos';
import { apurarSociedade, CEM_POR_CENTO, periodoDaSociedade, PERIODOS_DA_SOCIEDADE, textoDoPercentual } from '../regras/sociedade';
import '../estilos/gestao.css';

// Cada movimento do sócio: o título do modal, o botão e se o dinheiro entra.
const MOVIMENTOS = {
  APORTE: { titulo: 'Registrar aporte', botao: 'Registrar aporte', entra: true, feito: 'Aporte registrado' },
  PRO_LABORE: { titulo: 'Pagar pró-labore', botao: 'Pagar pró-labore', entra: false, feito: 'Pró-labore pago' },
  DISTRIBUICAO: { titulo: 'Distribuir lucros', botao: 'Distribuir', entra: false, feito: 'Lucros distribuídos' },
};

const iniciais = (nome) =>
  nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();

async function carregar(espacoId, periodo) {
  const [socios, categorias, contas, lancamentos] = await Promise.all([
    listarSocios(espacoId),
    listarCategorias(espacoId),
    listarContas(espacoId),
    listarLancamentos(espacoId, periodo),
  ]);
  return { socios, categorias, contas, lancamentos };
}

function Numero({ rotulo, icone, valor, rodape, className = '' }) {
  return (
    <article className={`of-kpi ${className}`.trim()}>
      <p className="of-kpi-rotulo">
        <span className={`of-kpi-icone ${icone === 'entrada' ? 'entrada' : ''}`.trim()} aria-hidden="true">
          <Icone nome={icone} tamanho={18} />
        </span>
        {rotulo}
      </p>
      <p className="of-kpi-valor">{valor}</p>
      <p className="of-kpi-rodape">{rodape}</p>
    </article>
  );
}

// Aba Sociedade & Aportes da empresa: o quadro societário (a participação de
// cada sócio), os aportes de capital, o pró-labore e a apuração dos
// dividendos do período (o lucro da aba Custos repartido pela participação,
// menos o que cada um já recebeu). Aporte, pró-labore e distribuição viram
// lançamentos na conta da empresa, com o sócio como responsável. A conta está
// em regras/sociedade.ts. No espaço pessoal, volta à Visão geral.
export default function Sociedade() {
  const { espaco } = useOutletContext();
  const toast = useToast();
  const [hoje] = useState(hojeIso);
  const [idDoPeriodo, setPeriodo] = useState('ano');
  const [janela, setJanela] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const periodo = periodoDaSociedade(idDoPeriodo, hoje);
  const espacoId = espaco.dados?.id;
  const daEmpresa = ehEmpresa(espaco.dados);
  const buscar = useMemo(
    () => (apiConfigurada && espacoId && daEmpresa ? () => carregar(espacoId, periodoDaSociedade(idDoPeriodo, hoje)) : null),
    [espacoId, daEmpresa, idDoPeriodo, hoje],
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
  const socios = dados?.socios ?? [];
  const contas = dados ? contasBancarias(dados.contas).filter((conta) => conta.ativa) : [];
  const lucro = dados ? montarCustos(dados.lancamentos, dados.categorias, periodo).lucro : 0;
  const apuracao = dados ? apurarSociedade(socios, dados.lancamentos, dados.categorias, periodo, lucro) : null;
  const noLimite = dados && dados.lancamentos.length >= LIMITE_DE_LANCAMENTOS;
  const rotuloDoPeriodo = PERIODOS_DA_SOCIEDADE.find((opcao) => opcao.id === idDoPeriodo)?.rotulo.toLowerCase();

  function fechar() {
    setJanela(null);
    setOcupado(false);
  }

  function aposSalvar() {
    fechar();
    livro.recarregar();
  }

  async function lancarMovimento(socio, tipo, corpo) {
    const lancamento = await lancarMovimentoDoSocio(espacoId, socio.id, { tipo, ...corpo });
    toast.sucesso(`${formatarBRL(lancamento.valor_centavos)} · ${lancamento.descricao}`, { titulo: MOVIMENTOS[tipo].feito });
    aposSalvar();
  }

  async function confirmarRemocao(socio) {
    setOcupado(true);
    try {
      await removerSocio(espacoId, socio.id);
      toast.sucesso('Os lançamentos continuam no extrato, com o nome escrito.', { titulo: `${socio.nome} saiu do quadro` });
      aposSalvar();
    } catch (falha) {
      toast.erro(falha.message, { titulo: 'Sócio não removido' });
      setOcupado(false);
    }
  }

  const itensDoSocio = (item) => [
    { id: 'aporte', rotulo: 'Registrar aporte', descricao: 'Capital que o sócio põe na empresa.', icone: 'entrada',
      aoEscolher: () => setJanela({ tipo: 'movimento', movimento: 'APORTE', socio: item.socio }) },
    { id: 'prolabore', rotulo: 'Pagar pró-labore', descricao: 'A remuneração de quem trabalha na empresa.', icone: 'saida',
      aoEscolher: () => setJanela({ tipo: 'movimento', movimento: 'PRO_LABORE', socio: item.socio }) },
    { id: 'distribuir', rotulo: 'Distribuir lucros', descricao: `Parte no lucro ainda a distribuir: ${formatarBRL(item.aDistribuir)}.`, icone: 'crescimento',
      aoEscolher: () => setJanela({ tipo: 'movimento', movimento: 'DISTRIBUICAO', socio: item.socio, sugerido: item.aDistribuir }) },
    { id: 'editar', rotulo: 'Editar nome e participação', icone: 'editar', aoEscolher: () => setJanela({ tipo: 'socio', socio: item.socio }) },
    { id: 'remover', rotulo: 'Tirar do quadro', descricao: 'Os lançamentos ficam, com o nome escrito.', icone: 'excluir', perigo: true,
      aoEscolher: () => setJanela({ tipo: 'remover', socio: item.socio }) },
  ];

  return (
    <div className="of-empresa of-gestao">
      <header className="of-cabecalho">
        <div>
          <h1>Sociedade & aportes</h1>
          <p>Quem é dono de quanto, o capital que cada sócio pôs e o lucro que cabe a cada um.</p>
        </div>
        <div className="of-cabecalho-acoes">
          <button type="button" onClick={() => setJanela({ tipo: 'socio' })}>
            <Icone nome="mais" tamanho={16} />
            Incluir sócio
          </button>
        </div>
      </header>

      <div className="abas of-periodo-da-gestao" role="group" aria-label="Período da apuração">
        {PERIODOS_DA_SOCIEDADE.map((opcao) => (
          <button key={opcao.id} type="button" aria-pressed={idDoPeriodo === opcao.id} onClick={() => setPeriodo(opcao.id)}>
            {opcao.rotulo}
          </button>
        ))}
      </div>

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

      {apuracao && (
        <section className="of-kpis of-empresa-numeros" aria-label="Resumo da sociedade no período">
          <Numero rotulo="Capital aportado" icone="entrada" valor={formatarBRL(apuracao.aportes)} rodape={`Aportes dos sócios ${rotuloDoPeriodo}`} />
          <Numero rotulo="Lucro do período" icone="alvo" valor={formatarComSinal(lucro)} className={lucro < 0 ? 'negativo' : ''}
            rodape="Receita menos os custos, com o pró-labore" />
          <Numero rotulo="Distribuído" icone="saida" valor={formatarBRL(apuracao.distribuido)}
            rodape={`${formatarBRL(apuracao.proLabore)} de pró-labore à parte`} />
          <Numero rotulo="A distribuir" icone="crescimento" valor={formatarBRL(apuracao.aDistribuir)}
            rodape={lucro > 0 ? 'Lucro que ainda cabe aos sócios' : 'Sem lucro no período, nada a distribuir'} />
        </section>
      )}

      {apuracao && socios.length > 0 && !apuracao.completa && (
        <p className="mensagem info of-aviso-da-gestao" role="status">
          <Icone nome="alerta" tamanho={16} />
          O quadro soma {textoDoPercentual(apuracao.totalDaParticipacao)}: complete as participações até 100% para a
          divisão do lucro fechar.
        </p>
      )}

      {dados && socios.length === 0 ? (
        <section className="cartao vazio">
          <SimboloDoVazio icone="pessoas" semente={53} />
          <h3>Ninguém no quadro societário</h3>
          <p>Inclua os sócios com a participação de cada um. Aportes, pró-labore e distribuição de lucros entram pelo menu de cada sócio.</p>
          <button type="button" onClick={() => setJanela({ tipo: 'socio' })}>
            <Icone nome="mais" tamanho={16} />
            Incluir sócio
          </button>
        </section>
      ) : (
        apuracao && (
          <section className="cartao of-painel" aria-labelledby="titulo-quadro">
            <div className="of-painel-cabecalho">
              <h2 id="titulo-quadro">Quadro societário</h2>
              <small>Apuração {rotuloDoPeriodo}</small>
            </div>
            <div className="of-tabela-da-gestao">
              <table>
                <caption className="apenas-leitor">Participação, aportes, pró-labore e lucros de cada sócio</caption>
                <thead>
                  <tr>
                    <th scope="col">Sócio</th>
                    <th scope="col">Participação</th>
                    <th scope="col">Aportes</th>
                    <th scope="col">Pró-labore</th>
                    <th scope="col">Distribuído</th>
                    <th scope="col">Parte no lucro</th>
                    <th scope="col">A distribuir</th>
                    <th scope="col">
                      <span className="apenas-leitor">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {apuracao.socios.map((item) => (
                    <tr key={item.socio.id}>
                      <th scope="row">
                        <span className="of-socio">
                          <span className="of-socio-marca" aria-hidden="true">
                            {iniciais(item.socio.nome)}
                          </span>
                          {item.socio.nome}
                        </span>
                      </th>
                      <td>
                        <span className="of-participacao">
                          {textoDoPercentual(item.socio.participacao_centesimos)}
                          <span className="barra" aria-hidden="true">
                            <i style={{ '--largura': `${(item.socio.participacao_centesimos / CEM_POR_CENTO) * 100}%` }} />
                          </span>
                        </span>
                      </td>
                      <td>{formatarBRL(item.aportes)}</td>
                      <td>{formatarBRL(item.proLabore)}</td>
                      <td>{formatarBRL(item.distribuido)}</td>
                      <td>{formatarBRL(item.direito)}</td>
                      <td className={item.aDistribuir > 0 ? 'destaque' : undefined}>{formatarBRL(item.aDistribuir)}</td>
                      <td className="acao">
                        <Menu rotulo={`Ações de ${item.socio.nome}`} itens={itensDoSocio(item)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td>{textoDoPercentual(apuracao.totalDaParticipacao)}</td>
                    <td>{formatarBRL(apuracao.aportes)}</td>
                    <td>{formatarBRL(apuracao.proLabore)}</td>
                    <td>{formatarBRL(apuracao.distribuido)}</td>
                    <td>{formatarBRL(apuracao.lucroDistribuivel)}</td>
                    <td>{formatarBRL(apuracao.aDistribuir)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            {apuracao.semSocio > 0 && (
              <p className="of-discreto">
                {formatarBRL(apuracao.semSocio)} em aportes, pró-labore ou distribuições estão com um responsável que não é
                sócio: confira em Lançamentos.
              </p>
            )}
            <details className="of-dre-ajuda">
              <summary>Como o lucro é dividido</summary>
              <p>
                O lucro do período é o da aba Custos: a receita menos os custos variáveis, os fixos (com o pró-labore) e as
                despesas operacionais. Cada sócio tem direito à parte dele pela participação; "A distribuir" é esse
                direito menos o que já saiu como distribuição de lucros. Aporte e distribuição não entram no DRE nem nos
                custos: são dinheiro entre a empresa e os sócios. Confira a tributação de pró-labore e dividendos com a
                sua contabilidade.
                {noLimite && ` Mostrando os ${LIMITE_DE_LANCAMENTOS} lançamentos mais recentes do período.`}
              </p>
            </details>
          </section>
        )
      )}

      <Modal
        aberta={janela?.tipo === 'socio'}
        titulo={janela?.socio ? 'Editar sócio' : 'Incluir sócio'}
        descricao={janela?.socio ? janela.socio.nome : 'Nome e participação no quadro societário.'}
        ocupado={ocupado}
        aoFechar={fechar}
      >
        {janela?.tipo === 'socio' && (
          <FormularioDeSocio espacoId={espacoId} socios={socios} emEdicao={janela.socio ?? null} aoSalvar={aposSalvar}
            aoCancelar={fechar} aoMudarOcupado={setOcupado} />
        )}
      </Modal>

      <Modal
        aberta={janela?.tipo === 'movimento'}
        titulo={janela?.tipo === 'movimento' ? MOVIMENTOS[janela.movimento].titulo : ''}
        descricao={janela?.tipo === 'movimento' ? `${janela.socio.nome}, na conta da empresa.` : ''}
        ocupado={ocupado}
        aoFechar={fechar}
      >
        {janela?.tipo === 'movimento' && (
          <FormularioDeMovimento
            contas={contas}
            valorSugerido={janela.sugerido ?? 0}
            entra={MOVIMENTOS[janela.movimento].entra}
            rotuloDoBotao={MOVIMENTOS[janela.movimento].botao}
            tituloDoErro="Não foi lançado"
            dica={
              janela.movimento === 'APORTE'
                ? 'Entra como capital do sócio: fica fora do DRE e dos custos.'
                : janela.movimento === 'PRO_LABORE'
                  ? 'Sai como custo fixo da empresa, com o sócio como responsável.'
                  : 'Sai como lucro distribuído: fica fora do DRE e dos custos.'
            }
            aoEnviar={(corpo) => lancarMovimento(janela.socio, janela.movimento, corpo)}
            aoCancelar={fechar}
            aoMudarOcupado={setOcupado}
          />
        )}
      </Modal>

      <Confirmacao
        aberta={janela?.tipo === 'remover'}
        titulo={janela?.tipo === 'remover' ? `Tirar ${janela.socio.nome} do quadro?` : ''}
        rotuloDeConfirmar="Tirar do quadro"
        perigo
        ocupado={ocupado}
        aoConfirmar={() => janela?.tipo === 'remover' && confirmarRemocao(janela.socio)}
        aoCancelar={() => !ocupado && fechar()}
      >
        Aportes, pró-labore e distribuições continuam no extrato, com o nome escrito como responsável, mas saem da
        apuração.
      </Confirmacao>
    </div>
  );
}
