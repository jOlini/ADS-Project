import { createContext } from 'react';

// Guarda as funções de toast (mostrar, fechar, sucesso, erro...) entregues
// pelo ToastProvider. Arquivo próprio para o provider e o hook o importarem.
export const ContextoToast = createContext(null);
