import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import Icone from './Icone';
import { ehCorHex, hexParaHsv, hsvParaHex, mascararHex, normalizarHex, rgbParaHex, type Hsv } from '../regras/cores';

interface Sugestao {
  valor: string;
  rotulo: string;
}

interface Props {
  rotulo: string;
  name: string;
  // Nome de uma sugestão da paleta ou #rrggbb.
  valor: string;
  sugestoes: readonly Sugestao[];
  // O valor CSS de uma sugestão (corDaCategoria ou corDoPlastico).
  cssDaSugestao: (valor: string) => string;
  aoMudar: (valor: string) => void;
  erro?: string;
}

// API do conta-gotas do navegador (Chrome e Edge). Onde não existe, o botão
// não aparece: o código e a área de cor continuam.
interface ContaGotas {
  open: () => Promise<{ sRGBHex: string }>;
}
type JanelaComContaGotas = typeof globalThis & { EyeDropper?: new () => ContaGotas };

const PASSO = 0.01;
const PASSO_LARGO = 0.1;
const COR_INICIAL = '#2b7857';

// A cor de uma sugestão em hexadecimal, lida da variável do CSS no tema da
// tela (o ponto de partida da cor personalizada).
function hexDaSugestao(css: string): string {
  const variavel = /var\((--[\w-]+)\)/.exec(css)?.[1];
  if (!variavel || typeof document === 'undefined') {
    return COR_INICIAL;
  }
  return normalizarHex(getComputedStyle(document.documentElement).getPropertyValue(variavel)) ?? COR_INICIAL;
}

// "rgb(1, 2, 3)" (alguns navegadores) ou "#010203" -> "#010203".
function hexDoContaGotas(cor: string): string | null {
  const rgb = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(cor);
  if (rgb) {
    return rgbParaHex({ r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) });
  }
  return normalizarHex(cor);
}

const limitar = (numero: number) => Math.min(1, Math.max(0, numero));

