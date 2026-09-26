// Esqueleto de carga: a forma da tela que vai chegar, com um brilho que passa
// devagar (parado para quem pede menos movimento). Nada de roda girando no
// meio da página: quem espera já vê onde cada coisa vai ficar.
//
// forma:
//   'pagina'  título, quatro números e dois painéis (Visão geral, Relatórios)
//   'lista'   linhas de extrato (Lançamentos, fatura do cartão)
//   'casca'   barra lateral e topo, enquanto a sessão é conferida
//   'landing' o campo esmeralda da página de apresentação
const LINHAS_DA_LISTA = 6;

function Bloco({ className = '' }) {
  return <span className={`esqueleto ${className}`.trim()} />;
}

function Lista({ linhas = LINHAS_DA_LISTA }) {
  return (
    <div className="esqueleto-lista">
      {Array.from({ length: linhas }, (_, indice) => (
        <div key={indice} className="esqueleto-linha" style={{ '--atraso': `${indice * 70}ms` }}>
          <Bloco className="circulo" />
          <span className="esqueleto-textos">
            <Bloco className="texto" />
            <Bloco className="texto curto" />
          </span>
          <Bloco className="valor" />
        </div>
      ))}
    </div>
  );
}

function Pagina() {
  return (
    <div className="esqueleto-pagina">
      <div className="esqueleto-cabecalho">
        <Bloco className="titulo" />
        <Bloco className="linha" />
      </div>
      <div className="esqueleto-numeros">
        {[0, 1, 2, 3].map((indice) => (
          <div key={indice} className="esqueleto-cartao" style={{ '--atraso': `${indice * 60}ms` }}>
            <Bloco className="texto curto" />
            <Bloco className="numero" />
          </div>
        ))}
      </div>
      <div className="esqueleto-paineis">
        <div className="esqueleto-cartao alto">
          <Bloco className="texto curto" />
          <Bloco className="grafico" />
        </div>
        <div className="esqueleto-cartao alto">
          <Bloco className="texto curto" />
          <Lista linhas={4} />
        </div>
      </div>
    </div>
  );
}

export default function Esqueleto({ forma = 'pagina', rotulo = 'Carregando seus dados' }) {
  return (
    <div className={`carregando carregando-${forma}`} role="status" aria-busy="true" aria-label={rotulo}>
      {forma === 'lista' && <Lista />}
      {forma === 'pagina' && <Pagina />}
      {forma === 'casca' && (
        <div className="esqueleto-casca">
          <div className="esqueleto-lateral">
            <Bloco className="texto" />
            {[0, 1, 2, 3, 4].map((indice) => (
              <Bloco key={indice} className="item" />
            ))}
          </div>
          <Pagina />
        </div>
      )}
      {forma === 'landing' && <div className="esqueleto-landing" />}
    </div>
  );
}
