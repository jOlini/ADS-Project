import { useEffect, useId, useRef, useState } from 'react';
import Icone from './Icone';
import { useCliqueFora, usePosicaoFlutuante } from './flutuante';
import { opcaoPorDigitacao, primeiraHabilitada, proximaHabilitada, ultimaHabilitada } from '../regras/seletor';

// Menu de ações de uma linha (padrão "menu button" do WAI-ARIA). Cada item
// tem título e, se precisar, uma frase dizendo o que acontece: é ali que
// "Estornar" e "Excluir" se diferenciam antes do clique.
//
// itens: [{ id, rotulo, descricao?, icone?, perigo?, desabilitado?, aoEscolher }].
// rotulo é o nome do botão para leitores de tela (o botão mostra só o ícone).
export default function Menu({ rotulo, itens }) {
  const idBase = useId();
  const botao = useRef(null);
  const menu = useRef(null);
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(-1);

  const opcoes = itens.map((item) => ({ rotulo: item.rotulo, desabilitada: item.desabilitado }));
  const fechar = () => setAberto(false);
  const estilo = usePosicaoFlutuante(botao, menu, aberto, { alinhar: 'fim', aoRolarFora: fechar });
  useCliqueFora([botao, menu], fechar, aberto);

  // O foco segue o item ativo (no menu, o foco anda de verdade entre os itens).
  useEffect(() => {
    if (aberto && ativo >= 0) {
      menu.current?.querySelectorAll('[role="menuitem"]')[ativo]?.focus({ preventScroll: true });
    }
  }, [aberto, ativo]);

  function abrir(indice) {
    setAtivo(indice);
    setAberto(true);
  }

  function voltarAoBotao() {
    fechar();
    botao.current?.focus();
  }

  function escolher(item) {
    // O foco volta ao botão antes da ação: se ela abrir um diálogo, é para
    // cá que o foco retorna quando ele fechar.
    voltarAoBotao();
    item.aoEscolher();
  }

  function teclarNoBotao(evento) {
    if (['ArrowDown', 'Enter', ' '].includes(evento.key)) {
      evento.preventDefault();
      abrir(primeiraHabilitada(opcoes));
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      abrir(ultimaHabilitada(opcoes));
    }
  }

  function teclarNoMenu(evento) {
    const destino = {
      ArrowDown: () => (ativo === ultimaHabilitada(opcoes) ? primeiraHabilitada(opcoes) : proximaHabilitada(opcoes, ativo, 1)),
      ArrowUp: () => (ativo === primeiraHabilitada(opcoes) ? ultimaHabilitada(opcoes) : proximaHabilitada(opcoes, ativo, -1)),
      Home: () => primeiraHabilitada(opcoes),
      End: () => ultimaHabilitada(opcoes),
    }[evento.key];
    if (destino) {
      evento.preventDefault();
      setAtivo(destino());
    } else if (evento.key === 'Escape') {
      evento.preventDefault();
      evento.stopPropagation();
      voltarAoBotao();
    } else if (evento.key === 'Tab') {
      fechar();
    } else if (evento.key.length === 1 && evento.key !== ' ') {
      const indice = opcaoPorDigitacao(opcoes, evento.key, ativo);
      if (indice >= 0) {
        setAtivo(indice);
      }
    }
  }

  return (
    <div className="menu-de-acoes">
      <button
        ref={botao}
        type="button"
        id={`${idBase}-botao`}
        className="botao-icone"
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? `${idBase}-menu` : undefined}
        onClick={() => (aberto ? fechar() : abrir(primeiraHabilitada(opcoes)))}
        onKeyDown={teclarNoBotao}
      >
        <Icone nome="maisOpcoes" tamanho={18} />
      </button>

      {aberto && (
        <div ref={menu} id={`${idBase}-menu`} role="menu" aria-labelledby={`${idBase}-botao`} className="lista-flutuante menu-flutuante"
          style={estilo} onKeyDown={teclarNoMenu}>
          {itens.map((item, indice) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={indice === ativo ? 0 : -1}
              className={`item-do-menu${item.perigo ? ' perigo' : ''}`}
              disabled={item.desabilitado}
              onPointerMove={() => indice !== ativo && !item.desabilitado && setAtivo(indice)}
              onClick={() => escolher(item)}
            >
              {item.icone && <Icone nome={item.icone} tamanho={18} />}
              <span className="rotulo-da-opcao">
                {item.rotulo}
                {item.descricao && <small>{item.descricao}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
