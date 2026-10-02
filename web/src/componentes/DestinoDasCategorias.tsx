import { useState, type FormEvent } from 'react';
import CampoJs from './Campo';
import SeletorJs from './Seletor';
import { semTipos } from './semTipos';
import {
  destinosPossiveis,
  destinoSugerido,
  textoDosLancamentos,
  validarDestinos,
  type CategoriaDaExclusao,
  type CategoriaEmUso,
} from '../regras/exclusaoDeCategoria';

const Campo = semTipos(CampoJs);
const Seletor = semTipos(SeletorJs);

interface Props {
  emUso: readonly CategoriaEmUso[];
  categorias: readonly CategoriaDaExclusao[];
  ocupado: boolean;
  // { id da categoria em uso: id do destino }
  aoConfirmar: (destinos: Record<string, string>) => void;
  aoCancelar: () => void;
}

// Segunda etapa da exclusão (no modal): as categorias selecionadas que estão
// em lançamentos não saem sem um destino. Para cada uma, a pessoa escolhe a
// categoria que recebe os lançamentos (do mesmo tipo e ativa), já com uma
// sugestão marcada. "Mover e excluir" manda tudo para a API, que move os
// lançamentos e só então exclui (o histórico e os relatórios continuam
// somando certo). Cancelar mantém essas categorias como estão.
export default function DestinoDasCategorias({ emUso, categorias, ocupado, aoConfirmar, aoCancelar }: Props) {
  const saindo = new Set(emUso.map(({ categoria }) => categoria.id));
  const [destinos, setDestinos] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      emUso.map(({ categoria }) => [categoria.id, destinoSugerido(destinosPossiveis(categorias, categoria, saindo), categoria)]),
    ),
  );
  const [erros, setErros] = useState<Record<string, string>>({});

  function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const encontrados = validarDestinos(emUso, destinos);
    setErros(encontrados);
    if (Object.keys(encontrados).length === 0) {
      aoConfirmar(destinos);
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="destino-das-categorias">
      <p className="dica-do-campo">
        Os lançamentos passam para a categoria escolhida, com o mesmo valor e a mesma data, e então a categoria sai. Não há
        como desfazer.
      </p>
      {emUso.map(({ categoria, lancamentos }) => {
        const possiveis = destinosPossiveis(categorias, categoria, saindo);
        return (
          <Campo
            key={categoria.id}
            elemento={Seletor}
            rotulo={`${categoria.nome}: ${textoDosLancamentos(lancamentos)} vão para`}
            name={`destino-${categoria.id}`}
            placeholder={possiveis.length > 0 ? 'Escolha a categoria' : 'Nenhuma categoria do mesmo tipo'}
            opcoes={possiveis.map((outra) => ({ valor: outra.id, rotulo: outra.nome, cor: outra.cor ?? 'neutro' }))}
            value={destinos[categoria.id] ?? ''}
            disabled={ocupado || possiveis.length === 0}
            onChange={(evento: { target: { value: string } }) => {
              setDestinos((atuais) => ({ ...atuais, [categoria.id]: evento.target.value }));
              setErros((atuais) => ({ ...atuais, [categoria.id]: '' }));
            }}
            erro={
              erros[categoria.id] ||
              (possiveis.length === 0 ? `Crie outra categoria de ${categoria.tipo === 'DESPESA' ? 'despesa' : 'receita'} antes.` : '')
            }
          />
        );
      })}
      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={ocupado}>
          Cancelar
        </button>
        <button type="submit" className="perigo" disabled={ocupado} aria-busy={ocupado}>
          {ocupado ? 'Movendo…' : 'Mover e excluir'}
        </button>
      </div>
    </form>
  );
}
