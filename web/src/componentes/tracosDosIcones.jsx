// Desenhos dos ícones da OliFine (usados por Icone.jsx). Separados do
// componente para o teste conferir que todo nome usado nas telas existe.

const n = (valor) => Math.round(valor * 100) / 100;

// Retângulo com cantos em folha: canto superior esquerdo e inferior direito
// largos (R), os outros justos (r).
function folha(x, y, largura, altura, R = 5, r = 1.8) {
  return (
    `M${n(x + R)} ${y}H${n(x + largura - r)}a${r} ${r} 0 0 1 ${r} ${r}V${n(y + altura - R)}` +
    `a${R} ${R} 0 0 1 -${R} ${R}H${n(x + r)}a${r} ${r} 0 0 1 -${r} -${r}V${n(y + R)}a${R} ${R} 0 0 1 ${R} -${R}Z`
  );
}

export const TRACOS = {
  // ------------------------------------------------------------ Navegação
  // Visão geral: o painel com a linha do saldo subindo.
  resumo: (
    <>
      <path className="seiva" d="M7 16l3.3-3.4 2.6 2.1L17 10v7H7Z" />
      <path d={folha(3.5, 3.5, 17, 17, 5.5, 2)} />
      <path d="M7 16l3.3-3.4 2.6 2.1L17 10" />
    </>
  ),
  // Lançamentos: a página do livro-caixa, com a moeda na linha do meio.
  lancamentos: (
    <>
      <path d={folha(4.5, 3.5, 15, 17, 5, 1.8)} />
      <path d="M8 8.5h8M8 12h4.8M8 15.5h7" />
      <circle className="seiva" cx="15.6" cy="12" r="2" />
      <circle cx="15.6" cy="12" r="2" />
    </>
  ),
  // Contas: a carteira, com a aba e o fecho.
  contas: (
    <>
      <path d={folha(3, 7, 18, 13, 5, 1.8)} />
      <path d="M5.8 7l9.3-3a1.3 1.3 0 0 1 1.7 1.2V7" />
      <path className="seiva" d="M15.5 11.5H21v5h-5.5a2.5 2.5 0 0 1 0-5Z" />
      <path d="M15.5 11.5H21v5h-5.5a2.5 2.5 0 0 1 0-5Z" />
    </>
  ),
  // Categorias: formas diferentes guardadas lado a lado.
  categorias: (
    <>
      <path d={folha(3.5, 3.5, 7.5, 7.5, 3.5, 1.2)} />
      <path d={folha(13, 3.5, 7.5, 7.5, 3.5, 1.2)} />
      <path d={folha(3.5, 13, 7.5, 7.5, 3.5, 1.2)} />
      <circle className="seiva" cx="16.75" cy="16.75" r="3.75" />
      <circle cx="16.75" cy="16.75" r="3.75" />
    </>
  ),
  // Relatórios: colunas com um broto na mais alta.
  relatorios: (
    <>
      <path className="seiva" d="M5.5 20.5v-6h3.4v6ZM10.3 20.5V11h3.4v9.5ZM15.1 20.5v-4h3.4v4Z" />
      <path d="M3.5 20.5h17M7.2 20.5v-6M12 20.5V11M16.8 20.5v-4" />
      <path d="M12 8.6c.1-2.5 1.6-4.1 4.2-4.3-.1 2.5-1.7 4.1-4.2 4.3Z" />
    </>
  ),
  // Metas: o broto (dois cotilédones sobre o caule).
  broto: (
    <>
      <path d="M12 21v-8.5" />
      <path className="seiva" d="M12 13c0-4.2-2.6-6.6-7-6.8.1 4.3 2.7 6.8 7 6.8Z" />
      <path d="M12 13c0-4.2-2.6-6.6-7-6.8.1 4.3 2.7 6.8 7 6.8Z" />
      <path d="M12 11.5c.2-3.6 2.4-5.8 6.8-6 0 3.9-2.4 6-6.8 6Z" />
    </>
  ),
  sair: (
    <>
      <path d="M13 4.5h-2.5A4.5 4.5 0 0 0 6 9v8.7a1.8 1.8 0 0 0 1.8 1.8H13" />
      <path d="M10.5 12h10" />
      <path d="M17.3 8.4c1.2 1.4 2.3 2.5 3.2 3.6-.9 1.1-2 2.2-3.2 3.6" />
    </>
  ),
  menuLinhas: <path d="M4 7h16M4 12h16M4 17h9.5" />,
  usuario: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20.2c1.2-3.6 4-5.4 7.5-5.4s6.3 1.8 7.5 5.4" />
    </>
  ),
  pessoas: (
    <>
      <circle cx="9" cy="8.2" r="3.3" />
      <circle cx="16.8" cy="9.6" r="2.6" />
      <path d="M3.3 19.6c.8-3.5 3-5.4 5.7-5.4s4.9 1.9 5.7 5.4" />
      <path d="M15.4 14.4c2.8-.4 4.8 1.2 5.4 4.5" />
    </>
  ),
  sino: (
    <>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 4.5 1.6 6.2 2.4 7H3.6c.8-.8 2.4-2.5 2.4-7Z" />
      <path className="seiva" d="M10 19.5a2.2 2.2 0 0 0 4 0Z" />
      <path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),

  // --------------------------------------------------------------- Dinheiro
  // Entrada: a seta chega na moeda. Saída: a seta sai dela. Sempre na
  // horizontal (uma seta em diagonal presa ao círculo lembraria outro
  // símbolo).
  entrada: (
    <>
      <circle className="seiva" cx="16" cy="12" r="5.2" />
      <circle cx="16" cy="12" r="5.2" />
      <path d="M16 9.9v4.2" />
      <path d="M2.8 12h6.9" />
      <path d="M6.6 8.7c1.1 1.2 2.1 2.2 3.1 3.3-1 1.1-2 2.1-3.1 3.3" />
    </>
  ),
  saida: (
    <>
      <circle className="seiva" cx="8" cy="12" r="5.2" />
      <circle cx="8" cy="12" r="5.2" />
      <path d="M8 9.9v4.2" />
      <path d="M14.3 12h6.9" />
      <path d="M18.1 8.7c1.1 1.2 2.1 2.2 3.1 3.3-1 1.1-2 2.1-3.1 3.3" />
    </>
  ),
  // Transferência: duas moedas trocando de lugar.
  transferencia: (
    <>
      <circle className="seiva" cx="6.5" cy="7" r="3" />
      <circle cx="6.5" cy="7" r="3" />
      <circle cx="17.5" cy="17" r="3" />
      <path d="M11 5.5c3.8-.3 6.5 1.4 6.5 5.3" />
      <path d="M15.4 9c.8.8 1.4 1.4 2.1 2.2.7-.8 1.3-1.4 2.1-2.2" />
      <path d="M13 18.5c-3.8.3-6.5-1.4-6.5-5.3" />
      <path d="M8.6 15c-.8-.8-1.4-1.4-2.1-2.2-.7.8-1.3 1.4-2.1 2.2" />
    </>
  ),
  cartao: (
    <>
      <path d={folha(2.8, 5.5, 18.4, 13, 4.5, 1.8)} />
      <path className="seiva" d="M2.8 9.2h18.4v2.6H2.8Z" />
      <path d="M2.8 9.2h18.4M2.8 11.8h18.4" />
      <path d="M6.5 15.2h3.5" />
    </>
  ),
  // Estornar: a volta em torno da moeda.
  estornar: (
    <>
      <path d="M5.2 9.6A7.4 7.4 0 1 1 5.6 16" />
      <path d="M4.6 5.3c0 1.5 0 2.9.1 4.4 1.5.1 2.9.1 4.4.1" />
      <circle className="seiva" cx="12.2" cy="12.5" r="2.4" />
    </>
  ),
  crescimento: (
    <>
      <path d="M3.5 17.5 8.6 12.4l3.6 3.4 6-6.3" />
      <path className="seiva" d="M18.2 9.5c-.1-2.6 1.4-4.3 3.5-4.5.1 2.5-1.3 4.3-3.5 4.5Z" />
      <path d="M18.2 9.5c-.1-2.6 1.4-4.3 3.5-4.5.1 2.5-1.3 4.3-3.5 4.5Z" />
    </>
  ),
  rosca: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12Z" />
      <path className="seiva" d="M15 3.8a8.5 8.5 0 0 1 5.2 5.2H15Z" />
      <path d="M15 3.8a8.5 8.5 0 0 1 5.2 5.2H15Z" />
    </>
  ),
  alvo: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle className="seiva" cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle className="ponto" cx="12" cy="12" r="1.1" />
    </>
  ),
  gota: (
    <>
      <path className="seiva" d="M12 3.2s6.2 6.6 6.2 11a6.2 6.2 0 0 1-12.4 0c0-4.4 6.2-11 6.2-11Z" />
      <path d="M12 3.2s6.2 6.6 6.2 11a6.2 6.2 0 0 1-12.4 0c0-4.4 6.2-11 6.2-11Z" />
      <path d="M9.2 14.6a2.9 2.9 0 0 0 2.2 2.6" />
    </>
  ),

  // ----------------------------------------------------------------- Ações
  mais: <path d="M12 5.5v13M5.5 12h13" />,
  fechar: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  certo: <path d="M5 12.8c1.6 1.3 3 2.7 4.3 4.2C12 13 15 9.8 19 7.2" />,
  editar: (
    <>
      <path d="M15.2 4.8a2.2 2.2 0 0 1 3.1 3.1L8.4 17.8l-4 1.8 1.8-4Z" />
      <path className="seiva" d="M6.2 15.6l-1.8 4 4-1.8Z" />
      <path d="M13.4 6.6l3.1 3.1" />
    </>
  ),
  excluir: (
    <>
      <path d="M4 6.8h16" />
      <path d="M9.5 6.8V5a1.4 1.4 0 0 1 1.4-1.4h2.2A1.4 1.4 0 0 1 14.5 5v1.8" />
      <path d="M6.2 6.8l.9 11.6a2.2 2.2 0 0 0 2.2 2h5.4a2.2 2.2 0 0 0 2.2-2l.9-11.6" />
      <path d="M10.2 10.8v5.4M13.8 10.8v5.4" />
    </>
  ),
  busca: (
    <>
      <circle cx="10.5" cy="10.5" r="6.3" />
      <path d="M8 8.3a3.3 3.3 0 0 1 2.4-1.1" />
      <path d="M15.2 15.2 20 20" />
    </>
  ),
  importar: (
    <>
      <path d={folha(4.5, 8, 15, 12.5, 4, 1.6)} />
      <path d="M12 3v8.5" />
      <path d="M9.2 8.9c1 .9 1.9 1.8 2.8 2.8.9-1 1.8-1.9 2.8-2.8" />
      <path d="M8 15.5h8" />
    </>
  ),
  colunas: (
    <>
      <path d={folha(3.5, 4, 17, 16, 5, 1.8)} />
      <path className="seiva" d="M9.3 4h5.4v16H9.3Z" />
      <path d="M9.3 4v16M14.7 4v16" />
    </>
  ),
  maisOpcoes: (
    <>
      <circle className="ponto" cx="5.5" cy="12" r="1.5" />
      <circle className="ponto" cx="12" cy="12" r="1.5" />
      <circle className="ponto" cx="18.5" cy="12" r="1.5" />
    </>
  ),

  // ----------------------------------------------------- Setas e aberturas
  seta: <path d="M7 9.6c1.9 1.7 3.5 3.4 5 5.2 1.5-1.8 3.1-3.5 5-5.2" />,
  anterior: <path d="M14.6 6.8c-1.8 1.8-3.5 3.4-5.2 5.2 1.7 1.8 3.4 3.4 5.2 5.2" />,
  proximo: <path d="M9.4 6.8c1.8 1.8 3.5 3.4 5.2 5.2-1.7 1.8-3.4 3.4-5.2 5.2" />,
  setaDireita: (
    <>
      <path d="M4.5 12H19" />
      <path d="M14.2 6.8c1.6 2 3.3 3.6 4.8 5.2-1.5 1.6-3.2 3.2-4.8 5.2" />
    </>
  ),
  olho: (
    <>
      <path d="M2.8 12C5.5 7.3 8.6 5.6 12 5.6s6.5 1.7 9.2 6.4c-2.7 4.7-5.8 6.4-9.2 6.4S5.5 16.7 2.8 12Z" />
      <circle className="seiva" cx="12" cy="12" r="2.8" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  // Olho fechado: a pálpebra de baixo com os cílios (sem o risco cortando).
  olhoFechado: <path d="M3 10.2c2.6 3.7 5.6 5.5 9 5.5s6.4-1.8 9-5.5M6.1 14.2l-1.5 2.1M12 15.8v2.6M17.9 14.2l1.5 2.1" />,

  // ------------------------------------------------------------ Avisos
  alerta: (
    <>
      <path d="M10.3 4.7a2 2 0 0 1 3.4 0l7.2 12.4a2 2 0 0 1-1.7 3H4.8a2 2 0 0 1-1.7-3Z" />
      <path d="M12 9.6v4.2" />
      <circle className="ponto" cx="12" cy="16.9" r="1" />
    </>
  ),
  escudo: (
    <>
      <path d="M12 3 4.5 6v5.4c0 4.7 3.2 8.2 7.5 9.6 4.3-1.4 7.5-4.9 7.5-9.6V6Z" />
      <path className="seiva" d="M9 15.2c.2-3.3 2.2-5.3 5.8-5.5 0 3.3-2 5.3-5.8 5.5Z" />
      <path d="M9 15.2c.2-3.3 2.2-5.3 5.8-5.5 0 3.3-2 5.3-5.8 5.5Z" />
    </>
  ),
  cadeado: (
    <>
      <path d={folha(4.5, 10.5, 15, 10, 4, 1.6)} />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
      <circle className="seiva" cx="12" cy="15.3" r="1.9" />
      <path d="M12 15.3v1.8" />
    </>
  ),
  documento: (
    <>
      <path d="M13.8 3H8.6A3.6 3.6 0 0 0 5 6.6v12.6A1.8 1.8 0 0 0 6.8 21h10.4a1.8 1.8 0 0 0 1.8-1.8V8.2Z" />
      <path className="seiva" d="M13.8 3v5.2H19Z" />
      <path d="M13.8 3v5.2H19M8.8 13h6.4M8.8 16.5h4.2" />
    </>
  ),
  calendario: (
    <>
      <path d={folha(3.5, 5, 17, 15.5, 5, 1.8)} />
      <path d="M8.5 3v4M15.5 3v4M3.5 10.2h17" />
      <circle className="seiva" cx="15.3" cy="15.3" r="2.2" />
      <circle className="ponto" cx="15.3" cy="15.3" r="1" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),

  // --------------------------------------------- Grupos de categoria (cor)
  casa: (
    <>
      <path d="M3.8 11 12 4.2l8.2 6.8" />
      <path d="M6 9.6V19a1.5 1.5 0 0 0 1.5 1.5h9A1.5 1.5 0 0 0 18 19V9.6" />
      <path className="seiva" d="M10 20.5v-4.3a2 2 0 0 1 4 0v4.3Z" />
      <path d="M10 20.5v-4.3a2 2 0 0 1 4 0v4.3" />
    </>
  ),
  carrinho: (
    <>
      <path d="M2.8 3.8h2.6l2.3 11.1h10.5l2-7.7H6.4" />
      <path className="seiva" d="M6.4 7.2h14l-2 7.7H7.7Z" />
      <circle cx="9.5" cy="19.2" r="1.4" />
      <circle cx="17" cy="19.2" r="1.4" />
    </>
  ),
  carro: (
    <>
      <path d="M4 16.5V12l2-5.2A1.8 1.8 0 0 1 7.7 5.6h8.6a1.8 1.8 0 0 1 1.7 1.2L20 12v4.5" />
      <path className="seiva" d="M3 12h18v4.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M3 12h18v4.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M6.5 17.5V19M17.5 17.5V19M7 14.5h1.5M15.5 14.5H17" />
    </>
  ),
  raio: (
    <>
      <path className="seiva" d="M13 2.8 5 13.2h6.2L10.5 21l8.5-10.6h-6.3Z" />
      <path d="M13 2.8 5 13.2h6.2L10.5 21l8.5-10.6h-6.3Z" />
    </>
  ),
  coracao: (
    <>
      <path className="seiva" d="M12 20s-7.8-4.6-7.8-10.2A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 7.8 2.8C19.8 15.4 12 20 12 20Z" />
      <path d="M12 20s-7.8-4.6-7.8-10.2A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 7.8 2.8C19.8 15.4 12 20 12 20Z" />
    </>
  ),
  estrela: (
    <>
      <path className="seiva" d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z" />
      <path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z" />
    </>
  ),
};
