import { useState } from 'react';
import { formatarBRL } from '../../regras/dinheiro';

const RAIO = 70;
const ESPESSURA = 20;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
// Fresta entre as fatias, em unidades do traço.
const FRESTA = 3;

const corDa = (cor) => `var(--cat-${cor ?? 'neutro'})`;

// Despesas por categoria: rosca com o total no meio e a legenda ao lado,
// sempre com o nome da categoria (a cor é só apoio de leitura). Passar o
// mouse ou o foco numa linha da legenda destaca a fatia, e vice-versa.
export default function Rosca({ fatias, total, rotuloDoTotal }) {
  const [destaque, setDestaque] = useState(null);
  const soma = fatias.reduce((acumulado, fatia) => acumulado + fatia.valor, 0) || 1;

  const tamanhos = fatias.map((fatia) => (fatia.valor / soma) * CIRCUNFERENCIA);
  const arcos = fatias.map((fatia, indice) => ({
    ...fatia,
    inicio: tamanhos.slice(0, indice).reduce((total, tamanho) => total + tamanho, 0),
    tamanho: Math.max(0.5, tamanhos[indice] - (fatias.length > 1 ? FRESTA : 0)),
  }));
  const emFoco = destaque === null ? null : fatias.find((fatia) => fatia.categoria === destaque);

  return (
    <div className="of-rosca">
      <div className="of-rosca-desenho">
        <svg viewBox="0 0 180 180" aria-hidden="true">
          <circle className="of-rosca-trilho" cx="90" cy="90" r={RAIO} strokeWidth={ESPESSURA} />
          <g transform="rotate(-90 90 90)">
            {arcos.map((arco) => (
              <circle
                key={arco.categoria}
                className={`of-rosca-fatia${destaque && destaque !== arco.categoria ? ' apagada' : ''}`}
                cx="90"
                cy="90"
                r={RAIO}
                strokeWidth={ESPESSURA}
                style={{ stroke: corDa(arco.cor) }}
                strokeDasharray={`${arco.tamanho} ${CIRCUNFERENCIA}`}
                strokeDashoffset={-arco.inicio}
                onPointerEnter={() => setDestaque(arco.categoria)}
                onPointerLeave={() => setDestaque(null)}
              />
            ))}
          </g>
        </svg>
        <p className="of-rosca-miolo">
          <b>{formatarBRL(emFoco ? emFoco.valor : total)}</b>
          <small>{emFoco ? `${emFoco.categoria} · ${emFoco.fatia}%` : rotuloDoTotal}</small>
        </p>
      </div>

      <ul className="of-rosca-legenda">
        {fatias.map((fatia) => (
          <li
            key={fatia.categoria}
            tabIndex={0}
            className={destaque === fatia.categoria ? 'ativa' : ''}
            onPointerEnter={() => setDestaque(fatia.categoria)}
            onPointerLeave={() => setDestaque(null)}
            onFocus={() => setDestaque(fatia.categoria)}
            onBlur={() => setDestaque(null)}
          >
            <span className="of-rosca-ponto" style={{ background: corDa(fatia.cor) }} aria-hidden="true" />
            <span className="of-rosca-nome">
              {fatia.categoria}
              {fatia.agrupa ? <small> ({fatia.agrupa} categorias)</small> : null}
            </span>
            <span className="of-rosca-fatia-texto">{fatia.fatia}%</span>
            <span className="of-rosca-valor">{formatarBRL(fatia.valor)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
