import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import AvisoApi from '../componentes/AvisoApi';
import Esqueleto from '../componentes/Esqueleto';
import GraficoMensal from '../componentes/GraficoMensal';
import Icone from '../componentes/Icone';
import { useCarga } from '../componentes/useCarga';
import { formatarBRL, formatarComSinal } from '../regras/dinheiro';
import { hojeIso } from '../regras/datas';
import {
  larguraDaBarra,
  nomeDoMes,
  PERIODO_PADRAO,
  PERIODOS,
  periodoDoFiltro,
  rotuloDoMes,
  totaisDoPeriodo,
} from '../regras/relatorios';
import { apiConfigurada, relatorioCategorias, relatorioMensal } from '../servicos/livroCaixa';
import '../estilos/relatorios.css';

async function carregarRelatorios(espacoId, periodo) {
  const [mensal, categorias] = await Promise.all([relatorioMensal(espacoId, periodo), relatorioCategorias(espacoId, periodo)]);
  return { mensal, categorias };
}

function Numero({ rotulo, icone, valor, rodape, className = '' }) {
  return (
    <article className={`of-kpi ${className}`.trim()}>
      <p className="of-kpi-rotulo">
        <span className={`of-kpi-icone ${icone}`} aria-hidden="true">
          <Icone nome={icone} tamanho={18} />
        </span>
        {rotulo}
      </p>
      <p className="of-kpi-valor">{valor}</p>
      <p className="of-kpi-rodape">{rodape}</p>
    </article>
  );
}

// Gasto por categoria: uma linha por categoria, do maior para o menor, com o
// nome, a barra (uma cor só: o comprimento é a leitura), o valor e a fatia
// escritos ao lado. A lista é a própria tabela: nada fica só na cor.
function Categorias({ dados }) {
  const maior = dados.categorias[0]?.valor_centavos ?? 0;
  if (dados.categorias.length === 0) {
    return <p className="rel-vazio-curto">Nenhuma despesa neste período.</p>;
  }
  return (
    <ol className="rel-categorias" aria-label="Gasto por categoria, do maior para o menor">
      {dados.categorias.map((categoria) => (
        <li key={categoria.categoria_id}>
          <span className="rel-categoria-nome">
            <span className="ponto-de-cor" style={{ '--cor-do-ponto': `var(--cat-${categoria.cor ?? 'neutro'})` }} aria-hidden="true" />
            {categoria.nome}
          </span>
          <span className="rel-barra" aria-hidden="true">
            <i style={{ '--largura': `${larguraDaBarra(categoria.valor_centavos, maior)}%` }} />
          </span>
          <b className="rel-categoria-valor">{formatarBRL(categoria.valor_centavos)}</b>
          <span className="rel-categoria-fatia">{categoria.fatia}%</span>
        </li>
      ))}
    </ol>
  );
}

