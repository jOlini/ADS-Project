// Testes unitários do cadastro no Firebase. O SDK é substituído por dublês
// (vi.mock): o teste confere o que o código pede ao Firebase, sem rede.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({ auth: { nome: 'auth', currentUser: null }, db: { nome: 'db' } }));
vi.mock('./dadosLocais', () => ({ gravarJson: vi.fn(), lerJson: vi.fn(), limparDadosLocais: vi.fn() }));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  deleteUser: vi.fn(),
  onAuthStateChanged: vi.fn(),
  sendEmailVerification: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((db, colecao, id) => `${colecao}/${id}`),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(() => 'horario-do-servidor'),
  setDoc: vi.fn(),
}));

const { createUserWithEmailAndPassword, deleteUser, sendEmailVerification, signOut } = await import('firebase/auth');
const { setDoc } = await import('firebase/firestore');
const { auth } = await import('../firebase');
const { gravarJson, lerJson, limparDadosLocais } = await import('./dadosLocais');
const { cadastrar, conferirConfirmacao, reenviarConfirmacao, sair, ultimoEnvioDoLink } = await import('./contas');

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
    sendEmailVerification.mockResolvedValue(undefined);
    signOut.mockResolvedValue(undefined);
  });

  it('cria a conta no Authentication e grava os dados com o uid no Firestore', async () => {
    await cadastrar(FORMULARIO);

    expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(auth, 'maria@exemplo.com', 'segredo1');
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

  it('manda o link de confirmação do e-mail para a conta nova', async () => {
    await cadastrar(FORMULARIO);

    expect(sendEmailVerification).toHaveBeenCalledWith({ uid: 'uid-123' });
  });

  it('registra no navegador o envio do link, para o login logo depois não mandar outro', async () => {
    await cadastrar(FORMULARIO);

    expect(gravarJson).toHaveBeenCalledWith('olifine:confirmacao:uid-123', expect.any(Number));
  });

  it('conclui o cadastro mesmo se o envio do link falhar (a tela de confirmação reenvia)', async () => {
    sendEmailVerification.mockRejectedValue(Object.assign(new Error('cota'), { code: 'auth/too-many-requests' }));

    await expect(cadastrar(FORMULARIO)).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalled();
    // Sem registro, a tela de confirmação manda o link sozinha.
    expect(gravarJson).not.toHaveBeenCalled();
  });

  it('não manda link quando a gravação falhou e a conta foi desfeita', async () => {
    setDoc.mockRejectedValue(Object.assign(new Error('negado'), { code: 'permission-denied' }));

    await expect(cadastrar(FORMULARIO)).rejects.toBeDefined();
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });
});

describe('reenviarConfirmacao', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.currentUser = { uid: 'uid-123' };
  });

  it('manda o link para a conta logada e registra o envio', async () => {
    sendEmailVerification.mockResolvedValue(undefined);

    await reenviarConfirmacao();

    expect(sendEmailVerification).toHaveBeenCalledWith({ uid: 'uid-123' });
    expect(gravarJson).toHaveBeenCalledWith('olifine:confirmacao:uid-123', expect.any(Number));
  });

  it('não registra envio que o Firebase recusou', async () => {
    sendEmailVerification.mockRejectedValue(Object.assign(new Error('cota'), { code: 'auth/too-many-requests' }));

    await expect(reenviarConfirmacao()).rejects.toMatchObject({ code: 'auth/too-many-requests' });
    expect(gravarJson).not.toHaveBeenCalled();
  });

  it('lê o último envio pela chave da conta', () => {
    lerJson.mockReturnValue(123);

    expect(ultimoEnvioDoLink('uid-123')).toBe(123);
    expect(lerJson).toHaveBeenCalledWith('olifine:confirmacao:uid-123');
  });
});

describe('sair', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('encerra a sessão e apaga os dados do app no navegador', async () => {
    signOut.mockResolvedValue(undefined);

    await sair();

    expect(signOut).toHaveBeenCalled();
    expect(limparDadosLocais).toHaveBeenCalled();
  });

  it('apaga os dados do navegador mesmo quando o signOut falha', async () => {
    signOut.mockRejectedValue(Object.assign(new Error('sem rede'), { code: 'auth/network-request-failed' }));

    await expect(sair()).rejects.toBeDefined();
    expect(limparDadosLocais).toHaveBeenCalled();
  });
});

describe('conferirConfirmacao', () => {
  it('recarrega a conta e renova o token quando o e-mail foi confirmado', async () => {
    const usuario = { emailVerified: false, reload: vi.fn(), getIdToken: vi.fn() };
    usuario.reload.mockImplementation(async () => {
      usuario.emailVerified = true;
    });
    auth.currentUser = usuario;

    await expect(conferirConfirmacao()).resolves.toBe(true);
    // Token novo, já com email_verified, para a API aceitar.
    expect(usuario.getIdToken).toHaveBeenCalledWith(true);
  });

  it('continua pedindo a confirmação quando o link ainda não foi aberto', async () => {
    const usuario = { emailVerified: false, reload: vi.fn(), getIdToken: vi.fn() };
    auth.currentUser = usuario;

    await expect(conferirConfirmacao()).resolves.toBe(false);
    expect(usuario.getIdToken).not.toHaveBeenCalled();
  });

  it('sem sessão, não há o que conferir', async () => {
    auth.currentUser = null;

    await expect(conferirConfirmacao()).resolves.toBe(false);
  });
});
