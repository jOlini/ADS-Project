// Limpeza do texto livre que a pessoa digita (nome de conta, descrição de
// lançamento, pessoa do racha, nome do cadastro), antes de ir à rede. A API
// limpa de novo com a mesma regra (api/app/sanitizacao.py): o que vale é o
// servidor, porque a requisição pode não ter passado por esta tela.
//
// Contra o quê:
// - XSS: sem "<" e ">", nenhum texto gravado vira tag, mesmo que um dia seja
//   mostrado fora do React (que já escapa tudo);
// - injeção de fórmula (CSV injection): texto que começa com =, +, - ou @
//   vira fórmula quando o extrato é aberto numa planilha;
// - caracteres invisíveis: controle, largura zero e os que invertem a
//   direção do texto (enganam quem lê, trocando a ordem do que aparece).
// Injeção de SQL não se aplica (o banco é o MongoDB), e a de operador do
// Mongo ($ne, $where) a API barra pelo tipo de cada campo.

/* eslint-disable no-control-regex */
const CONTROLE = /[\u0000-\u001F\u007F-\u009F]/g;
const INVISIVEIS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const SINAIS_DE_TAG = /[<>\uFF1C\uFF1E]/g;
// Os de largura cheia (U+FF1D, U+FF0B, U+FF0D, U+FF20) também: planilhas os tratam como os normais.
const COMECO_DE_FORMULA = /^[=+\-@\uFF1D\uFF0B\uFF0D\uFF20\s]+/;
/* eslint-enable no-control-regex */

// Texto pronto para gravar: sem o que foi descrito acima, sem espaço
// repetido e sem espaço nas pontas.
export function limparTexto(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFC')
    .replace(CONTROLE, ' ')
    .replace(INVISIVEIS, '')
    .replace(SINAIS_DE_TAG, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(COMECO_DE_FORMULA, '');
}

// Durante a digitação: só tira o que nunca serve (controle, invisível, sinal
// de tag). Espaços ficam como estão, senão o espaço entre duas palavras
// sumiria antes da segunda.
export function limparDigitacao(texto: unknown): string {
  return String(texto ?? '')
    .replace(CONTROLE, '')
    .replace(INVISIVEIS, '')
    .replace(SINAIS_DE_TAG, '');
}

// Campos de texto livre dos corpos enviados à API do livro-caixa. O resto
// (ids, datas, tipos, o texto do CSV, que a API lê e limpa célula por célula)
// vai como está.
export const CAMPOS_DE_TEXTO = new Set(['nome', 'descricao', 'pessoa']);

// Corpo com os campos de texto livre limpos, em qualquer profundidade (a
// divisão do racha é uma lista de { pessoa, valor_centavos }).
export function limparCorpo<T>(corpo: T): T {
  if (Array.isArray(corpo)) {
    return corpo.map((item) => limparCorpo(item)) as T;
  }
  if (corpo && typeof corpo === 'object') {
    return Object.fromEntries(
      Object.entries(corpo).map(([campo, valor]) => [
        campo,
        CAMPOS_DE_TEXTO.has(campo) && typeof valor === 'string' ? limparTexto(valor) : limparCorpo(valor),
      ]),
    ) as T;
  }
  return corpo;
}
