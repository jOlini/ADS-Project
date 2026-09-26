// Testes das chamadas à API do livro-caixa. O Firebase e o fetch são dublês:
// o teste confere o que o código manda para a API, sem rede.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// vi.mock sobe para o topo do arquivo; os dublês que ele usa sobem junto.
const { usuario, auth, fetch } = vi.hoisted(() => {
  const usuario = { getIdToken: vi.fn() };
  return { usuario, auth: { currentUser: usuario }, fetch: vi.fn() };
});
vi.mock('../firebase', () => ({ auth }));
vi.stubEnv('VITE_API_URL', 'http://api.teste/');
vi.stubGlobal('fetch', fetch);

const {
  ErroDaApi,
  MENSAGEM_SEM_API,
  MENSAGEM_SESSAO_ENCERRADA,
  apiConfigurada,
  espacoPessoal,
  estornar,
  estruturaDoExtrato,
  excluir,
  lancar,
  listarLancamentos,
  listarPessoas,
  relatorioMensal,
} = await import('./livroCaixa');

function resposta(status, corpo) {
  return { ok: status >= 200 && status < 300, status, json: async () => corpo };
}

describe('API do livro-caixa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.currentUser = usuario;
    usuario.getIdToken.mockResolvedValue('token-do-firebase');
  });

  it('fica ligada quando VITE_API_URL está preenchida', () => {
    expect(apiConfigurada).toBe(true);
  });

  it('manda o ID token do Firebase no cabeçalho Authorization', async () => {
    fetch.mockResolvedValue(resposta(200, [{ id: 'e1', tipo: 'PF' }]));

    const espaco = await espacoPessoal();

    expect(espaco).toEqual({ id: 'e1', tipo: 'PF' });
    expect(fetch).toHaveBeenCalledWith('http://api.teste/espacos', {
      method: 'GET',
      headers: { Authorization: 'Bearer token-do-firebase' },
      body: undefined,
    });
  });

  it('envia o corpo em JSON no POST', async () => {
    fetch.mockResolvedValue(resposta(201, { id: 'l1' }));

    await lancar('e1', { tipo: 'DESPESA', valor_centavos: 21437 });

    const [url, opcoes] = fetch.mock.calls[0];
    expect(url).toBe('http://api.teste/espacos/e1/lancamentos');
    expect(opcoes.method).toBe('POST');
    expect(opcoes.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opcoes.body)).toEqual({ tipo: 'DESPESA', valor_centavos: 21437 });
  });

  it('monta o filtro de período e codifica os ids na URL', async () => {
    fetch.mockResolvedValue(resposta(200, []));

    await listarLancamentos('e/1', { de: '2026-09-01', ate: '2026-09-30' });
    await estornar('e1', 'l?1');

    expect(fetch.mock.calls[0][0]).toBe('http://api.teste/espacos/e%2F1/lancamentos?limite=1000&de=2026-09-01&ate=2026-09-30');
    expect(fetch.mock.calls[1][0]).toBe('http://api.teste/espacos/e1/lancamentos/l%3F1/estorno');
  });

  it('exclui com DELETE e aceita a resposta 204 sem corpo', async () => {
    fetch.mockResolvedValue({ ok: true, status: 204, json: async () => Promise.reject(new SyntaxError('sem corpo')) });

    await expect(excluir('e1', 'l1')).resolves.toBeNull();
    expect(fetch.mock.calls[0][0]).toBe('http://api.teste/espacos/e1/lancamentos/l1');
    expect(fetch.mock.calls[0][1].method).toBe('DELETE');
  });

  it('busca as pessoas e a estrutura do extrato', async () => {
    fetch.mockResolvedValue(resposta(200, []));

    await listarPessoas('e1');
    await estruturaDoExtrato('e1', { csv: 'a;b', delimitador: ';' });

    expect(fetch.mock.calls[0][0]).toBe('http://api.teste/espacos/e1/pessoas');
    expect(fetch.mock.calls[1][0]).toBe('http://api.teste/espacos/e1/importacoes/estrutura');
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ csv: 'a;b', delimitador: ';' });
  });

  it('transforma o Problem Details em ErroDaApi com o erro de cada campo', async () => {
    fetch.mockResolvedValue(
      resposta(400, { status: 400, detail: 'Um ou mais campos são inválidos.', campos: { categoria_id: 'Categoria não encontrada.' } }),
    );

    const falha = lancar('e1', {}).catch((erro) => erro);

    await expect(falha).resolves.toBeInstanceOf(ErroDaApi);
    await expect(falha).resolves.toMatchObject({
      status: 400,
      message: 'Um ou mais campos são inválidos.',
      campos: { categoria_id: 'Categoria não encontrada.' },
    });
  });

  it('401 vira pedido para entrar de novo', async () => {
    fetch.mockResolvedValue(resposta(401, { detail: 'Sessão inválida ou expirada. Entre de novo.' }));

    await expect(espacoPessoal()).rejects.toMatchObject({ status: 401, message: MENSAGEM_SESSAO_ENCERRADA });
  });

  it('sem resposta do servidor, avisa que a API pode estar fora do ar', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(espacoPessoal()).rejects.toMatchObject({ status: 0, message: MENSAGEM_SEM_API });
  });

  it('sem sessão no Firebase, nem chama a API', async () => {
    auth.currentUser = null;

    await expect(espacoPessoal()).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('pede o relatório mensal com o período só quando ele vem', async () => {
    fetch.mockResolvedValue(resposta(200, { meses: [] }));

    await relatorioMensal('e1');
    await relatorioMensal('e1', { de: '2026-04', ate: '2026-09' });

    expect(fetch.mock.calls[0][0]).toBe('http://api.teste/espacos/e1/relatorios/mensal');
    expect(fetch.mock.calls[1][0]).toBe('http://api.teste/espacos/e1/relatorios/mensal?de=2026-04&ate=2026-09');
  });
});