// Seletor de cor do projeto: as sugestões da paleta (só o círculo da cor; o
// nome fica para o leitor de tela) e a cor personalizada, com a área de
// saturação e brilho, a faixa de matiz, o código hexadecimal (#rrggbb) e o
// conta-gotas para copiar uma cor da tela. As sugestões acompanham o tema
// claro e escuro; a personalizada é a mesma nos dois.
export default function SeletorDeCorHex({ rotulo, name, valor, sugestoes, cssDaSugestao, aoMudar, erro }: Props) {
  const id = useId();
  const area = useRef<HTMLDivElement>(null);
  const personalizada = ehCorHex(valor);
  const [aberta, setAberta] = useState(personalizada);
  // HSV próprio: com a saturação no zero, o hexadecimal perde a matiz, e a
  // faixa pularia para o vermelho.
  const [hsv, setHsv] = useState<Hsv>(() => hexParaHsv(personalizada ? valor : COR_INICIAL));
  const [texto, setTexto] = useState(personalizada ? valor : '#');
  const [valorAnterior, setValorAnterior] = useState(valor);
  const contaGotas = (globalThis as JanelaComContaGotas).EyeDropper;

  // Cor trocada por fora (o formulário reabriu com outra): os campos acompanham.
  if (valor !== valorAnterior) {
    setValorAnterior(valor);
    if (ehCorHex(valor) && valor !== hsvParaHex(hsv)) {
      setHsv(hexParaHsv(valor));
      setTexto(valor);
    }
  }

  const hexAtual = hsvParaHex(hsv);

  function escolherHsv(novo: Hsv) {
    setHsv(novo);
    const hex = hsvParaHex(novo);
    setTexto(hex);
    aoMudar(hex);
  }

  function abrirPersonalizada() {
    setAberta(true);
    if (!personalizada) {
      // Começa da sugestão escolhida: a pessoa ajusta a partir dela.
      const inicial = hexDaSugestao(cssDaSugestao(valor));
      setHsv(hexParaHsv(inicial));
      setTexto(inicial);
      aoMudar(inicial);
    }
  }

  function pelaPosicao(evento: PointerEvent<HTMLDivElement>) {
    const caixa = area.current?.getBoundingClientRect();
    if (!caixa || caixa.width === 0 || caixa.height === 0) {
      return;
    }
    escolherHsv({
      h: hsv.h,
      s: limitar((evento.clientX - caixa.left) / caixa.width),
      v: limitar(1 - (evento.clientY - caixa.top) / caixa.height),
    });
  }

  function pelaSeta(evento: KeyboardEvent<HTMLDivElement>) {
    const passo = evento.shiftKey ? PASSO_LARGO : PASSO;
    const mudancas: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: limitar(hsv.s - passo) },
      ArrowRight: { s: limitar(hsv.s + passo) },
      ArrowDown: { v: limitar(hsv.v - passo) },
      ArrowUp: { v: limitar(hsv.v + passo) },
    };
    const mudanca = mudancas[evento.key];
    if (mudanca) {
      evento.preventDefault();
      escolherHsv({ ...hsv, ...mudanca });
    }
  }

  function digitarCodigo(bruto: string) {
    const mascarado = mascararHex(bruto);
    setTexto(mascarado);
    const hex = normalizarHex(mascarado);
    if (hex && mascarado.length === 7) {
      setHsv(hexParaHsv(hex));
      aoMudar(hex);
    }
  }

  async function usarContaGotas() {
    if (!contaGotas) {
      return;
    }
    try {
      const { sRGBHex } = await new contaGotas().open();
      const hex = hexDoContaGotas(sRGBHex);
      if (hex) {
        setHsv(hexParaHsv(hex));
        setTexto(hex);
        aoMudar(hex);
      }
    } catch {
      // Esc no conta-gotas: a cor continua a de antes.
    }
  }

  return (
    <fieldset className="seletor-de-cor-hex" aria-describedby={erro ? `${id}-erro` : undefined}>
      <legend className="rotulo-do-campo">{rotulo}</legend>
      <div className="amostras-hex">
        {sugestoes.map((sugestao) => (
          <label key={sugestao.valor} className="amostra-hex" title={sugestao.rotulo}>
            <input
              type="radio"
              name={name}
              value={sugestao.valor}
              checked={valor === sugestao.valor}
              aria-label={sugestao.rotulo}
              onChange={() => {
                setAberta(false);
                aoMudar(sugestao.valor);
              }}
            />
            <span className="circulo-da-cor" style={{ background: cssDaSugestao(sugestao.valor) }} aria-hidden="true" />
          </label>
        ))}
        <label className="amostra-hex personalizada" title="Cor personalizada">
          <input
            type="radio"
            name={name}
            value="personalizada"
            checked={personalizada}
            aria-label="Cor personalizada"
            onChange={abrirPersonalizada}
          />
          <span
            className="circulo-da-cor"
            style={personalizada ? { background: valor } : undefined}
            aria-hidden="true"
          />
        </label>
      </div>

      {aberta && (
        <div className="painel-da-cor">
          <div
            ref={area}
            className="area-da-cor"
            role="slider"
            tabIndex={0}
            aria-label="Saturação (setas para os lados) e brilho (setas para cima e para baixo)"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hsv.s * 100)}
            aria-valuetext={`Saturação ${Math.round(hsv.s * 100)}%, brilho ${Math.round(hsv.v * 100)}%`}
            style={{ '--matiz-da-area': `hsl(${Math.round(hsv.h)} 100% 50%)` } as CSSProperties}
            onPointerDown={(evento) => {
              evento.currentTarget.setPointerCapture(evento.pointerId);
              pelaPosicao(evento);
            }}
            onPointerMove={(evento) => {
              if (evento.currentTarget.hasPointerCapture(evento.pointerId)) {
                pelaPosicao(evento);
              }
            }}
            onKeyDown={pelaSeta}
          >
            <span
              className="alvo-da-cor"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: hexAtual }}
              aria-hidden="true"
            />
          </div>
          <input
            type="range"
            className="faixa-de-matiz"
            min={0}
            max={359}
            step={1}
            value={Math.round(hsv.h)}
            aria-label="Matiz da cor"
            onChange={(evento) => escolherHsv({ ...hsv, h: Number(evento.target.value) })}
          />
          <div className="linha-do-codigo">
            <span className="previa-da-cor" style={{ background: hexAtual }} aria-hidden="true" />
            <label className="codigo-da-cor">
              <span className="apenas-leitor">Código hexadecimal da cor</span>
              <input
                name={`${name}-hex`}
                value={texto}
                maxLength={7}
                spellCheck={false}
                autoComplete="off"
                inputMode="text"
                aria-invalid={texto.length > 1 && texto.length < 7}
                onChange={(evento) => digitarCodigo(evento.target.value)}
                onBlur={() => setTexto(hexAtual)}
              />
            </label>
            {contaGotas && (
              <button type="button" className="secundario botao-conta-gotas" onClick={usarContaGotas}>
                <Icone nome="gota" tamanho={16} />
                Conta-gotas
              </button>
            )}
          </div>
        </div>
      )}
      <span id={`${id}-erro`} className="erro-do-campo">
        {erro && (
          <>
            <Icone nome="alerta" tamanho={14} />
            {erro}
          </>
        )}
      </span>
    </fieldset>
  );
}
