import { useState } from 'react';
import Campo from './Campo';
import Seletor from './Seletor';
import SeletorDeCor from './SeletorDeCor';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import { formatarBRL, valorParaCampo } from '../regras/dinheiro';
import { corpoDoCartao, CORES_DO_CARTAO, DIAS_DO_MES, errosDaApi, ORDEM_DO_CARTAO, validarCartao } from '../regras/livroCaixa';
import { atualizarConta, criarConta } from '../servicos/livroCaixa';

const NOVO = { nome: '', limite: '', diaFechamento: '', diaVencimento: '', cor: 'grafite', ativa: true };

function formularioDe(cartao) {
  return {
    nome: cartao.nome,
    limite: valorParaCampo(cartao.limite_centavos),
    diaFechamento: String(cartao.dia_fechamento),
    diaVencimento: String(cartao.dia_vencimento),
    cor: cartao.cor ?? 'grafite',
    ativa: cartao.ativa,
  };
}

// Formulário do cartão de crédito (no modal "Novo cartão" ou "Editar
// cartão"): nome, limite, dias de fechamento e vencimento da fatura e a cor
// do plástico na carteira. Na edição, o cartão pode ser desativado (não
// recebe compras novas). aoSalvar recebe o cartão salvo.
export default function FormularioDeCartao({ espacoId, emEdicao = null, aoSalvar, aoCancelar, aoMudarOcupado }) {
  const toast = useToast();
  const [formulario, setFormulario] = useState(() => (emEdicao ? formularioDe(emEdicao) : NOVO));
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);

  function mudar(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  async function salvar() {
    if (emEdicao) {
      const salvo = await atualizarConta(espacoId, emEdicao.id, corpoDoCartao(formulario, { comAtiva: true }));
      toast.sucesso(`Limite de ${formatarBRL(salvo.limite_centavos)}.`, { titulo: `Cartão "${salvo.nome}" salvo` });
      return salvo;
    }
    const criado = await criarConta(espacoId, corpoDoCartao(formulario));
    toast.sucesso(`Fecha no dia ${criado.dia_fechamento} e vence no dia ${criado.dia_vencimento}.`, {
      titulo: `Cartão "${criado.nome}" criado`,
    });
    return criado;
  }

  async function enviar(evento) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements;
    const encontrados = validarCartao(formulario);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DO_CARTAO);
    if (primeiro) {
      elementos[primeiro]?.focus();
      return;
    }

    setEnviando(true);
    aoMudarOcupado?.(true);
    try {
      aoSalvar(await salvar());
    } catch (erro) {
      setErros(errosDaApi(erro.campos));
      toast.erro(erro.message, { titulo: 'Cartão não salvo' });
      setEnviando(false);
      aoMudarOcupado?.(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <Campo rotulo="Nome" name="nome" autoComplete="off" maxLength={60} placeholder="Ex.: Cartão do banco" data-foco-inicial
        value={formulario.nome} onChange={(evento) => mudar('nome', evento.target.value)} erro={erros.nome} />

      <Campo rotulo="Limite (R$)" name="limite" inputMode="decimal" autoComplete="off" placeholder="0,00"
        value={formulario.limite} onChange={(evento) => mudar('limite', evento.target.value)} erro={erros.limite} />

      <div className="duas-colunas">
        <Campo elemento={Seletor} rotulo="Fatura fecha" name="diaFechamento" placeholder="Dia" opcoes={DIAS_DO_MES}
          value={formulario.diaFechamento} onChange={(evento) => mudar('diaFechamento', evento.target.value)}
          erro={erros.diaFechamento} />
        <Campo elemento={Seletor} rotulo="Fatura vence" name="diaVencimento" placeholder="Dia" opcoes={DIAS_DO_MES}
          value={formulario.diaVencimento} onChange={(evento) => mudar('diaVencimento', evento.target.value)}
          erro={erros.diaVencimento} />
      </div>
      <p className="dica-do-campo">
        A compra feita no dia do fechamento já entra na fatura seguinte. Dias 29 a 31 viram o último dia nos meses mais curtos.
      </p>

      <SeletorDeCor rotulo="Cor do cartão" name="cor" valor={formulario.cor} opcoes={CORES_DO_CARTAO}
        aoMudar={(cor) => mudar('cor', cor)} />

      {emEdicao && (
        <label className="caixa-de-marcar">
          <input type="checkbox" name="ativa" checked={formulario.ativa} onChange={(evento) => mudar('ativa', evento.target.checked)} />
          <span>
            <b>Cartão ativo</b>
            <small>Desativado, não recebe compras novas. As faturas e o pagamento continuam.</small>
          </span>
        </label>
      )}

      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Salvando…' : emEdicao ? 'Salvar' : 'Criar cartão'}
        </button>
      </div>
    </form>
  );
}