// Tela Relatórios (release 0.3): como os meses se comparam e para onde o
// dinheiro foi, no período escolhido na linha de filtros. Os números vêm da
// API (agregados no banco, DOCS_API.md parte 7), com as mesmas regras do
// resumo do mês: compra no cartão conta no mês da parcela, pagamento de
// fatura e transferência não contam.
export default function Relatorios() {
  const { espaco } = useOutletContext();
  const [filtro, setFiltro] = useState(PERIODO_PADRAO);
  const [hoje] = useState(hojeIso);
  const periodo = periodoDoFiltro(filtro, hoje);

  const espacoId = espaco.dados?.id;
  const buscar = useMemo(
    () => (apiConfigurada && espacoId ? () => carregarRelatorios(espacoId, periodoDoFiltro(filtro, hoje)) : null),
    [espacoId, filtro, hoje],
  );
  const relatorios = useCarga(buscar);

  if (!apiConfigurada) {
    return (
      <div className="of-visao rel">
        <header className="of-cabecalho">
          <div>
            <h1>Relatórios</h1>
            <p>Como os meses se comparam e para onde o dinheiro foi.</p>
          </div>
        </header>
        <AvisoApi />
      </div>
    );
  }

  if (espaco.carregando || (espacoId && !relatorios.dados && !relatorios.erro)) {
    return <Esqueleto />;
  }

  const erro = espaco.erro || relatorios.erro?.message;
  const dados = relatorios.dados;
  const meses = dados?.mensal.meses ?? [];
  const totais = totaisDoPeriodo(meses);
  const semMovimento = meses.every((mes) => mes.receitas_centavos === 0 && mes.despesas_centavos === 0);
  const trecho = `${nomeDoMes(periodo.de)} a ${nomeDoMes(periodo.ate)}`;

  return (
    <div className="of-visao rel">
      <header className="of-cabecalho">
        <div>
          <h1>Relatórios</h1>
          <p>Como os meses se comparam e para onde o dinheiro foi.</p>
        </div>
      </header>

      {/* Filtros numa linha só, acima de tudo o que eles mudam. */}
      <div className="rel-filtros">
        <div className="abas" role="group" aria-label="Período dos relatórios">
          {PERIODOS.map((opcao) => (
            <button key={opcao.id} type="button" aria-pressed={filtro === opcao.id} onClick={() => setFiltro(opcao.id)}>
              {opcao.rotulo}
            </button>
          ))}
        </div>
        <p className="rel-trecho">
          <Icone nome="calendario" tamanho={16} />
          <span>{trecho}</span>
        </p>
      </div>

      {erro && (
        <p className="mensagem erro" role="alert">
          <Icone nome="alerta" tamanho={16} />
          Não foi possível carregar os relatórios: {erro}
          <button type="button" className="secundario compacto" onClick={relatorios.recarregar}>
            Tentar de novo
          </button>
        </p>
      )}

      {dados && (
        // Ao trocar o período, os números antigos ficam na tela, esmaecidos,
        // até os novos chegarem: nada pisca nem muda de lugar.
        <div className={`rel-conteudo${relatorios.carregando ? ' atualizando' : ''}`} aria-busy={relatorios.carregando}>
          <section className="of-kpis rel-numeros" aria-label="Números do período">
            <Numero rotulo="Receitas" icone="entrada" valor={formatarBRL(totais.receitas)} rodape={`${meses.length} meses somados`} />
            <Numero rotulo="Despesas" icone="saida" valor={formatarBRL(totais.despesas)} rodape={`Média de ${formatarBRL(totais.mediaDeDespesas)} por mês`} />
            <Numero
              rotulo="Sobra"
              icone="crescimento"
              valor={formatarComSinal(totais.sobra)}
              rodape={totais.sobra >= 0 ? 'Entrou mais do que saiu' : 'Saiu mais do que entrou'}
              className={totais.sobra < 0 ? 'negativo' : ''}
            />
          </section>

          {semMovimento ? (
            <section className="cartao vazio rel-vazio">
              <span className="simbolo" aria-hidden="true">
                <Icone nome="relatorios" tamanho={20} />
              </span>
              <h3>Nenhum lançamento neste período</h3>
              <p>Os relatórios aparecem assim que houver receitas ou despesas lançadas entre {trecho}.</p>
              <Link to="/lancamentos" className="botao">
                <Icone nome="mais" tamanho={16} />
                Lançar agora
              </Link>
            </section>
          ) : (
            <div className="of-grade rel-grade">
              <section className="cartao of-painel rel-painel" aria-labelledby="titulo-mensal">
                <div className="of-painel-cabecalho">
                  <h2 id="titulo-mensal">Receitas e despesas por mês</h2>
                  <ul className="rel-legenda" aria-label="Legenda">
                    <li>
                      <i className="chave receita" aria-hidden="true" />
                      Receitas
                    </li>
                    <li>
                      <i className="chave despesa" aria-hidden="true" />
                      Despesas
                    </li>
                    <li>
                      <i className="chave sobra" aria-hidden="true" />
                      Sobra
                    </li>
                  </ul>
                </div>
                <GraficoMensal meses={meses} descricao={`Receitas, despesas e sobra de cada mês, de ${trecho}`} />
                <details className="rel-tabela">
                  <summary>
                    <Icone nome="colunas" tamanho={16} />
                    Ver os números em tabela
                  </summary>
                  <div className="rel-tabela-rolagem">
                    <table>
                      <caption className="apenas-leitor">Receitas, despesas, sobra e saldo no fim de cada mês</caption>
                      <thead>
                        <tr>
                          <th scope="col">Mês</th>
                          <th scope="col">Receitas</th>
                          <th scope="col">Despesas</th>
                          <th scope="col">Sobra</th>
                          <th scope="col">Saldo no fim</th>
                        </tr>
                      </thead>
                      <tbody>
                        {meses.map((mes) => (
                          <tr key={mes.mes}>
                            <th scope="row">{rotuloDoMes(mes.mes, { comAno: true })}</th>
                            <td>{formatarBRL(mes.receitas_centavos)}</td>
                            <td>{formatarBRL(mes.despesas_centavos)}</td>
                            <td className={mes.sobra_centavos < 0 ? 'negativo' : undefined}>{formatarComSinal(mes.sobra_centavos)}</td>
                            <td>{formatarBRL(mes.saldo_final_centavos)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </section>

              <section className="cartao of-painel rel-painel" aria-labelledby="titulo-categorias">
                <div className="of-painel-cabecalho">
                  <h2 id="titulo-categorias">Para onde foi</h2>
                  <small>{formatarBRL(dados.categorias.total_centavos)} em despesas</small>
                </div>
                <Categorias dados={dados.categorias} />
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
