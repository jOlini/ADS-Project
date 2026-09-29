import { useMemo, useState } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import Esqueleto from '../../componentes/Esqueleto';
import Icone from '../../componentes/Icone';
import { useCarga } from '../../componentes/useCarga';
import { hojeIso } from '../../regras/datas';
import { formatarBRL, formatarComSinal } from '../../regras/dinheiro';
import { ehEmpresa } from '../../regras/espacos';
import { intervaloDoMes, mesDe } from '../../regras/livroCaixa';
import { nomeDoMes, somarMeses } from '../../regras/relatorios';
import { apiConfigurada, listarCategorias, listarLancamentos } from '../../servicos/livroCaixa';
import SimboloDoVazio from '../componentes/SimboloDoVazio';
import { montarDre } from '../regras/empresa';
import { leituraDaVariacao, textoDaVariacao, variacaoPercentual } from '../regras/tendencia';

const periodo = (mes) => intervaloDoMes(mesDe(`${mes}-01`));

// Linhas do DRE, de cima para baixo. As de grupo abrem nas categorias; as de
// resultado (=) são a conta das anteriores. maiorEhMelhor diz a cor da
// comparação com o mês anterior.
const LINHAS = [
  { id: 'RECEITA', rotulo: 'Receita bruta', sinal: '', campo: 'receitaBruta', grupo: true },
  { id: 'DEDUCAO', rotulo: 'Impostos sobre a receita', sinal: '−', campo: 'deducoes', grupo: true, maiorEhMelhor: false },
  { id: 'liquida', rotulo: 'Receita líquida', sinal: '=', campo: 'receitaLiquida' },
  { id: 'CUSTO', rotulo: 'Custos variáveis (fornecedores, insumos)', sinal: '−', campo: 'custos', grupo: true, maiorEhMelhor: false },
  { id: 'bruto', rotulo: 'Lucro bruto', sinal: '=', campo: 'lucroBruto' },
  { id: 'DESPESA_OPERACIONAL', rotulo: 'Despesas operacionais', sinal: '−', campo: 'despesasOperacionais', grupo: true, maiorEhMelhor: false },
  { id: 'operacional', rotulo: 'Resultado operacional', sinal: '=', campo: 'resultadoOperacional' },
  { id: 'FINANCEIRO', rotulo: 'Resultado financeiro (tarifas, juros, rendimentos)', sinal: '±', campo: 'resultadoFinanceiro', grupo: true },
  { id: 'liquido', rotulo: 'Lucro líquido', sinal: '=', campo: 'lucroLiquido', destaque: true },
];

function Comparacao({ atual, anterior, maiorEhMelhor = true }) {
  const variacao = variacaoPercentual(atual, anterior);
  const leitura = leituraDaVariacao(variacao, { maiorEhMelhor });
  return leitura ? <span className={`of-tendencia ${leitura}`}>{textoDaVariacao(variacao)}</span> : <span className="of-dre-sem">—</span>;
}

// Valor e parte da receita de uma linha, com a comparação.
function Valores({ linha, dre, anterior }) {
  const valor = dre[linha.campo];
  const parte = dre.receitaBruta > 0 ? Math.round((Math.abs(valor) / dre.receitaBruta) * 100) : null;
  const comSinal = linha.sinal === '=' || linha.sinal === '±';
  return (
    <>
      <span className={`of-dre-valor${comSinal && valor < 0 ? ' negativo' : ''}`}>
        {comSinal ? formatarComSinal(valor) : formatarBRL(valor)}
      </span>
      <span className="of-dre-parte">{parte === null ? '—' : `${parte}%`}</span>
      <span className="of-dre-comparacao">
        <Comparacao atual={valor} anterior={anterior[linha.campo]} maiorEhMelhor={linha.maiorEhMelhor ?? true} />
      </span>
    </>
  );
}

