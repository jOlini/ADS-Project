import { useState } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import Campo from '../../componentes/Campo';
import Confirmacao from '../../componentes/Confirmacao';
import Menu from '../../componentes/Menu';
import Modal from '../../componentes/Modal';
import SeletorDeData from '../../componentes/SeletorDeData';
import { useToast } from '../../componentes/toast/useToast';
import { formatarBRL, lerValor } from '../../regras/dinheiro';
import { formatarData, hojeIso } from '../../regras/datas';
import Arvore from '../componentes/Arvore';
import Icone from '../../componentes/Icone';
import {
  concluida,
  faltaParaOAlvo,
  FASES,
  faseDaMeta,
  guardado,
  planoMensal,
  porcentagem,
  progresso,
  proximaFase,
  sementeDaMeta,
  sequenciaDeSemanas,
  TAMANHO_MAXIMO_DO_NOME,
  validarAporte,
  validarMeta,
} from '../regras/metas';
import { useMetas } from '../useMetas';

// Valores rápidos de aporte, em centavos.
const APORTES_RAPIDOS = [5000, 10000, 20000, 50000];
const MES_E_ANO = new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const mesEAno = (iso) => MES_E_ANO.format(new Date(`${iso}T12:00:00Z`)).replace('.', '').replace(' de ', '/');

function FormularioDeMeta({ aoCriar, aoCancelar }) {
  const [formulario, setFormulario] = useState({ nome: '', alvo: '', prazo: '' });
  const [erros, setErros] = useState({});
  const hoje = hojeIso();

  function criar(evento) {
    evento.preventDefault();
    const alvo = lerValor(formulario.alvo);
    const encontrados = validarMeta({ ...formulario, alvo }, hoje);
    setErros(encontrados);
    if (Object.keys(encontrados).length === 0) {
      aoCriar({ nome: formulario.nome, alvo, prazo: formulario.prazo });
    }
  }

  const mudar = (campo) => (evento) => setFormulario((atual) => ({ ...atual, [campo]: evento.target?.value ?? evento }));

  return (
    <form className="of-formulario-da-meta" onSubmit={criar} noValidate>
      <Campo rotulo="Nome da meta" name="nome" value={formulario.nome} onChange={mudar('nome')} erro={erros.nome}
        maxLength={TAMANHO_MAXIMO_DO_NOME} placeholder="Ex.: Reserva de emergência" autoFocus />
      <Campo rotulo="Quanto você quer juntar" name="alvo" inputMode="decimal" value={formulario.alvo}
        onChange={mudar('alvo')} erro={erros.alvo} placeholder="R$ 0,00" />
      <Campo rotulo="Prazo (opcional)" elemento={SeletorDeData} name="prazo" value={formulario.prazo}
        onChange={(valor) => setFormulario((atual) => ({ ...atual, prazo: valor }))} erro={erros.prazo} min={hoje}
        dica="Com prazo, a meta mostra quanto guardar por mês." />
      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar}>
          Cancelar
        </button>
        <button type="submit">
          <Icone nome="broto" tamanho={16} />
          Plantar meta
        </button>
      </div>
    </form>
  );
}

// Régua das fases embaixo da árvore: cada marco no ponto do alvo em que a
// fase começa; os alcançados ficam verdes. Os nomes ficam sob os marcos.
const posicaoDaFase = (fase) => (fase.id === 'broto' ? 0 : fase.aPartirDe * 100);

