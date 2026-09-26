import { useCallback, useEffect, useRef, useState } from 'react';
import { hojeIso } from '../regras/datas';
import { METAS_DE_EXEMPLO } from './dados/exemplo';
import { comAporte, novaMeta, semAporte } from './regras/metas';
import { chaveDasMetas, gravarMetas, lerMetas, novoId } from './servicos/metasLocais';

// Metas da conta, com as ações. No modo de exemplo, as metas fictícias
// aceitam aportes só na memória da página: dá para brincar com a árvore sem
// gravar nada. { metas, exemplo, gravou, criar, aportar, desfazerAporte, remover }.
export function useMetas(uid, { exemplo = false } = {}) {
  const origem = exemplo ? 'exemplo' : chaveDasMetas(uid);
  const carregar = () => (exemplo ? METAS_DE_EXEMPLO : lerMetas(uid));
  const [metas, setMetas] = useState(carregar);
  const [origemCarregada, setOrigemCarregada] = useState(origem);
  const [gravou, setGravou] = useState(true);

  // Outra conta ou entrada/saída do modo de exemplo: recarrega a lista ainda
  // nesta renderização (sem efeito, sem um quadro com a lista antiga).
  if (origemCarregada !== origem) {
    setOrigemCarregada(origem);
    setMetas(carregar());
  }

  // A mesma conta aberta em outra aba: acompanha o que for gravado lá.
  useEffect(() => {
    if (exemplo) {
      return undefined;
    }
    const aoMudar = (evento) => {
      if (evento.key === chaveDasMetas(uid)) {
        setMetas(lerMetas(uid));
      }
    };
    window.addEventListener('storage', aoMudar);
    return () => window.removeEventListener('storage', aoMudar);
  }, [uid, exemplo]);

  // Lista atual fora do estado, para gravar exatamente o que a tela mostra
  // (o atualizador do setState não pode ter efeito colateral).
  const atuais = useRef(metas);
  useEffect(() => {
    atuais.current = metas;
  }, [metas]);

  const mudar = useCallback(
    (transformar) => {
      const novas = transformar(atuais.current);
      atuais.current = novas;
      setMetas(novas);
      if (!exemplo) {
        setGravou(gravarMetas(uid, novas));
      }
    },
    [uid, exemplo],
  );

  const criar = useCallback(
    (dados) => {
      const meta = novaMeta(dados, { id: novoId(), hoje: hojeIso() });
      mudar((atuais) => [...atuais, meta]);
      return meta;
    },
    [mudar],
  );

  const aportar = useCallback(
    (metaId, valor) => {
      const aporte = { id: novoId(), valor, data: hojeIso() };
      mudar((atuais) => atuais.map((meta) => (meta.id === metaId ? comAporte(meta, aporte) : meta)));
      return aporte;
    },
    [mudar],
  );

  const desfazerAporte = useCallback(
    (metaId, aporteId) => mudar((atuais) => atuais.map((meta) => (meta.id === metaId ? semAporte(meta, aporteId) : meta))),
    [mudar],
  );

  const remover = useCallback((metaId) => mudar((atuais) => atuais.filter((meta) => meta.id !== metaId)), [mudar]);

  return { metas, exemplo, gravou, criar, aportar, desfazerAporte, remover };
}
