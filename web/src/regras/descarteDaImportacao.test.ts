// Testes do descarte de linhas na conferência da importação: a sugestão do
// pagamento de fatura, o descarte que a pessoa liga e desliga e o que vai
// para a API.
import { describe, expect, it } from 'vitest';
import {
  ajustar,
  ajustesDasSugestoes,
  ajustesParaAApi,
  alternarDescarte,
  descartada,
  MOTIVO_DO_PAGAMENTO_NA_CONTA,
  MOTIVO_DO_PAGAMENTO_NA_FATURA,
  novasQueEntram,
  resumoDaImportacao,
  sugestoesDeDescarte,
  validarAjustes,
  type LinhaDaResposta,
} from './importacao';

const linha = (numero: number, descricao: string, valor: number, situacao: LinhaDaResposta['situacao'] = 'NOVA'): LinhaDaResposta => ({
  linha: numero,
  situacao,
  data: '2026-09-09',
  descricao,
  valor_centavos: valor,
  categoria_id: 'outras',
});

describe('sugestão de descarte', () => {
  const fatura = [
    linha(2, 'PAG BOLETO BANCARIO', 47598),
    linha(3, 'Pagamento recebido', 50000),
    linha(4, 'Uber UBER TRIP', -300),
    linha(5, 'Estorno da loja', 1500),
    linha(6, 'PAGAMENTO RECEBIDO', 10000, 'JA_IMPORTADA'),
  ];

  it('na fatura do cartão, o pagamento da fatura anterior (crédito) já vem descartado', () => {
    expect(sugestoesDeDescarte(fatura, { cartao: true })).toEqual({ 2: MOTIVO_DO_PAGAMENTO_NA_FATURA, 3: MOTIVO_DO_PAGAMENTO_NA_FATURA });
  });

  it('no extrato da conta, a saída que paga a fatura do cartão', () => {
    // O "pagamento de boleto" da conta de luz não é a fatura: fica.
    const conta = [linha(2, 'PAGTO FATURA CARTAO', -47598), linha(3, 'Pix recebido', 3000), linha(4, 'Pagamento de boleto', -18000)];
    expect(sugestoesDeDescarte(conta, { cartao: false })).toEqual({ 2: MOTIVO_DO_PAGAMENTO_NA_CONTA });
  });

  it('as sugestões viram os ajustes iniciais', () => {
    expect(ajustesDasSugestoes({ 2: 'x', 3: 'y' })).toEqual({ 2: { descartar: true }, 3: { descartar: true } });
  });
});

describe('descarte na conferência', () => {
  const uber = linha(4, 'Uber', -300);

  it('liga e desliga sem perder a edição', () => {
    const editada = ajustar({}, uber, 'descricao', 'Uber para o trabalho');
    const fora = alternarDescarte(editada, uber);
    expect(descartada(fora, uber)).toBe(true);
    expect(alternarDescarte(fora, uber)).toEqual({ 4: { descricao: 'Uber para o trabalho' } });
    expect(alternarDescarte(alternarDescarte({}, uber), uber)).toEqual({});
  });

  it('a linha descartada não pede descrição e vai para a API', () => {
    const ajustes = alternarDescarte(ajustar({}, uber, 'descricao', '  '), uber);
    expect(validarAjustes(ajustes)).toEqual({});
    expect(ajustesParaAApi(ajustes)).toEqual({ 4: { descricao: '', descartar: true } });
  });

  it('conta só as novas que entram', () => {
    const linhas = [uber, linha(5, 'Padaria', -1250), linha(6, 'Antiga', -10, 'JA_IMPORTADA')];
    expect(novasQueEntram(linhas, alternarDescarte({}, uber))).toBe(1);
  });

  it('o resumo diz quantas foram descartadas', () => {
    expect(resumoDaImportacao({ simulacao: false, novas: 0, importadas: 3, ja_importadas: 0, invalidas: 0, descartadas: 2 })).toBe(
      '3 lançamentos importados · 2 descartadas',
    );
  });
});
