import { useMemo, useState, type CSSProperties } from 'react';
import { caminhoDoGalho, desenharArvore, montarGalhos, RAIZ, recorteDaMiniatura } from '../regras/arvore';
import { frutosQueCaem, quedaDoFruto } from '../regras/crescimento';
import { useProgressoAnimado } from '../useProgressoAnimado';

// Folha de comprimento 1, apontando para a direita; a escala dá o tamanho.
const FOLHA = 'M0 0C.3-.36.74-.32 1 0 .74.32.3.36 0 0Z';
const TONS = ['var(--of-verde)', 'var(--of-verde-vivo)', 'var(--of-lima)', 'var(--of-folha-funda)'];
// Gota de uns 7 de largura, com a ponta para cima e o centro na origem.
const GOTA = 'M0-4.5c0 0 3.5 4.6 3.5 7.2a3.5 3.5 0 0 1-7 0c0-2.6 3.5-7.2 3.5-7.2Z';
// Onde fica o bico do regador inclinado (no desenho de 320 × 300): as gotas
// saem daqui. É a ponta do bico (3, 18) do regador em translate(200 38),
// girada −26° em volta do ponto de apoio, perto da alça (movimento em CSS,
// .of-arvore-regador).
const BICO = { x: 199.5, y: 78.5 };
// Cada gota: atraso (ms), para o lado (px, negativo = para a árvore) e a
// altura da queda. Leque estreito no começo, abrindo como água de regador.
const GOTAS = [
  { atraso: 0, dx: -10, dy: 62 },
  { atraso: 70, dx: -18, dy: 70 },
  { atraso: 130, dx: -6, dy: 58 },
  { atraso: 190, dx: -24, dy: 76 },
  { atraso: 250, dx: -14, dy: 66 },
  { atraso: 320, dx: -28, dy: 72 },
  { atraso: 380, dx: -9, dy: 60 },
  { atraso: 450, dx: -20, dy: 68 },
];

type ComVariaveis = CSSProperties & Record<`--${string}`, string>;

// Maçã de uns 13 de largura, centrada no ponto do fruto: corpo em dois lobos,
// cabinho, folha e um brilho. É o fruto da árvore completa e a colheita.
function Maca({ style }: { style?: ComVariaveis }) {
  return (
    <g className="of-arvore-maca" style={style}>
      <path
        className="of-arvore-maca-corpo"
        d="M0-3.6C-1.4-5.2-6.2-5-6.2.2c0 4.4 3.2 6.8 4.6 6.8.8 0 1-.5 1.6-.5s.8.5 1.6.5c1.4 0 4.6-2.4 4.6-6.8 0-5.2-4.8-5.4-6.2-3.8Z"
      />
      <path className="of-arvore-maca-cabo" d="M0-3.6c0-1.4.4-2.6 1.2-3.4" />
      <path className="of-arvore-maca-folha" d="M.8-5.4c.8-2 2.8-2.4 4.2-1.6-.8 1.6-2.6 2.2-4.2 1.6Z" />
      <ellipse className="of-arvore-maca-brilho" cx="-2.6" cy="-1" rx="1.1" ry="1.8" />
    </g>
  );
}

// Conta as colheitas: a rega que leva a meta a 100% faz algumas maçãs caírem.
// Ajustado durante a renderização (e não num efeito), como o React indica
// para estado derivado de uma prop que mudou.
function useColheita(progresso: number, rega: number): number {
  const [visto, setVisto] = useState({ progresso, rega, colheita: 0 });
  if (visto.progresso !== progresso || visto.rega !== rega) {
    const completou = rega !== visto.rega && progresso >= 1 && visto.progresso < 1;
    setVisto({ progresso, rega, colheita: visto.colheita + (completou ? 1 : 0) });
  }
  return visto.colheita;
}

interface Props {
  semente: number;
  // Progresso de verdade (0 a 1): o alvo da animação e o que decide a colheita.
  progresso: number;
  // Progresso já animado por quem usa (a estufa anima a árvore e a barra
  // juntas). Sem ele, a árvore anima sozinha.
  mostrado?: number;
  // Muda a cada aporte: dispara o regador e as gotas.
  rega?: number;
  // Miniatura das listas: sem céu, sem água e sem animação.
  compacta?: boolean;
  rotulo: string;
}

