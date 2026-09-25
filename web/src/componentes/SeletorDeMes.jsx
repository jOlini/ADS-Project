import { useRef, useState } from 'react';
import Calendario from './Calendario';
import Icone from './Icone';
import { useCliqueFora, usePosicaoFlutuante } from './flutuante';
import { nomeDoMes } from '../regras/calendario';
import { mudarMes } from '../regras/livroCaixa';

// Navegação por mês do extrato: setas para o mês vizinho e, no meio, o nome
// do mês, que abre a grade dos 12 meses (e dos anos) para pular direto para
// qualquer um. valor e aoMudar usam { ano, mes }.
export default function SeletorDeMes({ valor, aoMudar, rotulo = 'Mês' }) {
  const botao = useRef(null);
  const painel = useRef(null);
  const [aberto, setAberto] = useState(false);

  const fechar = () => setAberto(false);
  const estilo = usePosicaoFlutuante(botao, painel, aberto, { aoRolarFora: fechar });
  useCliqueFora([botao, painel], fechar, aberto);

  function cancelar() {
    fechar();
    botao.current?.focus();
  }

  function escolher(novo) {
    aoMudar(novo);
    cancelar();
  }

  return (
    <div className="seletor-de-mes" role="group" aria-label={rotulo}>
      <button type="button" className="botao-icone" onClick={() => aoMudar(mudarMes(valor, -1))} aria-label="Mês anterior">
        <Icone nome="anterior" tamanho={16} />
      </button>
      <button
        ref={botao}
        type="button"
        className="mes"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        onClick={() => setAberto((atual) => !atual)}
      >
        <Icone nome="calendario" tamanho={16} />
        <span aria-live="polite">{nomeDoMes(valor)}</span>
        <Icone nome="seta" tamanho={14} />
      </button>
      <button type="button" className="botao-icone" onClick={() => aoMudar(mudarMes(valor, 1))} aria-label="Próximo mês">
        <Icone nome="proximo" tamanho={16} />
      </button>

      {aberto && (
        <div ref={painel} role="dialog" aria-label="Escolher o mês" className="painel-flutuante" style={estilo}>
          <Calendario modo="mes" valor={valor} aoEscolher={escolher} aoCancelar={cancelar} />
        </div>
      )}
    </div>
  );
}
