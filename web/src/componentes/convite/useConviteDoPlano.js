import { useContext } from 'react';
import { ContextoDoConvite } from './contexto';

/**
 * @typedef {{
 *   abrir: (motivo: import('../../regras/acessoPorPlano').MotivoDoConvite, maximo?: number | null) => void,
 *   abrirSeForLimite: (erro: unknown) => boolean,
 * }} ConviteDoPlano
 */

// Fora da área logada (sem o provider), o convite não abre: abrirSeForLimite
// devolve false e quem chamou mostra o erro comum.
/** @type {ConviteDoPlano} */
const SEM_CONVITE = { abrir: () => undefined, abrirSeForLimite: () => false };

// Uso nas telas e formulários da área logada:
//   const convite = useConviteDoPlano();
//   convite.abrir('empresarial');
//   if (convite.abrirSeForLimite(erro)) return; // o 403 do teto do Free
/** @returns {ConviteDoPlano} */
export function useConviteDoPlano() {
  return useContext(ContextoDoConvite) ?? SEM_CONVITE;
}
