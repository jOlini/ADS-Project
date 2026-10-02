import Icone from './Icone';
import SeletorJs from './Seletor';
import { propsDaMascara } from './mascara';
import { semTipos } from './semTipos';
import { nomeDoMes } from '../regras/calendario';
import { mesDaReferencia } from '../regras/cartoes';
import { formatarData } from '../regras/datas';
import { formatarComSinal } from '../regras/dinheiro';
import {
  ajustar,
  alternarDescarte,
  descartada,
  editavel,
  opcoesDaCategoria,
  ROTULO_DA_ORIGEM_DA_CATEGORIA,
  ROTULO_DA_SITUACAO,
  TAMANHO_MAXIMO_DA_DESCRICAO,
  tipoDaLinha,
  valoresDaLinha,
  type Ajustes,
  type Categoria,
  type LinhaDaResposta,
} from '../regras/importacao';

const Seletor = semTipos(SeletorJs);

interface Props {
  linhas: LinhaDaResposta[];
  categorias: Categoria[];
  ajustes: Ajustes;
  erros: Record<string, string>;
  ocupado: boolean;
  aoAjustar: (ajustes: Ajustes) => void;
  // Por que a linha já vem descartada (sugestoesDeDescarte), pelo número dela.
  sugestoes?: Readonly<Record<number, string>>;
  // "+ Nova categoria" na lista da linha: quem usa abre o submodal.
  aoNovaCategoria?: (linha: LinhaDaResposta) => void;
}

// Valor da opção "+ Nova categoria" no seletor (nunca vira ajuste).
const NOVA_CATEGORIA = '__nova__';

// Tabela da conferência da importação: cada linha do arquivo com o que vai
// ser gravado. Na linha nova, a descrição e a categoria se editam ali mesmo,
// antes de importar; a categoria vem sugerida pela API, com a pista de onde
// ela veio (do arquivo, como antes, pela descrição, padrão), e a lista dela
// termina em "+ Nova categoria", que cria a categoria sem sair daqui. Cada
// linha nova pode ser descartada (o pagamento da fatura anterior, que
// entraria em dobro, já vem descartado, com o motivo). Linha já importada ou
// com erro aparece só para leitura, com o motivo.
export default function ConferenciaDaImportacao({
  linhas,
  categorias,
  ajustes,
  erros,
  ocupado,
  aoAjustar,
  sugestoes = {},
  aoNovaCategoria,
}: Props) {
  const nomeDaCategoria = new Map(categorias.map((categoria) => [categoria.id, categoria.nome]));

  return (
    <div className="conferencia-da-importacao" role="region" aria-label="Lançamentos do arquivo" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">Data</th>
            <th scope="col">Descrição</th>
            <th scope="col">Categoria</th>
            <th scope="col" className="numero">
              Valor
            </th>
            <th scope="col">
              <span className="apenas-leitor">Descartar</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha) => {
            const { descricao, categoria_id: categoriaId } = valoresDaLinha(linha, ajustes);
            const fora = descartada(ajustes, linha);
            const ajustada = Boolean(ajustes[linha.linha]) && !fora;
            const erro = erros[`linha-${linha.linha}`];
            const origem = ajustes[linha.linha]?.categoria_id ? 'AJUSTE' : linha.origem_da_categoria;
            const rotulo = linha.descricao ?? `Linha ${linha.linha}`;
            const travada = ocupado || fora;
            return (
              <tr
                key={linha.linha}
                className={`situacao-${linha.situacao.toLowerCase()}${ajustada ? ' ajustada' : ''}${fora ? ' descartada' : ''}`}
              >
                <td className="data" data-rotulo="Data">
                  {linha.data ? formatarData(linha.data) : `Linha ${linha.linha}`}
                  {linha.fatura && <small>fatura de {nomeDoMes(mesDaReferencia(linha.fatura))}</small>}
                </td>
                <td className="descricao" data-rotulo="Descrição">
                  {editavel(linha) ? (
                    <input
                      name={`linha-${linha.linha}-descricao`}
                      aria-label={`Descrição da linha ${linha.linha}`}
                      aria-invalid={Boolean(erro)}
                      maxLength={TAMANHO_MAXIMO_DA_DESCRICAO}
                      value={descricao}
                      disabled={travada}
                      {...propsDaMascara('texto', {
                        onChange: (evento) => aoAjustar(ajustar(ajustes, linha, 'descricao', evento.target.value)),
                      })}
                    />
                  ) : (
                    <span className="texto">{rotulo}</span>
                  )}
                  {(erro || linha.erro) && (
                    <small className="erro-do-campo">
                      <Icone nome="alerta" tamanho={14} />
                      {erro || linha.erro}
                    </small>
                  )}
                  {linha.observacao && <small className="observacao-da-linha">{linha.observacao}</small>}
                  {fora && sugestoes[linha.linha] && <small className="motivo-do-descarte">{sugestoes[linha.linha]}</small>}
                </td>
                <td className="categoria" data-rotulo="Categoria">
                  {editavel(linha) ? (
                    <>
                      <Seletor
                        name={`linha-${linha.linha}-categoria`}
                        aria-label={`Categoria de ${descricao || rotulo}`}
                        value={categoriaId}
                        opcoes={[
                          ...opcoesDaCategoria(categorias, tipoDaLinha(linha)),
                          ...(aoNovaCategoria ? [{ valor: NOVA_CATEGORIA, rotulo: '+ Nova categoria', descricao: 'Criar sem sair da conferência' }] : []),
                        ]}
                        disabled={travada}
                        onChange={(evento: { target: { value: string } }) =>
                          evento.target.value === NOVA_CATEGORIA
                            ? aoNovaCategoria?.(linha)
                            : aoAjustar(ajustar(ajustes, linha, 'categoria_id', evento.target.value))
                        }
                      />
                      {origem && (
                        <small className={`origem-da-categoria origem-${origem.toLowerCase()}`}>
                          {ROTULO_DA_ORIGEM_DA_CATEGORIA[origem]}
                        </small>
                      )}
                    </>
                  ) : (
                    <span className="texto">
                      {linha.situacao === 'INVALIDA' ? '—' : (nomeDaCategoria.get(categoriaId) ?? '—')}
                      <small>{ROTULO_DA_SITUACAO[linha.situacao]}</small>
                    </span>
                  )}
                </td>
                <td className={`valor numero${(linha.valor_centavos ?? 0) > 0 ? ' entrada' : ''}`} data-rotulo="Valor">
                  {linha.valor_centavos == null ? '' : formatarComSinal(linha.valor_centavos)}
                </td>
                <td className="acao-da-linha">
                  {editavel(linha) && (
                    <button
                      type="button"
                      className="botao-icone"
                      aria-pressed={fora}
                      aria-label={fora ? `Voltar ${descricao || rotulo} para a importação` : `Descartar ${descricao || rotulo}`}
                      title={fora ? 'Voltar para a importação' : 'Descartar esta linha'}
                      disabled={ocupado}
                      onClick={() => aoAjustar(alternarDescarte(ajustes, linha))}
                    >
                      <Icone nome={fora ? 'estornar' : 'excluir'} tamanho={16} />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
