import { useMemo, useState } from 'react';
import { useLocation, useOutletContext, useParams } from 'react-router-dom';
import AvisoApi from '../componentes/AvisoApi';
import AvisoComAtalho from '../componentes/AvisoComAtalho';
import BarraDeSelecao from '../componentes/BarraDeSelecao';
import CartaoVisual from '../componentes/CartaoVisual';
import Confirmacao from '../componentes/Confirmacao';
import Esqueleto from '../componentes/Esqueleto';
import Extrato from '../componentes/Extrato';
import FormularioDeCartao from '../componentes/FormularioDeCartao';
import FormularioDeCompra from '../componentes/FormularioDeCompra';
import FormularioDePagamento from '../componentes/FormularioDePagamento';
import Icone from '../componentes/Icone';
import SimboloDoVazio from '../olifine/componentes/SimboloDoVazio';
import ImportarExtrato from '../componentes/ImportarExtrato';
import MedidorDoLimite from '../componentes/MedidorDoLimite';
import AcoesDaLinha from '../componentes/AcoesDaLinha';
import Modal from '../componentes/Modal';
import SeletorDeMes from '../componentes/SeletorDeMes';
import { useToast } from '../componentes/toast/useToast';
import { useAcoesDoExtrato } from '../componentes/useAcoesDoExtrato';
import { useCarga } from '../componentes/useCarga';
import { useSelecao } from '../componentes/useSelecao';
import { nomeDoMes } from '../regras/calendario';
import { mesDaReferencia, referenciaDoMes, ROTULO_DA_SITUACAO, textoDoVencimento, ultimoDiaDaFatura } from '../regras/cartoes';
import { formatarData } from '../regras/datas';
import { formatarBRL } from '../regras/dinheiro';
import { destinoDaImportacao } from '../regras/importacao';
import { contasBancarias, paraExtrato } from '../regras/livroCaixa';
import { pessoasDaFamilia } from '../regras/familia';
import { familiaLiberada, planoDoCliente } from '../regras/planos';
import { agruparPorDia } from '../regras/resumo';
import {
  apiConfigurada,
  buscarCartao,
  buscarFatura,
  excluirFatura,
  listarCategorias,
  listarContas,
  listarFaturas,
  listarPessoas,
} from '../servicos/livroCaixa';
import '../estilos/lancamentos.css';
import '../estilos/cartoes.css';

const diaEMes = (iso) => formatarData(iso).slice(0, 5);
const contar = (quantidade, singular, plural) => `${quantidade} ${quantidade === 1 ? singular : plural}`;
const comMaiuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

// Painel do cartão, contas (nomes e origem do pagamento), categorias e as
// pessoas já usadas em rachas (só sugestão: se falhar, fica sem elas).
async function carregarCartao(espacoId, cartaoId) {
  const [painel, contas, categorias, pessoas] = await Promise.all([
    buscarCartao(espacoId, cartaoId),
    listarContas(espacoId),
    listarCategorias(espacoId),
    listarPessoas(espacoId).catch(() => []),
  ]);
  return { painel, contas, categorias, pessoas };
}

