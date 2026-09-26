import { useRef, useState } from 'react';
import { useTamanho } from './useTamanho';
import { formatarBRL, formatarComSinal } from '../regras/dinheiro';
import { nomeDoMes, reguaDasColunas, rotuloDoMes } from '../regras/relatorios';
import { valorCurto } from '../olifine/regras/curva';

const MARGEM = { cima: 14, direita: 10, baixo: 30, esquerda: 64 };
// Coluna fina (no máximo 24px, a sobra da faixa fica de respiro), 2px de
// superfície entre a receita e a despesa do mesmo mês e ponta arredondada
// de 4px só do lado do valor (a base fica reta, na linha do zero).
const COLUNA_MAXIMA = 24;
const FRESTA = 2;
const PONTA = 4;

// Coluna de x a x + largura, da linha do zero (base) até topo; com valor
// negativo, cresce para baixo e a ponta arredondada fica embaixo.
function coluna(x, largura, base, topo) {
  const altura = Math.abs(base - topo);
  if (altura < 0.5) {
    return '';
  }
  const raio = Math.min(PONTA, altura, largura / 2);
  if (topo <= base) {
    return `M${x} ${base}V${topo + raio}Q${x} ${topo} ${x + raio} ${topo}H${x + largura - raio}Q${x + largura} ${topo} ${x + largura} ${topo + raio}V${base}Z`;
  }
  return `M${x} ${base}V${topo - raio}Q${x} ${topo} ${x + raio} ${topo}H${x + largura - raio}Q${x + largura} ${topo} ${x + largura} ${topo - raio}V${base}Z`;
}

