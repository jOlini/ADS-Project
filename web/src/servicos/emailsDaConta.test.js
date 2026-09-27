// Testes dos pedidos de e-mail à API: o fetch é um dublê. O que importa é
// quando a API assume o envio (true) e quando o Firebase precisa assumir (false).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { fetch } = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.stubEnv('VITE_API_URL', 'http://api.teste/');
vi.stubGlobal('fetch', fetch);

const { MUITOS_PEDIDOS, linkDeConfirmacaoPelaApi, linkDeNovaSenhaPelaApi } = await import('./emailsDaConta');

const resposta = (status) => ({ ok: status >= 200 && status < 300, status });
const usuario = { getIdToken: vi.fn() };

describe('pedidos de e-mail à API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuario.getIdToken.mockResolvedValue('token-do-firebase');
  });

  it('manda o link de confirmação com o ID token da conta', async () => {
    fetch.mockResolvedValue(resposta(202));

    await expect(linkDeConfirmacaoPelaApi(usuario)).resolves.toBe(true);

    const [url, opcoes] = fetch.mock.calls[0];
    expect(url).toBe('http://api.teste/conta/confirmacao');
    expect(opcoes.method).toBe('POST');
    expect(opcoes.headers.Authorization).toBe('Bearer token-do-firebase');
  });

  it('pede a senha nova só com o e-mail, sem token', async () => {
    fetch.mockResolvedValue(resposta(202));

    await expect(linkDeNovaSenhaPelaApi('ana@exemplo.com')).resolves.toBe(true);

    const [url, opcoes] = fetch.mock.calls[0];
    expect(url).toBe('http://api.teste/conta/nova-senha');
    expect(JSON.parse(opcoes.body)).toEqual({ email: 'ana@exemplo.com' });
    expect(opcoes.headers.Authorization).toBeUndefined();
  });

  it.each([
    ['sem provedor de e-mail (503)', 503],
    ['API antiga, sem a rota (404)', 404],
    ['erro inesperado (500)', 500],
  ])('devolve false para o Firebase assumir: %s', async (_, status) => {
    fetch.mockResolvedValue(resposta(status));

    await expect(linkDeNovaSenhaPelaApi('ana@exemplo.com')).resolves.toBe(false);
  });

  it('devolve false com a API fora do ar', async () => {
    fetch.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(linkDeConfirmacaoPelaApi(usuario)).resolves.toBe(false);
  });

  it('recusa sem cair no Firebase quando a API limita os pedidos', async () => {
    fetch.mockResolvedValue(resposta(429));

    await expect(linkDeNovaSenhaPelaApi('ana@exemplo.com')).rejects.toMatchObject({ code: MUITOS_PEDIDOS });
  });

  it('e-mail recusado pela API vira o erro de e-mail inválido', async () => {
    fetch.mockResolvedValue(resposta(400));

    await expect(linkDeNovaSenhaPelaApi('nao-e-email')).rejects.toMatchObject({ code: 'auth/invalid-email' });
  });
});