function ReguaDeFases({ meta }) {
  const atual = FASES.findIndex((fase) => fase.id === faseDaMeta(meta).id);
  const marcos = FASES.filter((fase) => fase.id !== 'semente');
  const alcancada = (fase) => FASES.indexOf(fase) <= atual;
  return (
    <div className="of-fases">
      <div className="of-fases-trilho" aria-hidden="true">
        <i style={{ '--p': `${porcentagem(meta)}%` }} />
        {marcos.map((fase) => (
          <span key={fase.id} className={`of-fases-marco${alcancada(fase) ? ' alcancado' : ''}`} style={{ left: `${posicaoDaFase(fase)}%` }} />
        ))}
      </div>
      <ol className="of-fases-nomes" aria-label="Fases da árvore">
        {marcos.map((fase) => (
          <li key={fase.id} className={alcancada(fase) ? 'alcancada' : ''} style={{ left: `${posicaoDaFase(fase)}%` }}>
            {fase.id === 'frutos' ? 'Frutos' : fase.nome}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Estufa({ meta, rega, aoRegar, aoExcluir }) {
  const [outro, setOutro] = useState('');
  const [erro, setErro] = useState('');
  const hoje = hojeIso();
  const fase = faseDaMeta(meta);
  const proxima = proximaFase(meta);
  const plano = planoMensal(meta, hoje);
  const sequencia = sequenciaDeSemanas(meta.aportes, hoje);
  const completa = concluida(meta);
  const ultimos = [...meta.aportes].reverse().slice(0, 4);

  function regarOutro(evento) {
    evento.preventDefault();
    const valor = lerValor(outro);
    const problema = validarAporte(valor);
    setErro(problema);
    if (!problema) {
      aoRegar(valor);
      setOutro('');
    }
  }

  return (
    <section className="cartao of-estufa" aria-labelledby="titulo-da-estufa">
      <header className="of-estufa-cabecalho">
        <div>
          <h2 id="titulo-da-estufa">{meta.nome}</h2>
          <p>
            <span className={`of-fase-selo${completa ? ' completa' : ''}`}>{fase.nome}</span>
            {meta.prazo && <span className="of-estufa-prazo">até {formatarData(meta.prazo)}</span>}
          </p>
        </div>
        <Menu
          rotulo={`Ações da meta ${meta.nome}`}
          itens={[{ id: 'excluir', rotulo: 'Excluir meta', descricao: 'Apaga a meta e os aportes deste navegador.', icone: 'excluir', perigo: true, aoEscolher: aoExcluir }]}
        />
      </header>

      <div className="of-estufa-corpo">
        <div className="of-estufa-arvore">
          <Arvore
            semente={sementeDaMeta(meta.id)}
            progresso={progresso(meta)}
            rega={rega}
            rotulo={`Árvore da meta ${meta.nome}: fase ${fase.nome}, ${porcentagem(meta)}% do alvo.`}
          />
        </div>

        <div className="of-estufa-painel">
          <p className="of-estufa-guardado">
            <b>{formatarBRL(guardado(meta))}</b>
            <span>de {formatarBRL(meta.alvo)}</span>
          </p>
          <ReguaDeFases meta={meta} />

          <ul className="of-estufa-fatos">
            <li>
              <Icone nome="broto" tamanho={16} />
              {completa
                ? 'Meta completa: a árvore deu frutos.'
                : proxima.fase.id === 'broto'
                  ? 'Faça o primeiro aporte para a semente brotar.'
                  : `Faltam ${formatarBRL(proxima.faltam)} para virar ${proxima.fase.id === 'frutos' ? 'árvore com frutos' : proxima.fase.nome.toLowerCase()}.`}
            </li>
            <li>
              <Icone nome="gota" tamanho={16} />
              {sequencia > 0
                ? `${sequencia} ${sequencia === 1 ? 'semana' : 'semanas seguidas'} regando.`
                : 'Regue esta semana para começar uma sequência.'}
            </li>
            {plano && (
              <li>
                <Icone nome="calendario" tamanho={16} />
                Para chegar lá até {mesEAno(meta.prazo)}, guarde {formatarBRL(plano.porMes)} por mês.
              </li>
            )}
          </ul>

          {!completa && (
            <div className="of-regar">
              <p className="of-regar-titulo">Regar com um aporte</p>
              <div className="of-regar-rapidos">
                {APORTES_RAPIDOS.filter((valor) => valor <= Math.max(faltaParaOAlvo(meta), 5000)).map((valor) => (
                  <button key={valor} type="button" className="of-chip" onClick={() => aoRegar(valor)}>
                    <Icone nome="gota" tamanho={14} />+ {formatarBRL(valor).replace(',00', '')}
                  </button>
                ))}
              </div>
              <form className="of-regar-outro" onSubmit={regarOutro} noValidate>
                <Campo rotulo="Outro valor" name="aporte" inputMode="decimal" value={outro}
                  onChange={(evento) => setOutro(evento.target.value)} erro={erro} placeholder="R$ 0,00" />
                <button type="submit">
                  <Icone nome="gota" tamanho={16} />
                  Regar
                </button>
              </form>
            </div>
          )}

          {ultimos.length > 0 && (
            <div className="of-aportes">
              <p className="of-regar-titulo">Últimos aportes</p>
              <ul>
                {ultimos.map((aporte) => (
                  <li key={aporte.id}>
                    <span>{formatarData(aporte.data)}</span>
                    <b>+ {formatarBRL(aporte.valor)}</b>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Aba Metas: cada meta é uma árvore que cresce com os aportes. As metas ficam
// neste navegador até a API de metas (release 0.5); a tela diz isso.
export default function Metas() {
  const { usuario } = useOutletContext();
  const location = useLocation();
  const toast = useToast();
  const [exemplo, setExemplo] = useState(false);
  const { metas, gravou, criar, aportar, desfazerAporte, remover } = useMetas(usuario?.uid, { exemplo });
  const [escolhida, setEscolhida] = useState(() => location.hash.slice(1) || null);
  const [criando, setCriando] = useState(false);
  const [excluindo, setExcluindo] = useState(null);
  const [regas, setRegas] = useState({});

  // Vindo da Visão geral com #id, abre aquela meta.
  const [hashVisto, setHashVisto] = useState(location.hash);
  if (location.hash !== hashVisto) {
    setHashVisto(location.hash);
    if (location.hash) {
      setEscolhida(location.hash.slice(1));
    }
  }

  const meta = metas.find((item) => item.id === escolhida) ?? metas.find((item) => !concluida(item)) ?? metas[0] ?? null;

  function regar(valor) {
    const antes = faseDaMeta(meta);
    const aporte = aportar(meta.id, valor);
    setRegas((atual) => ({ ...atual, [meta.id]: (atual[meta.id] ?? 0) + 1 }));
    const depois = faseDaMeta({ ...meta, aportes: [...meta.aportes, aporte] });
    const desfazer = { rotulo: 'Desfazer', aoClicar: () => desfazerAporte(meta.id, aporte.id) };
    if (depois.id === 'frutos') {
      toast.sucesso(`${meta.nome} chegou a ${formatarBRL(meta.alvo)}.`, { titulo: 'Meta completa: a árvore deu frutos!', acao: desfazer });
    } else if (depois.id !== antes.id) {
      toast.sucesso(`+ ${formatarBRL(valor)} em ${meta.nome}.`, { titulo: `Nova fase: ${depois.nome}!`, acao: desfazer });
    } else {
      toast.sucesso(`+ ${formatarBRL(valor)} em ${meta.nome}.`, { titulo: 'Árvore regada', acao: desfazer });
    }
  }

  function plantar(dados) {
    const nova = criar(dados);
    setCriando(false);
    setEscolhida(nova.id);
    toast.sucesso('Faça o primeiro aporte para a semente brotar.', { titulo: `Meta "${nova.nome}" plantada` });
  }

  function confirmarExclusao() {
    remover(excluindo.id);
    toast.info(`A meta "${excluindo.nome}" saiu deste navegador.`, { titulo: 'Meta excluída' });
    setExcluindo(null);
    setEscolhida(null);
  }

  return (
    <div className="of-metas">
      <header className="of-cabecalho">
        <div>
          <h1>Metas</h1>
          <p>Cada aporte rega a sua árvore. Complete a meta e ela dá frutos.</p>
        </div>
        <div className="of-cabecalho-acoes">
          {exemplo ? (
            <>
              <span className="selo-exemplo">
                <Icone nome="alerta" tamanho={14} />
                Metas de exemplo: nada é gravado
              </span>
              <button type="button" className="secundario" onClick={() => setExemplo(false)}>
                Sair do exemplo
              </button>
            </>
          ) : (
            <>
              <span className="of-selo-local" title="As metas ainda não vão para o servidor: ficam só neste navegador.">
                <Icone nome="cadeado" tamanho={14} />
                Salvas neste navegador
              </span>
              <button type="button" className="secundario" onClick={() => setCriando(true)}>
                <Icone nome="mais" tamanho={16} />
                Nova meta
              </button>
            </>
          )}
        </div>
      </header>

      {!gravou && (
        <p className="mensagem erro" role="alert">
          <Icone nome="alerta" tamanho={16} />
          O navegador não deixou gravar a última mudança. Ela vale até você fechar esta página.
        </p>
      )}

      {meta ? (
        <div className="of-metas-grade">
          <Estufa key={meta.id} meta={meta} rega={regas[meta.id] ?? 0} aoRegar={regar} aoExcluir={() => setExcluindo(meta)} />

          <section className="cartao of-painel of-metas-lista" aria-labelledby="titulo-lista-de-metas">
            <div className="of-painel-cabecalho">
              <h2 id="titulo-lista-de-metas">Seu pomar</h2>
              <small>{metas.length} {metas.length === 1 ? 'meta' : 'metas'}</small>
            </div>
            <ul>
              {metas.map((item) => (
                <li key={item.id}>
                  <button type="button" aria-pressed={item.id === meta.id} onClick={() => setEscolhida(item.id)}>
                    <span className="of-metas-resumo-arvore">
                      <Arvore semente={sementeDaMeta(item.id)} progresso={progresso(item)} compacta rotulo="" />
                    </span>
                    <span className="of-metas-resumo-textos">
                      <b>{item.nome}</b>
                      <small>
                        <span className="of-valor-guardado">{formatarBRL(guardado(item))}</span> de {formatarBRL(item.alvo)}
                      </small>
                      <span className="of-progresso" aria-hidden="true">
                        <i style={{ '--p': `${porcentagem(item)}%` }} />
                      </span>
                    </span>
                    <span className="of-metas-resumo-porcento">{porcentagem(item)}%</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <section className="cartao of-metas-vazio">
          <div className="of-metas-vazio-arvore">
            <Arvore semente={2026} progresso={0.62} rotulo="Árvore de exemplo, crescida pela metade." />
          </div>
          <div>
            <h2>Plante a sua primeira meta</h2>
            <p>
              Diga quanto quer juntar e para quê. Cada aporte rega a árvore: ela brota, vira muda, cresce e, quando a meta
              fica completa, dá frutos. Regar toda semana mantém a sequência viva.
            </p>
            <div className="of-metas-vazio-acoes">
              <button type="button" onClick={() => setCriando(true)}>
                <Icone nome="broto" tamanho={16} />
                Plantar meta
              </button>
              <button type="button" className="secundario" onClick={() => setExemplo(true)}>
                <Icone nome="olho" tamanho={16} />
                Ver metas de exemplo
              </button>
            </div>
          </div>
        </section>
      )}

      <Modal aberta={criando} titulo="Nova meta" descricao="A meta fica salva neste navegador." aoFechar={() => setCriando(false)}>
        <FormularioDeMeta aoCriar={plantar} aoCancelar={() => setCriando(false)} />
      </Modal>

      <Confirmacao
        aberta={Boolean(excluindo)}
        titulo="Excluir esta meta?"
        rotuloDeConfirmar="Excluir meta"
        perigo
        aoConfirmar={confirmarExclusao}
        aoCancelar={() => setExcluindo(null)}
      >
        {excluindo && (
          <p>
            &ldquo;{excluindo.nome}&rdquo; e os {excluindo.aportes.length} aportes dela saem deste navegador. Não dá para desfazer.
          </p>
        )}
      </Confirmacao>
    </div>
  );
}
