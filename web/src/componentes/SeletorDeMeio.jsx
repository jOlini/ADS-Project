import { useId } from 'react';
import { MEIOS_DE_PAGAMENTO } from '../regras/livroCaixa';

// Meio do lançamento à vista (PIX, débito, dinheiro, TED/DOC), em botões
// lado a lado como as abas do tipo. Crédito não está aqui de propósito: a
// compra no cartão entra na fatura dele. opcional acrescenta "Não informado"
// (a linha importada do extrato chega sem meio).
export default function SeletorDeMeio({ valor, aoMudar, erro, opcional = false }) {
  const id = useId();
  const opcoes = opcional ? [...MEIOS_DE_PAGAMENTO, { valor: '', rotulo: 'Não informado' }] : MEIOS_DE_PAGAMENTO;

  return (
    <div className="campo">
      <span className="rotulo-do-campo" id={`${id}-rotulo`}>
        Meio
      </span>
      <div className="abas largas meios" role="group" aria-labelledby={`${id}-rotulo`}>
        {opcoes.map((opcao, indice) => (
          <button
            key={opcao.valor || 'nenhum'}
            type="button"
            name={indice === 0 ? 'meio' : undefined}
            aria-pressed={valor === opcao.valor}
            title={opcao.descricao}
            onClick={() => aoMudar(opcao.valor)}
          >
            {opcao.rotulo}
          </button>
        ))}
      </div>
      {/* Linha reservada, como a do Campo: o erro não empurra nada. */}
      <span className="erro-do-campo">{erro}</span>
    </div>
  );
}
