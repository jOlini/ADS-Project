import { useCallback, useMemo, useState } from 'react';
import Modal from '../Modal';
import { conviteDe, limiteDoErro } from '../../regras/acessoPorPlano';
import ConviteDoPlano from './ConviteDoPlano';
import { ContextoDoConvite } from './contexto';

// Um convite de plano para a área logada inteira: qualquer tela ou
// formulário abre o mesmo modal (useConviteDoPlano), seja na guarda das rotas
// da empresa, seja no teto do Free (antes de abrir o formulário, pelo uso do
// plano, ou depois, pelo 403 da API com o membro "limite").
export default function ConviteProvider({ children }) {
  const [aberta, setAberta] = useState(false);
  // { motivo, maximo }: fica depois de fechar, para o modal não sumir vazio
  // durante a saída.
  const [pedido, setPedido] = useState(null);

  const abrir = useCallback((motivo, maximo = null) => {
    setPedido({ motivo, maximo });
    setAberta(true);
  }, []);
  const abrirSeForLimite = useCallback(
    (erro) => {
      const limite = limiteDoErro(erro);
      if (limite) {
        abrir(limite.recurso, limite.maximo);
      }
      return Boolean(limite);
    },
    [abrir],
  );
  const fechar = useCallback(() => setAberta(false), []);
  const valor = useMemo(() => ({ abrir, abrirSeForLimite }), [abrir, abrirSeForLimite]);

  return (
    <ContextoDoConvite.Provider value={valor}>
      {children}
      <Modal aberta={aberta} titulo={pedido ? conviteDe(pedido.motivo, pedido.maximo).titulo : ''} aoFechar={fechar}>
        {pedido && <ConviteDoPlano motivo={pedido.motivo} maximo={pedido.maximo} aoFechar={fechar} />}
      </Modal>
    </ContextoDoConvite.Provider>
  );
}