// DRE simplificado do espaço de empresa: receita bruta, impostos, custos
// variáveis, despesas operacionais, resultado financeiro e lucro líquido do
// mês, com a parte de cada linha na receita e a comparação com o mês
// anterior. Cada linha de grupo abre nas categorias que a compõem (o número
// mostra de onde veio). A conta está em regras/empresa.ts. Em outro espaço, a
// tela volta à Visão geral.
export default function Dre() {
  const { espaco } = useOutletContext();
  const [hoje] = useState(hojeIso);
  const mesDeHoje = hoje.slice(0, 7);
  const [mes, setMes] = useState(mesDeHoje);
  const espacoId = espaco.dados?.id;
  const daEmpresa = ehEmpresa(espaco.dados);
  const buscar = useMemo(
    () =>
      apiConfigurada && espacoId && daEmpresa
        ? () =>
            Promise.all([
              listarCategorias(espacoId),
              listarLancamentos(espacoId, { de: periodo(somarMeses(mes, -1)).de, ate: periodo(mes).ate }),
            ]).then(([categorias, lancamentos]) => ({ categorias, lancamentos }))
        : null,
    [espacoId, daEmpresa, mes],
  );
  const livro = useCarga(buscar);

  if (!apiConfigurada || (!espaco.carregando && espaco.dados && !daEmpresa)) {
    return <Navigate to="/principal" replace />;
  }
  if (espaco.carregando || (livro.carregando && !livro.dados)) {
    return <Esqueleto />;
  }

  const erro = espaco.erro || livro.erro?.message;
  const dados = livro.dados;
  const dre = dados ? montarDre(dados.lancamentos, dados.categorias, periodo(mes)) : null;
  const anterior = dados ? montarDre(dados.lancamentos, dados.categorias, periodo(somarMeses(mes, -1))) : null;

  return (
    <div className="of-empresa">
      <header className="of-cabecalho">
        <div>
          <h1>DRE simplificado</h1>
          <p>O resultado do mês, pela data de cada lançamento: compras no cartão entram no mês da compra.</p>
        </div>
        <div className="of-cabecalho-acoes of-dre-mes" role="group" aria-label="Mês do DRE">
          <button type="button" className="botao-icone" aria-label="Mês anterior" onClick={() => setMes(somarMeses(mes, -1))}>
            <Icone nome="anterior" />
          </button>
          <b aria-live="polite">{nomeDoMes(mes)}</b>
          <button type="button" className="botao-icone" aria-label="Próximo mês" disabled={mes >= mesDeHoje}
            onClick={() => setMes(somarMeses(mes, 1))}>
            <Icone nome="proximo" />
          </button>
        </div>
      </header>

      {erro && (
        <div className="cartao painel of-erro">
          <p className="mensagem erro" role="alert">
            <Icone nome="alerta" tamanho={16} />
            {erro}
          </p>
          <button type="button" className="secundario" onClick={livro.recarregar}>
            Tentar de novo
          </button>
        </div>
      )}

      {dre && dre.lancamentos === 0 && (
        <section className="cartao vazio">
          <SimboloDoVazio icone="documento" semente={73} />
          <h3>Nenhuma receita ou despesa em {nomeDoMes(mes)}</h3>
          <p>O DRE monta as linhas pelas categorias de empresa: vendas e serviços, impostos, fornecedores, folha e as outras.</p>
          <Link to="/lancamentos" className="botao">
            <Icone nome="mais" tamanho={16} />
            Lançar agora
          </Link>
        </section>
      )}

      {dre && dre.lancamentos > 0 && (
        <>
          <section className="of-kpis of-empresa-numeros" aria-label="Resumo do mês">
            <article className="of-kpi">
              <p className="of-kpi-rotulo">
                <span className="of-kpi-icone entrada" aria-hidden="true">
                  <Icone nome="entrada" tamanho={18} />
                </span>
                Receita bruta
              </p>
              <p className="of-kpi-valor">{formatarBRL(dre.receitaBruta)}</p>
              <p className="of-kpi-rodape">
                <Comparacao atual={dre.receitaBruta} anterior={anterior.receitaBruta} />
                em relação ao mês anterior
              </p>
            </article>
            <article className="of-kpi">
              <p className="of-kpi-rotulo">
                <span className="of-kpi-icone" aria-hidden="true">
                  <Icone nome="crescimento" tamanho={18} />
                </span>
                Margem bruta
              </p>
              <p className="of-kpi-valor">{dre.margemBruta === null ? '—' : `${dre.margemBruta}%`}</p>
              <p className="of-kpi-rodape">Lucro bruto de {formatarComSinal(dre.lucroBruto)}</p>
            </article>
            <article className={`of-kpi${dre.lucroLiquido < 0 ? ' negativo' : ''}`}>
              <p className="of-kpi-rotulo">
                <span className="of-kpi-icone" aria-hidden="true">
                  <Icone nome="alvo" tamanho={18} />
                </span>
                Lucro líquido
              </p>
              <p className="of-kpi-valor">{formatarComSinal(dre.lucroLiquido)}</p>
              <p className="of-kpi-rodape">
                {dre.margemLiquida === null ? 'Sem receita no mês' : `Margem líquida de ${dre.margemLiquida}%`}
              </p>
            </article>
          </section>

          <section className="cartao of-painel" aria-labelledby="titulo-dre">
            <div className="of-painel-cabecalho">
              <h2 id="titulo-dre">Demonstrativo de {nomeDoMes(mes)}</h2>
              <small>{dre.lancamentos} lançamentos</small>
            </div>
            <div className="of-dre">
              <p className="of-dre-titulos" aria-hidden="true">
                <span>Linha</span>
                <span>Valor</span>
                <span>Da receita</span>
                <span>Mês anterior</span>
              </p>
              {LINHAS.map((linha) =>
                linha.grupo ? (
                  <details key={linha.id} className="of-dre-linha grupo">
                    <summary>
                      <span className="of-dre-rotulo">
                        <span className="of-dre-sinal" aria-hidden="true">
                          {linha.sinal}
                        </span>
                        {linha.rotulo}
                        <Icone nome="seta" tamanho={14} />
                      </span>
                      <Valores linha={linha} dre={dre} anterior={anterior} />
                    </summary>
                    {dre.grupos[linha.id].categorias.length > 0 ? (
                      <ul>
                        {dre.grupos[linha.id].categorias.map((categoria) => (
                          <li key={categoria.nome}>
                            <span>{categoria.nome}</span>
                            <span>{formatarBRL(Math.abs(categoria.valor))}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="of-discreto">Nenhum lançamento nesta linha.</p>
                    )}
                  </details>
                ) : (
                  <div key={linha.id} className={`of-dre-linha resultado${linha.destaque ? ' destaque' : ''}`}>
                    <span className="of-dre-rotulo">
                      <span className="of-dre-sinal" aria-hidden="true">
                        {linha.sinal}
                      </span>
                      {linha.rotulo}
                    </span>
                    <Valores linha={linha} dre={dre} anterior={anterior} />
                  </div>
                ),
              )}
            </div>
            <details className="of-dre-ajuda">
              <summary>Como cada categoria entra no DRE</summary>
              <p>
                Categorias de receita são receita bruta (rendimentos vão para o resultado financeiro). Impostos, DAS e
                tributos são impostos sobre a receita; fornecedores, insumos e mercadorias, custos variáveis; tarifas,
                juros e IOF, resultado financeiro; as outras despesas, operacionais. Transferências entre contas e o
                pagamento da fatura do cartão ficam de fora (a compra já entrou no mês em que foi feita).
              </p>
            </details>
          </section>
        </>
      )}
    </div>
  );
}
