// Um toast na tela: ícone, título, mensagem, ação opcional, botão de fechar
// e a barra de tempo. A barra é uma animação CSS com a duração do toast:
// quando ela termina, o toast fecha. Passar o mouse ou focar pausa a barra
// (animation-play-state no CSS), então pausa também o fechamento.

const TRACO_DO_ICONE = {
  sucesso: 'M5 12.5l4.5 4.5L19 7.5',
  erro: 'M7 7l10 10M17 7L7 17',
  aviso: 'M12 6.5v7M12 17.5v.5',
  info: 'M12 11v6.5M12 6.5v.5',
};

export default function Toast({ toast, aoFechar, aoSair }) {
  const { id, tipo, titulo, mensagem, duracao, acao, saindo } = toast;

  // A animação de saída termina e só então o toast sai do estado.
  function terminouAnimacao(evento) {
    if (saindo && evento.animationName === 'toast-sair') {
      aoSair(id);
    }
  }

  function executarAcao() {
    acao.aoClicar();
    aoFechar(id);
  }

  return (
    <div
      className={`toast toast-${tipo}${saindo ? ' saindo' : ''}`}
      // Erro interrompe o leitor de tela na hora; os demais esperam a vez.
      role={tipo === 'erro' ? 'alert' : 'status'}
      style={{ '--duracao': `${duracao}ms` }}
      onAnimationEnd={terminouAnimacao}
    >
      <span className="toast-icone" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path d={TRACO_DO_ICONE[tipo]} />
        </svg>
      </span>

      <div className="toast-texto">
        <strong>{titulo}</strong>
        {mensagem && <p>{mensagem}</p>}
        {acao && (
          <button type="button" className="toast-acao" onClick={executarAcao}>
            {acao.rotulo}
          </button>
        )}
      </div>

      <button type="button" className="toast-fechar" aria-label="Fechar notificação" onClick={() => aoFechar(id)}>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path d={TRACO_DO_ICONE.erro} />
        </svg>
      </button>

      {duracao > 0 && !saindo && (
        <span className="toast-progresso" aria-hidden="true" onAnimationEnd={() => aoFechar(id)} />
      )}
    </div>
  );
}