// Cartão de crédito: o painel (limite total, limite disponível, fatura
// atual, parcelamentos futuros e o que há a pagar), a fatura aberta na tela,
// com os itens dela, e a lista de faturas ao lado. Compras no crédito,
// parceladas ou não, e a fatura importada (CSV ou PDF) entram aqui, nunca no extrato
// das contas; o pagamento da fatura sai de uma conta e libera o limite. Os
// itens da fatura e as faturas inteiras têm seleção em lote para remover.
export default function Cartao() {
  const { espaco, espacos } = useOutletContext();
  const { cartaoId } = useParams();
  const toast = useToast();
  // null = a fatura atual (vem do painel). ?fatura=AAAA-MM (a busca do topo)
  // abre a fatura da compra achada.
  const { search } = useLocation();
  const faturaDaUrl = /^\d{4}-\d{2}$/.test(new URLSearchParams(search).get('fatura') ?? '')
    ? new URLSearchParams(search).get('fatura')
    : null;
  const [mesEscolhido, setMesEscolhido] = useState(() => (faturaDaUrl ? mesDaReferencia(faturaDaUrl) : null));
  const [faturaVista, setFaturaVista] = useState(faturaDaUrl);
  if (faturaDaUrl !== faturaVista) {
    setFaturaVista(faturaDaUrl);
    if (faturaDaUrl) {
      setMesEscolhido(mesDaReferencia(faturaDaUrl));
    }
  }
  const [modal, setModal] = useState(null);
  const [modalOcupado, setModalOcupado] = useState(false);
  const [faturasARemover, setFaturasARemover] = useState(null);
  const [removendo, setRemovendo] = useState(false);

  const espacoId = espaco.dados?.id;
  const buscar = useMemo(() => (espacoId ? () => carregarCartao(espacoId, cartaoId) : null), [espacoId, cartaoId]);
  const cartao = useCarga(buscar);
  const buscarFaturas = useMemo(() => (espacoId ? () => listarFaturas(espacoId, cartaoId) : null), [espacoId, cartaoId]);
  const faturas = useCarga(buscarFaturas);
  const painel = cartao.dados?.painel;
  const mes = mesEscolhido ?? (painel ? mesDaReferencia(painel.fatura_atual.referencia) : null);
  const referencia = mes ? referenciaDoMes(mes) : null;
  const buscarDaFatura = useMemo(
    () => (espacoId && referencia ? () => buscarFatura(espacoId, cartaoId, referencia) : null),
    [espacoId, cartaoId, referencia],
  );
  const fatura = useCarga(buscarDaFatura);
  // Responsável só com a família (Plano Família), com as pessoas dela.
  const familia = useMemo(() => pessoasDaFamilia(espaco.dados), [espaco.dados]);
  const acoes = useAcoesDoExtrato({
    espacoId,
    categorias: cartao.dados?.categorias ?? [],
    familia,
    aoMudar: recarregar,
  });

  function recarregar() {
    cartao.recarregar();
    fatura.recarregar();
    faturas.recarregar();
  }

  const dias = useMemo(() => {
    if (!cartao.dados || !fatura.dados) {
      return null;
    }
    const linhas = paraExtrato(fatura.dados.lancamentos, cartao.dados.contas, cartao.dados.categorias, { pontoDeVista: cartaoId });
    return agruparPorDia(linhas, 0);
  }, [cartao.dados, fatura.dados, cartaoId]);
  const linhas = useMemo(() => (dias ?? []).flatMap((dia) => dia.lancamentos), [dias]);
  const idsDosItens = useMemo(() => linhas.map((linha) => linha.id), [linhas]);
  const selecaoDeItens = useSelecao(idsDosItens);
  const listaDeFaturas = useMemo(() => faturas.dados ?? [], [faturas.dados]);
  const idsDasFaturas = useMemo(() => listaDeFaturas.map((item) => item.referencia), [listaDeFaturas]);
  const selecaoDeFaturas = useSelecao(idsDasFaturas);

  if (!apiConfigurada) {
    return (
      <>
        <header className="cabecalho-da-pagina">
          <h1>Cartão de crédito</h1>
        </header>
        <AvisoApi />
      </>
    );
  }
  if (espaco.carregando || (espacoId && cartao.carregando && !cartao.dados)) {
    return <Esqueleto />;
  }
  if (cartao.erro?.status === 404) {
    return (
      <section className="cartao painel">
        <AvisoComAtalho icone="cartao" titulo="Cartão não encontrado"
          atalho={{ para: '/contas#cartoes', rotulo: 'Voltar a Contas & Cartões', icone: 'anterior' }}>
          Ele pode ter sido removido ou cadastrado em outra conta de acesso, ou o endereço está incompleto.
        </AvisoComAtalho>
      </section>
    );
  }
  const falha = espaco.erro || cartao.erro?.message;
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

  const { contas, categorias, pessoas } = cartao.dados;
  const contasParaPagar = contasBancarias(contas).filter((conta) => conta.ativa);

  function fecharModal() {
    setModal(null);
    setModalOcupado(false);
  }

  function aposMudar() {
    fecharModal();
    recarregar();
  }

  // Depois de importar, a tela vai para a fatura onde as linhas entraram (a
  // parcela com a data da compra pode cair numa fatura diferente do mês do
  // arquivo), e o aviso diz isso: sem ele, parece que a importação falhou.
  function irParaAFaturaImportada(resposta) {
    const destino = destinoDaImportacao(resposta.linhas);
    if (destino && destino !== referencia) {
      setMesEscolhido(mesDaReferencia(destino));
      toast.info(`As compras do arquivo estão na fatura de ${nomeDoMes(mesDaReferencia(destino))}: a tela foi para ela.`, {
        titulo: 'Fatura de outro mês',
      });
    }
  }

  function aposImportar(resposta) {
    aposMudar();
    irParaAFaturaImportada(resposta);
  }

  function pedirRemocaoDeFaturas(ids) {
    const escolhidas = listaDeFaturas.filter((item) => ids.includes(item.referencia));
    if (escolhidas.length > 0) {
      setFaturasARemover(escolhidas);
    }
  }

  // Uma fatura por vez; se uma falhar, as anteriores já saíram.
  async function confirmarRemocaoDeFaturas() {
    setRemovendo(true);
    let excluidos = 0;
    try {
      for (const item of faturasARemover) {
        excluidos += (await excluirFatura(espacoId, cartaoId, item.referencia)).excluidos;
      }
      toast.sucesso(`${contar(excluidos, 'lançamento saiu', 'lançamentos saíram')}, e o limite voltou. Os pagamentos ficaram.`, {
        titulo: contar(faturasARemover.length, 'fatura removida', 'faturas removidas'),
      });
    } catch (erro) {
      toast.erro(erro.message, { titulo: 'Remoção interrompida' });
    } finally {
      setRemovendo(false);
      setFaturasARemover(null);
      selecaoDeFaturas.limpar();
      recarregar();
    }
  }

  const totalARemover = (faturasARemover ?? []).reduce((soma, item) => soma + item.total_centavos, 0);

  return (
    <div className="pagina-do-cartao">
      <header className="barra-do-extrato">
        <div className="titulo-do-cartao">
          <h1>{painel.nome}</h1>
          <small>
            Fecha dia {painel.dia_fechamento} · vence dia {painel.dia_vencimento}
            {!painel.ativa && <span className="etiqueta">Desativado</span>}
          </small>
        </div>
        <div className="acoes-do-extrato" role="toolbar" aria-label="Ações do cartão">
          <button type="button" className="secundario" onClick={() => setModal('editar')}>
            <Icone nome="editar" tamanho={18} />
            Editar cartão
          </button>
          <button type="button" className="secundario" onClick={() => setModal('importar')}>
            <Icone nome="importar" tamanho={18} />
            Importar fatura
          </button>
          <button type="button" className="secundario" onClick={() => setModal('pagar')}>
            <Icone nome="contas" tamanho={18} />
            Pagar fatura
          </button>
          <button type="button" onClick={() => setModal('comprar')}>
            <Icone nome="mais" tamanho={18} />
            Nova compra
          </button>
        </div>
      </header>

      <section className="cartao painel-do-cartao" aria-label="Limite e faturas">
        <div className="plastico-do-painel">
          <CartaoVisual cartao={painel} />
        </div>
        <div className="numeros-e-limite">
          <dl className="numeros-do-cartao">
            <div>
              <dt>Limite total</dt>
              <dd>{formatarBRL(painel.limite_centavos)}</dd>
            </div>
            <div>
              <dt>Limite disponível</dt>
              <dd>{formatarBRL(painel.disponivel_centavos)}</dd>
              <small>{formatarBRL(painel.usado_centavos)} ocupados</small>
            </div>
            <div>
              <dt>Fatura atual</dt>
              <dd>{formatarBRL(painel.fatura_atual_centavos)}</dd>
              <small>
                fecha {diaEMes(painel.fatura_atual.fechamento)} · vence {diaEMes(painel.fatura_atual.vencimento)}
              </small>
            </div>
            <div>
              <dt>Parcelamentos futuros</dt>
              <dd>{formatarBRL(painel.parcelamentos_futuros_centavos)}</dd>
              <small>nas próximas faturas</small>
            </div>
          </dl>
          <MedidorDoLimite cartao={painel} />
          {painel.a_pagar_centavos > 0 && (
            <div className="a-pagar-do-cartao" role="status">
              <Icone nome="alerta" tamanho={16} />
              <span>
                Fatura fechada a pagar: <b>{formatarBRL(painel.a_pagar_centavos)}</b>, que{' '}
                {textoDoVencimento(painel.ultima_fechada.vencimento)}.
              </span>
              <button type="button" className="discreto-botao" onClick={() => setModal('pagar')}>
                Pagar agora
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="corpo-do-cartao">
        <section className="cartao extrato fatura" aria-label={`Fatura com vencimento em ${referencia}`}>
          <div className="ferramentas-do-extrato">
            <SeletorDeMes valor={mes} aoMudar={setMesEscolhido} rotulo="Fatura (mês do vencimento)" />
            {fatura.dados && (
              <p className="periodo-da-fatura">
                <span className={`situacao-da-fatura ${fatura.dados.situacao.toLowerCase()}`}>{ROTULO_DA_SITUACAO[fatura.dados.situacao]}</span>
                Compras de {diaEMes(fatura.dados.inicio)} a {diaEMes(ultimoDiaDaFatura(fatura.dados.fechamento))} · fecha{' '}
                {diaEMes(fatura.dados.fechamento)} · vence {formatarData(fatura.dados.vencimento)}
              </p>
            )}
          </div>

          {fatura.dados && (
            <p className="totais-do-mes" aria-live="polite">
              <span>
                Total da fatura <b>{formatarBRL(fatura.dados.total_centavos)}</b>
              </span>
              <span>
                Pagamentos no período <b className="entrada">{formatarBRL(fatura.dados.pagamentos_centavos)}</b>
              </span>
            </p>
          )}

          <BarraDeSelecao ids={idsDosItens} selecao={selecaoDeItens} nomes={['item', 'itens']}
            aoRemover={(ids) => acoes.removerEmLote(linhas.filter((linha) => ids.includes(linha.id)), selecaoDeItens.limpar)} />

          <div className="lista-da-fatura">
            {fatura.erro ? (
              <p className="mensagem erro" role="alert">
                <Icone nome="alerta" tamanho={16} />
                {fatura.erro.message}
              </p>
            ) : !dias ? (
              <Esqueleto forma="lista" rotulo="Carregando a fatura" />
            ) : dias.length > 0 ? (
              <Extrato
                dias={dias}
                mostrarSaldo={false}
                selecao={selecaoDeItens}
                acoes={(linha) => <AcoesDaLinha rotulo={`Ações de ${linha.descricao}`} nome={linha.descricao} itens={acoes.itens(linha)} />}
              />
            ) : (
              <div className="vazio">
                <SimboloDoVazio icone="cartao" semente={31} />
                <h3>Nenhuma compra nesta fatura</h3>
                <p>Use &quot;Nova compra&quot; para lançar uma compra no crédito, ou traga a fatura do banco com &quot;Importar fatura&quot;.</p>
              </div>
            )}
          </div>
        </section>

        <section className="cartao lista lista-de-faturas" aria-labelledby="titulo-das-faturas">
          <div className="cabecalho-do-painel">
            <h2 id="titulo-das-faturas">Faturas</h2>
            <small>clique para abrir</small>
          </div>
          <BarraDeSelecao ids={idsDasFaturas} selecao={selecaoDeFaturas} nomes={['fatura', 'faturas']}
            aoRemover={pedirRemocaoDeFaturas} ocupado={removendo} />
          {faturas.erro ? (
            <p className="mensagem erro" role="alert">
              <Icone nome="alerta" tamanho={16} />
              {faturas.erro.message}
            </p>
          ) : (
            <ul className="itens">
              {listaDeFaturas.map((item) => (
                <li
                  key={item.referencia}
                  className={`item item-de-fatura com-selecao${selecaoDeFaturas.marcado(item.referencia) ? ' marcado' : ''}`}
                  aria-current={item.referencia === referencia || undefined}
                >
                  <input type="checkbox" className="marcar-linha" checked={selecaoDeFaturas.marcado(item.referencia)}
                    onChange={() => selecaoDeFaturas.alternar(item.referencia)}
                    aria-label={`Selecionar a fatura de ${nomeDoMes(mesDaReferencia(item.referencia))}`} />
                  <button type="button" className="abrir-fatura" onClick={() => setMesEscolhido(mesDaReferencia(item.referencia))}>
                    <span className="descricao">
                      <b>{nomeDoMes(mesDaReferencia(item.referencia))}</b>
                      <small>
                        <span className={`situacao-da-fatura ${item.situacao.toLowerCase()}`}>{ROTULO_DA_SITUACAO[item.situacao]}</span>
                        {contar(item.quantidade, 'compra', 'compras')}
                      </small>
                    </span>
                    <span className="valor">{formatarBRL(item.total_centavos)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Modal aberta={modal === 'comprar'} titulo="Nova compra no cartão" descricao={painel.nome} aoFechar={fecharModal} ocupado={modalOcupado}>
        <FormularioDeCompra
          espacoId={espacoId}
          cartao={painel}
          categorias={categorias}
          pessoasConhecidas={pessoas}
          familia={familia}
          divisaoPorPessoa={familiaLiberada(planoDoCliente(espacos))}
          aoComprar={recarregar}
          aoCancelar={fecharModal}
          aoMudarOcupado={setModalOcupado}
        />
      </Modal>

      <Modal aberta={modal === 'pagar'} titulo="Pagar fatura" descricao={painel.nome} aoFechar={fecharModal} ocupado={modalOcupado}>
        <FormularioDePagamento
          espacoId={espacoId}
          cartao={painel}
          contas={contasParaPagar}
          aoPagar={aposMudar}
          aoCancelar={fecharModal}
          aoMudarOcupado={setModalOcupado}
        />
      </Modal>

      <Modal aberta={modal === 'editar'} titulo="Editar cartão" descricao={painel.nome} aoFechar={fecharModal} ocupado={modalOcupado}>
        <FormularioDeCartao espacoId={espacoId} emEdicao={painel} aoSalvar={aposMudar} aoCancelar={fecharModal}
          aoMudarOcupado={setModalOcupado} />
      </Modal>

      <Modal aberta={modal === 'importar'} titulo="Importar fatura" largura="extra" aoFechar={fecharModal} ocupado={modalOcupado}
        descricao={`Traga a fatura de ${painel.nome} exportada pelo banco. Nada é gravado antes de você conferir.`}>
        <ImportarExtrato
          espacoId={espacoId}
          contaFixa={painel}
          categorias={categorias}
          aoImportar={aposImportar}
          aoVerImportados={(resposta) => {
            fecharModal();
            irParaAFaturaImportada(resposta);
          }}
          aoCancelar={fecharModal}
          aoMudarOcupado={setModalOcupado}
        />
      </Modal>

      <Confirmacao
        aberta={Boolean(faturasARemover)}
        titulo={faturasARemover ? `Remover ${contar(faturasARemover.length, 'fatura', 'faturas')}?` : ''}
        rotuloDeConfirmar="Remover"
        perigo
        ocupado={removendo}
        aoConfirmar={confirmarRemocaoDeFaturas}
        aoCancelar={() => !removendo && setFaturasARemover(null)}
      >
        {faturasARemover && (
          <>
            <p>
              {comMaiuscula(faturasARemover.map((item) => nomeDoMes(mesDaReferencia(item.referencia))).join(', '))}: as compras e os créditos
              saem ({formatarBRL(totalARemover)} ao todo), e o limite volta. Não há como desfazer.
            </p>
            <p>Compra parcelada sai inteira, com as parcelas das outras faturas.</p>
            <p>Os pagamentos ficam: eles saíram de uma conta e continuam no extrato dela.</p>
          </>
        )}
      </Confirmacao>

      {acoes.dialogos}
    </div>
  );
}
