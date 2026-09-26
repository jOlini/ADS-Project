import { useEffect, useId, useRef, useState } from 'react';
import Icone from './Icone';
import { mostrarNoPainel, useCliqueFora, usePosicaoFlutuante, usePresenca } from './flutuante';
import { opcaoPorDigitacao, primeiraHabilitada, proximaHabilitada, ultimaHabilitada } from '../regras/seletor';

// Tempo para juntar as letras digitadas numa busca só ("mer" acha Mercado).
const PAUSA_DA_DIGITACAO = 600;
const PAGINA = 10;

// Seletor do projeto no lugar do <select> do navegador, que cada sistema
// desenha de um jeito e não segue o tema. Segue o padrão "combobox só de
// escolha" do WAI-ARIA: o botão fica com o foco e aponta a opção ativa com
// aria-activedescendant. Setas, Home, End, Page Up/Down e letras (começo do
// rótulo) andam pela lista; Enter ou espaço escolhem; Esc fecha sem mudar.
//
// opcoes: [{ valor, rotulo, descricao?, cor? (nome --cat-*), desabilitada? }].
// onChange recebe { target: { name, value } }, como o de um <select>: dá para
// trocar um pelo outro sem mexer no formulário. O botão leva o name, então
// form.elements[name].focus() continua funcionando na validação.
export default function Seletor({
  id,
  name,
  value,
  onChange,
  opcoes,
  placeholder = 'Escolha uma opção',
  disabled = false,
  idDoRotulo,
  className = '',
  ...propsDoBotao
}) {
  const idGerado = useId();
  const idBase = id ?? idGerado;
  const idDaLista = `${idBase}-lista`;
  const botao = useRef(null);
  const lista = useRef(null);
  const digitado = useRef({ texto: '', ate: 0 });
  const [aberto, setAberto] = useState(false);
  const [ativa, setAtiva] = useState(-1);

  const indiceEscolhido = opcoes.findIndex((opcao) => opcao.valor === value);
  const escolhida = opcoes[indiceEscolhido];
  const fechar = () => setAberto(false);
  const estilo = usePosicaoFlutuante(botao, lista, aberto, { larguraDaAncora: true, aoRolarFora: fechar });
  // Continua na tela durante a animação de saída.
  const presente = usePresenca(aberto);
  useCliqueFora([botao, lista], fechar, aberto);

  // A opção ativa fica sempre visível na lista, mesmo andando pelo teclado.
  useEffect(() => {
    if (aberto && ativa >= 0) {
      mostrarNoPainel(lista.current, document.getElementById(`${idBase}-opcao-${ativa}`));
    }
  }, [aberto, ativa, idBase]);

  function abrir(indice) {
    setAtiva(indice ?? (indiceEscolhido >= 0 ? indiceEscolhido : primeiraHabilitada(opcoes)));
    setAberto(true);
  }

  function escolher(indice) {
    const opcao = opcoes[indice];
    if (!opcao || opcao.desabilitada) {
      return;
    }
    fechar();
    if (opcao.valor !== value) {
      onChange?.({ target: { name, value: opcao.valor } });
    }
  }

  function procurar(letra) {
    const agora = Date.now();
    const anterior = digitado.current;
    const texto = agora < anterior.ate ? anterior.texto + letra : letra;
    digitado.current = { texto, ate: agora + PAUSA_DA_DIGITACAO };
    return opcaoPorDigitacao(opcoes, texto, aberto ? ativa : indiceEscolhido);
  }

  function teclar(evento) {
    const { key } = evento;
    const letra = key.length === 1 && key !== ' ' && !evento.ctrlKey && !evento.metaKey && !evento.altKey;

    if (!aberto) {
      const abrirEm = {
        ArrowDown: undefined,
        ArrowUp: undefined,
        Enter: undefined,
        ' ': undefined,
        Home: primeiraHabilitada(opcoes),
        End: ultimaHabilitada(opcoes),
      };
      if (key in abrirEm) {
        evento.preventDefault();
        abrir(abrirEm[key]);
      } else if (letra) {
        const indice = procurar(key);
        if (indice >= 0) {
          abrir(indice);
        }
      }
      return;
    }

    const destino = {
      ArrowDown: () => proximaHabilitada(opcoes, ativa, 1),
      ArrowUp: () => proximaHabilitada(opcoes, ativa, -1),
      PageDown: () => proximaHabilitada(opcoes, ativa, PAGINA),
      PageUp: () => proximaHabilitada(opcoes, ativa, -PAGINA),
      Home: () => primeiraHabilitada(opcoes),
      End: () => ultimaHabilitada(opcoes),
    }[key];

    if (key === 'ArrowUp' && evento.altKey) {
      evento.preventDefault();
      escolher(ativa);
    } else if (destino) {
      evento.preventDefault();
      setAtiva(destino());
    } else if (key === 'Enter' || key === ' ') {
      evento.preventDefault();
      escolher(ativa);
    } else if (key === 'Escape') {
      // Sem o preventDefault, o Esc também fecharia o modal em volta.
      evento.preventDefault();
      evento.stopPropagation();
      fechar();
    } else if (key === 'Tab') {
      fechar();
    } else if (letra) {
      const indice = procurar(key);
      if (indice >= 0) {
        setAtiva(indice);
      }
    }
  }

  return (
    <div className={`seletor ${className}`.trim()}>
      <button
        ref={botao}
        type="button"
        id={idBase}
        name={name}
        value={value ?? ''}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={idDaLista}
        aria-activedescendant={aberto && ativa >= 0 ? `${idBase}-opcao-${ativa}` : undefined}
        className="controle-do-seletor"
        disabled={disabled}
        onClick={() => (aberto ? fechar() : abrir())}
        onKeyDown={teclar}
        {...propsDoBotao}
      >
        {escolhida?.cor && <span className="ponto-de-cor" style={{ '--cor-do-ponto': `var(--cat-${escolhida.cor})` }} aria-hidden="true" />}
        <span className={`valor-do-seletor${escolhida ? '' : ' sem-valor'}`}>{escolhida?.rotulo ?? placeholder}</span>
        <Icone nome="seta" tamanho={16} />
      </button>

      {presente && (
        <ul ref={lista} id={idDaLista} role="listbox" aria-labelledby={idDoRotulo} className="lista-flutuante" style={estilo}>
          {opcoes.length === 0 && <li className="sem-opcoes">Nenhuma opção disponível.</li>}
          {opcoes.map((opcao, indice) => (
            <li
              key={String(opcao.valor)}
              id={`${idBase}-opcao-${indice}`}
              role="option"
              aria-selected={indice === indiceEscolhido}
              aria-disabled={opcao.desabilitada || undefined}
              className={indice === ativa ? 'ativa' : undefined}
              onPointerMove={() => indice !== ativa && !opcao.desabilitada && setAtiva(indice)}
              // O foco fica no botão: clicar na opção não pode tirá-lo de lá.
              onMouseDown={(evento) => evento.preventDefault()}
              onClick={() => escolher(indice)}
            >
              {opcao.cor && <span className="ponto-de-cor" style={{ '--cor-do-ponto': `var(--cat-${opcao.cor})` }} aria-hidden="true" />}
              <span className="rotulo-da-opcao">
                {opcao.rotulo}
                {opcao.descricao && <small>{opcao.descricao}</small>}
              </span>
              {indice === indiceEscolhido && <Icone nome="certo" tamanho={16} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
