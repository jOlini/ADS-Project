import { useState } from 'react';
import AvisoComAtalho from './AvisoComAtalho';
import Campo from './Campo';
import Seletor from './Seletor';
import SeletorDeData from './SeletorDeData';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import { corpoDoPagamento, ORDEM_DO_PAGAMENTO, textoDoVencimento, validarPagamento, valorSugeridoDoPagamento } from '../regras/cartoes';
import { hojeIso } from '../regras/datas';
import { formatarBRL } from '../regras/dinheiro';
import { errosDaApi } from '../regras/livroCaixa';
import { pagarFatura } from '../servicos/livroCaixa';

// Formulário do "Pagar fatura" (dentro do modal). O pagamento sai da conta
// escolhida (uma saída no extrato dela) e entra no cartão, liberando o mesmo
// valor no limite. O valor já vem com o que há a pagar das faturas fechadas
// ou, sem elas, com a fatura atual. aoPagar recebe o lançamento criado.
export default function FormularioDePagamento({ espacoId, cartao, contas, aoPagar, aoCancelar, aoMudarOcupado }) {
  const toast = useToast();
  const [formulario, setFormulario] = useState(() => ({
    conta_id: contas.length === 1 ? contas[0].id : '',
    valor: valorSugeridoDoPagamento(cartao),
    data: hojeIso(),
  }));
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);

  if (contas.length === 0) {
    return (
      <AvisoComAtalho
        icone="contas"
        titulo="Nenhuma conta para pagar a fatura"
        atalho={{ para: '/contas?cadastrar=conta', rotulo: 'Cadastrar conta', icone: 'contas' }}
        aoFechar={aoCancelar}
      >
        O pagamento da fatura sai de uma conta (corrente, poupança, carteira). Cadastre a conta com o saldo de hoje e volte
        para pagar.
      </AvisoComAtalho>
    );
  }

  function mudar(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  async function enviar(evento) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements;
    const encontrados = validarPagamento(formulario);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DO_PAGAMENTO);
    if (primeiro) {
      elementos[primeiro]?.focus();
      return;
    }

    setEnviando(true);
    aoMudarOcupado?.(true);
    try {
      const pago = await pagarFatura(espacoId, cartao.id, corpoDoPagamento(formulario));
      const conta = contas.find((item) => item.id === pago.conta_id)?.nome ?? 'conta';
      toast.sucesso(`${formatarBRL(pago.valor_centavos)} saíram de ${conta} e voltaram ao limite.`, { titulo: 'Fatura paga' });
      aoPagar(pago);
    } catch (erro) {
      const campos = errosDaApi(erro.campos);
      setErros(campos);
      toast.erro(erro.message, { titulo: 'Pagamento não registrado' });
      setEnviando(false);
      aoMudarOcupado?.(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <dl className="resumo-do-pagamento">
        <div>
          <dt>Faturas fechadas a pagar</dt>
          <dd>{formatarBRL(cartao.a_pagar_centavos)}</dd>
          {cartao.a_pagar_centavos > 0 && <small>{textoDoVencimento(cartao.ultima_fechada.vencimento)}</small>}
        </div>
        <div>
          <dt>Fatura atual</dt>
          <dd>{formatarBRL(cartao.fatura_atual_centavos)}</dd>
          <small>{textoDoVencimento(cartao.fatura_atual.vencimento)}</small>
        </div>
      </dl>

      <Campo elemento={Seletor} rotulo="Sai da conta" name="conta_id" placeholder="Escolha a conta"
        opcoes={contas.map((conta) => ({ valor: conta.id, rotulo: `${conta.nome} · ${formatarBRL(conta.saldo_centavos)}` }))}
        value={formulario.conta_id} onChange={(evento) => mudar('conta_id', evento.target.value)} erro={erros.conta_id} />

      <div className="duas-colunas">
        <Campo rotulo="Valor pago (R$)" name="valor" inputMode="decimal" autoComplete="off" placeholder="0,00"
          value={formulario.valor} onChange={(evento) => mudar('valor', evento.target.value)} erro={erros.valor} />
        <Campo elemento={SeletorDeData} rotulo="Data do pagamento" name="data"
          value={formulario.data} onChange={(evento) => mudar('data', evento.target.value)} erro={erros.data} />
      </div>
      <p className="dica-do-campo">
        Entra no extrato da conta como uma saída e libera o mesmo valor no limite do cartão.
      </p>

      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Pagando…' : 'Pagar fatura'}
        </button>
      </div>
    </form>
  );
}
