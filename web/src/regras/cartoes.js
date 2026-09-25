// Regras das telas do cartão de crédito, sem interface: referência da fatura,
// uso do limite, texto das parcelas e validação dos formulários de compra e
// de pagamento. A API faz as contas de verdade (ciclo da fatura, parcelas,
// painel); aqui fica só o que a tela precisa para mostrar e conferir antes
// de ir à rede.
import { formatarData, hojeIso } from './datas';
import { formatarBRL, lerValor, valorParaCampo } from './dinheiro';
import { corpoDaDivisao, validarDivisao } from './divisao';

// Mesmos limites da API.
export const MAXIMO_DE_PARCELAS = 48;
const TAMANHO_DA_DESCRICAO = 120;

// Opções do seletor de parcelas: todas até 24x e as longas mais comuns.
export const OPCOES_DE_PARCELAS = [...Array.from({ length: 24 }, (_, indice) => indice + 1), 30, 36, 48].map((numero) => ({
  valor: String(numero),
  rotulo: numero === 1 ? 'À vista' : `${numero}x`,
}));

export const ROTULO_DA_SITUACAO = { ABERTA: 'Aberta', FECHADA: 'Fechada', FUTURA: 'Futura' };

// A fatura leva o mês do vencimento: 'AAAA-MM' <-> { ano, mes }.
export const referenciaDoMes = ({ ano, mes }) => `${ano}-${String(mes).padStart(2, '0')}`;

export function mesDaReferencia(referencia) {
  const [ano, mes] = referencia.split('-').map(Number);
  return { ano, mes };
}

