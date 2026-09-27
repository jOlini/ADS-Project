// Operações de conta do cliente final no Firebase: cadastro, login, sessão,
// confirmação do e-mail, senha nova e leitura dos dados pessoais. As páginas
// só chamam estas funções.
import {
  applyActionCode,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { PREFIXO_DO_APP } from '../regras/dadosLocais';
import { gravarJson, lerJson, limparDadosLocais } from './dadosLocais';
import { linkDeConfirmacaoPelaApi, linkDeNovaSenhaPelaApi } from './emailsDaConta';

// Um documento por usuário, com o id igual ao uid do Authentication.
// As regras do Firestore usam essa igualdade para liberar só o dono.
const COLECAO = 'usuarios';

// Instante do último link de confirmação mandado deste navegador para a conta
// (regras/confirmacao.js). O logout apaga junto com o resto do app.
const chaveDoEnvio = (uid) => `${PREFIXO_DO_APP}confirmacao:${uid}`;

// Com a API no ar e o provedor configurado, o e-mail sai da API, com a marca
// OliFine e o link para /auth/verificar-email. Sem isso (GitHub Pages, API
// desligada), sai do próprio Firebase, como antes.
async function enviarLink(usuario) {
  if (!(await linkDeConfirmacaoPelaApi(usuario))) {
    await sendEmailVerification(usuario);
  }
  gravarJson(chaveDoEnvio(usuario.uid), Date.now());
}

export function ultimoEnvioDoLink(uid) {
  return lerJson(chaveDoEnvio(uid));
}

export async function cadastrar({ email, senha, nome, sobrenome, dataNascimento }) {
  // 1. Cria a conta no Firebase Authentication (provedor e-mail/senha).
  const { user } = await createUserWithEmailAndPassword(auth, email.trim(), senha);

  // 2. Grava o restante dos dados no Firestore, com o uid devolvido pelo Auth.
  try {
    await setDoc(doc(db, COLECAO, user.uid), {
      uid: user.uid,
      nome: nome.trim(),
      sobrenome: sobrenome.trim(),
      dataNascimento,
      criadoEm: serverTimestamp(),
    });
  } catch (erro) {
    // Sem o documento, a conta ficaria "pela metade": login funciona, mas a
    // página principal não teria o que mostrar. Desfaz a conta e repassa o erro
    // original, que é o que explica a falha para quem se cadastrou.
    try {
      await deleteUser(user);
    } catch {
      // Se nem desfazer der certo, o erro do Firestore continua sendo o relevante.
    }
    throw erro;
  }

  // 3. Manda o link de confirmação. A área logada só abre com o e-mail
  // confirmado: prova que quem se cadastrou é dono do endereço. Se o envio
  // falhar, nada fica registrado e a tela de confirmação (depois do login)
  // manda o link sozinha.
  try {
    await enviarLink(user);
  } catch {
    // Segue: o cadastro já está completo.
  }

  // O Firebase já deixa a conta nova logada. Encerra a sessão para o fluxo
  // do enunciado seguir pela página de login.
  await signOut(auth);
}

export function entrar(email, senha) {
  return signInWithEmailAndPassword(auth, email.trim(), senha);
}

// Sai da conta e apaga do navegador o que o app guardou dela (metas,
// tentativas de login, sessão da aba), mesmo se o signOut falhar sem rede.
export async function sair() {
  try {
    await signOut(auth);
  } finally {
    limparDadosLocais();
  }
}

// Novo link de confirmação para a conta logada (ainda sem confirmar).
export function reenviarConfirmacao() {
  return enviarLink(auth.currentUser);
}

// Depois do clique no link (em outra aba ou no celular), a sessão aberta aqui
// ainda diz "não confirmado": reload() busca o estado novo no Firebase, e o
// getIdToken(true) troca o token por um com email_verified, que a API exige.
export async function conferirConfirmacao() {
  const usuario = auth.currentUser;
  if (!usuario) {
    return false;
  }
  await usuario.reload();
  if (!usuario.emailVerified) {
    return false;
  }
  await usuario.getIdToken(true);
  return true;
}

// Link de confirmação aberto (página /auth/verificar-email): o código vale
// uma vez só. A sessão aberta nesta aba, se houver, é atualizada pela página
// (conferirConfirmacao, pelo Layout), para a área logada saber na hora.
export function aplicarConfirmacao(codigo) {
  return applyActionCode(auth, codigo);
}

// "Esqueci minha senha". Nenhum dos dois caminhos diz se o e-mail tem conta:
// a API responde igual, e o Firebase, com a proteção contra enumeração
// ligada, também. O auth/user-not-found de um projeto sem essa proteção é
// engolido pelo mesmo motivo.
export async function pedirNovaSenha(email) {
  const endereco = email.trim();
  if (await linkDeNovaSenhaPelaApi(endereco)) {
    return;
  }
  try {
    await sendPasswordResetEmail(auth, endereco);
  } catch (erro) {
    if (erro.code !== 'auth/user-not-found') {
      throw erro;
    }
  }
}

// Link de senha nova aberto: confere o código e devolve o e-mail da conta.
export function emailDoCodigoDeSenha(codigo) {
  return verifyPasswordResetCode(auth, codigo);
}

export function salvarSenhaNova(codigo, senha) {
  return confirmPasswordReset(auth, codigo, senha);
}

// Devolve { uid, nome, sobrenome, dataNascimento, criadoEm } ou null.
export async function buscarDadosPessoais(uid) {
  const documento = await getDoc(doc(db, COLECAO, uid));
  return documento.exists() ? documento.data() : null;
}

// Avisa quando a sessão muda (login, logout, recarga da página).
// Devolve a função que cancela o aviso.
export function observarSessao(aoMudar) {
  return onAuthStateChanged(auth, aoMudar);
}
