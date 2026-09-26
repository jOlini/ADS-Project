import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { iconeDaLinha } from '../olifine/regras/icones';
import { TRACOS } from './tracosDosIcones';

// Todos os .js e .jsx do app (menos os testes), para achar os nomes de
// ícone escritos no código.
function arquivosDoApp(pasta) {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) {
      return arquivosDoApp(caminho);
    }
    return /\.jsx?$/.test(nome) && !nome.includes('.test.') ? [caminho] : [];
  });
}

describe('ícones da OliFine', () => {
  it('todo nome de ícone escrito nas telas tem desenho', () => {
    const raiz = join(import.meta.dirname, '..');
    const usados = new Set();
    for (const arquivo of arquivosDoApp(raiz)) {
      const texto = readFileSync(arquivo, 'utf8');
      // <Icone nome="x" />, { icone: 'x' } e icone="x" (props de aviso e menu).
      for (const [, nome] of texto.matchAll(/<Icone\b[^>]*?\bnome="([a-z][a-zA-Z]*)"/g)) {
        usados.add(nome);
      }
      for (const [, nome] of texto.matchAll(/\bicone(?:=|: )["']([a-z][a-zA-Z]*)["']/g)) {
        usados.add(nome);
      }
      // Pares [ícone, rótulo] das listas da landing.
      if (texto.includes('<Icone')) {
        for (const [, nome] of texto.matchAll(/\[\s*'([a-z][a-zA-Z]*)',\s*'[A-ZÀ-Ú][^']*'\s*\]/g)) {
          usados.add(nome);
        }
      }
    }
    expect(usados.size).toBeGreaterThan(20);
    const semDesenho = [...usados].filter((nome) => !TRACOS[nome]);
    expect(semDesenho).toEqual([]);
  });

  it('toda linha do extrato ganha um ícone que existe', () => {
    const cores = ['moradia', 'mercado', 'transporte', 'casa', 'saude', 'lazer', 'entrada', 'neutro', 'desconhecida'];
    const linhas = [
      { estorno: true, valor: 100 },
      { tipo: 'transferencia', valor: -100 },
      { tipo: 'pagamento', valor: -100 },
      { valor: 100 },
      ...cores.map(() => ({ valor: -100 })),
    ];
    const nomes = [...linhas.map((linha) => iconeDaLinha(linha, 'neutro')), ...cores.map((cor) => iconeDaLinha({ valor: -1 }, cor))];
    expect(nomes.filter((nome) => !TRACOS[nome])).toEqual([]);
  });
});
