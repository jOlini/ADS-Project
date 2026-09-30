import { useMemo, useState } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import Esqueleto from '../../componentes/Esqueleto';
import GraficoMensal from '../../componentes/GraficoMensal';
import Icone from '../../componentes/Icone';
import { useCarga } from '../../componentes/useCarga';
import { hojeIso } from '../../regras/datas';
import { formatarBRL, formatarComSinal } from '../../regras/dinheiro';
import { ehEmpresa } from '../../regras/espacos';
import { rotuloDoMes } from '../../regras/relatorios';
import {
  apiConfigurada,
  LIMITE_DE_LANCAMENTOS,
  listarCategorias,
  listarContas,
  listarLancamentos,
} from '../../servicos/livroCaixa';
import SimboloDoVazio from '../componentes/SimboloDoVazio';
import { fluxoDeCaixa, saldosDaEmpresa, ultimosMeses } from '../regras/empresa';
import { leituraDaVariacao, textoDaVariacao, variacaoPercentual } from '../regras/tendencia';
import '../../estilos/relatorios.css';

// Meses do gráfico e da tabela.
const MESES = 6;
const ROTULOS = { receitas: 'Entradas', despesas: 'Saídas', sobra: 'Geração de caixa' };

function Numero({ rotulo, icone, valor, rodape, className = '' }) {
  return (
    <article className={`of-kpi ${className}`.trim()}>
      <p className="of-kpi-rotulo">
        <span className={`of-kpi-icone ${['entrada', 'saida'].includes(icone) ? icone : ''}`.trim()} aria-hidden="true">
          <Icone nome={icone} tamanho={18} />
        </span>
        {rotulo}
      </p>
      <p className="of-kpi-valor">{valor}</p>
      {rodape}
    </article>
  );
}

function Tendencia({ atual, anterior, maiorEhMelhor = true }) {
  const variacao = variacaoPercentual(atual, anterior);
  const leitura = leituraDaVariacao(variacao, { maiorEhMelhor });
  if (!leitura) {
    return <p className="of-kpi-rodape">Sem mês anterior para comparar</p>;
  }
  return (
    <p className="of-kpi-rodape">
      <span className={`of-tendencia ${leitura}`}>{textoDaVariacao(variacao)}</span>
      em relação ao mês anterior
    </p>
  );
}

