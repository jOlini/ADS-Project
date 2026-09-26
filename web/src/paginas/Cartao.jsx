import { useMemo, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import AvisoApi from '../componentes/AvisoApi';
import AvisoComAtalho from '../componentes/AvisoComAtalho';
import Esqueleto from '../componentes/Esqueleto';
import Extrato from '../componentes/Extrato';
import FormularioDeCompra from '../componentes/FormularioDeCompra';
import FormularioDePagamento from '../componentes/FormularioDePagamento';
import Icone from '../componentes/Icone';
import ImportarExtrato from '../componentes/ImportarExtrato';
import MedidorDoLimite from '../componentes/MedidorDoLimite';
import Menu from '../componentes/Menu';
import Modal from '../componentes/Modal';
import SeletorDeMes from '../componentes/SeletorDeMes';
import { useAcoesDoExtrato } from '../componentes/useAcoesDoExtrato';
import { useCarga } from '../componentes/useCarga';
import { mesDaReferencia, referenciaDoMes, ROTULO_DA_SITUACAO, textoDoVencimento, ultimoDiaDaFatura } from '../regras/cartoes';
import { formatarData } from '../regras/datas';
import { formatarBRL } from '../regras/dinheiro';
import { contasBancarias, paraExtrato } from '../regras/livroCaixa';
import { agruparPorDia } from '../regras/resumo';
import {
  apiConfigurada,
  buscarCartao,
  buscarFatura,
  listarCategorias,
  listarContas,
  listarPessoas,
} from '../servicos/livroCaixa';
import '../estilos/lancamentos.css';
import '../estilos/cartoes.css';

const diaEMes = (iso) => formatarData(iso).slice(0, 5);

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
// atual, parcelamentos futuros e o que há a pagar) e o extrato de uma fatura
// por vez. Compras no crédito, parceladas ou não, e a fatura importada em CSV
// entram aqui, nunca no extrato das contas; o pagamento da fatura sai de uma
// conta e libera o limite.
export default function Cartao() {
  const { espaco } = useOutletContext();
  const { cartaoId } = useParams();
  // null = a fatura atual (vem do painel).
  const [mesEscolhido, setMesEscolhido] = useState(null);
  const [modal, setModal] = useState(null);
  const [modalOcupado, setModalOcupado] = useState(false);

  const espacoId = espaco.dados?.id;
  const buscar = useMemo(() => (espacoId ? () => carregarCartao(espacoId, cartaoId) : null), [espacoId, cartaoId]);
  const cartao = useCarga(buscar);
  const painel = cartao.dados?.painel;
  const mes = mesEscolhido ?? (painel ? mesDaReferencia(painel.fatura_atual.referencia) : null);
  const referencia = mes ? referenciaDoMes(mes) : null;
  const buscarDaFatura = useMemo(
    () => (espacoId && referencia ? () => buscarFatura(espacoId, cartaoId, referencia) : null),
    [espacoId, cartaoId, referencia],
  );
  const fatura = useCarga(buscarDaFatura);
  const acoes = useAcoesDoExtrato({ espacoId, aoMudar: recarregar });

  function recarregar() {
    cartao.recarregar();
    fatura.recarregar();
  }

  const dias = useMemo(() => {
    if (!cartao.dados || !fatura.dados) {
      return null;
    }
    const linhas = paraExtrato(fatura.dados.lancamentos, cartao.dados.contas, cartao.dados.categorias, { pontoDeVista: cartaoId });
    return agruparPorDia(linhas, 0);
  }, [cartao.dados, fatura.dados, cartaoId]);

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
          Ele pode ter sido cadastrado em outra conta de acesso, ou o endereço está incompleto.
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

  return (
    <div className="pagina-do-cartao">
      <header className="barra-do-extrato">
        <div className="titulo-do-cartao">
          <Link to="/contas#cartoes" className="voltar">
            <Icone nome="anterior" tamanho={16} />
            Contas & Cartões
          </Link>
          <h1>{painel.nome}</h1>
          <small>
            Fecha dia {painel.dia_fechamento} · vence dia {painel.dia_vencimento}
            {!painel.ativa && <span className="etiqueta">Desativado</span>}
          </small>
        </div>
        <div className="acoes-do-extrato" role="toolbar" aria-label="Ações do cartão">
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
      </section>

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
              acoes={(linha) => <Menu rotulo={`Ações de ${linha.descricao}`} itens={acoes.itens(linha)} />}
            />
          ) : (
            <div className="vazio">
              <span className="simbolo" aria-hidden="true">
                <Icone nome="cartao" tamanho={20} />
              </span>
              <h3>Nenhuma compra nesta fatura</h3>
              <p>Use &quot;Nova compra&quot; para lançar uma compra no crédito, ou traga a fatura do banco com &quot;Importar fatura&quot;.</p>
            </div>
          )}
        </div>
      </section>

      <Modal aberta={modal === 'comprar'} titulo="Nova compra no cartão" descricao={painel.nome} aoFechar={fecharModal} ocupado={modalOcupado}>
        <FormularioDeCompra
          espacoId={espacoId}
          cartao={painel}
          categorias={categorias}
          pessoasConhecidas={pessoas}
          aoComprar={aposMudar}
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

      <Modal aberta={modal === 'importar'} titulo="Importar fatura" largura="larga" aoFechar={fecharModal} ocupado={modalOcupado}
        descricao={`Traga a fatura de ${painel.nome} exportada pelo banco. Nada é gravado antes de você conferir.`}>
        <ImportarExtrato
          espacoId={espacoId}
          contaFixa={painel}
          categorias={categorias}
          aoImportar={aposMudar}
          aoCancelar={fecharModal}
          aoMudarOcupado={setModalOcupado}
        />
      </Modal>

      {acoes.dialogos}
    </div>
  );
}
