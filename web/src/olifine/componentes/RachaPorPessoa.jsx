import { memo, useState } from 'react';
import Campo from '../../componentes/Campo';
import Icone from '../../componentes/Icone';
import Menu from '../../componentes/Menu';
import Modal from '../../componentes/Modal';
import Seletor from '../../componentes/Seletor';
import SeletorDeData from '../../componentes/SeletorDeData';
import { useToast } from '../../componentes/toast/useToast';
import { formatarData, hojeIso } from '../../regras/datas';
import { formatarBRL } from '../../regras/dinheiro';
import { errosDaApi } from '../../regras/livroCaixa';
import { atualizarParte } from '../../servicos/livroCaixa';
import Dica from './Dica';

const dataCurta = (iso) => formatarData(iso).slice(0, 5);

// O que a parte diz, em poucas palavras: o prazo, o pagamento ou o atraso.
function situacaoDaParte(parte) {
  if (parte.estado === 'recebido') {
    return { texto: parte.recebidoEm ? `Recebido em ${dataCurta(parte.recebidoEm)}` : 'Recebido', icone: 'certo' };
  }
  if (parte.estado === 'inadimplente') {
    return parte.situacao === 'NAO_PAGO'
      ? { texto: 'Não pagou: virou despesa sua', icone: 'alerta' }
      : { texto: `Venceu há ${parte.diasDeAtraso} ${parte.diasDeAtraso === 1 ? 'dia' : 'dias'}: virou despesa sua`, icone: 'alerta' };
  }
  return { texto: parte.vencimento ? `A receber até ${dataCurta(parte.vencimento)}` : 'A receber, sem prazo', icone: 'relogio' };
}

const iniciais = (nome) =>
  nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palavra) => palavra[0])
    .join('')
    .toUpperCase();

