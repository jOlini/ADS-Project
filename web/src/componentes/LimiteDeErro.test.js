// Error Boundary (LimiteDeErro): o ciclo de vida é conferido pelos métodos
// estáticos que o React chama, e o aviso pela marcação gerada no servidor.
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import LimiteDeErro from './LimiteDeErro';

function avisoCom(props) {
  const limite = new LimiteDeErro({ chave: '/metas', ...props });
  limite.state = { ...LimiteDeErro.getDerivedStateFromError(new Error('prazo.split is not a function')), chave: '/metas' };
  return renderToStaticMarkup(limite.render());
}

describe('LimiteDeErro', () => {
  it('guarda o erro e o esquece quando a chave muda (outra rota)', () => {
    const erro = new Error('falhou');
    const comErro = { ...LimiteDeErro.getDerivedStateFromError(erro), chave: '/metas' };
    expect(comErro.erro).toBe(erro);
    expect(LimiteDeErro.getDerivedStateFromProps({ chave: '/metas' }, comErro)).toBeNull();
    expect(LimiteDeErro.getDerivedStateFromProps({ chave: '/principal' }, comErro)).toEqual({ erro: null, chave: '/principal' });
  });

  it('sem erro, desenha os filhos', () => {
    const limite = new LimiteDeErro({ chave: '/metas', children: createElement('p', null, 'Tela') });
    expect(renderToStaticMarkup(limite.render())).toBe('<p>Tela</p>');
  });

  it('com erro, mostra o aviso sem o detalhe técnico', () => {
    const html = avisoCom({ titulo: 'Esta meta não abriu', acoes: createElement('button', null, 'Excluir esta meta') });
    expect(html).toContain('role="alert"');
    expect(html).toContain('Esta meta não abriu');
    expect(html).toContain('Tentar de novo');
    expect(html).toContain('Excluir esta meta');
    expect(html).not.toContain('prazo.split');
  });
});
