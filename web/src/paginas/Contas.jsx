import { useEffect, useMemo, useState } from 'react';
import { useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import AvisoApi from '../componentes/AvisoApi';
import BarraDeSelecao from '../componentes/BarraDeSelecao';
import CartaoVisual from '../componentes/CartaoVisual';
import Confirmacao from '../componentes/Confirmacao';
import ContaVisual from '../componentes/ContaVisual';
import Esqueleto from '../componentes/Esqueleto';
import FormularioDeCartao from '../componentes/FormularioDeCartao';
import FormularioDeConta from '../componentes/FormularioDeConta';
import Icone from '../componentes/Icone';
import SimboloDoVazio from '../olifine/componentes/SimboloDoVazio';
import Modal from '../componentes/Modal';
import { useToast } from '../componentes/toast/useToast';
import { useCarga } from '../componentes/useCarga';
import { useSelecao } from '../componentes/useSelecao';
import { formatarBRL } from '../regras/dinheiro';
import { cartoesDe, contasBancarias, saldoTotal } from '../regras/livroCaixa';
import { apiConfigurada, excluirConta, listarCartoes, listarContas } from '../servicos/livroCaixa';
import '../estilos/cartoes.css';

const contar = (quantidade, singular, plural) => `${quantidade} ${quantidade === 1 ? singular : plural}`;

// Textos de cada cadastro: o título do modal, os nomes na seleção e o que a
// remoção leva junto (dito antes de confirmar, porque não há volta).
const TIPOS = {
  conta: {
    nomes: ['conta', 'contas'],
    novo: 'Nova conta',
    editar: 'Editar conta',
    removidos: ['conta removida', 'contas removidas'],
    consequencia:
      'Cada conta sai com todos os lançamentos dela. Transferências e pagamentos de fatura com outras contas também saem, e o saldo delas muda.',
    alternativa: 'Para guardar o histórico, desative a conta em Editar.',
  },
  cartao: {
    nomes: ['cartão', 'cartões'],
    novo: 'Novo cartão',
    editar: 'Editar cartão',
    removidos: ['cartão removido', 'cartões removidos'],
    consequencia:
      'Cada cartão sai com todas as compras, parcelas e faturas. Os pagamentos de fatura também saem, e o valor volta ao saldo da conta de onde saiu.',
    alternativa: 'Para guardar o histórico, desative o cartão em Editar.',
  },
};

// Contas e o painel de cada cartão (limite, fatura atual) de uma vez.
async function carregarCadastros(espacoId) {
  const [contas, cartoes] = await Promise.all([listarContas(espacoId), listarCartoes(espacoId)]);
  return { contas, paineis: new Map(cartoes.map((cartao) => [cartao.id, cartao])) };
}

// Contas & Cartões, em duas seções separadas, no mesmo visual de carteira:
// - Contas bancárias: onde o dinheiro está (corrente, poupança, carteira,
//   investimento), cada uma num card como o plástico de um cartão, com a cor
//   escolhida e o saldo;
// - Cartões de crédito: a carteira, com cada cartão desenhado como o plástico
//   (cor, faixa magnética, fatura atual e limite disponível); o cartão
//   inteiro abre a tela dele, com a fatura e as parcelas.
// Criar e editar é sempre num modal. As duas listas têm seleção em lote para
// remover. Um atalho de outra tela chega com ?cadastrar=conta (ou cartao) e
// já abre o modal certo, com o foco no nome.
export default function Contas() {
  const { espaco } = useOutletContext();
  const toast = useToast();
  const [parametros, setParametros] = useSearchParams();
  const atalho = TIPOS[parametros.get('cadastrar')] ? parametros.get('cadastrar') : null;
  // { tipo: 'conta' | 'cartao', emEdicao } com o modal aberto; senão, null.
  const [modal, setModal] = useState(() => (atalho ? { tipo: atalho, emEdicao: null } : null));
  const [modalOcupado, setModalOcupado] = useState(false);
  // { tipo, itens } esperando a confirmação da remoção.
  const [aRemover, setARemover] = useState(null);
  const [removendo, setRemovendo] = useState(false);

  const espacoId = espaco.dados?.id;
  const buscarCadastros = useMemo(() => (espacoId ? () => carregarCadastros(espacoId) : null), [espacoId]);
  const cadastros = useCarga(buscarCadastros);
  const todas = useMemo(() => cadastros.dados?.contas ?? [], [cadastros.dados]);
  const contas = useMemo(() => contasBancarias(todas), [todas]);
  const cartoes = useMemo(() => cartoesDe(todas), [todas]);
  const idsDasContas = useMemo(() => contas.map((conta) => conta.id), [contas]);
  const idsDosCartoes = useMemo(() => cartoes.map((cartao) => cartao.id), [cartoes]);
  const selecaoDeContas = useSelecao(idsDasContas);
  const selecaoDeCartoes = useSelecao(idsDosCartoes);

  // O atalho "Abrir cartões" (/contas#cartoes) rola até a carteira quando
  // ela aparece.
  const { hash } = useLocation();
  const listaPronta = Boolean(cadastros.dados);
  useEffect(() => {
    if (hash === '#cartoes' && listaPronta) {
      document.getElementById('cartoes')?.scrollIntoView({ block: 'start' });
    }
  }, [hash, listaPronta]);

  if (!apiConfigurada) {
    return (
      <>
        <header className="cabecalho-da-pagina">
          <h1>Contas & Cartões</h1>
        </header>
        <AvisoApi />
      </>
    );
  }
  if (espaco.carregando || (espacoId && cadastros.carregando && !cadastros.dados)) {
    return <Esqueleto />;
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

  const paineis = cadastros.dados?.paineis ?? new Map();
  const faturasAtuais = cartoes.reduce((soma, cartao) => soma + (paineis.get(cartao.id)?.fatura_atual_centavos ?? 0), 0);
  const disponivel = cartoes.reduce((soma, cartao) => soma + (paineis.get(cartao.id)?.disponivel_centavos ?? 0), 0);

  function abrir(tipo, emEdicao = null) {
    setModal({ tipo, emEdicao });
  }

  function fecharModal() {
    setModal(null);
    setModalOcupado(false);
    // O atalho já cumpriu o papel: recarregar a página não reabre o modal.
    if (atalho) {
      setParametros({}, { replace: true });
    }
  }

  function aposSalvar() {
    fecharModal();
    cadastros.recarregar();
  }

  function pedirRemocao(tipo, ids) {
    const itens = (tipo === 'conta' ? contas : cartoes).filter((item) => ids.includes(item.id));
    if (itens.length > 0) {
      setARemover({ tipo, itens });
    }
  }

  // Uma por uma: a API apaga cada conta com os lançamentos dela. Se uma
  // falhar, as anteriores já saíram, e o aviso diz quantas.
  async function confirmarRemocao() {
    const { tipo, itens } = aRemover;
    const textos = TIPOS[tipo];
    setRemovendo(true);
    let removidos = 0;
    let lancamentos = 0;
    try {
      for (const item of itens) {
        lancamentos += (await excluirConta(espacoId, item.id)).excluidos;
        removidos += 1;
      }
      toast.sucesso(`Com ${contar(lancamentos, 'lançamento', 'lançamentos')}.`, { titulo: contar(removidos, ...textos.removidos) });
    } catch (erro) {
      const antes = removidos > 0 ? ` Antes da falha, ${contar(removidos, ...textos.removidos)}.` : '';
      toast.erro(`${erro.message}${antes}`, { titulo: 'Remoção interrompida' });
    } finally {
      setRemovendo(false);
      setARemover(null);
      (tipo === 'conta' ? selecaoDeContas : selecaoDeCartoes).limpar();
      cadastros.recarregar();
    }
  }

  const textosDoModal = modal ? TIPOS[modal.tipo] : null;
  const textosDaRemocao = aRemover ? TIPOS[aRemover.tipo] : null;

  return (
    <>
      <header className="cabecalho-da-pagina">
        <h1>Contas & Cartões</h1>
        <div className="acoes-da-pagina">
          {/* As duas ações principais da tela, no verde da marca. */}
          <button type="button" onClick={() => abrir('conta')}>
            <Icone nome="contas" tamanho={18} />
            Nova conta
          </button>
          <button type="button" onClick={() => abrir('cartao')}>
            <Icone nome="cartao" tamanho={18} />
            Novo cartão
          </button>
        </div>
      </header>

      <div className="pagina-de-contas">
        <section className="secao-do-cadastro" aria-labelledby="titulo-contas">
          <div className="cabecalho-da-secao">
            <h2 id="titulo-contas">
              <span className="simbolo-da-secao" aria-hidden="true">
                <Icone nome="contas" tamanho={18} />
              </span>
              Contas bancárias
            </h2>
            {contas.length > 0 && (
              <p>
                Saldo em contas <b>{formatarBRL(saldoTotal(contas))}</b>
              </p>
            )}
          </div>

          {contas.length === 0 ? (
            <div className="cartao vazio">
              <SimboloDoVazio icone="contas" semente={17} />
              <h3>Nenhuma conta cadastrada</h3>
              <p>
                Comece pela conta onde o salário cai e informe o saldo de hoje. Poupança e dinheiro na carteira também
                contam.
              </p>
              <button type="button" onClick={() => abrir('conta')}>
                <Icone nome="mais" tamanho={16} />
                Cadastrar conta
              </button>
            </div>
          ) : (
            <>
              <div className="cartao barra-da-carteira">
                <BarraDeSelecao ids={idsDasContas} selecao={selecaoDeContas} nomes={TIPOS.conta.nomes}
                  aoRemover={(ids) => pedirRemocao('conta', ids)} ocupado={removendo} />
              </div>
              <div className="carteira">
                {contas.map((conta) => (
                  <ContaVisual
                    key={conta.id}
                    conta={conta}
                    marcado={selecaoDeContas.marcado(conta.id)}
                    aoMarcar={() => selecaoDeContas.alternar(conta.id)}
                    aoEditar={() => abrir('conta', conta)}
                  />
                ))}
              </div>
            </>
          )}
        </section>

        <section className="secao-do-cadastro" aria-labelledby="titulo-cartoes" id="cartoes">
          <div className="cabecalho-da-secao">
            <h2 id="titulo-cartoes">
              <span className="simbolo-da-secao" aria-hidden="true">
                <Icone nome="cartao" tamanho={18} />
              </span>
              Cartões de crédito
            </h2>
            {cartoes.length > 0 && (
              <p>
                Faturas atuais <b>{formatarBRL(faturasAtuais)}</b> · Limite disponível <b>{formatarBRL(disponivel)}</b>
              </p>
            )}
          </div>

          {cartoes.length === 0 ? (
            <div className="cartao vazio">
              <span className="simbolo" aria-hidden="true">
                <Icone nome="cartao" tamanho={20} />
              </span>
              <h3>Nenhum cartão cadastrado</h3>
              <p>
                Cadastre o cartão com o limite e os dias de fechamento e vencimento. As compras no crédito ficam na fatura dele,
                separadas do extrato das contas, e o pagamento sai de uma conta.
              </p>
              <button type="button" onClick={() => abrir('cartao')}>
                <Icone nome="mais" tamanho={16} />
                Cadastrar cartão
              </button>
            </div>
          ) : (
            <>
              <div className="cartao barra-da-carteira">
                <BarraDeSelecao ids={idsDosCartoes} selecao={selecaoDeCartoes} nomes={TIPOS.cartao.nomes}
                  aoRemover={(ids) => pedirRemocao('cartao', ids)} ocupado={removendo} />
              </div>
              <div className="carteira">
                {cartoes.map((cartao) => {
                  const painel = paineis.get(cartao.id);
                  return painel ? (
                    <CartaoVisual
                      key={cartao.id}
                      cartao={painel}
                      para={`/contas/cartoes/${cartao.id}`}
                      marcado={selecaoDeCartoes.marcado(cartao.id)}
                      aoMarcar={() => selecaoDeCartoes.alternar(cartao.id)}
                      aoEditar={() => abrir('cartao', painel)}
                    />
                  ) : null;
                })}
              </div>
            </>
          )}
        </section>
      </div>

      <Modal aberta={Boolean(modal)} titulo={modal?.emEdicao ? textosDoModal?.editar : textosDoModal?.novo}
        descricao={modal?.emEdicao?.nome} aoFechar={fecharModal} ocupado={modalOcupado}>
        {modal?.tipo === 'conta' && (
          <FormularioDeConta espacoId={espacoId} emEdicao={modal.emEdicao} aoSalvar={aposSalvar} aoCancelar={fecharModal}
            aoMudarOcupado={setModalOcupado} />
        )}
        {modal?.tipo === 'cartao' && (
          <FormularioDeCartao espacoId={espacoId} emEdicao={modal.emEdicao} aoSalvar={aposSalvar} aoCancelar={fecharModal}
            aoMudarOcupado={setModalOcupado} />
        )}
      </Modal>

      <Confirmacao
        aberta={Boolean(aRemover)}
        titulo={aRemover ? `Remover ${contar(aRemover.itens.length, ...textosDaRemocao.nomes)}?` : ''}
        rotuloDeConfirmar="Remover"
        perigo
        ocupado={removendo}
        aoConfirmar={confirmarRemocao}
        aoCancelar={() => !removendo && setARemover(null)}
      >
        {aRemover && (
          <>
            <p>{aRemover.itens.map((item) => item.nome).join(', ')}.</p>
            <p>{textosDaRemocao.consequencia} Não há como desfazer.</p>
            <p>{textosDaRemocao.alternativa}</p>
          </>
        )}
      </Confirmacao>
    </>
  );
}
