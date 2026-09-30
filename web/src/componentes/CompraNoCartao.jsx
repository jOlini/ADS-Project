import { useState } from 'react';
import AvisoComAtalho from './AvisoComAtalho';
import Campo from './Campo';
import FormularioDeCompra from './FormularioDeCompra';
import Seletor from './Seletor';
import { formatarBRL } from '../regras/dinheiro';

// "Nova compra no crédito" fora da tela do cartão (o "+ Novo" da Visão geral):
// primeiro o cartão, depois o mesmo formulário da tela dele. cartoes são os
// painéis da API (GET /cartoes). Com um cartão ativo só, ele já vem escolhido.
// divisaoPorPessoa segue para o formulário (o plano decide o racha).
export default function CompraNoCartao({
  espacoId,
  cartoes,
  categorias,
  pessoasConhecidas,
  divisaoPorPessoa = false,
  aoComprar,
  aoCancelar,
  aoMudarOcupado,
}) {
  const ativos = cartoes.filter((cartao) => cartao.ativa);
  const [cartaoId, setCartaoId] = useState(ativos.length === 1 ? ativos[0].id : '');
  const cartao = ativos.find((item) => item.id === cartaoId);

  if (ativos.length === 0) {
    return (
      <AvisoComAtalho
        icone="cartao"
        titulo="Nenhum cartão ativo"
        atalho={{ para: '/contas?cadastrar=cartao', rotulo: 'Cadastrar cartão', icone: 'cartao' }}
        aoFechar={aoCancelar}
      >
        A compra no crédito entra na fatura de um cartão. Cadastre o cartão (ou reative um em Contas & Cartões) e volte.
      </AvisoComAtalho>
    );
  }

  return (
    <div className="compra-no-cartao">
      <Campo elemento={Seletor} rotulo="Cartão" name="cartao" placeholder="Escolha o cartão"
        opcoes={ativos.map((item) => ({ valor: item.id, rotulo: item.nome, descricao: `${formatarBRL(item.disponivel_centavos)} disponíveis` }))}
        value={cartaoId} onChange={(evento) => setCartaoId(evento.target.value)} />
      {cartao ? (
        <FormularioDeCompra
          key={cartao.id}
          espacoId={espacoId}
          cartao={cartao}
          categorias={categorias}
          pessoasConhecidas={pessoasConhecidas}
          divisaoPorPessoa={divisaoPorPessoa}
          aoComprar={aoComprar}
          aoCancelar={aoCancelar}
          aoMudarOcupado={aoMudarOcupado}
        />
      ) : (
        <div className="acoes-do-formulario">
          <button type="button" className="secundario" onClick={aoCancelar}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
