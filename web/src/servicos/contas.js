// Operações de conta do cliente final no Firebase: cadastro, login, sessão
// e leitura dos dados pessoais. As páginas só chamam estas funções.
import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

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

  // O Firebase já deixa a conta nova logada. Encerra a sessão para o fluxo
  // do enunciado seguir pela página de login.
  await signOut(auth);
}

export function entrar(email, senha) {
  return signInWithEmailAndPassword(auth, email.trim(), senha);
}

export function sair() {
  return signOut(auth);
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
