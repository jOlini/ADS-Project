// Testes unitários da regra de login.
//
// "Unitário" = testa uma unidade isolada de código, sem banco, sem rede,
// sem navegador. Somativa 2 de DevOps pede pelo menos cinco testes unitários, 
// rodando a cada commit numa pull request.
//
// Estrutura de cada teste (padrão Arrange-Act-Assert):
// preparar os dados  ->  executar  ->  verificar o resultado
// Aqui os três passos cabem numa linha só, porque a função é simples.

import { describe, expect, it } from 'vitest';
import {
  MENSAGEM_ERRO,
  MENSAGEM_SUCESSO,
  validarCredenciais,
} from './validacao';

// Credencial fictícia. Nenhum dado pessoal real entra no repositório:
// regra do CONTRIBUTING.md, derivada do item 4, inciso III das diretrizes
// da PUCPR e da LGPD.
const CREDENCIAL = {
  email: 'usuario@pessoalfinance.com',
  senha: 'financeiro123',
};

describe('validarCredenciais', () => {
  it('recusa o acesso quando o e-mail está vazio', () => {
    const mensagem = validarCredenciais('', CREDENCIAL.senha, CREDENCIAL);

    expect(mensagem).toBe(MENSAGEM_ERRO);
  });

  it('recusa o acesso quando o e-mail não tem arroba', () => {
    const mensagem = validarCredenciais(
      'usuario.pessoalfinance.com',
      CREDENCIAL.senha,
      CREDENCIAL,
    );

    expect(mensagem).toBe(MENSAGEM_ERRO);
  });

  it('recusa o acesso quando a senha está incorreta', () => {
    const mensagem = validarCredenciais(
      CREDENCIAL.email,
      'senha-errada',
      CREDENCIAL,
    );

    expect(mensagem).toBe(MENSAGEM_ERRO);
  });

  it('libera o acesso quando e-mail e senha estão corretos', () => {
    const mensagem = validarCredenciais(
      CREDENCIAL.email,
      CREDENCIAL.senha,
      CREDENCIAL,
    );

    expect(mensagem).toBe(MENSAGEM_SUCESSO);
  });

  it('usa exatamente as mensagens exigidas pelo enunciado', () => {
    expect(MENSAGEM_SUCESSO).toBe('Acessado com sucesso!');
    expect(MENSAGEM_ERRO).toBe('Usuário ou senha incorretos!');
  });
});
