import type { PessoaDaFamilia } from '../regras/espacos';
import { TITULAR, TODOS } from '../regras/familia';

interface Props {
  pessoas: readonly PessoaDaFamilia[];
  valor: string;
  aoMudar: (valor: string) => void;
  rotulo?: string;
  className?: string;
}

// Filtro "de quem" do Modo Família: a casa toda (visão consolidada), o
// titular ("Você") ou uma pessoa da família, cada uma com a cor dela. São
// abas (um botão pressionado por vez), como os outros filtros do app; a cor
// só ajuda a achar, o nome está sempre escrito.
export default function FiltroDePessoa({ pessoas, valor, aoMudar, rotulo = 'De quem', className = '' }: Props) {
  const opcoes = [
    { id: TODOS, nome: 'Todos', cor: null },
    { id: TITULAR, nome: 'Você', cor: 'titular' },
    ...pessoas.map((pessoa) => ({ id: pessoa.id, nome: pessoa.nome, cor: pessoa.cor })),
  ];
  return (
    <div className={`abas filtro-de-pessoa ${className}`.trim()} role="group" aria-label={rotulo}>
      {opcoes.map((opcao) => (
        <button key={opcao.id} type="button" aria-pressed={valor === opcao.id} onClick={() => aoMudar(opcao.id)}>
          {opcao.cor && <span className={`ponto-de-pessoa ${opcao.cor}`} aria-hidden="true" />}
          <span className="filtro-de-pessoa-nome">{opcao.nome}</span>
        </button>
      ))}
    </div>
  );
}
