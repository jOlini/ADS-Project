import { describe, expect, it } from 'vitest';
import { buscarEmTudo, totalDaBusca, type LinhaDaBusca } from './buscaGlobal';

const contas = [
  { id: 'corrente', nome: 'Conta do Banco Exemplo', tipo: 'CORRENTE' },
  { id: 'roxo', nome: 'Cartão Roxo', tipo: 'CARTAO_CREDITO', dia_fechamento: 25, dia_vencimento: 5 },
];
const categorias = [
  { id: 'mercado', nome: 'Mercado', tipo: 'DESPESA', cor: 'mercado' },
  { id: 'pets', nome: 'Pets', tipo: 'DESPESA', cor: '#c2410c' },
];
const linha = (extras: Partial<LinhaDaBusca>): LinhaDaBusca => ({
  id: 'l',
  data: '2026-09-10',
  descricao: 'Padaria',
  categoria: 'Mercado',
  conta: 'Conta do Banco Exemplo',
  valor: -1250,
  tipo: 'despesa',
  noCartao: false,
  original: { conta_id: 'corrente' },
  ...extras,
});
const linhas = [
  linha({ id: 'a', descricao: 'Mercado Bom Preço', data: '2026-08-02' }),
  linha({ id: 'b', descricao: 'Mercado Online', data: '2026-09-24', noCartao: true, conta: '', original: { conta_id: 'roxo' } }),
  linha({ id: 'c', descricao: 'Ração do Thor', categoria: 'Pets', noCartao: true, original: { conta_id: 'roxo' } }),
];

describe('busca do topo', () => {
  it('separa lançamentos das contas e compras nos cartões', () => {
    const achados = buscarEmTudo('mercado', { linhas, contas, categorias });
    expect(achados.lancamentos.map((item) => item.titulo)).toEqual(['Mercado Bom Preço']);
    expect(achados.cartoes.map((item) => item.titulo)).toEqual(['Mercado Online']);
    expect(achados.categorias.map((item) => item.titulo)).toEqual(['Mercado']);
    expect(totalDaBusca(achados)).toBe(3);
  });

  it('leva ao mês do extrato e à fatura certa do cartão', () => {
    const achados = buscarEmTudo('mercado', { linhas, contas, categorias });
    expect(achados.lancamentos[0]!.para).toBe('/lancamentos?mes=2026-08&busca=Mercado+Bom+Pre%C3%A7o');
    // Compra de 24/09 no cartão que fecha dia 25 e vence dia 5: fatura de outubro.
    expect(achados.cartoes[0]!.para).toBe('/contas/cartoes/roxo?fatura=2026-10');
  });

  it('acha pela categoria da compra, pelo nome da conta e do cartão', () => {
    expect(buscarEmTudo('pets', { linhas, contas, categorias }).cartoes.map((item) => item.titulo)).toEqual(['Ração do Thor']);
    expect(buscarEmTudo('banco exemplo', { linhas: [], contas, categorias }).contas.map((item) => item.titulo)).toEqual(['Conta do Banco Exemplo']);
    expect(buscarEmTudo('roxo', { linhas: [], contas, categorias }).cartoes.map((item) => item.titulo)).toEqual(['Cartão Roxo']);
  });

  it('termo curto não busca, e cada aba tem o limite', () => {
    expect(totalDaBusca(buscarEmTudo('m', { linhas, contas, categorias }))).toBe(0);
    const muitas = Array.from({ length: 20 }, (_, indice) => linha({ id: String(indice), descricao: `Padaria ${indice}` }));
    expect(buscarEmTudo('padaria', { linhas: muitas, contas, categorias }, 5).lancamentos).toHaveLength(5);
  });
});
