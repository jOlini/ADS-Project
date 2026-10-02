import { useDeferredValue, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import Icone from '../../componentes/Icone';
import { useCliqueFora } from '../../componentes/flutuante';
import {
  ABAS_DA_BUSCA,
  buscarEmTudo,
  MINIMO_DA_BUSCA,
  totalDaBusca,
  type AbaDaBusca,
  type CategoriaDaBusca,
  type ContaDaBusca,
  type LinhaDaBusca,
  type ResultadoDaBusca,
} from '../../regras/buscaGlobal';
import { corDaCategoria } from '../../regras/cores';
import { hojeIso } from '../../regras/datas';
import { somarDias } from '../../regras/calendario';
import { formatarComSinal } from '../../regras/dinheiro';
import { paraExtrato } from '../../regras/livroCaixa';
import { normalizarTexto } from '../../regras/texto';
import { listarCategorias, listarContas, listarLancamentos } from '../../servicos/livroCaixa';

interface Props {
  espacoId: string | undefined;
}

interface DadosDaBusca {
  espacoId: string;
  linhas: LinhaDaBusca[];
  contas: ContaDaBusca[];
  categorias: CategoriaDaBusca[];
  lidoEm: number;
}

// Os lançamentos de um ano para trás: o bastante para achar o que a pessoa
// lembra, dentro do teto de uma consulta da API.
const DIAS_DA_BUSCA = 365;
// Dados lidos há menos disto servem para a próxima busca sem ir à API.
const VALIDADE_DOS_DADOS = 60_000;
// Na aba "Tudo", quantos resultados de cada aba aparecem.
const POR_ABA_NO_TUDO = 4;

const ICONE_DA_ABA: Record<AbaDaBusca, string> = {
  lancamentos: 'lancamentos',
  cartoes: 'cartao',
  contas: 'contas',
  categorias: 'categorias',
};

// Busca do topo: a cada letra, a lista abaixo do campo mostra o que combina,
// em abas (Tudo, Lançamentos, Cartões, Contas, Categorias), com as compras
// nos cartões de crédito junto dos lançamentos das contas. Os dados são
// lidos uma vez ao entrar no campo (e de novo depois de um minuto); a
// digitação nunca espera a lista (useDeferredValue). Setas escolhem, Enter
// abre (sem nada escolhido, abre a busca no extrato, como antes), Esc fecha.
export default function BuscaGlobal({ espacoId }: Props) {
  const navigate = useNavigate();
  const idDaLista = useId();
  const moldura = useRef<HTMLFormElement>(null);
  const [termo, setTermo] = useState('');
  const termoAdiado = useDeferredValue(termo);
  const [aberta, setAberta] = useState(false);
  const [aba, setAba] = useState<AbaDaBusca | 'tudo'>('tudo');
  const [ativo, setAtivo] = useState(-1);
  const [dados, setDados] = useState<DadosDaBusca | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [falhou, setFalhou] = useState(false);

  useCliqueFora([moldura], () => setAberta(false), aberta);

  async function carregar() {
    if (!espacoId || carregando || (dados?.espacoId === espacoId && Date.now() - dados.lidoEm < VALIDADE_DOS_DADOS)) {
      return;
    }
    setCarregando(true);
    try {
      const hoje = hojeIso();
      const [contas, categorias, lancamentos] = await Promise.all([
        listarContas(espacoId),
        listarCategorias(espacoId),
        listarLancamentos(espacoId, { de: somarDias(hoje, -DIAS_DA_BUSCA) }),
      ]);
      setDados({ espacoId, linhas: paraExtrato(lancamentos, contas, categorias), contas, categorias, lidoEm: Date.now() });
      setFalhou(false);
    } catch {
      // Sem a API: Enter continua levando à busca do extrato.
      setFalhou(true);
    } finally {
      setCarregando(false);
    }
  }

  const resultados = useMemo(
    () => (dados && dados.espacoId === espacoId ? buscarEmTudo(termoAdiado, dados) : null),
    [termoAdiado, dados, espacoId],
  );
  const visiveis: ResultadoDaBusca[] = resultados
    ? aba === 'tudo'
      ? ABAS_DA_BUSCA.flatMap((item) => resultados[item.id].slice(0, POR_ABA_NO_TUDO))
      : resultados[aba]
    : [];
  const mostrar = aberta && normalizarTexto(termo).length >= MINIMO_DA_BUSCA;
  const idDoResultado = (indice: number) => `${idDaLista}-${indice}`;

  function abrir(resultado: ResultadoDaBusca) {
    setAberta(false);
    setTermo('');
    setAtivo(-1);
    navigate(resultado.para);
  }

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const escolhido = visiveis[ativo];
    if (escolhido) {
      abrir(escolhido);
      return;
    }
    const busca = termo.trim();
    setAberta(false);
    navigate(busca ? `/lancamentos?busca=${encodeURIComponent(busca)}` : '/lancamentos');
  }

  function teclar(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'ArrowDown' || evento.key === 'ArrowUp') {
      evento.preventDefault();
      setAberta(true);
      if (visiveis.length > 0) {
        const passo = evento.key === 'ArrowDown' ? 1 : -1;
        setAtivo((atual) => (atual + passo + visiveis.length) % visiveis.length);
      }
    } else if (evento.key === 'Escape') {
      if (mostrar) {
        evento.preventDefault();
        setAberta(false);
      } else if (termo) {
        evento.preventDefault();
        setTermo('');
      }
    }
  }

  return (
    <form ref={moldura} className="of-busca" role="search" onSubmit={enviar}>
      <Icone nome="busca" tamanho={16} />
      <input
        type="search"
        role="combobox"
        aria-label="Buscar lançamentos, compras nos cartões, contas e categorias"
        aria-expanded={mostrar}
        aria-controls={idDaLista}
        aria-autocomplete="list"
        aria-activedescendant={mostrar && visiveis[ativo] ? idDoResultado(ativo) : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="Buscar lançamentos, cartões, contas"
        value={termo}
        onChange={(evento) => {
          setTermo(evento.target.value);
          setAtivo(-1);
          setAberta(true);
        }}
        onFocus={() => {
          setAberta(true);
          void carregar();
        }}
        onKeyDown={teclar}
      />
      {mostrar && (
        <div className="of-busca-painel">
          <div className="of-busca-abas" role="group" aria-label="Mostrar resultados de">
            {[{ id: 'tudo' as const, rotulo: 'Tudo' }, ...ABAS_DA_BUSCA].map((item) => {
              const quantos = resultados ? (item.id === 'tudo' ? totalDaBusca(resultados) : resultados[item.id].length) : 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={aba === item.id}
                  onMouseDown={(evento) => evento.preventDefault()}
                  onClick={() => {
                    setAba(item.id);
                    setAtivo(-1);
                  }}
                >
                  {item.rotulo}
                  <span className="of-busca-contagem">{quantos}</span>
                </button>
              );
            })}
          </div>
          {!resultados ? (
            <p className="of-busca-vazio" role="status">
              {falhou ? 'Não deu para buscar agora. Enter busca no extrato.' : 'Buscando…'}
            </p>
          ) : visiveis.length === 0 ? (
            <p className="of-busca-vazio" role="status">
              Nada com &quot;{termo.trim()}&quot; {aba === 'tudo' ? 'no último ano' : 'nesta aba'}. Enter busca no extrato do mês.
            </p>
          ) : (
            <ul id={idDaLista} role="listbox" aria-label="Resultados da busca" className="of-busca-lista">
              {visiveis.map((resultado, indice) => (
                <li
                  key={resultado.chave}
                  id={idDoResultado(indice)}
                  role="option"
                  aria-selected={indice === ativo}
                  onMouseDown={(evento) => evento.preventDefault()}
                  onMouseEnter={() => setAtivo(indice)}
                  onClick={() => abrir(resultado)}
                >
                  <span className={`of-busca-marca aba-${resultado.aba}`} aria-hidden="true">
                    {resultado.aba === 'categorias' ? (
                      <span className="circulo-da-categoria" style={{ ['--cor-da-categoria' as string]: corDaCategoria(resultado.cor) }} />
                    ) : (
                      <Icone nome={ICONE_DA_ABA[resultado.aba]} tamanho={16} />
                    )}
                  </span>
                  <span className="of-busca-textos">
                    <b>{resultado.titulo}</b>
                    <small>{resultado.detalhe}</small>
                  </span>
                  {resultado.valor !== undefined && (
                    <span className={`of-busca-valor${resultado.valor > 0 ? ' entrada' : ''}`}>{formatarComSinal(resultado.valor)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="of-busca-rodape" aria-hidden="true">
            ↑ ↓ escolhem · Enter abre · Esc fecha
          </p>
        </div>
      )}
    </form>
  );
}
