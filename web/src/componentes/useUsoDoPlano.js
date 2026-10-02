import { useCallback, useMemo } from 'react';
import { useConviteDoPlano } from './convite/useConviteDoPlano';
import { useCarga } from './useCarga';
import { podeCriar } from '../regras/acessoPorPlano';
import { apiConfigurada, usoDoPlano } from '../servicos/livroCaixa';

// O uso do plano neste espaço (contas e lançamentos do mês, com o teto do
// Free) e a trava amigável antes de abrir um formulário: no teto, abre o
// convite do plano no lugar do formulário. Sem o uso (carregando, API
// antiga, erro), deixa abrir: a API confere e responde 403 se for o caso.
//
//   const { uso, recarregar, seCouber } = useUsoDoPlano(espacoId);
//   <button onClick={() => seCouber('contas', () => abrir('conta'))}>
export function useUsoDoPlano(espacoId) {
  const convite = useConviteDoPlano();
  const buscar = useMemo(
    () => (apiConfigurada && espacoId ? () => usoDoPlano(espacoId).catch(() => null) : null),
    [espacoId],
  );
  const carga = useCarga(buscar);
  const uso = carga.dados ?? null;
  const { abrir } = convite;

  const seCouber = useCallback(
    (recurso, acao) => {
      if (podeCriar(uso, recurso)) {
        acao();
      } else {
        abrir(recurso, uso?.[recurso]?.maximo ?? null);
      }
    },
    [uso, abrir],
  );

  return { uso, recarregar: carga.recarregar, seCouber };
}
