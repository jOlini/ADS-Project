// Operações de conta do cliente final no Firebase: cadastro, login, sessão,
// confirmação do e-mail e leitura dos dados pessoais. As páginas só chamam
// estas funções.
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { limparDadosLocais } from './dadosLocais';

// Um documento por usuário, com o id igual ao uid do Authentication.
// As regras do Firestore usam essa igualdade para liberar só o dono.
const COLECAO = 'usuarios';

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
  // falhar, a tela de confirmação (depois do login) tem o "Reenviar".
  try {
    await sendEmailVerification(user);
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
  return sendEmailVerification(auth.currentUser);
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
