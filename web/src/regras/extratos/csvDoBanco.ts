// Leitor do CSV exportado pelo banco: o texto vai inteiro para a API, que
// reconhece as colunas pelo cabeçalho de cada banco (Nubank, Itaú, Bradesco,
// Banco do Brasil, C6, Caixa, Inter, Mercado Pago e o formato date, title,
// amount das faturas em inglês, em api/app/financeiro/reconhecimento.py) ou
// pelo conteúdo das células, e pede ajuda à pessoa quando fica em dúvida.

import { ErroDoLeitor, type LeitorDeExtrato } from './tipos';

export const csvDoBanco: LeitorDeExtrato = {
  id: 'csv-do-banco',
  nome: 'CSV do banco (colunas reconhecidas)',
  formato: 'csv',
  reconhece: (arquivo) => (arquivo.formato === 'csv' ? 1 : 0),
  preparar(arquivo) {
    if (arquivo.formato !== 'csv') {
      throw new ErroDoLeitor('Este leitor é só para CSV.');
    }
    return { csv: arquivo.texto, mapeamento: null, conferencias: [], avisos: [] };
  },
};
