import Icone from './Icone';

// Mostrado nas telas do livro-caixa quando o app foi montado sem a API
// (VITE_API_URL vazio), como a versão publicada no GitHub Pages.
export default function AvisoApi() {
  return (
    <section className="cartao vazio" role="status">
      <span className="simbolo" aria-hidden="true">
        <Icone nome="lancamentos" tamanho={20} />
      </span>
      <h3>Livro-caixa fora desta versão</h3>
      <p>
        Contas, categorias e lançamentos ficam na API da OliFine, que não está ligada a esta versão do site.
        Para usar, rode o projeto na sua máquina com <code>VITE_API_URL</code> no <code>web/.env</code> (veja o README).
      </p>
    </section>
  );
}
