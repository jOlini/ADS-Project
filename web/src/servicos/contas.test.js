// Testes unitários do cadastro no Firebase. O SDK é substituído por dublês
// (vi.mock): o teste confere o que o código pede ao Firebase, sem rede.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({ auth: { nome: 'auth' }, db: { nome: 'db' } }));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  deleteUser: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, colecao, id) => `${colecao}/${id}`),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'horario-do-servidor'),
  setDoc: vi.fn(),
}));

const { createUserWithEmailAndPassword, deleteUser, signOut } = await import('firebase/auth');
const { setDoc } = await import('firebase/firestore');
const { cadastrar } = await import('./contas');

const FORMULARIO = {
  email: ' maria@exemplo.com ',
  senha: 'segredo1',
  nome: ' Maria ',
  sobrenome: 'Silva',
  dataNascimento: '2000-05-10',
};

describe('cadastrar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'uid-123' } });
    setDoc.mockResolvedValue(undefined);
    deleteUser.mockResolvedValue(undefined);
    signOut.mockResolvedValue(undefined);
  });

  it('cria a conta no Authentication e grava os dados com o uid no Firestore', async () => {
    await cadastrar(FORMULARIO);

    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith({ nome: 'auth' }, 'maria@exemplo.com', 'segredo1');
    expect(setDoc).toHaveBeenCalledWith('usuarios/uid-123', {
      uid: 'uid-123',
      nome: 'Maria',
      sobrenome: 'Silva',
      dataNascimento: '2000-05-10',
      criadoEm: 'horario-do-servidor',
    });
  });

  it('não grava a senha no Firestore', async () => {
    await cadastrar(FORMULARIO);

    expect(setDoc.mock.calls[0][1]).not.toHaveProperty('senha');
  });

  it('desfaz a conta criada se a gravação no Firestore falhar', async () => {
    setDoc.mockRejectedValue(Object.assign(new Error('negado'), { code: 'permission-denied' }));

    await expect(cadastrar(FORMULARIO)).rejects.toMatchObject({ code: 'permission-denied' });
    expect(deleteUser).toHaveBeenCalledWith({ uid: 'uid-123' });
  });

  it('encerra a sessão ao final para o fluxo seguir pelo login', async () => {
    await cadastrar(FORMULARIO);

    expect(signOut).toHaveBeenCalled();
  });
});