// Fluxo de caixa operacional do espaço de empresa: o que entrou e saiu do
// caixa da operação em cada mês (regime de caixa: a compra no cartão entra
// quando a fatura é paga) separado do que foi para as aplicações e voltou
// delas e do dinheiro dos sócios (aportes e lucros distribuídos). A conta está
// em regras/empresa.ts; os dados, no livro-caixa do espaço. Em outro espaço, a
// tela volta à Visão geral.
export default function FluxoDeCaixa() {
  const { espaco } = useOutletContext();
  const [hoje] = useState(hojeIso);
  const meses = useMemo(() => ultimosMeses(hoje, MESES), [hoje]);
  const espacoId = espaco.dados?.id;
  const daEmpresa = ehEmpresa(espaco.dados);
  const buscar = useMemo(
    () =>
      apiConfigurada && espacoId && daEmpresa
        ? () =>
            Promise.all([
              listarContas(espacoId),
              listarCategorias(espacoId),
              listarLancamentos(espacoId, { de: `${meses[0]}-01`, ate: hoje }),
            ]).then(([contas, categorias, lancamentos]) => ({ contas, categorias, lancamentos }))
        : null,
    [espacoId, daEmpresa, meses, hoje],
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
  const fluxo = dados ? fluxoDeCaixa(dados.lancamentos, dados.contas, { meses, hoje, categorias: dados.categorias }) : [];
  const atual = fluxo.at(-1);
  const anterior = fluxo.at(-2);
  const saldos = dados ? saldosDaEmpresa(dados.contas) : null;
  const semMovimento = fluxo.every((mes) => mes.entradas === 0 && mes.saidas === 0 && mes.investido === 0 && mes.socios === 0);
  const noLimite = dados && dados.lancamentos.length >= LIMITE_DE_LANCAMENTOS;
  const trecho = meses.length > 0 ? `${rotuloDoMes(meses[0], { comAno: true })} a ${rotuloDoMes(meses.at(-1), { comAno: true })}` : '';

  return (
    // .rel: as cores de receita e despesa do gráfico mensal (relatorios.css).
    <div className="of-empresa rel">
      <header className="of-cabecalho">
        <div>
          <h1>Fluxo de caixa</h1>
          <p>O caixa da operação mês a mês, separado dos investimentos da empresa.</p>
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

      {atual && saldos && (
        <section className="of-kpis of-empresa-numeros" aria-label="Números do mês">
          <Numero
            rotulo="Caixa da operação hoje"
            icone="contas"
            valor={formatarBRL(saldos.caixa)}
            rodape={<p className="of-kpi-rodape">{formatarBRL(saldos.investido)} aplicados, fora do caixa</p>}
          />
          <Numero rotulo="Entradas operacionais" icone="entrada" valor={formatarBRL(atual.entradas)}
            rodape={<Tendencia atual={atual.entradas} anterior={anterior?.entradas} />} />
          <Numero rotulo="Saídas operacionais" icone="saida" valor={formatarBRL(atual.saidas)}
            rodape={<Tendencia atual={atual.saidas} anterior={anterior?.saidas} maiorEhMelhor={false} />} />
          <Numero
            rotulo="Geração de caixa"
            icone="crescimento"
            valor={formatarComSinal(atual.geracao)}
            className={atual.geracao < 0 ? 'negativo' : ''}
            rodape={
              <p className="of-kpi-rodape">
                {atual.investido === 0
                  ? 'Nada aplicado nem resgatado no mês'
                  : `${formatarBRL(atual.aplicado)} aplicados · ${formatarBRL(atual.resgatado)} resgatados`}
              </p>
            }
          />
        </section>
      )}

      {semMovimento ? (
        <section className="cartao vazio">
          <SimboloDoVazio icone="transferencia" semente={61} />
          <h3>Nenhum movimento no caixa de {trecho}</h3>
          <p>
            O fluxo aparece com as receitas e despesas das contas da empresa. Transferências para uma conta do tipo
            Investimento entram como aplicação, fora da operação.
          </p>
          <Link to="/lancamentos" className="botao">
            <Icone nome="mais" tamanho={16} />
            Lançar agora
          </Link>
        </section>
      ) : (
        <section className="cartao of-painel rel-painel" aria-labelledby="titulo-fluxo">
          <div className="of-painel-cabecalho">
            <h2 id="titulo-fluxo">Operação, mês a mês</h2>
            <ul className="rel-legenda" aria-label="Legenda">
              <li>
                <i className="chave receita" aria-hidden="true" />
                Entradas
              </li>
              <li>
                <i className="chave despesa" aria-hidden="true" />
                Saídas
              </li>
              <li>
                <i className="chave sobra" aria-hidden="true" />
                Geração de caixa
              </li>
            </ul>
          </div>
          <GraficoMensal
            meses={fluxo.map((mes) => ({
              mes: mes.mes,
              receitas_centavos: mes.entradas,
              despesas_centavos: mes.saidas,
              sobra_centavos: mes.geracao,
            }))}
            rotulos={ROTULOS}
            descricao={`Entradas, saídas e geração de caixa da operação em cada mês, de ${trecho}`}
          />

          {/* Operação × investimentos, lado a lado em cada mês. */}
          <div className="rel-tabela of-fluxo-tabela">
            <div className="rel-tabela-rolagem">
              <table>
                <caption className="apenas-leitor">Fluxo de caixa operacional e investimentos por mês</caption>
                <thead>
                  <tr>
                    <th scope="col">Mês</th>
                    <th scope="col">Entradas</th>
                    <th scope="col">Saídas</th>
                    <th scope="col">Geração de caixa</th>
                    <th scope="col">Investimentos</th>
                    <th scope="col">Sócios</th>
                    <th scope="col">Variação do caixa</th>
                  </tr>
                </thead>
                <tbody>
                  {[...fluxo].reverse().map((mes) => (
                    <tr key={mes.mes}>
                      <th scope="row">{rotuloDoMes(mes.mes, { comAno: true })}</th>
                      <td>{formatarBRL(mes.entradas)}</td>
                      <td>{formatarBRL(mes.saidas)}</td>
                      <td className={mes.geracao < 0 ? 'negativo' : undefined}>{formatarComSinal(mes.geracao)}</td>
                      <td>
                        {mes.investido === 0 ? '—' : `${mes.investido > 0 ? 'aplicou' : 'resgatou'} ${formatarBRL(Math.abs(mes.investido))}`}
                      </td>
                      <td className={mes.socios < 0 ? 'negativo' : undefined}>{mes.socios === 0 ? '—' : formatarComSinal(mes.socios)}</td>
                      <td className={mes.variacaoDoCaixa < 0 ? 'negativo' : undefined}>{formatarComSinal(mes.variacaoDoCaixa)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="of-discreto">
            Operação: receitas e despesas das contas correntes, poupanças e carteiras, com as faturas do cartão pagas.
            Investimentos: o que foi para as contas de investimento, menos o que voltou delas. Sócios: os aportes de
            capital menos os lucros distribuídos (aba Sociedade & aportes).
            {noLimite && ` Mostrando os ${LIMITE_DE_LANCAMENTOS} lançamentos mais recentes do período.`}
          </p>
        </section>
      )}
    </div>
  );
}
