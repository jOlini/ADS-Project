import { useId, useState } from 'react';
import Icone from './Icone';
import { formatarBRL } from '../regras/dinheiro';
import { MAXIMO_DE_PESSOAS, parteVazia, pessoasParaSugerir, repartirIgualmente, somaDaDivisao } from '../regras/divisao';

// Racha dentro do formulário de lançamento: cada pessoa com o nome e a parte
// dela, num campo que a pessoa ajusta à vontade (churrasco de R$ 300: Ana
// 100, Bruno 150, Carla 50). "Dividir igualmente" preenche as partes de uma
// vez, contando ou não com a parte de quem lançou; o que as partes não
// cobrem aparece como "Sua parte". Os inputs usam o name "divisao.N.campo",
// o mesmo da validação, para o foco ir ao primeiro erro.
export default function DivisaoEntrePessoas({ partes, aoMudar, total, erros = {}, pessoasConhecidas = [] }) {
  const idDoTitulo = useId();
  const [comMinhaParte, setComMinhaParte] = useState(true);
  const soma = somaDaDivisao(partes);
  const sobra = total === null ? null : total - soma;
  const sugestoes = pessoasParaSugerir(pessoasConhecidas, partes);
  const cheia = partes.length >= MAXIMO_DE_PESSOAS;

  function mudarParte(indice, campo, valor) {
    aoMudar(partes.map((parte, atual) => (atual === indice ? { ...parte, [campo]: valor } : parte)), `divisao.${indice}.${campo}`);
  }

  function adicionar(pessoa = '') {
    if (!cheia) {
      aoMudar([...partes, parteVazia(pessoa)], 'divisao');
    }
  }

  function remover(indice) {
    aoMudar(partes.filter((_, atual) => atual !== indice), 'divisao');
  }

  return (
    <fieldset className="divisao" aria-labelledby={idDoTitulo}>
      <div className="cabecalho-da-divisao">
        <p id={idDoTitulo} className="titulo-da-divisao">
          <Icone nome="pessoas" tamanho={16} />
          Dividir com pessoas
        </p>
        {partes.length > 0 && (
          <button type="button" className="discreto-botao" disabled={!total} onClick={() => aoMudar(repartirIgualmente(partes, total, { comMinhaParte }), 'divisao')}>
            Dividir igualmente
          </button>
        )}
      </div>

      {partes.length === 0 ? (
        <p className="dica-do-campo">Racha: diga quanto cabe a cada pessoa. O que sobrar é a sua parte.</p>
      ) : (
        <>
          <ul className="partes">
            {partes.map((parte, indice) => {
              const erroDaPessoa = erros[`divisao.${indice}.pessoa`];
              const erroDoValor = erros[`divisao.${indice}.valor`];
              return (
                // A posição é a identidade da parte: os campos são
                // controlados (o texto vem do estado), então tirar uma linha
                // do meio não troca o que aparece nas outras.
                <li key={indice} className="parte">
                  <input
                    name={`divisao.${indice}.pessoa`}
                    aria-label={`Nome da pessoa ${indice + 1}`}
                    aria-invalid={Boolean(erroDaPessoa)}
                    placeholder="Nome"
                    autoComplete="off"
                    maxLength={60}
                    value={parte.pessoa}
                    onChange={(evento) => mudarParte(indice, 'pessoa', evento.target.value)}
                  />
                  <input
                    name={`divisao.${indice}.valor`}
                    aria-label={`Parte de ${parte.pessoa.trim() || `pessoa ${indice + 1}`} (R$)`}
                    aria-invalid={Boolean(erroDoValor)}
                    inputMode="decimal"
                    placeholder="0,00"
                    autoComplete="off"
                    value={parte.valor}
                    onChange={(evento) => mudarParte(indice, 'valor', evento.target.value)}
                  />
                  <button type="button" className="botao-icone" onClick={() => remover(indice)}
                    aria-label={`Tirar ${parte.pessoa.trim() || `a pessoa ${indice + 1}`} da divisão`}>
                    <Icone nome="fechar" tamanho={16} />
                  </button>
                  {(erroDaPessoa || erroDoValor) && (
                    <span className="erro-do-campo" role="alert">
                      {[erroDaPessoa, erroDoValor].filter(Boolean).join(' ')}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>

          <label className="caixa-de-marcar compacta">
            <input type="checkbox" checked={comMinhaParte} onChange={(evento) => setComMinhaParte(evento.target.checked)} />
            <span>
              <b>Contar a minha parte na divisão igual</b>
            </span>
          </label>

          <p className={`resumo-da-divisao${sobra !== null && sobra < 0 ? ' passou' : ''}`} aria-live="polite">
            <span>
              Partes <b>{formatarBRL(soma)}</b>
            </span>
            {sobra !== null && (
              <span>
                {sobra < 0 ? 'Passou do total em' : 'Sua parte'} <b>{formatarBRL(Math.abs(sobra))}</b>
              </span>
            )}
          </p>
        </>
      )}

      {erros.divisao && (
        <span className="erro-do-campo" role="alert">
          {erros.divisao}
        </span>
      )}

      <div className="acoes-da-divisao">
        <button type="button" className="secundario compacto" onClick={() => adicionar()} disabled={cheia}>
          <Icone nome="mais" tamanho={16} />
          Adicionar pessoa
        </button>
        {sugestoes.map((nome) => (
          <button key={nome} type="button" className="sugestao" onClick={() => adicionar(nome)} disabled={cheia}
            aria-label={`Adicionar ${nome} à divisão`}>
            <Icone nome="mais" tamanho={14} />
            {nome}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
