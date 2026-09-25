import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import AvisoApi from '../componentes/AvisoApi';
import Campo from '../componentes/Campo';
import Carregando from '../componentes/Carregando';
import Icone from '../componentes/Icone';
import MedidorDoLimite from '../componentes/MedidorDoLimite';
import Seletor from '../componentes/Seletor';
import { useToast } from '../componentes/toast/useToast';
import { useCarga } from '../componentes/useCarga';
import { useFocoAoChegar } from '../componentes/useFocoAoChegar';
import { primeiroCampoComErro } from '../regras/cadastro';
import { formatarBRL, lerValor, valorParaCampo } from '../regras/dinheiro';
import { formatarData } from '../regras/datas';
import {
  cartoesDe,
  contasBancarias,
  corpoDoCartao,
  DIAS_DO_MES,
  ehCartao,
  errosDaApi,
  ORDEM_DA_CONTA,
  ORDEM_DO_CARTAO,
  rotuloDoTipoDeConta,
  saldoTotal,
  TIPOS_DE_CONTA,
  validarCartao,
  validarConta,
} from '../regras/livroCaixa';
import { apiConfigurada, atualizarConta, criarConta, listarCartoes, listarContas } from '../servicos/livroCaixa';
import '../estilos/cartoes.css';

const ID_DO_FORMULARIO = 'formulario-da-conta';
const CONTA_NOVA = { nome: '', tipo: 'CORRENTE', saldoInicial: '', ativa: true };
const CARTAO_NOVO = { nome: '', limite: '', diaFechamento: '', diaVencimento: '', ativa: true };
const TIPOS_DO_FORMULARIO = [
  { id: 'conta', rotulo: 'Conta' },
  { id: 'cartao', rotulo: 'Cartão de crédito' },
];

// Contas e o painel de cada cartão (limite, fatura atual) de uma vez.
async function carregarCadastros(espacoId) {
  const [contas, cartoes] = await Promise.all([listarContas(espacoId), listarCartoes(espacoId)]);
  return { contas, paineis: new Map(cartoes.map((cartao) => [cartao.id, cartao])) };
}

function formularioDe(conta) {
  if (ehCartao(conta)) {
    return {
      nome: conta.nome,
      limite: valorParaCampo(conta.limite_centavos),
      diaFechamento: String(conta.dia_fechamento),
      diaVencimento: String(conta.dia_vencimento),
      ativa: conta.ativa,
    };
  }
  return { nome: conta.nome, tipo: conta.tipo, saldoInicial: '', ativa: conta.ativa };
}

