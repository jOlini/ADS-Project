// Busca rápida do extrato, sem interface: acha lançamentos pela descrição,
// pelo valor ou pela pessoa da divisão (e também pela categoria e pela
// conta). Cada palavra digitada precisa aparecer em algum desses campos:
// "churrasco bruno" acha o churrasco dividido com o Bruno.
import { valorParaCampo } from './dinheiro';
import { normalizarTexto } from './texto';

// "R$ 1.850", "1850,00" ou "-32,90": a pessoa está procurando um valor.
const PARECE_VALOR = /^[-−+]?\s*(r\$)?\s*[\d.,]+$/i;

// Formas de escrever o valor que a busca aceita: "1.850,00" e "1850,00".
function valoresEscritos(centavos) {
  const comMilhar = valorParaCampo(Math.abs(centavos));
  return [comMilhar, comMilhar.replaceAll('.', '')];
}

function combinaComOValor(lancamento, termo) {
  const digitado = termo.replace(/[-−+\s]|r\$/gi, '');
  return valoresEscritos(lancamento.valor).some((escrito) => escrito.includes(digitado));
}

function textoDoLancamento(lancamento) {
  return normalizarTexto(
    [lancamento.descricao, lancamento.categoria, lancamento.conta, ...(lancamento.pessoas ?? []).map((parte) => parte.pessoa)].join(' '),
  );
}

export function combinaComABusca(lancamento, busca) {
  const termo = busca.trim();
  if (!termo) {
    return true;
  }
  // Número também pode estar no texto ("Parcela 3"): vale o valor ou o texto.
  if (PARECE_VALOR.test(termo) && combinaComOValor(lancamento, termo)) {
    return true;
  }
  const texto = textoDoLancamento(lancamento);
  return normalizarTexto(termo)
    .split(' ')
    .every((palavra) => texto.includes(palavra));
}

// Os dias do extrato só com os lançamentos que combinam; dia sem nenhum sai.
export function buscarNoExtrato(dias, busca) {
  if (!busca.trim()) {
    return dias;
  }
  return dias
    .map((dia) => ({ ...dia, lancamentos: dia.lancamentos.filter((lancamento) => combinaComABusca(lancamento, busca)) }))
    .filter((dia) => dia.lancamentos.length > 0);
}
