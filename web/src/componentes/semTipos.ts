import type { ComponentType } from 'react';

// Componente que ainda é .jsx, sem tipos: o TypeScript leria as props da
// desestruturação como todas obrigatórias. Até o componente ser migrado para
// .tsx (DA-076), quem o usa num .tsx o vê aceitando qualquer prop.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const semTipos = (componente: unknown) => componente as ComponentType<Record<string, any>>;
