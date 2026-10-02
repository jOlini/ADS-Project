import { createContext } from 'react';

// Guarda as funções do convite de plano (abrir, abrirSeForLimite) entregues
// pelo ConviteProvider. Arquivo próprio para o provider e o hook o importarem.
export const ContextoDoConvite = createContext(null);
