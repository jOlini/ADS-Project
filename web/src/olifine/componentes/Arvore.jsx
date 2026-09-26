import { useEffect, useMemo, useRef, useState } from 'react';
import { caminhoDoGalho, desenharArvore, montarGalhos, RAIZ, recorteDaMiniatura } from '../regras/arvore';

// Folha de comprimento 1, apontando para a direita; a escala dá o tamanho.
const FOLHA = 'M0 0C.3-.36.74-.32 1 0 .74.32.3.36 0 0Z';
const TONS = ['var(--of-verde)', 'var(--of-verde-vivo)', 'var(--of-lima)', 'var(--of-folha-funda)'];
const DURACAO_DO_CRESCIMENTO = 1400;
const ESPERA_DA_AGUA = 520;

function preferePoucoMovimento() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

// Progresso mostrado na tela, que anda até o valor novo depois da rega (a
// água cai primeiro, a árvore cresce em seguida). Sem animação quando o
// sistema pede menos movimento.
function useProgressoAnimado(progresso, rega) {
  const [mostrado, setMostrado] = useState(progresso);
  const atual = useRef(progresso);
  const ultimaRega = useRef(rega);

  useEffect(() => {
    const regou = rega !== ultimaRega.current;
    ultimaRega.current = rega;
    const de = atual.current;
    if (de === progresso || preferePoucoMovimento()) {
      atual.current = progresso;
      setMostrado(progresso);
      return undefined;
    }
    let quadro = 0;
    let inicio = 0;
    const passo = (agora) => {
      inicio ||= agora;
      const t = Math.min(1, (agora - inicio) / DURACAO_DO_CRESCIMENTO);
      const valor = de + (progresso - de) * (1 - (1 - t) ** 3);
      atual.current = valor;
      setMostrado(valor);
      if (t < 1) {
        quadro = requestAnimationFrame(passo);
      }
    };
    const espera = setTimeout(() => {
      quadro = requestAnimationFrame(passo);
    }, regou ? ESPERA_DA_AGUA : 0);
    return () => {
      clearTimeout(espera);
      cancelAnimationFrame(quadro);
    };
  }, [progresso, rega]);

  return mostrado;
}

// Árvore da meta, desenhada a partir do progresso (0 a 1). `rega` muda a
// cada aporte e dispara o regador e as gotas; `compacta` é a miniatura das
// listas (sem céu, sem animação de água).
export default function Arvore({ semente, progresso, rega = 0, compacta = false, rotulo }) {
  const galhos = useMemo(() => montarGalhos(semente), [semente]);
  const mostrado = useProgressoAnimado(progresso, rega);
  const quadro = useMemo(() => desenharArvore(galhos, mostrado), [galhos, mostrado]);
  const recorte = compacta ? recorteDaMiniatura(quadro) : null;
  // Na miniatura, folhas maiores: a copa precisa ler como viva em 52px.
  const escalaDaFolha = compacta ? 1.45 : 1;

  return (
    <svg
      className={`of-arvore${compacta ? ' compacta' : ''}`}
      viewBox={recorte ? `${recorte.x.toFixed(1)} ${recorte.y.toFixed(1)} ${recorte.lado.toFixed(1)} ${recorte.lado.toFixed(1)}` : '0 0 320 300'}
      role="img"
      aria-label={rotulo}
    >
      {!compacta && (
        <>
          <circle className="of-arvore-ceu" cx="160" cy="150" r="128" />
          <circle className="of-arvore-ceu-miolo" cx="160" cy="165" r="92" />
        </>
      )}

      <ellipse className="of-arvore-chao" cx={RAIZ.x} cy={RAIZ.y + 8} rx={compacta ? 70 : 104} ry={compacta ? 9 : 13} />
      {!compacta && (
        <path
          className="of-arvore-grama"
          d="M86 268l-3-9M92 268l2-10M98 268l-1-7M222 268l-2-9M228 268l3-10M234 268l0-7M130 272l-2-6M196 272l2-6"
        />
      )}

      {quadro.semente && (
        <g className="of-arvore-semente">
          <ellipse cx={RAIZ.x} cy={RAIZ.y - 3} rx="9" ry="6.5" />
          <path d={`M${RAIZ.x - 3} ${RAIZ.y - 7}q3 3 0 7`} />
        </g>
      )}

      {quadro.copas.length > 0 && (
        <g className="of-arvore-copa">
          {quadro.copas.map((copa) => (
            <circle key={copa.id} cx={copa.x.toFixed(1)} cy={copa.y.toFixed(1)} r={copa.raio.toFixed(1)} />
          ))}
        </g>
      )}

      <g className="of-arvore-galhos">
        {quadro.segmentos.map((segmento) => (
          <path key={segmento.id} d={caminhoDoGalho(segmento)} strokeWidth={segmento.espessura.toFixed(2)} />
        ))}
      </g>

      {quadro.broto && (
        <g className="of-arvore-broto" transform={`translate(${quadro.broto.x.toFixed(1)} ${quadro.broto.y.toFixed(1)})`}>
          <path d={FOLHA} transform={`rotate(-150) scale(${quadro.broto.tamanho.toFixed(2)})`} />
          <path d={FOLHA} transform={`rotate(-30) scale(${quadro.broto.tamanho.toFixed(2)})`} />
        </g>
      )}

      <g className="of-arvore-folhas">
        {quadro.folhas.map((folha) => (
          <path
            key={folha.id}
            d={FOLHA}
            style={{ fill: TONS[folha.tom] }}
            transform={`translate(${folha.x.toFixed(1)} ${folha.y.toFixed(1)}) rotate(${folha.angulo.toFixed(0)}) scale(${(folha.tamanho * escalaDaFolha).toFixed(2)})`}
          />
        ))}
      </g>

      {quadro.frutos.length > 0 && (
        <g className="of-arvore-frutos">
          {quadro.frutos.map((fruto, indice) => (
            // O translate fica no <g> de fora: o transform do CSS (animação)
            // substituiria o atributo transform do SVG.
            <g key={fruto.id} transform={`translate(${fruto.x.toFixed(1)} ${fruto.y.toFixed(1)})`}>
              <g className="of-arvore-moeda" style={{ '--atraso': `${indice * 70}ms` }}>
                <circle r="6.2" />
                <circle r="3.6" className="of-arvore-moeda-miolo" />
              </g>
            </g>
          ))}
        </g>
      )}

      {!compacta && rega > 0 && (
        // A key reinicia as animações de CSS a cada rega.
        <g className="of-arvore-rega" key={rega} aria-hidden="true">
          <g transform="translate(206 44)">
            <g className="of-arvore-regador">
              <path d="M8 22h30l-3 22H11Z" />
              <path d="M38 27l18-12" />
              <path d="M14 22c0-8 5-12 11-12s11 4 11 12" fill="none" />
            </g>
          </g>
          {[0, 1, 2, 3, 4, 5, 6].map((gota) => (
            <path
              key={gota}
              className="of-arvore-gota"
              style={{ '--atraso': `${gota * 60}ms`, '--desvio': `${(gota % 3) * 7 - 7}px` }}
              d={`M${258 - gota * 9} ${70 + (gota % 2) * 6}c0 0 4 5 4 8a4 4 0 0 1-8 0c0-3 4-8 4-8Z`}
            />
          ))}
        </g>
      )}
    </svg>
  );
}
