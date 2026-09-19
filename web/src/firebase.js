// Inicialização do Firebase (Authentication + Cloud Firestore).
//
// A configuração vem do web/.env (variáveis VITE_FIREBASE_*), nunca do código:
// o repositório é público e cada pessoa usa o próprio projeto Firebase.
// Esses valores são públicos por natureza, pois vão para o bundle do navegador.
// Quem protege os dados são as regras do Firestore (web/firestore.rules).
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

// Com VITE_FIREBASE_EMULADOR=true o app usa os emuladores locais do Firebase
// (firebase emulators:start), sem precisar de um projeto real na nuvem.
const usarEmulador = import.meta.env.VITE_FIREBASE_EMULADOR === 'true';

const configuracao = usarEmulador
  ? { apiKey: 'emulador', projectId: 'demo-pessoal-finance' }
  : {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    };

export const firebaseConfigurado = Boolean(configuracao.apiKey && configuracao.projectId);

// Sem configuração, o getAuth() lança erro na importação e derrubaria o app
// inteiro, inclusive a área administrativa, que não usa Firebase. Por isso
// auth e db ficam nulos e as páginas avisam o que falta.
const app = firebaseConfigurado ? initializeApp(configuracao) : null;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

if (app && usarEmulador) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8088);
}
