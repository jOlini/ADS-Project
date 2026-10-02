import { memo, useState } from 'react';
import { corDaCategoria } from '../../regras/cores';
import { formatarBRL } from '../../regras/dinheiro';

const RAIO = 70;
const ESPESSURA = 20;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
// Bordas internas e externas do anel, um pouco além do traço: a divisa
// atravessa a fatia inteira.
const DENTRO = RAIO - ESPESSURA / 2 - 1;
const FORA = RAIO + ESPESSURA / 2 + 1;

// A divisa entre duas fatias: uma linha do miolo até a borda, no ângulo em
// que a fatia começa (0 = topo, pelo giro de −90° do grupo).
function divisa(inicio) {
  const angulo = (inicio / CIRCUNFERENCIA) * 2 * Math.PI;
  const ponto = (raio) => [90 + raio * Math.cos(angulo), 90 + raio * Math.sin(angulo)];
  const [x1, y1] = ponto(DENTRO);
  const [x2, y2] = ponto(FORA);
  return { x1, y1, x2, y2 };
}

// Despesas por categoria: rosca com o total no meio e a legenda ao lado,
// sempre com o nome da categoria (a cor é só apoio de leitura). Passar o
// mouse ou o foco numa linha da legenda destaca a fatia, e vice-versa.
//
// Cada fatia é separada da vizinha por uma divisa de 2 px na cor do fundo do
// card (e não por uma fresta que mostra o trilho), e o anel tem um contorno
// fino: com cores escolhidas pela pessoa parecidas entre si, ou parecidas
// com o fundo, as fatias continuam distintas nos dois temas.
function Rosca({ fatias, total, rotuloDoTotal }) {
  const [destaque, setDestaque] = useState(null);
  const soma = fatias.reduce((acumulado, fatia) => acumulado + fatia.valor, 0) || 1;

  const tamanhos = fatias.map((fatia) => (fatia.valor / soma) * CIRCUNFERENCIA);
  const arcos = fatias.map((fatia, indice) => ({
    ...fatia,
    inicio: tamanhos.slice(0, indice).reduce((total, tamanho) => total + tamanho, 0),
    tamanho: Math.max(0.5, tamanhos[indice]),
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
                style={{ stroke: corDaCategoria(arco.cor) }}
                strokeDasharray={`${arco.tamanho} ${CIRCUNFERENCIA}`}
                strokeDashoffset={-arco.inicio}
                onPointerEnter={() => setDestaque(arco.categoria)}
                onPointerLeave={() => setDestaque(null)}
              />
            ))}
            {arcos.length > 1 &&
              arcos.map((arco) => <line key={`divisa-${arco.categoria}`} className="of-rosca-divisa" {...divisa(arco.inicio)} />)}
          </g>
          <circle className="of-rosca-contorno" cx="90" cy="90" r={DENTRO + 1} />
          <circle className="of-rosca-contorno" cx="90" cy="90" r={FORA - 1} />
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
            <span className="of-rosca-ponto" style={{ background: corDaCategoria(fatia.cor) }} aria-hidden="true" />
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

// memo: a Visão geral redesenha (filtro, modal, recarga) sem que isto mude (fatias memorizadas por quem usa).
export default memo(Rosca);
