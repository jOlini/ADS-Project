// Edição de um lançamento já gravado (o "Editar" do menu da linha), sem
// interface. A API confere tudo de novo (regras.conferir_edicao); aqui fica
// o que a tela precisa para mostrar só os campos que podem mudar e mandar só
// o que mudou.
import { dataExiste } from './datas';
import { lerValor, valorParaCampo } from './dinheiro';
import { erroDoResponsavel, responsavelParaApi } from './responsavel';

// O que cada lançamento deixa mudar:
// - estorno e lançamento estornado: descrição e meio (o estorno espelha o
//   original, e mudar um lado deixaria o outro errado);
// - parcela de compra no cartão: descrição e categoria, que valem para a
//   compra inteira (data e valor vêm do parcelamento);
// - compra no cartão: sem meio (ela é o crédito);
// - transferência: sem categoria e sem responsável.
// O responsável muda em todos os outros (na parcela, vale para a compra
// inteira): é só de quem é o lançamento, não mexe em valor nenhum.
export function camposEditaveis(lancamento, { noCartao = false } = {}) {
  const espelhado = Boolean(lancamento.estorno_de || lancamento.estornado_por);
  const parcela = Boolean(lancamento.compra_id);
  return {
    data: !espelhado && !parcela,
    valor: !espelhado && !parcela,
    categoria: !espelhado && lancamento.tipo !== 'TRANSFERENCIA',
    meio: !noCartao,
    responsavel: lancamento.tipo !== 'TRANSFERENCIA',
  };
}

export const ORDEM_DA_EDICAO = ['descricao', 'valor', 'data', 'categoria_id', 'responsavel', 'meio'];

const TAMANHO_DA_DESCRICAO = 120;

export function formularioDaEdicao(lancamento) {
  return {
    descricao: lancamento.descricao,
    valor: valorParaCampo(lancamento.valor_centavos),
    data: lancamento.data,
    categoria_id: lancamento.categoria_id ?? '',
    meio: lancamento.meio ?? '',
    responsavel: lancamento.responsavel ?? '',
  };
}

// { campo: mensagem } só dos campos que podem mudar e estão inválidos.
export function validarEdicao(formulario, lancamento, campos) {
  const erros = {};
  const descricao = formulario.descricao?.trim() ?? '';
  if (!descricao) {
    erros.descricao = 'Descreva o lançamento.';
  } else if (descricao.length > TAMANHO_DA_DESCRICAO) {
    erros.descricao = `Use no máximo ${TAMANHO_DA_DESCRICAO} caracteres.`;
  }
  if (campos.valor) {
    const valor = lerValor(formulario.valor);
    const doRacha = (lancamento.divisao ?? []).reduce((soma, parte) => soma + parte.valor_centavos, 0);
    if (!formulario.valor?.trim()) {
      erros.valor = 'Informe o valor.';
    } else if (valor === null) {
      erros.valor = 'Valor inválido. Use o formato 214,37.';
    } else if (valor === 0) {
      erros.valor = 'O valor precisa ser maior que zero.';
    } else if (doRacha > valor) {
      erros.valor = 'As partes do racha somam mais que o novo valor.';
    }
  }
  if (campos.data) {
    if (!formulario.data) {
      erros.data = 'Informe a data.';
    } else if (!dataExiste(formulario.data)) {
      erros.data = 'Data inválida.';
    }
  }
  if (campos.categoria && !formulario.categoria_id) {
    erros.categoria_id = 'Escolha a categoria.';
  }
  const erroDoNome = campos.responsavel ? erroDoResponsavel(formulario.responsavel) : '';
  if (erroDoNome) {
    erros.responsavel = erroDoNome;
  }
  return erros;
}

// Só o que mudou, para a API: um formulário igual ao original dá {}.
export function corpoDaEdicao(formulario, lancamento, campos) {
  const corpo = {};
  const descricao = formulario.descricao.trim();
  if (descricao !== lancamento.descricao) {
    corpo.descricao = descricao;
  }
  const valor = campos.valor ? lerValor(formulario.valor) : lancamento.valor_centavos;
  if (valor !== lancamento.valor_centavos) {
    corpo.valor_centavos = valor;
  }
  if (campos.data && formulario.data !== lancamento.data) {
    corpo.data = formulario.data;
  }
  if (campos.categoria && formulario.categoria_id !== (lancamento.categoria_id ?? '')) {
    corpo.categoria_id = formulario.categoria_id;
  }
  if (campos.meio && formulario.meio !== (lancamento.meio ?? '')) {
    corpo.meio = formulario.meio || null;
  }
  // Apagar o nome devolve o lançamento a quem lançou (null na API). Só a
  // grafia mudando ("ana" para "Ana") também vai: é o que a pessoa quis ver.
  const responsavel = responsavelParaApi(formulario.responsavel);
  if (campos.responsavel && responsavel !== (lancamento.responsavel ?? null)) {
    corpo.responsavel = responsavel;
  }
  return corpo;
}
