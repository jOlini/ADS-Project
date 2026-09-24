import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import AvisoApi from '../componentes/AvisoApi';
import Campo from '../componentes/Campo';
import Carregando from '../componentes/Carregando';
import Icone from '../componentes/Icone';
import { useToast } from '../componentes/toast/useToast';
import { useCarga } from '../componentes/useCarga';
import { primeiroCampoComErro } from '../regras/cadastro';
import { formatarBRL, lerValor } from '../regras/dinheiro';
import { errosDaApi, ORDEM_DA_CONTA, rotuloDoTipoDeConta, saldoTotal, TIPOS_DE_CONTA, validarConta } from '../regras/livroCaixa';
import { apiConfigurada, atualizarConta, criarConta, listarContas } from '../servicos/livroCaixa';

const NOVA = { nome: '', tipo: 'CORRENTE', saldoInicial: '', ativa: true };

// Contas: onde o dinheiro está (corrente, poupança, carteira, investimento),
// com o saldo de cada uma. O saldo inicial é o dinheiro que já estava lá antes
// do primeiro lançamento e não muda depois; renomear e desativar, sim.
export default function Contas() {
  const { espaco } = useOutletContext();
  const toast = useToast();
  // null = criando uma conta nova; senão, a conta em edição.
  const [emEdicao, setEmEdicao] = useState(null);
  const [formulario, setFormulario] = useState(NOVA);
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);

  const espacoId = espaco.dados?.id;
  const buscarContas = useMemo(() => (espacoId ? () => listarContas(espacoId) : null), [espacoId]);
  const contas = useCarga(buscarContas);

  if (!apiConfigurada) {
    return (
      <>
        <header className="cabecalho-da-pagina">
          <h1>Contas</h1>
        </header>
        <AvisoApi />
      </>
    );
  }
  if (espaco.carregando || (espacoId && contas.carregando && !contas.dados)) {
    return <Carregando />;
  }
  const falha = espaco.erro || contas.erro?.message;
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

  const lista = contas.dados ?? [];

  function mudar(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  function editar(conta) {
    setEmEdicao(conta);
    setFormulario({ nome: conta.nome, tipo: conta.tipo, saldoInicial: '', ativa: conta.ativa });
    setErros({});
    // O formulário fica ao lado (ou abaixo, no celular): o foco vai até ele.
    requestAnimationFrame(() => document.getElementById('formulario-da-conta')?.elements.nome?.focus());
  }

  function cancelar() {
    setEmEdicao(null);
    setFormulario(NOVA);
    setErros({});
  }

  async function enviar(evento) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements;
    const encontrados = validarConta(emEdicao ? { ...formulario, saldoInicial: '' } : formulario);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DA_CONTA);
    if (primeiro) {
      elementos[primeiro]?.focus();
      return;
    }

    setEnviando(true);
    try {
      if (emEdicao) {
        const salva = await atualizarConta(espacoId, emEdicao.id, {
          nome: formulario.nome.trim(),
          tipo: formulario.tipo,
          ativa: formulario.ativa,
        });
        toast.sucesso(salva.ativa ? 'Os lançamentos continuam iguais.' : 'Ela sai das opções de novos lançamentos.', {
          titulo: `Conta "${salva.nome}" salva`,
        });
      } else {
        const criada = await criarConta(espacoId, {
          nome: formulario.nome.trim(),
          tipo: formulario.tipo,
          saldo_inicial_centavos: formulario.saldoInicial.trim()
            ? lerValor(formulario.saldoInicial, { permitirNegativo: true })
            : 0,
        });
        toast.sucesso(`Saldo inicial de ${formatarBRL(criada.saldo_inicial_centavos)}.`, {
          titulo: `Conta "${criada.nome}" criada`,
        });
      }
      cancelar();
      contas.recarregar();
    } catch (erro) {
      setErros(errosDaApi(erro.campos));
      toast.erro(erro.message, { titulo: 'Conta não salva' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <header className="cabecalho-da-pagina">
        <h1>Contas</h1>
      </header>

      <div className="corpo-do-resumo pagina-de-cadastro">
        <section className="cartao lista" aria-labelledby="titulo-contas">
          <div className="cabecalho-do-painel">
            <h2 id="titulo-contas">Suas contas</h2>
            {lista.length > 0 && <small>Total {formatarBRL(saldoTotal(lista))}</small>}
          </div>

          {lista.length === 0 ? (
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
              {lista.map((conta) => (
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
                  <button type="button" className="discreto-botao" onClick={() => editar(conta)}>
                    <Icone nome="editar" tamanho={16} />
                    <span className="rotulo-da-acao">Editar</span>
                    <span className="apenas-leitor">: {conta.nome}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="lado">
          <section className="cartao painel" aria-labelledby="titulo-formulario-da-conta">
            <div className="cabecalho-do-painel">
              <h2 id="titulo-formulario-da-conta">{emEdicao ? 'Editar conta' : 'Nova conta'}</h2>
            </div>
            <form id="formulario-da-conta" onSubmit={enviar} noValidate>
              <Campo rotulo="Nome" name="nome" autoComplete="off" maxLength={60} placeholder="Ex.: Conta do banco"
                value={formulario.nome} onChange={(evento) => mudar('nome', evento.target.value)} erro={erros.nome} />

              <Campo elemento="select" rotulo="Tipo" name="tipo" value={formulario.tipo}
                onChange={(evento) => mudar('tipo', evento.target.value)} erro={erros.tipo}>
                {TIPOS_DE_CONTA.map((tipo) => (
                  <option key={tipo.valor} value={tipo.valor}>
                    {tipo.rotulo}
                  </option>
                ))}
              </Campo>

              {emEdicao ? (
                <>
                  <p className="dica-do-campo">
                    Saldo inicial: {formatarBRL(emEdicao.saldo_inicial_centavos)}. Ele não muda depois de criado, para não
                    reescrever o saldo dos dias passados; para corrigir, lance um ajuste.
                  </p>
                  <label className="caixa-de-marcar">
                    <input type="checkbox" name="ativa" checked={formulario.ativa}
                      onChange={(evento) => mudar('ativa', evento.target.checked)} />
                    <span>
                      <b>Conta ativa</b>
                      <small>Desativada, sai das opções de novos lançamentos e mantém o histórico.</small>
                    </span>
                  </label>
                </>
              ) : (
                <Campo rotulo="Saldo de hoje (R$)" name="saldoInicial" inputMode="decimal" autoComplete="off" placeholder="0,00"
                  dica="Quanto já está na conta. Use -150,00 se estiver no vermelho."
                  value={formulario.saldoInicial} onChange={(evento) => mudar('saldoInicial', evento.target.value)}
                  erro={erros.saldoInicial} />
              )}

              <div className="acoes-do-formulario">
                {emEdicao && (
                  <button type="button" className="secundario" onClick={cancelar} disabled={enviando}>
                    Cancelar
                  </button>
                )}
                <button type="submit" disabled={enviando} aria-busy={enviando}>
                  {enviando ? 'Salvando…' : emEdicao ? 'Salvar' : 'Criar conta'}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </>
  );
}
