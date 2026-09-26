// Ícone da linha de lançamento na OliFine: o tipo manda (estorno,
// transferência, pagamento de fatura, entrada) e, nas despesas, o grupo de
// cor da categoria escolhe o desenho. Nomes de componentes/Icone.jsx.

// Ícone de cada cor de categoria (a cor da API é o nome do grupo).
const ICONE_DA_COR = {
  moradia: 'casa',
  mercado: 'carrinho',
  transporte: 'carro',
  casa: 'raio',
  saude: 'coracao',
  lazer: 'estrela',
  entrada: 'entrada',
  neutro: 'categorias',
};

export function iconeDaLinha(linha, cor) {
  if (linha.estorno) {
    return 'estornar';
  }
  if (linha.tipo === 'transferencia') {
    return 'transferencia';
  }
  if (linha.tipo === 'pagamento') {
    return 'cartao';
  }
  if (linha.valor > 0) {
    return 'entrada';
  }
  return ICONE_DA_COR[cor] ?? 'categorias';
}