// "Gastos por pessoa" da Visão geral: o racha de cada pessoa, com o que ela
// ainda deve (a receber, um ativo de curto prazo, fora das suas despesas), o
// que já pagou (o reembolso entrou numa conta) e o que passou do prazo sem
// pagar (inadimplência: a parte volta a ser despesa sua, sem gravar nada).
// As contas estão em regras/aReceber.ts; cada parte tem o menu para marcar
// que recebeu (com a conta em que o dinheiro entrou), que a pessoa não vai
// pagar ou para voltar a cobrar.
function RachaPorPessoa({ espacoId, devedores, totais, contas, aoMudar }) {
  const toast = useToast();
  // A parte sendo recebida (o modal com a conta e a data).
  const [recebendo, setRecebendo] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function mudar(parte, mudanca, { titulo, mensagem, desfazer }) {
    try {
      await atualizarParte(espacoId, parte.lancamentoId, parte.indice, mudanca);
      toast.sucesso(mensagem, {
        titulo,
        ...(desfazer ? { acao: { rotulo: 'Desfazer', aoClicar: () => mudar(parte, desfazer, { titulo: 'Desfeito', mensagem: `${parte.pessoa} volta a dever ${formatarBRL(parte.valor)}.` }) } } : {}),
      });
      aoMudar();
    } catch (erro) {
      toast.erro(erro.message, { titulo: 'Racha não atualizado' });
    }
  }

  function acoesDa(parte) {
    const valor = formatarBRL(parte.valor);
    const recebida = parte.estado === 'recebido';
    return [
      ...(recebida
        ? []
        : [
            {
              id: 'receber',
              rotulo: 'Recebi',
              descricao: 'O dinheiro entrou numa conta sua.',
              icone: 'entrada',
              aoEscolher: () => setRecebendo(parte),
            },
          ]),
      ...(parte.situacao === 'PENDENTE'
        ? [
            {
              id: 'nao-pagou',
              rotulo: 'Não vai pagar',
              descricao: 'A parte volta a ser despesa sua.',
              icone: 'alerta',
              aoEscolher: () =>
                mudar(parte, { situacao: 'NAO_PAGO' }, {
                  titulo: 'Parte assumida',
                  mensagem: `${valor} de ${parte.pessoa} voltou para as suas despesas.`,
                  desfazer: { situacao: 'PENDENTE' },
                }),
            },
          ]
        : [
            {
              id: 'cobrar',
              rotulo: 'Voltar a cobrar',
              descricao: recebida ? 'Desfaz o recebimento: o reembolso sai da conta.' : 'A parte volta a ficar a receber.',
              icone: 'estornar',
              aoEscolher: () =>
                mudar(parte, { situacao: 'PENDENTE' }, { titulo: 'Parte a receber de novo', mensagem: `${parte.pessoa} deve ${valor}.` }),
            },
          ]),
    ];
  }

  return (
    <section className="cartao of-painel of-painel-racha" aria-labelledby="titulo-racha">
      <div className="of-painel-cabecalho">
        <h2 id="titulo-racha">Gastos por pessoa</h2>
        <small>O racha: quem te deve e quem já pagou</small>
      </div>

      <dl className="of-racha-totais">
        <div className="a-receber">
          <dt>
            A receber
            <Dica titulo="A receber">
              <p>
                As partes das despesas que você dividiu e que as outras pessoas ainda vão te pagar. É dinheiro seu nas mãos
                delas: fica fora das suas despesas e entra no saldo livre quando vence até o fim do mês.
              </p>
            </Dica>
          </dt>
          <dd>{formatarBRL(totais.aReceber)}</dd>
        </div>
        <div className="recebido">
          <dt>Recebido</dt>
          <dd>{formatarBRL(totais.recebido)}</dd>
        </div>
        <div className="inadimplente">
          <dt>
            Assumido
            <Dica titulo="Assumido (inadimplência)">
              <p>
                O que passou do prazo sem pagamento, ou que você marcou como não pago. Essa parte volta a ser despesa sua e
                sai do que está a receber. Se a pessoa pagar depois, marque como recebido.
              </p>
            </Dica>
          </dt>
          <dd>{formatarBRL(totais.inadimplente)}</dd>
        </div>
      </dl>

      {devedores.length > 0 ? (
        <ul className="of-racha-pessoas">
          {devedores.map((devedor) => (
            <li key={devedor.pessoa} className={devedor.inadimplente > 0 ? 'com-atraso' : ''}>
              <details>
                <summary>
                  <span className="of-racha-avatar" aria-hidden="true">
                    {iniciais(devedor.pessoa)}
                  </span>
                  <span className="of-racha-nome">
                    <b>{devedor.pessoa}</b>
                    <small>
                      {devedor.aReceber > 0 ? `deve ${formatarBRL(devedor.aReceber)}` : 'nada a receber'}
                      {devedor.inadimplente > 0 ? ` · ${formatarBRL(devedor.inadimplente)} assumidos` : ''}
                    </small>
                  </span>
                  <span className={`of-racha-valor${devedor.aReceber > 0 ? '' : ' quitado'}`}>
                    {formatarBRL(devedor.aReceber)}
                  </span>
                  <Icone nome="seta" tamanho={14} />
                </summary>
                <ul className="of-racha-partes">
                  {devedor.partes.map((parte) => {
                    const situacao = situacaoDaParte(parte);
                    return (
                      <li key={`${parte.lancamentoId}-${parte.indice}`} className={`parte ${parte.estado}`}>
                        <span className="of-racha-parte-textos">
                          <b>{parte.descricao}</b>
                          <small>
                            {formatarData(parte.data)} · <Icone nome={situacao.icone} tamanho={12} /> {situacao.texto}
                          </small>
                        </span>
                        <span className="of-racha-parte-valor">{formatarBRL(parte.valor)}</span>
                        <Menu rotulo={`Ações da parte de ${parte.pessoa} em ${parte.descricao}`} itens={acoesDa(parte)} icone="maisOpcoes" />
                      </li>
                    );
                  })}
                </ul>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="of-discreto">
          Dividiu um gasto com alguém? No "+ Novo", divida a despesa com o nome e a parte de cada pessoa: quem te deve aparece
          aqui, com o prazo para pagar.
        </p>
      )}

      <Modal
        aberta={Boolean(recebendo)}
        titulo="Recebi a parte"
        descricao={recebendo ? `${recebendo.pessoa} · ${recebendo.descricao} · ${formatarBRL(recebendo.valor)}` : undefined}
        aoFechar={() => setRecebendo(null)}
        ocupado={ocupado}
      >
        {recebendo && (
          <FormularioDeRecebimento
            espacoId={espacoId}
            parte={recebendo}
            contas={contas}
            aoMudarOcupado={setOcupado}
            aoCancelar={() => setRecebendo(null)}
            aoReceber={() => {
              setRecebendo(null);
              aoMudar();
            }}
          />
        )}
      </Modal>
    </section>
  );
}

// A conta em que o dinheiro da parte entrou e quando: a API lança o
// reembolso nela (um estorno parcial da despesa, que não vira receita).
function FormularioDeRecebimento({ espacoId, parte, contas, aoMudarOcupado, aoCancelar, aoReceber }) {
  const toast = useToast();
  const [contaId, setContaId] = useState(contas.length === 1 ? contas[0].id : '');
  const [data, setData] = useState(hojeIso);
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento) {
    evento.preventDefault();
    if (!contaId) {
      setErros({ conta_id: 'Escolha a conta em que o dinheiro entrou.' });
      return;
    }
    setEnviando(true);
    aoMudarOcupado(true);
    try {
      await atualizarParte(espacoId, parte.lancamentoId, parte.indice, { situacao: 'RECEBIDO', conta_id: contaId, data });
      toast.sucesso(`${formatarBRL(parte.valor)} de ${parte.pessoa} entrou na conta.`, { titulo: 'Parte recebida' });
      aoReceber();
    } catch (erro) {
      setErros(errosDaApi(erro.campos));
      toast.erro(erro.message, { titulo: 'Recebimento não registrado' });
    } finally {
      setEnviando(false);
      aoMudarOcupado(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <p className="dica-do-campo">
        O valor entra na conta como reembolso da despesa: a categoria fica só com a sua parte, sem virar receita.
      </p>
      <div className="duas-colunas">
        <Campo elemento={Seletor} rotulo="Entrou na conta" name="conta_id" placeholder="Escolha a conta"
          opcoes={contas.map((conta) => ({ valor: conta.id, rotulo: conta.nome }))} value={contaId}
          onChange={(evento) => {
            setContaId(evento.target.value);
            setErros((atuais) => ({ ...atuais, conta_id: undefined }));
          }} erro={erros.conta_id} />
        <Campo elemento={SeletorDeData} rotulo="Em" name="data" value={data}
          onChange={(evento) => setData(evento.target.value)} erro={erros.data} />
      </div>
      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Registrando…' : 'Registrar recebimento'}
        </button>
      </div>
    </form>
  );
}

// memo: a Visão geral redesenha (filtro, modal, recarga) sem que isto mude.
export default memo(RachaPorPessoa);
