import { useId, useRef, useState } from 'react';
import { useTamanho } from '../../componentes/useTamanho';
import { formatarBRL } from '../../regras/dinheiro';
import { caminhoSuave, valorCurto } from '../regras/curva';
import { reguaDoGrafico } from '../regras/serie';
import { leituraDaVariacao, textoDaVariacao } from '../regras/tendencia';

const MARGEM = { cima: 18, direita: 14, baixo: 30, esquerda: 66 };

const DIA = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const DIA_LONGO = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC' });
const MES = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' });
const MES_LONGO = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

// 'AAAA-MM-DD' (dia) ou 'AAAA-MM' (mês) vira Date em UTC.
function comoData(texto) {
  const [ano, mes, dia = 1] = texto.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia));
}
// "28 de ago." vira "28 ago": cabe mais rótulo no eixo.
const semPonto = (texto) => texto.replace(' de ', ' ').replace('.', '');
const ehMes = (texto) => texto.length === 7;
const rotuloCurto = (texto) => semPonto(ehMes(texto) ? MES.format(comoData(texto)) : DIA.format(comoData(texto)));
const rotuloLongo = (texto) => (ehMes(texto) ? MES_LONGO.format(comoData(texto)) : DIA_LONGO.format(comoData(texto)).replace('.', ''));

// Quantos rótulos cabem no eixo de baixo: um a cada ~64px.
function indicesDoEixo(quantos, largura) {
  const cabem = Math.max(2, Math.floor(largura / 64));
  if (quantos <= cabem) {
    return Array.from({ length: quantos }, (_, indice) => indice);
  }
  const passo = (quantos - 1) / (cabem - 1);
  return Array.from({ length: cabem }, (_, indice) => Math.round(indice * passo));
}

// Evolução do saldo como instrumento: régua discreta, traço verde com área
// esmeralda transparente, e um cursor que lê qualquer ponto com o mouse, o
// dedo ou as setas do teclado. Em repouso, o balão mostra o último ponto.
export default function GraficoDeSaldo({ serie, variacao, descricao }) {
  const caixa = useRef(null);
  const { largura, altura } = useTamanho(caixa);
  const [cursor, setCursor] = useState(null);
  const id = useId().replace(/:/g, '');

  const regua = reguaDoGrafico(serie.map((ponto) => ponto.saldo));
  const util = { largura: Math.max(0, largura - MARGEM.esquerda - MARGEM.direita), altura: Math.max(0, altura - MARGEM.cima - MARGEM.baixo) };
  const x = (indice) => MARGEM.esquerda + (serie.length <= 1 ? util.largura : (indice / (serie.length - 1)) * util.largura);
  const y = (valor) => MARGEM.cima + util.altura - ((valor - regua.minimo) / (regua.maximo - regua.minimo)) * util.altura;
  const pontos = serie.map((ponto, indice) => ({ x: x(indice), y: y(ponto.saldo) }));
  const linha = caminhoSuave(pontos);
  const base = MARGEM.cima + util.altura;
  const area = pontos.length > 1 ? `${linha}L${pontos.at(-1).x} ${base}L${pontos[0].x} ${base}Z` : '';

  const atual = cursor ?? serie.length - 1;
  const ponto = pontos[atual];
  const dado = serie[atual];
  const leitura = leituraDaVariacao(variacao);

  function aoMover(evento) {
    const retangulo = caixa.current.getBoundingClientRect();
    const relativo = (evento.clientX - retangulo.left - MARGEM.esquerda) / Math.max(1, util.largura);
    setCursor(Math.min(serie.length - 1, Math.max(0, Math.round(relativo * (serie.length - 1)))));
  }

  function aoTeclar(evento) {
    const passos = { ArrowLeft: -1, ArrowRight: 1 };
    if (evento.key in passos) {
      evento.preventDefault();
      setCursor((anterior) => Math.min(serie.length - 1, Math.max(0, (anterior ?? serie.length - 1) + passos[evento.key])));
    } else if (evento.key === 'Home') {
      evento.preventDefault();
      setCursor(0);
    } else if (evento.key === 'End') {
      evento.preventDefault();
      setCursor(serie.length - 1);
    }
  }

  const pronto = largura > 0 && serie.length > 0;
  return (
    <div
      className="of-grafico"
      ref={caixa}
      tabIndex={0}
      role="group"
      aria-roledescription="gráfico"
      aria-label={`${descricao}. Use as setas para ler cada ponto.`}
      onPointerMove={aoMover}
      onPointerLeave={() => setCursor(null)}
      onKeyDown={aoTeclar}
      onBlur={() => setCursor(null)}
    >
      {pronto && (
        <svg width={largura} height={altura} aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--of-verde)', stopOpacity: 0.24 }} />
              <stop offset="1" style={{ stopColor: 'var(--of-verde)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>

          <g className="of-grafico-regua">
            {regua.marcas.map((marca) => (
              <g key={marca}>
                <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(marca)} y2={y(marca)} />
                <text x={MARGEM.esquerda - 12} y={y(marca)} dy="0.32em" textAnchor="end">
                  {valorCurto(marca)}
                </text>
              </g>
            ))}
          </g>

          <g className="of-grafico-eixo">
            {indicesDoEixo(serie.length, util.largura).map((indice) => (
              <text key={indice} x={x(indice)} y={altura - 8} textAnchor={indice === 0 ? 'start' : indice === serie.length - 1 ? 'end' : 'middle'}>
                {rotuloCurto(serie[indice].data)}
              </text>
            ))}
          </g>

          {/* A key refaz o traço (e a animação de desenho) a cada faixa nova. */}
          <g key={`${serie[0].data}-${serie.length}`}>
            <path className="of-grafico-area" d={area} fill={`url(#${id}-area)`} />
            <path className="of-grafico-linha" d={linha} pathLength="1" />
          </g>

          {ponto && (
            <g className="of-grafico-cursor">
              <line x1={ponto.x} x2={ponto.x} y1={MARGEM.cima} y2={base} />
              <circle cx={ponto.x} cy={ponto.y} r="5.5" />
            </g>
          )}
        </svg>
      )}

      {pronto && ponto && (
        <div
          className={`of-grafico-balao${ponto.x > largura - 150 ? ' a-esquerda' : ''}`}
          style={{ left: `${ponto.x}px`, top: `${ponto.y}px` }}
          aria-hidden="true"
        >
          <b>{formatarBRL(dado.saldo)}</b>
          {cursor === null && leitura ? (
            <span className={`of-tendencia ${leitura}`}>{textoDaVariacao(variacao)}</span>
          ) : (
            <small>{rotuloLongo(dado.data)}</small>
          )}
        </div>
      )}

      <p className="apenas-leitor" aria-live="polite">
        {cursor !== null && dado ? `${rotuloLongo(dado.data)}: ${formatarBRL(dado.saldo)}` : ''}
      </p>
    </div>
  );
}
