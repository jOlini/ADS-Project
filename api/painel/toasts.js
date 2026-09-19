// Toasts do painel, em JavaScript puro. Mesma aparência e comportamento dos
// toasts da área do cliente (web/src/componentes/toast):
//
//   toast.sucesso('Usuário criado.');
//   toast.erro('Sem resposta da API.', { titulo: 'API fora do ar', duracao: 0 });
//   toast.mostrar({ tipo: 'aviso', titulo, mensagem, duracao, acao: { rotulo, aoClicar } });
//   configurarToasts({ posicao: 'base-direita', maximo: 3, duracao: 6000 });
//
// duracao em milissegundos; 0 deixa o toast na tela até a pessoa fechar.
// Todo texto entra por textContent: mensagem vinda da API não vira HTML.

const TIPOS = ['sucesso', 'erro', 'aviso', 'info'];
const POSICOES = ['topo-direita', 'topo-centro', 'base-direita', 'base-centro'];

const TITULO_DO_TIPO = {
  sucesso: 'Tudo certo',
  erro: 'Algo deu errado',
  aviso: 'Atenção',
  info: 'Aviso',
};

const TRACO_DO_ICONE = {
  sucesso: 'M5 12.5l4.5 4.5L19 7.5',
  erro: 'M7 7l10 10M17 7L7 17',
  aviso: 'M12 6.5v7M12 17.5v.5',
  info: 'M12 11v6.5M12 6.5v.5',
};

const configuracao = { posicao: 'topo-direita', maximo: 4, duracao: 4500 };
let regiao = null;

export function configurarToasts(opcoes = {}) {
  if (POSICOES.includes(opcoes.posicao)) {
    configuracao.posicao = opcoes.posicao;
  }
  if (Number.isInteger(opcoes.maximo) && opcoes.maximo > 0) {
    configuracao.maximo = opcoes.maximo;
  }
  if (Number.isFinite(opcoes.duracao) && opcoes.duracao >= 0) {
    configuracao.duracao = opcoes.duracao;
  }
  if (regiao) {
    regiao.className = `toasts toasts-${configuracao.posicao}`;
  }
}

// A região é criada no primeiro toast e fica no fim do <body>.
function obterRegiao() {
  if (!regiao) {
    regiao = document.createElement('section');
    regiao.className = `toasts toasts-${configuracao.posicao}`;
    regiao.setAttribute('aria-label', 'Notificações');
    regiao.setAttribute('aria-live', 'polite');
    document.body.append(regiao);
  }
  return regiao;
}

function criarIcone(tipo, tamanho) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', tamanho);
  svg.setAttribute('height', tamanho);
  svg.setAttribute('aria-hidden', 'true');
  const traco = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  traco.setAttribute('d', TRACO_DO_ICONE[tipo]);
  svg.append(traco);
  return svg;
}

// Mostra um toast e devolve a função que o fecha.
export function mostrarToast(opcoes = {}) {
  const tipo = TIPOS.includes(opcoes.tipo) ? opcoes.tipo : 'info';
  const duracao =
    Number.isFinite(opcoes.duracao) && opcoes.duracao >= 0 ? opcoes.duracao : configuracao.duracao;

  const elemento = document.createElement('div');
  elemento.className = `toast toast-${tipo}`;
  // Erro interrompe o leitor de tela na hora; os demais esperam a vez.
  elemento.setAttribute('role', tipo === 'erro' ? 'alert' : 'status');
  elemento.style.setProperty('--duracao', `${duracao}ms`);

  const icone = document.createElement('span');
  icone.className = 'toast-icone';
  icone.append(criarIcone(tipo, 18));

  const texto = document.createElement('div');
  texto.className = 'toast-texto';
  const titulo = document.createElement('strong');
  titulo.textContent = opcoes.titulo || TITULO_DO_TIPO[tipo];
  texto.append(titulo);
  if (opcoes.mensagem) {
    const mensagem = document.createElement('p');
    mensagem.textContent = opcoes.mensagem;
    texto.append(mensagem);
  }

  let fechado = false;
  function fechar() {
    if (fechado) {
      return;
    }
    fechado = true;
    elemento.classList.add('saindo');
    elemento.addEventListener('animationend', (evento) => {
      if (evento.animationName === 'toast-sair') {
        elemento.remove();
      }
    });
    // Garantia: sem animação (ou com ela desligada), remove mesmo assim.
    setTimeout(() => elemento.remove(), 600);
  }

  if (opcoes.acao?.rotulo && typeof opcoes.acao.aoClicar === 'function') {
    const acao = document.createElement('button');
    acao.type = 'button';
    acao.className = 'toast-acao';
    acao.textContent = opcoes.acao.rotulo;
    acao.addEventListener('click', () => {
      opcoes.acao.aoClicar();
      fechar();
    });
    texto.append(acao);
  }

  const botaoFechar = document.createElement('button');
  botaoFechar.type = 'button';
  botaoFechar.className = 'toast-fechar';
  botaoFechar.setAttribute('aria-label', 'Fechar notificação');
  botaoFechar.append(criarIcone('erro', 14));
  botaoFechar.addEventListener('click', fechar);

  elemento.append(icone, texto, botaoFechar);

  // Barra de tempo: animação CSS com a duração do toast. Quando termina, o
  // toast fecha; passar o mouse pausa a animação (e o fechamento).
  if (duracao > 0) {
    const progresso = document.createElement('span');
    progresso.className = 'toast-progresso';
    progresso.setAttribute('aria-hidden', 'true');
    progresso.addEventListener('animationend', fechar);
    elemento.append(progresso);
  }

  const pilha = obterRegiao();
  pilha.prepend(elemento);
  // Passando do máximo, o mais antigo sai para a tela não encher.
  while (pilha.children.length > configuracao.maximo) {
    pilha.lastElementChild.remove();
  }
  return fechar;
}

export const toast = {
  mostrar: mostrarToast,
  sucesso: (mensagem, opcoes) => mostrarToast({ ...opcoes, tipo: 'sucesso', mensagem }),
  erro: (mensagem, opcoes) => mostrarToast({ ...opcoes, tipo: 'erro', mensagem }),
  aviso: (mensagem, opcoes) => mostrarToast({ ...opcoes, tipo: 'aviso', mensagem }),
  info: (mensagem, opcoes) => mostrarToast({ ...opcoes, tipo: 'info', mensagem }),
};