// Contas & Cartões. Contas são onde o dinheiro está (corrente, poupança,
// carteira, investimento), com o saldo de cada uma; o saldo inicial não muda
// depois de criado. Cartões de crédito são contas de dívida, com limite e
// fatura: cada um abre a própria tela, com o extrato da fatura, as compras
// parceladas e o pagamento. Um atalho de outra tela chega com
// ?cadastrar=conta (ou cartao) e cai no formulário certo, com o foco no nome.
export default function Contas() {
  const { espaco } = useOutletContext();
  const toast = useToast();
  const [parametros] = useSearchParams();
  const atalho = parametros.get('cadastrar');
  const [tipoDoFormulario, setTipoDoFormulario] = useState(atalho === 'cartao' ? 'cartao' : 'conta');
  // null = criando; senão, a conta ou o cartão em edição.
  const [emEdicao, setEmEdicao] = useState(null);
  const [formulario, setFormulario] = useState(() => (atalho === 'cartao' ? CARTAO_NOVO : CONTA_NOVA));
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);

  const espacoId = espaco.dados?.id;
  const buscarCadastros = useMemo(() => (espacoId ? () => carregarCadastros(espacoId) : null), [espacoId]);
  const cadastros = useCarga(buscarCadastros);
  useFocoAoChegar(atalho === 'conta' || atalho === 'cartao', ID_DO_FORMULARIO);
  // O atalho "Abrir cartões" (/contas#cartoes) rola até a lista de cartões
  // quando ela aparece.
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

  const todas = cadastros.dados?.contas ?? [];
  const paineis = cadastros.dados?.paineis ?? new Map();
  const contas = contasBancarias(todas);
  const cartoes = cartoesDe(todas);
  const cartao = tipoDoFormulario === 'cartao';

  function focarNoNome() {
    // O formulário fica ao lado (ou abaixo, no celular): o foco vai até ele.
    requestAnimationFrame(() => document.getElementById(ID_DO_FORMULARIO)?.elements.nome?.focus());
  }

  function trocarTipo(tipo) {
    setTipoDoFormulario(tipo);
    setFormulario(tipo === 'cartao' ? CARTAO_NOVO : CONTA_NOVA);
    setErros({});
  }

  function mudar(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  function editar(conta) {
    setEmEdicao(conta);
    setTipoDoFormulario(ehCartao(conta) ? 'cartao' : 'conta');
    setFormulario(formularioDe(conta));
    setErros({});
    focarNoNome();
  }

  function novoCartao() {
    cancelar();
    trocarTipo('cartao');
    focarNoNome();
  }

  function cancelar() {
    setEmEdicao(null);
    setFormulario(tipoDoFormulario === 'cartao' ? CARTAO_NOVO : CONTA_NOVA);
    setErros({});
  }

  async function salvarConta() {
    if (emEdicao) {
      const salva = await atualizarConta(espacoId, emEdicao.id, {
        nome: formulario.nome.trim(),
        tipo: formulario.tipo,
        ativa: formulario.ativa,
      });
      toast.sucesso(salva.ativa ? 'Os lançamentos continuam iguais.' : 'Ela sai das opções de novos lançamentos.', {
        titulo: `Conta "${salva.nome}" salva`,
      });
      return;
    }
    const criada = await criarConta(espacoId, {
      nome: formulario.nome.trim(),
      tipo: formulario.tipo,
      saldo_inicial_centavos: formulario.saldoInicial.trim() ? lerValor(formulario.saldoInicial, { permitirNegativo: true }) : 0,
    });
    toast.sucesso(`Saldo inicial de ${formatarBRL(criada.saldo_inicial_centavos)}.`, { titulo: `Conta "${criada.nome}" criada` });
  }

  async function salvarCartao() {
    if (emEdicao) {
      const salvo = await atualizarConta(espacoId, emEdicao.id, corpoDoCartao(formulario, { comAtiva: true }));
      toast.sucesso(`Limite de ${formatarBRL(salvo.limite_centavos)}.`, { titulo: `Cartão "${salvo.nome}" salvo` });
      return;
    }
    const criado = await criarConta(espacoId, corpoDoCartao(formulario));
    toast.sucesso(`Fecha no dia ${criado.dia_fechamento} e vence no dia ${criado.dia_vencimento}.`, {
      titulo: `Cartão "${criado.nome}" criado`,
    });
  }

  async function enviar(evento) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements;
    const encontrados = cartao
      ? validarCartao(formulario)
      : validarConta(emEdicao ? { ...formulario, saldoInicial: '' } : formulario);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, cartao ? ORDEM_DO_CARTAO : ORDEM_DA_CONTA);
    if (primeiro) {
      elementos[primeiro]?.focus();
      return;
    }

    setEnviando(true);
    try {
      await (cartao ? salvarCartao() : salvarConta());
      cancelar();
      cadastros.recarregar();
    } catch (erro) {
      setErros(errosDaApi(erro.campos));
      toast.erro(erro.message, { titulo: cartao ? 'Cartão não salvo' : 'Conta não salva' });
    } finally {
      setEnviando(false);
    }
  }

  const botaoEditar = (conta) => (
    <button type="button" className="discreto-botao" onClick={() => editar(conta)}>
      <Icone nome="editar" tamanho={16} />
      <span className="rotulo-da-acao">Editar</span>
      <span className="apenas-leitor">: {conta.nome}</span>
    </button>
  );

  return (
    <>
      <header className="cabecalho-da-pagina">
        <h1>Contas & Cartões</h1>
      </header>

      <div className="corpo-do-resumo pagina-de-cadastro">
        <div className="colunas-de-cadastro">
          <section className="cartao lista" aria-labelledby="titulo-contas">
            <div className="cabecalho-do-painel">
              <h2 id="titulo-contas">Contas</h2>
              {contas.length > 0 && <small>Total {formatarBRL(saldoTotal(contas))}</small>}
            </div>

            {contas.length === 0 ? (
              <div className="vazio">
                <span className="simbolo" aria-hidden="true">
                  <Icone nome="contas" tamanho={20} />
                </span>
                <h3>Nenhuma conta cadastrada</h3>
                <p>
                  Comece pela conta onde o salário cai e informe o saldo de hoje. Poupança e dinheiro na carteira também
                  contam.
                </p>
              </div>
            ) : (
              <ul className="itens">
                {contas.map((conta) => (
                  <li key={conta.id} className={`item${conta.ativa ? '' : ' desativado'}`} aria-current={emEdicao?.id === conta.id || undefined}>
                    <span className="marca-da-categoria" aria-hidden="true">
                      <Icone nome="contas" tamanho={16} />
                    </span>
                    <span className="descricao">
                      <b>{conta.nome}</b>
                      <small>
                        {rotuloDoTipoDeConta(conta.tipo)}
                        {!conta.ativa && <span className="etiqueta">Desativada</span>}
                      </small>
                    </span>
                    <span className={`valor${conta.saldo_centavos < 0 ? ' negativo' : ''}`}>{formatarBRL(conta.saldo_centavos)}</span>
                    {botaoEditar(conta)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cartao lista" aria-labelledby="titulo-cartoes" id="cartoes">
            <div className="cabecalho-do-painel">
              <h2 id="titulo-cartoes">Cartões de crédito</h2>
              {cartoes.length > 0 && (
                <button type="button" className="discreto-botao" onClick={novoCartao}>
                  <Icone nome="mais" tamanho={16} />
                  Novo cartão
                </button>
              )}
            </div>

            {cartoes.length === 0 ? (
              <div className="vazio">
                <span className="simbolo" aria-hidden="true">
                  <Icone nome="cartao" tamanho={20} />
                </span>
                <h3>Nenhum cartão cadastrado</h3>
                <p>
                  Cadastre o cartão com o limite e os dias de fechamento e vencimento. As compras no crédito ficam na fatura
                  dele, e o pagamento sai de uma conta.
                </p>
                <button type="button" onClick={novoCartao}>
                  <Icone nome="mais" tamanho={16} />
                  Cadastrar cartão
                </button>
              </div>
            ) : (
              <ul className="itens">
                {cartoes.map((item) => {
                  const painel = paineis.get(item.id);
                  return (
                    <li key={item.id} className={`item item-de-cartao${item.ativa ? '' : ' desativado'}`} aria-current={emEdicao?.id === item.id || undefined}>
                      <span className="marca-da-categoria" aria-hidden="true">
                        <Icone nome="cartao" tamanho={16} />
                      </span>
                      <span className="descricao">
                        <Link to={`/contas/cartoes/${item.id}`} className="nome-do-cartao">
                          {item.nome}
                        </Link>
                        <small>
                          Fecha dia {item.dia_fechamento} · vence dia {item.dia_vencimento}
                          {!item.ativa && <span className="etiqueta">Desativado</span>}
                        </small>
                      </span>
                      {painel && (
                        <span className="fatura-do-item">
                          <small>Fatura atual · vence {formatarData(painel.fatura_atual.vencimento).slice(0, 5)}</small>
                          <b>{formatarBRL(painel.fatura_atual_centavos)}</b>
                        </span>
                      )}
                      {botaoEditar(item)}
                      {painel && <MedidorDoLimite cartao={painel} compacto />}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="lado">
          <section className="cartao painel" aria-labelledby="titulo-formulario-da-conta">
            <div className="cabecalho-do-painel">
              <h2 id="titulo-formulario-da-conta">
                {emEdicao ? (cartao ? 'Editar cartão' : 'Editar conta') : cartao ? 'Novo cartão' : 'Nova conta'}
              </h2>
            </div>
            {!emEdicao && (
              <div className="abas largas" role="group" aria-label="O que cadastrar">
                {TIPOS_DO_FORMULARIO.map((tipo) => (
                  <button key={tipo.id} type="button" aria-pressed={tipoDoFormulario === tipo.id} onClick={() => trocarTipo(tipo.id)}>
                    {tipo.rotulo}
                  </button>
                ))}
              </div>
            )}
            <form id={ID_DO_FORMULARIO} onSubmit={enviar} noValidate>
              <Campo rotulo="Nome" name="nome" autoComplete="off" maxLength={60}
                placeholder={cartao ? 'Ex.: Cartão do banco' : 'Ex.: Conta do banco'}
                value={formulario.nome} onChange={(evento) => mudar('nome', evento.target.value)} erro={erros.nome} />

              {cartao ? (
                <>
                  <Campo rotulo="Limite (R$)" name="limite" inputMode="decimal" autoComplete="off" placeholder="0,00"
                    value={formulario.limite} onChange={(evento) => mudar('limite', evento.target.value)} erro={erros.limite} />
                  <div className="duas-colunas">
                    <Campo elemento={Seletor} rotulo="Fatura fecha" name="diaFechamento" placeholder="Dia" opcoes={DIAS_DO_MES}
                      value={formulario.diaFechamento} onChange={(evento) => mudar('diaFechamento', evento.target.value)}
                      erro={erros.diaFechamento} />
                    <Campo elemento={Seletor} rotulo="Fatura vence" name="diaVencimento" placeholder="Dia" opcoes={DIAS_DO_MES}
                      value={formulario.diaVencimento} onChange={(evento) => mudar('diaVencimento', evento.target.value)}
                      erro={erros.diaVencimento} />
                  </div>
                  <p className="dica-do-campo">
                    A compra feita no dia do fechamento já entra na fatura seguinte. Dias 29 a 31 viram o último dia nos meses
                    mais curtos.
                  </p>
                </>
              ) : (
                <Campo elemento={Seletor} rotulo="Tipo" name="tipo" value={formulario.tipo} opcoes={TIPOS_DE_CONTA}
                  onChange={(evento) => mudar('tipo', evento.target.value)} erro={erros.tipo} />
              )}

              {!cartao && emEdicao && (
                <p className="dica-do-campo">
                  Saldo inicial: {formatarBRL(emEdicao.saldo_inicial_centavos)}. Ele não muda depois de criado, para não
                  reescrever o saldo dos dias passados; para corrigir, lance um ajuste.
                </p>
              )}
              {!cartao && !emEdicao && (
                <Campo rotulo="Saldo de hoje (R$)" name="saldoInicial" inputMode="decimal" autoComplete="off" placeholder="0,00"
                  dica="Quanto já está na conta. Use -150,00 se estiver no vermelho."
                  value={formulario.saldoInicial} onChange={(evento) => mudar('saldoInicial', evento.target.value)}
                  erro={erros.saldoInicial} />
              )}

              {emEdicao && (
                <label className="caixa-de-marcar">
                  <input type="checkbox" name="ativa" checked={formulario.ativa}
                    onChange={(evento) => mudar('ativa', evento.target.checked)} />
                  <span>
                    <b>{cartao ? 'Cartão ativo' : 'Conta ativa'}</b>
                    <small>
                      {cartao
                        ? 'Desativado, não recebe compras novas. As faturas e o pagamento continuam.'
                        : 'Desativada, sai das opções de novos lançamentos e mantém o histórico.'}
                    </small>
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
                  {enviando ? 'Salvando…' : emEdicao ? 'Salvar' : cartao ? 'Criar cartão' : 'Criar conta'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
