// Painel de demonstração da API (Sistemas Web Seguros), em JavaScript puro.
//
// É servido pela própria API em /painel/, então as chamadas vão para a mesma
// origem e não dependem de CORS. Todo dado vindo da API entra na página por
// textContent, nunca por innerHTML: um nome como "<img onerror=...>" aparece
// como texto e não executa (proteção contra XSS).

import { toast } from './toasts.js';

const CHAVE_DA_SESSAO = 'pessoal-finance.sessao-admin';
const MAXIMO_DE_RESPOSTAS = 15;
const PERFIS = ['ADMINISTRADOR', 'OPERADOR', 'CLIENTE'];

const TEXTO_DO_STATUS = {
  0: 'sem resposta',
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
};

// Toast que aparece quando uma chamada falha: [tipo, título].
const AVISO_DO_STATUS = {
  0: ['erro', 'API fora do ar'],
  400: ['aviso', 'Dados inválidos'],
  401: ['erro', 'Não autenticado'],
  403: ['aviso', 'Acesso negado pelo RBAC'],
  404: ['aviso', 'Não encontrado'],
  409: ['aviso', 'Conflito'],
};

const $ = (seletor) => document.querySelector(seletor);

let sessao = lerSessao();
let numeroDaResposta = 0;

// ---------------------------------------------------------------------------
// Sessão: token no sessionStorage, que some ao fechar a aba. Um token
// esquecido num computador compartilhado não sobrevive.

function lerSessao() {
  try {
    const salva = JSON.parse(sessionStorage.getItem(CHAVE_DA_SESSAO));
    // Token vencido é descartado aqui, antes de a API recusá-lo com 401.
    if (salva?.token && Date.parse(salva.expira_em) > Date.now()) {
      return salva;
    }
  } catch {
    // JSON corrompido: trata como sem sessão.
  }
  sessionStorage.removeItem(CHAVE_DA_SESSAO);
  return null;
}

function salvarSessao({ token, expira_em, usuario }) {
  sessao = { token, expira_em, usuario };
  sessionStorage.setItem(CHAVE_DA_SESSAO, JSON.stringify(sessao));
}

function encerrarSessao() {
  sessao = null;
  sessionStorage.removeItem(CHAVE_DA_SESSAO);
}

// ---------------------------------------------------------------------------
// Chamada à API. Toda resposta vai para o painel "Respostas da API"; as
// falhas também viram toast (menos no login, que mostra o erro no formulário).