// Receitas e despesas de cada mês em colunas lado a lado, na mesma escala,
// e a sobra do mês como linha fina com pontos (mesma unidade, mesma régua).
// Passar o mouse (ou o dedo, ou as setas do teclado) numa faixa de mês abre
// o balão com os três valores; a tabela embaixo tem todos eles sem balão.
export default function GraficoMensal({ meses, descricao }) {
  const caixa = useRef(null);
  const { largura, altura } = useTamanho(caixa);
  const [cursor, setCursor] = useState(null);

  const regua = reguaDasColunas(meses.flatMap((mes) => [mes.receitas_centavos, mes.despesas_centavos, mes.sobra_centavos]));
  const util = {
    largura: Math.max(0, largura - MARGEM.esquerda - MARGEM.direita),
    altura: Math.max(0, altura - MARGEM.cima - MARGEM.baixo),
  };
  const faixa = meses.length > 0 ? util.largura / meses.length : 0;
  const larguraDaColuna = Math.max(4, Math.min(COLUNA_MAXIMA, (faixa - FRESTA) * 0.3));
  const centro = (indice) => MARGEM.esquerda + faixa * (indice + 0.5);
  const y = (valor) => MARGEM.cima + util.altura - ((valor - regua.minimo) / (regua.maximo - regua.minimo)) * util.altura;
  const zero = y(0);
  // Rótulo de mês em toda faixa larga; nas estreitas, um sim, um não.
  const pulo = faixa >= 40 ? 1 : 2;

  function aoMover(evento) {
    const retangulo = caixa.current.getBoundingClientRect();
    const indice = Math.floor((evento.clientX - retangulo.left - MARGEM.esquerda) / Math.max(1, faixa));
    setCursor(indice >= 0 && indice < meses.length ? indice : null);
  }

  function aoTeclar(evento) {
    const passos = { ArrowLeft: -1, ArrowRight: 1 };
    if (evento.key in passos) {
      evento.preventDefault();
      setCursor((anterior) => Math.min(meses.length - 1, Math.max(0, (anterior ?? meses.length) + passos[evento.key])));
    } else if (evento.key === 'Home' || evento.key === 'End') {
      evento.preventDefault();
      setCursor(evento.key === 'Home' ? 0 : meses.length - 1);
    } else if (evento.key === 'Escape') {
      setCursor(null);
    }
  }

  const pronto = largura > 0 && meses.length > 0;
  const lido = cursor !== null ? meses[cursor] : null;
  const pontosDaSobra = meses.map((mes, indice) => `${indice === 0 ? 'M' : 'L'}${centro(indice)} ${y(mes.sobra_centavos)}`).join('');

  return (
    <div
      className="rel-grafico"
      ref={caixa}
      tabIndex={0}
      role="group"
      aria-roledescription="gráfico"
      aria-label={`${descricao}. Use as setas para ler cada mês.`}
      onPointerMove={aoMover}
      onPointerLeave={() => setCursor(null)}
      onKeyDown={aoTeclar}
      onBlur={() => setCursor(null)}
    >
      {pronto && (
        <svg width={largura} height={altura} aria-hidden="true">
          <g className="rel-regua">
            {regua.marcas.map((marca) => (
              <g key={marca}>
                <line x1={MARGEM.esquerda} x2={largura - MARGEM.direita} y1={y(marca)} y2={y(marca)} className={marca === 0 ? 'zero' : undefined} />
                <text x={MARGEM.esquerda - 10} y={y(marca)} dy="0.32em" textAnchor="end">
                  {valorCurto(marca)}
                </text>
              </g>
            ))}
          </g>

          {cursor !== null && (
            <rect className="rel-faixa-lida" x={MARGEM.esquerda + faixa * cursor} y={MARGEM.cima} width={faixa} height={util.altura} rx="8" />
          )}

          <g className="rel-colunas">
            {meses.map((mes, indice) => {
              const x = centro(indice);
              const apagada = cursor !== null && cursor !== indice;
              return (
                <g key={mes.mes} className={apagada ? 'apagada' : undefined}>
                  <path className="receita" d={coluna(x - FRESTA / 2 - larguraDaColuna, larguraDaColuna, zero, y(mes.receitas_centavos))} />
                  <path className="despesa" d={coluna(x + FRESTA / 2, larguraDaColuna, zero, y(mes.despesas_centavos))} />
                </g>
              );
            })}
          </g>

          <g className="rel-sobra">
            <path d={pontosDaSobra} />
            {meses.map((mes, indice) => (
              <circle key={mes.mes} cx={centro(indice)} cy={y(mes.sobra_centavos)} r={cursor === indice ? 5 : 4} />
            ))}
          </g>

          <g className="rel-eixo">
            {meses.map((mes, indice) =>
              indice % pulo === 0 || indice === meses.length - 1 ? (
                <text key={mes.mes} x={centro(indice)} y={altura - 9} textAnchor="middle" className={cursor === indice ? 'lido' : undefined}>
                  {rotuloDoMes(mes.mes, { comAno: indice === 0 })}
                </text>
              ) : null,
            )}
          </g>
        </svg>
      )}

      {pronto && lido && (
        <div
          className={`rel-balao${centro(cursor) > largura - 170 ? ' a-esquerda' : ''}`}
          style={{ left: `${centro(cursor)}px`, top: `${MARGEM.cima}px` }}
          aria-hidden="true"
        >
          <small>{nomeDoMes(lido.mes)}</small>
          <p>
            <i className="chave receita" />
            <b>{formatarBRL(lido.receitas_centavos)}</b>
            <span>Receitas</span>
          </p>
          <p>
            <i className="chave despesa" />
            <b>{formatarBRL(lido.despesas_centavos)}</b>
            <span>Despesas</span>
          </p>
          <p>
            <i className="chave sobra" />
            <b>{formatarComSinal(lido.sobra_centavos)}</b>
            <span>Sobra</span>
          </p>
        </div>
      )}

      <p className="apenas-leitor" aria-live="polite">
        {lido
          ? `${nomeDoMes(lido.mes)}: receitas ${formatarBRL(lido.receitas_centavos)}, despesas ${formatarBRL(lido.despesas_centavos)}, sobra ${formatarComSinal(lido.sobra_centavos)}.`
          : ''}
      </p>
    </div>
  );
}
