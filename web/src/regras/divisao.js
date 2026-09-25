// Racha: divisão de um lançamento entre pessoas, sem interface. Cada parte
// é { pessoa, valor } com o valor como a pessoa digitou ("100,00"). As partes
// somam até o valor do lançamento; o que sobra é a parte de quem lançou.
// A API confere as mesmas regras (api/app/financeiro/regras.py).
import { formatarBRL, lerValor, valorParaCampo } from './dinheiro';
import { normalizarTexto } from './texto';

// Mesmos limites da API.
export const MAXIMO_DE_PESSOAS = 20;
const TAMANHO_DO_NOME = 60;

export const parteVazia = (pessoa = '') => ({ pessoa, valor: '' });

// `total` centavos em `quantidade` partes iguais. Os centavos que não dividem
// exato vão um para cada parte, a partir da primeira: R$ 100,00 por 3 dá
// 33,34 + 33,33 + 33,33, e a soma fecha no centavo.
export function dividirIgualmente(total, quantidade) {
  if (quantidade <= 0 || total <= 0) {
    return [];
  }
  const base = Math.floor(total / quantidade);
  const sobra = total - base * quantidade;
  return Array.from({ length: quantidade }, (_, indice) => base + (indice < sobra ? 1 : 0));
}

// Preenche o valor de cada parte com a divisão igual. comMinhaParte conta
// quem lançou como mais uma pessoa: a parte dela fica de fora da lista e
// aparece como o que sobra.
export function repartirIgualmente(partes, total, { comMinhaParte = false } = {}) {
  const valores = dividirIgualmente(total, partes.length + (comMinhaParte ? 1 : 0));
  return partes.map((parte, indice) => ({ ...parte, valor: valorParaCampo(valores[indice] ?? 0) }));
}

// Soma do que já dá para ler (valor ilegível conta zero até ser corrigido).
export function somaDaDivisao(partes) {
  return partes.reduce((soma, parte) => soma + Math.max(0, lerValor(parte.valor) ?? 0), 0);
}

// { campo: mensagem }, com os campos no formato "divisao.0.pessoa" (o name
// dos inputs), mais "divisao" para o conjunto. Vazio = pode enviar.
export function validarDivisao(partes, total) {
  const erros = {};
  if (partes.length > MAXIMO_DE_PESSOAS) {
    erros.divisao = `Divida entre no máximo ${MAXIMO_DE_PESSOAS} pessoas.`;
  }
  const vistas = new Set();
  partes.forEach((parte, indice) => {
    const nome = normalizarTexto(parte.pessoa);
    if (!nome) {
      erros[`divisao.${indice}.pessoa`] = 'Informe o nome.';
    } else if (parte.pessoa.trim().length > TAMANHO_DO_NOME) {
      erros[`divisao.${indice}.pessoa`] = `Use no máximo ${TAMANHO_DO_NOME} caracteres.`;
    } else if (vistas.has(nome)) {
      erros[`divisao.${indice}.pessoa`] = 'Esta pessoa já está na divisão.';
    }
    vistas.add(nome);

    const valor = lerValor(parte.valor);
    if (!parte.valor?.trim()) {
      erros[`divisao.${indice}.valor`] = 'Informe a parte.';
    } else if (valor === null) {
      erros[`divisao.${indice}.valor`] = 'Valor inválido. Use o formato 100,00.';
    } else if (valor === 0) {
      erros[`divisao.${indice}.valor`] = 'A parte precisa ser maior que zero.';
    }
  });
  const soma = somaDaDivisao(partes);
  if (total !== null && soma > total) {
    erros.divisao = `As partes somam ${formatarBRL(soma)}, mais que o valor do lançamento.`;
  }
  return erros;
}

// Nomes dos campos da divisão na ordem da tela (para focar o primeiro erro).
export function camposDaDivisao(partes) {
  return [...partes.flatMap((_, indice) => [`divisao.${indice}.pessoa`, `divisao.${indice}.valor`]), 'divisao'];
}

// Corpo da divisão para a API, de partes já validadas.
export function corpoDaDivisao(partes) {
  return partes.map((parte) => ({ pessoa: parte.pessoa.trim(), valor_centavos: lerValor(parte.valor) }));
}

// Pessoas já usadas que ainda não estão nesta divisão, para sugerir.
export function pessoasParaSugerir(conhecidas, partes, limite = 8) {
  const presentes = new Set(partes.map((parte) => normalizarTexto(parte.pessoa)));
  return conhecidas.filter((nome) => !presentes.has(normalizarTexto(nome))).slice(0, limite);
}
