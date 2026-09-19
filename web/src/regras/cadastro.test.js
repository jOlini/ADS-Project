// Testes unitários da validação do cadastro: função pura, sem Firebase,
// sem rede e sem navegador. Padrão Arrange-Act-Assert em cada teste.
import { describe, expect, it } from 'vitest';
import { validarCadastro } from './cadastro';

// Dados fictícios: nenhum dado pessoal real entra no repositório público.
const VALIDO = {
  email: 'maria@exemplo.com',
  senha: 'segredo1',
  nome: 'Maria',
  sobrenome: 'Silva',
  dataNascimento: '2000-05-10',
};

// "Hoje" fixo para o teste não mudar de resultado com o passar do tempo.
const HOJE = new Date(2026, 8, 18);

describe('validarCadastro', () => {
  it('aceita um formulário completo e válido', () => {
    expect(validarCadastro(VALIDO, HOJE)).toEqual({});
  });

  it('exige os cinco campos', () => {
    const erros = validarCadastro(
      { email: '', senha: '', nome: '  ', sobrenome: '', dataNascimento: '' },
      HOJE,
    );

    expect(Object.keys(erros).sort()).toEqual(['dataNascimento', 'email', 'nome', 'senha', 'sobrenome']);
  });

  it('recusa e-mail sem arroba ou sem domínio', () => {
    expect(validarCadastro({ ...VALIDO, email: 'maria.exemplo.com' }, HOJE).email).toBe('E-mail inválido.');
    expect(validarCadastro({ ...VALIDO, email: 'maria@exemplo' }, HOJE).email).toBe('E-mail inválido.');
  });

  it('recusa senha com menos de 6 caracteres, o mínimo do Firebase', () => {
    expect(validarCadastro({ ...VALIDO, senha: '12345' }, HOJE).senha).toMatch(/pelo menos 6/);
    expect(validarCadastro({ ...VALIDO, senha: '123456' }, HOJE).senha).toBeUndefined();
  });

  it('recusa data de nascimento no futuro', () => {
    expect(validarCadastro({ ...VALIDO, dataNascimento: '2026-09-19' }, HOJE).dataNascimento).toMatch(/futuro/);
    expect(validarCadastro({ ...VALIDO, dataNascimento: '2026-09-18' }, HOJE).dataNascimento).toBeUndefined();
  });

  it('recusa data que não existe no calendário', () => {
    expect(validarCadastro({ ...VALIDO, dataNascimento: '2023-02-30' }, HOJE).dataNascimento).toBe(
      'Data de nascimento inválida.',
    );
  });
});