async function chamarApi(metodo, caminho, corpo, { avisarFalha = true } = {}) {
  const cabecalhos = {};
  if (sessao) {
    cabecalhos.Authorization = `Bearer ${sessao.token}`;
  }
  if (corpo !== undefined) {
    cabecalhos['Content-Type'] = 'application/json';
  }

  let registro;
  try {
    const resposta = await fetch(caminho, {
      method: metodo,
      headers: cabecalhos,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const texto = await resposta.text();
    registro = { metodo, caminho, status: resposta.status, ok: resposta.ok, corpo: lerJson(texto) };
  } catch {
    registro = { metodo, caminho, status: 0, ok: false, corpo: { detail: 'Sem resposta da API.' } };
  }

  mostrarResposta(registro);

  if (!registro.ok && avisarFalha) {
    const [tipo, titulo] = AVISO_DO_STATUS[registro.status] ?? ['erro', 'Erro na API'];
    toast.mostrar({ tipo, titulo: `${registro.status || ''} ${titulo}`.trim(), mensagem: descreverErro(registro.corpo) });
  }

  // Token vencido ou usuário excluído: volta para o login.
  if (registro.status === 401 && sessao) {
    encerrarSessao();
    mostrarTela();
    escreverMensagem('#mensagem-login', 'Sessão encerrada pela API. Entre novamente.', 'erro');
  }
  return registro;
}

function lerJson(texto) {
  if (!texto) {
    return null;
  }
  try {
    return JSON.parse(texto);
  } catch {
    return texto;
  }
}

// O id vai codificado na URL: um valor como "../auth" não muda a rota chamada.
const rotaDoUsuario = (id) => `/usuarios/${encodeURIComponent(id)}`;

// Texto de erro da API: o "detail" e, se houver, o erro de cada campo.
function descreverErro(corpo) {
  if (!corpo || typeof corpo !== 'object') {
    return 'Erro inesperado.';
  }
  const campos = Object.entries(corpo.campos ?? {}).map(([campo, erro]) => `${campo}: ${erro}`);
  return [corpo.detail, ...campos].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Interface

function escreverMensagem(seletor, texto, tipo = '') {
  const elemento = $(seletor);
  elemento.textContent = texto;
  elemento.className = `mensagem ${tipo}`.trim();
}

function iniciais(nome) {
  const partes = nome.trim().split(/\s+/);
  return `${partes[0]?.[0] ?? ''}${partes.length > 1 ? partes.at(-1)[0] : ''}`.toUpperCase();
}

// Selo colorido do perfil. A classe só recebe valores conhecidos.
function criarSelo(perfil) {
  const selo = document.createElement('span');
  selo.className = PERFIS.includes(perfil) ? `selo selo-${perfil.toLowerCase()}` : 'selo';
  selo.textContent = perfil;
  return selo;
}

function mostrarTela() {
  const logado = Boolean(sessao);
  $('#tela-login').hidden = logado;
  $('#tela-usuarios').hidden = !logado;
  $('#sessao').hidden = !logado;

  if (logado) {
    const { nome, perfil } = sessao.usuario;
    const expira = new Date(sessao.expira_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    $('#sessao-avatar').textContent = iniciais(nome);
    $('#sessao-nome').textContent = nome;
    $('#sessao-validade').textContent = `token válido até ${expira}`;
    $('#sessao-perfil').replaceWith(Object.assign(criarSelo(perfil), { id: 'sessao-perfil' }));
    $('#payload-token').textContent = JSON.stringify(lerPayloadJwt(sessao.token), null, 2);
  }
}

function mostrarResposta(registro) {
  numeroDaResposta += 1;
  const item = document.createElement('li');
  item.className = `resposta ${classeDoStatus(registro.status)}`;

  const cabecalho = document.createElement('header');
  const rota = document.createElement('code');
  rota.textContent = `#${numeroDaResposta}  ${registro.metodo} ${registro.caminho}`;
  const status = document.createElement('span');
  status.className = 'status';
  status.textContent = `${registro.status || ''} ${TEXTO_DO_STATUS[registro.status] ?? ''}`.trim();
  cabecalho.append(rota, status);
  item.append(cabecalho);

  if (registro.corpo !== null) {
    const corpo = document.createElement('pre');
    corpo.textContent = JSON.stringify(registro.corpo, null, 2);
    item.append(corpo);
  }

  const lista = $('#lista-respostas');
  lista.prepend(item);
  while (lista.children.length > MAXIMO_DE_RESPOSTAS) {
    lista.lastElementChild.remove();
  }
  $('#sem-respostas').hidden = true;
}

function classeDoStatus(status) {
  if (status >= 200 && status < 300) {
    return 'sucesso';
  }
  return status >= 400 && status < 500 ? 'aviso' : 'erro';
}

function renderizarUsuarios(usuarios) {
  const tabela = $('#tabela-usuarios');
  tabela.replaceChildren();

  for (const usuario of usuarios) {
    const linha = document.createElement('tr');

    const nome = document.createElement('td');
    const avatar = document.createElement('span');
    avatar.className = 'avatar pequeno';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = iniciais(usuario.nome);
    const textoNome = document.createElement('span');
    textoNome.textContent = usuario.nome;
    nome.className = 'celula-nome';
    nome.append(avatar, textoNome);

    const email = document.createElement('td');
    email.textContent = usuario.email;
    const perfil = document.createElement('td');
    perfil.append(criarSelo(usuario.perfil));
    const id = document.createElement('td');
    id.className = 'celula-id';
    id.textContent = usuario.id;
    id.title = usuario.id;

    const acoes = document.createElement('td');
    acoes.className = 'acoes-da-linha';
    acoes.append(
      criarBotao('Editar', 'secundario', () => prepararEdicao(usuario)),
      criarBotao('Excluir', 'perigo', () => excluirUsuario(usuario)),
    );

    linha.append(nome, email, perfil, id, acoes);
    tabela.append(linha);
  }

  $('#tabela-vazia').hidden = usuarios.length > 0;
}

function criarBotao(texto, classe, aoClicar) {
  const botao = document.createElement('button');
  botao.type = 'button';
  botao.className = classe;
  botao.textContent = texto;
  botao.addEventListener('click', aoClicar);
  return botao;
}

// Caixa de confirmação (<dialog>). Devolve true se a pessoa confirmou.
function confirmar({ titulo, mensagem, rotulo }) {
  const dialogo = $('#dialogo-confirmacao');
  $('#dialogo-titulo').textContent = titulo;
  $('#dialogo-mensagem').textContent = mensagem;
  $('#dialogo-confirmar').textContent = rotulo;
  dialogo.returnValue = '';
  dialogo.showModal();
  return new Promise((resolver) => {
    dialogo.addEventListener('close', () => resolver(dialogo.returnValue === 'confirmar'), { once: true });
  });
}

// Lê o payload do JWT só para exibir. Não confere a assinatura e por isso
// não decide nada: quem valida o token e aplica o RBAC é a API.
function lerPayloadJwt(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), (caractere) => caractere.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    const data = (segundos) => new Date(segundos * 1000).toLocaleString('pt-BR');
    return { ...payload, 'iat (emitido em)': data(payload.iat), 'exp (expira em)': data(payload.exp) };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ações

async function entrar(evento) {
  evento.preventDefault();
  const formulario = evento.target;
  const botao = formulario.querySelector('button[type=submit]');
  botao.setAttribute('aria-busy', 'true');
  const dados = new FormData(formulario);
  const resposta = await chamarApi(
    'POST',
    '/auth/login',
    { email: dados.get('email'), senha: dados.get('senha') },
    { avisarFalha: false },
  );
  botao.removeAttribute('aria-busy');

  if (!resposta.ok) {
    escreverMensagem('#mensagem-login', descreverErro(resposta.corpo), 'erro');
    return;
  }
  formulario.reset();
  escreverMensagem('#mensagem-login', '');
  salvarSessao(resposta.corpo);
  mostrarTela();
  toast.sucesso(`Perfil ${sessao.usuario.perfil}. O token vale 30 minutos.`, {
    titulo: `Bem-vindo(a), ${sessao.usuario.nome}`,
  });
  carregarUsuarios();
}

function sair() {
  encerrarSessao();
  cancelarEdicao();
  renderizarUsuarios([]);
  mostrarTela();
  toast.info('O token foi descartado deste navegador.', { titulo: 'Sessão encerrada' });
}

// ADMINISTRADOR e OPERADOR veem a lista; CLIENTE, só o próprio cadastro.
function carregarUsuarios() {
  return sessao?.usuario.perfil === 'CLIENTE' ? meusDados() : listarTodos();
}

async function listarTodos() {
  const resposta = await chamarApi('GET', '/usuarios');
  if (resposta.ok) {
    renderizarUsuarios(resposta.corpo);
  }
}

async function meusDados() {
  const resposta = await chamarApi('GET', rotaDoUsuario(sessao.usuario.id));
  if (resposta.ok) {
    renderizarUsuarios([resposta.corpo]);
  }
}

async function consultarPorId(evento) {
  evento.preventDefault();
  const id = new FormData(evento.target).get('id').trim();
  if (!id) {
    toast.aviso('Informe o ID de um usuário.');
    return;
  }
  const resposta = await chamarApi('GET', rotaDoUsuario(id));
  if (resposta.ok) {
    renderizarUsuarios([resposta.corpo]);
  }
}

let idEmEdicao = null;

function prepararEdicao(usuario) {
  idEmEdicao = usuario.id;
  const formulario = $('#form-usuario');
  formulario.nome.value = usuario.nome;
  formulario.email.value = usuario.email;
  formulario.perfil.value = usuario.perfil;
  $('#campo-senha').hidden = true;
  $('#titulo-formulario').textContent = `Editar usuário: ${usuario.nome}`;
  $('#botao-salvar').textContent = 'Salvar alterações';
  $('#botao-cancelar').hidden = false;
  escreverMensagem('#mensagem-formulario', '');
  formulario.nome.focus();
}

function cancelarEdicao() {
  idEmEdicao = null;
  $('#form-usuario').reset();
  $('#campo-senha').hidden = false;
  $('#titulo-formulario').textContent = 'Cadastrar usuário';
  $('#botao-salvar').textContent = 'Cadastrar';
  $('#botao-cancelar').hidden = true;
}

async function salvarUsuario(evento) {
  evento.preventDefault();
  const formulario = evento.target;
  const dados = { nome: formulario.nome.value, email: formulario.email.value, perfil: formulario.perfil.value };

  const resposta = idEmEdicao
    ? await chamarApi('PUT', rotaDoUsuario(idEmEdicao), dados)
    : await chamarApi('POST', '/usuarios', { ...dados, senha: formulario.senha.value });

  if (!resposta.ok) {
    escreverMensagem('#mensagem-formulario', descreverErro(resposta.corpo), 'erro');
    return;
  }
  const acao = idEmEdicao ? 'atualizado' : 'cadastrado';
  cancelarEdicao();
  escreverMensagem('#mensagem-formulario', '');
  toast.sucesso(`${resposta.corpo.nome} (${resposta.corpo.perfil}).`, { titulo: `Usuário ${acao}` });
  carregarUsuarios();
}

async function excluirUsuario(usuario) {
  const confirmado = await confirmar({
    titulo: `Excluir ${usuario.nome}?`,
    mensagem: `${usuario.email} perde o acesso na hora, mesmo com um token ainda válido. Não dá para desfazer.`,
    rotulo: 'Excluir',
  });
  if (!confirmado) {
    return;
  }
  const resposta = await chamarApi('DELETE', rotaDoUsuario(usuario.id));
  if (resposta.ok) {
    toast.sucesso(`${usuario.nome} foi removido.`, { titulo: 'Usuário excluído' });
    carregarUsuarios();
  }
}

// ---------------------------------------------------------------------------

$('#form-login').addEventListener('submit', entrar);
$('#botao-sair').addEventListener('click', sair);
$('#botao-listar').addEventListener('click', listarTodos);
$('#botao-meus-dados').addEventListener('click', meusDados);
$('#form-consulta').addEventListener('submit', consultarPorId);
$('#form-usuario').addEventListener('submit', salvarUsuario);
$('#botao-cancelar').addEventListener('click', cancelarEdicao);

mostrarTela();
if (sessao) {
  carregarUsuarios();
}
