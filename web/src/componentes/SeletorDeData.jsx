import { useId, useRef, useState } from 'react';
import Calendario from './Calendario';
import Icone from './Icone';
import { useCliqueFora, usePosicaoFlutuante } from './flutuante';
import { lerDataDigitada, mascararData } from '../regras/calendario';
import { dataExiste, formatarData } from '../regras/datas';

// Texto do campo para um valor vindo de fora: ISO vira "dd/mm/aaaa"; o texto
// incompleto que o próprio campo mandou volta igual.
const textoDoValor = (valor) => (dataExiste(valor) ? formatarData(valor) : (valor ?? ''));

// Campo de data do projeto, no lugar do <input type="date">: a pessoa digita
// "dd/mm/aaaa" (as barras entram sozinhas) ou abre o calendário pelo botão ou
// com Alt+seta para baixo. value e onChange usam a data ISO, como o input
// nativo; enquanto a data está incompleta ou não existe, onChange recebe o
// texto digitado, e a validação do formulário acusa "Data inválida".
// visaoInicial="anos" abre o calendário na escolha do ano (data de nascimento).
export default function SeletorDeData({
  id,
  name,
  value,
  onChange,
  min,
  max,
  visaoInicial,
  disabled = false,
  idDoRotulo,
  placeholder = 'dd/mm/aaaa',
  ...propsDoCampo
}) {
  const idGerado = useId();
  const idBase = id ?? idGerado;
  const campo = useRef(null);
  const moldura = useRef(null);
  const painel = useRef(null);
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(() => textoDoValor(value));
  const [valorAnterior, setValorAnterior] = useState(value);

  // O formulário pode trocar o valor por fora (limpar, preencher hoje): o
  // texto acompanha, sem apagar o que a pessoa está digitando.
  if (value !== valorAnterior) {
    setValorAnterior(value);
    if (textoDoValor(value) !== texto && lerDataDigitada(texto) !== value) {
      setTexto(textoDoValor(value));
    }
  }

  const fechar = () => setAberto(false);
  const estilo = usePosicaoFlutuante(moldura, painel, aberto, { aoRolarFora: fechar });
  useCliqueFora([moldura, painel], fechar, aberto);

  function emitir(novoTexto) {
    onChange?.({ target: { name, value: lerDataDigitada(novoTexto) ?? novoTexto } });
  }

  function digitar(evento) {
    const novo = mascararData(evento.target.value);
    setTexto(novo);
    emitir(novo);
  }

  // Ao sair do campo, "5/9/2026" vira "05/09/2026".
  function sair() {
    const iso = lerDataDigitada(texto);
    if (iso) {
      setTexto(formatarData(iso));
    }
  }

  function escolher(iso) {
    setTexto(formatarData(iso));
    onChange?.({ target: { name, value: iso } });
    fechar();
    campo.current?.focus();
  }

  function cancelar() {
    fechar();
    campo.current?.focus();
  }

  return (
    <div ref={moldura} className={`seletor-de-data${disabled ? ' desligado' : ''}`}>
      <input
        ref={campo}
        id={idBase}
        name={name}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        maxLength={10}
        placeholder={placeholder}
        value={texto}
        disabled={disabled}
        onChange={digitar}
        onBlur={sair}
        onKeyDown={(evento) => {
          if (evento.altKey && evento.key === 'ArrowDown') {
            evento.preventDefault();
            setAberto(true);
          }
        }}
        {...propsDoCampo}
      />
      <button
        type="button"
        className="botao-icone"
        aria-label={aberto ? 'Fechar o calendário' : 'Abrir o calendário'}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        disabled={disabled}
        onClick={() => setAberto((atual) => !atual)}
      >
        <Icone nome="calendario" tamanho={18} />
      </button>

      {aberto && (
        <div
          ref={painel}
          role="dialog"
          aria-label="Escolher a data"
          aria-describedby={idDoRotulo}
          className="painel-flutuante"
          style={estilo}
        >
          <Calendario valor={value} aoEscolher={escolher} aoCancelar={cancelar} min={min} max={max}
            visaoInicial={dataExiste(value) ? 'dias' : visaoInicial} />
        </div>
      )}
    </div>
  );
}