// Árvore da meta, desenhada a partir do progresso (0 a 1).
//
// Sem rastro nem cópia: o desenho não sai da caixa do SVG (overflow escondido
// no CSS, e o Chrome não deixa sobra de quadro antigo fora dela), e a maçã da
// colheita é o próprio fruto que desce do galho, não uma segunda maçã por
// cima dele. As que não caem ficam na copa.
export default function Arvore({ semente, progresso, mostrado, rega = 0, compacta = false, rotulo }: Props) {
  const galhos = useMemo(() => montarGalhos(semente), [semente]);
  const animado = useProgressoAnimado(progresso, { rega, animar: mostrado === undefined && !compacta });
  const p = mostrado ?? animado;
  const colheita = useColheita(progresso, rega);
  const quadro = useMemo(() => desenharArvore(galhos, p), [galhos, p]);
  // A colheita começa quando a árvore termina de crescer até 100%.
  const caindo = !compacta && colheita > 0 && p >= 0.999 ? frutosQueCaem(quadro.frutos) : new Set();
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
          {quadro.frutos.map((fruto, indice) => {
            const cai = caindo.has(fruto.id);
            const { queda, desvio } = quedaDoFruto(fruto, indice, RAIZ.y + 4);
            return (
              // O translate fica no <g> de fora: o transform do CSS (animação)
              // substituiria o atributo transform do SVG. A queda anima o <g>
              // do meio, e a maçã de dentro continua com a animação de nascer.
              <g key={cai ? `${fruto.id}-${colheita}` : fruto.id} transform={`translate(${fruto.x.toFixed(1)} ${fruto.y.toFixed(1)})`}>
                <g
                  className={cai ? 'of-arvore-queda' : undefined}
                  style={
                    cai
                      ? ({ '--atraso': `${700 + indice * 90}ms`, '--queda': `${queda.toFixed(1)}px`, '--desvio': `${desvio}px` } as ComVariaveis)
                      : undefined
                  }
                >
                  <Maca style={{ '--atraso': `${indice * 70}ms` } as ComVariaveis} />
                </g>
              </g>
            );
          })}
        </g>
      )}

      {!compacta && rega > 0 && (
        // A key reinicia as animações de CSS a cada rega.
        <g className="of-arvore-rega" key={rega} aria-hidden="true">
          {/* O regador olha para a árvore: bico à esquerda, alça atrás. */}
          <g transform="translate(200 38)">
            <g className="of-arvore-regador">
              <path d="M20 24h30l-3 21H23Z" />
              <path d="M27 24c0-7 4.5-11 10-11s10 4 10 11" fill="none" />
              <path d="M50 28c6 0 9 3 9 8s-3 8-9 8" fill="none" />
              <path d="M21 30L4 18" />
              <path d="M1 15.5l5.5 5" />
            </g>
          </g>
          {/* Gotas em parábola: o <g> de fora anda para o lado em ritmo
              constante e a gota de dentro cai acelerando. */}
          {GOTAS.map((gota, indice) => (
            <g key={indice} transform={`translate(${BICO.x} ${BICO.y})`}>
              <g className="of-arvore-gota-lado" style={{ '--atraso': `${gota.atraso}ms`, '--dx': `${gota.dx}px` } as ComVariaveis}>
                <path className="of-arvore-gota" d={GOTA} style={{ '--atraso': `${gota.atraso}ms`, '--dy': `${gota.dy}px` } as ComVariaveis} />
              </g>
            </g>
          ))}
          {/* Respingos onde a água chega na copa. */}
          {GOTAS.filter((_, indice) => indice % 3 === 1).map((gota, indice) => (
            <circle
              key={`respingo-${indice}`}
              className="of-arvore-respingo"
              cx={BICO.x + gota.dx}
              cy={BICO.y + gota.dy}
              r="5"
              style={{ '--atraso': `${gota.atraso + 640}ms` } as ComVariaveis}
            />
          ))}
        </g>
      )}
    </svg>
  );
}