// Último dia de compra da fatura: a véspera do fechamento (a compra do dia
// do fechamento já vai para a próxima).
export function ultimoDiaDaFatura(fechamento) {
  const data = new Date(`${fechamento}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() - 1);
  return data.toISOString().slice(0, 10);
}

// Quanto do limite está ocupado, de 0 a 100 (acima do limite fica em 100).
export function usoDoLimite({ limite_centavos: limite, usado_centavos: usado }) {
  if (!limite || usado <= 0) {
    return 0;
  }
  return Math.min(100, Math.round((usado / limite) * 100));
}

// Estado do limite para o medidor: a cor muda com ele, e o texto ao lado diz
// o mesmo (a cor nunca aparece sozinha).
export function situacaoDoLimite(cartao) {
  if (cartao.disponivel_centavos <= 0) {
    return { nivel: 'esgotado', rotulo: cartao.disponivel_centavos < 0 ? 'Acima do limite' : 'Limite esgotado' };
  }
  if (usoDoLimite(cartao) >= 80) {
    return { nivel: 'atencao', rotulo: 'Limite quase no fim' };
  }
  return { nivel: 'normal', rotulo: '' };
}

// "3x de R$ 100,00", ou "1x de R$ 3,34 + 2x de R$ 3,33" quando o centavo
// que sobra da divisão vai para a primeira parcela (mesma regra da API).
export function textoDasParcelas(total, parcelas) {
  if (!total || total <= 0 || !parcelas) {
    return '';
  }
  const base = Math.floor(total / parcelas);
  const primeira = total - base * (parcelas - 1);
  if (parcelas === 1) {
    return `À vista, ${formatarBRL(total)}`;
  }
  if (primeira === base) {
    return `${parcelas}x de ${formatarBRL(base)}`;
  }
  return `1x de ${formatarBRL(primeira)} + ${parcelas - 1}x de ${formatarBRL(base)}`;
}

// ------------------------------------------------------------ Compra

export const ORDEM_DA_COMPRA = ['descricao', 'valor', 'data', 'categoria_id', 'parcelas'];

export const compraVazia = () => ({
  descricao: '',
  valor: '',
  data: hojeIso(),
  categoria_id: '',
  parcelas: '1',
  divisao: [],
});

const aVista = (formulario) => Number(formulario.parcelas) === 1;

export function validarCompra(formulario) {
  const erros = {};
  const descricao = formulario.descricao?.trim() ?? '';
  const valor = lerValor(formulario.valor);
  const parcelas = Number(formulario.parcelas);

  if (!descricao) {
    erros.descricao = 'Descreva a compra (ex.: Supermercado).';
  } else if (descricao.length > TAMANHO_DA_DESCRICAO) {
    erros.descricao = `Use no máximo ${TAMANHO_DA_DESCRICAO} caracteres.`;
  }
  if (!formulario.valor?.trim()) {
    erros.valor = 'Informe o valor total da compra.';
  } else if (valor === null) {
    erros.valor = 'Valor inválido. Use o formato 214,37.';
  } else if (valor === 0) {
    erros.valor = 'O valor precisa ser maior que zero.';
  } else if (parcelas > valor) {
    erros.valor = 'Cada parcela precisa de pelo menos um centavo.';
  }
  if (!formulario.data) {
    erros.data = 'Informe a data da compra.';
  }
  if (!formulario.categoria_id) {
    erros.categoria_id = 'Escolha a categoria.';
  }
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > MAXIMO_DE_PARCELAS) {
    erros.parcelas = 'Escolha o número de parcelas.';
  }
  // Racha só na compra à vista (a API recusa nas parceladas).
  if (aVista(formulario) && formulario.divisao?.length > 0) {
    Object.assign(erros, validarDivisao(formulario.divisao, valor || null));
  }
  return erros;
}

export function corpoDaCompra(formulario) {
  const corpo = {
    descricao: formulario.descricao.trim(),
    data: formulario.data,
    valor_centavos: lerValor(formulario.valor),
    categoria_id: formulario.categoria_id,
    parcelas: Number(formulario.parcelas),
  };
  if (aVista(formulario) && formulario.divisao?.length > 0) {
    corpo.divisao = corpoDaDivisao(formulario.divisao);
  }
  return corpo;
}

// --------------------------------------------------------- Pagamento

export const ORDEM_DO_PAGAMENTO = ['conta_id', 'valor', 'data'];

// Valor que o formulário já traz: as faturas fechadas em aberto; sem elas, a
// fatura atual (pagamento adiantado). Nada a pagar deixa o campo vazio.
export function valorSugeridoDoPagamento(cartao) {
  const valor = cartao.a_pagar_centavos > 0 ? cartao.a_pagar_centavos : cartao.fatura_atual_centavos;
  return valor > 0 ? valorParaCampo(valor) : '';
}

export function validarPagamento(formulario) {
  const erros = {};
  const valor = lerValor(formulario.valor);
  if (!formulario.conta_id) {
    erros.conta_id = 'Escolha a conta de onde sai o pagamento.';
  }
  if (!formulario.valor?.trim()) {
    erros.valor = 'Informe o valor pago.';
  } else if (valor === null) {
    erros.valor = 'Valor inválido. Use o formato 1.234,56.';
  } else if (valor === 0) {
    erros.valor = 'O valor precisa ser maior que zero.';
  }
  if (!formulario.data) {
    erros.data = 'Informe a data do pagamento.';
  }
  return erros;
}

export function corpoDoPagamento(formulario) {
  return { conta_id: formulario.conta_id, valor_centavos: lerValor(formulario.valor), data: formulario.data };
}

// "venceu em 10/09/2026" ou "vence em 10/10/2026", conforme hoje.
export function textoDoVencimento(vencimento, hoje = hojeIso()) {
  return `${vencimento < hoje ? 'venceu' : 'vence'} em ${formatarData(vencimento)}`;
}

// ------------------------------------------------------ A vencer

// Faturas fechadas com valor a pagar, da que vence primeiro para a última.
// Vencida continua na lista, marcada, até ser paga.
export function faturasAVencer(cartoes, hoje = hojeIso()) {
  return cartoes
    .filter((cartao) => cartao.a_pagar_centavos > 0)
    .map((cartao) => ({
      id: cartao.id,
      descricao: `Fatura ${cartao.nome}`,
      data: cartao.ultima_fechada.vencimento,
      valor: cartao.a_pagar_centavos,
      vencida: cartao.ultima_fechada.vencimento < hoje,
    }))
    .sort((a, b) => a.data.localeCompare(b.data));
}
