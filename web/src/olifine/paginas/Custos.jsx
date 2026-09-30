import { useMemo, useState } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import Esqueleto from '../../componentes/Esqueleto';
import Icone from '../../componentes/Icone';
import Seletor from '../../componentes/Seletor';
import { useToast } from '../../componentes/toast/useToast';
import { useCarga } from '../../componentes/useCarga';
import { hojeIso } from '../../regras/datas';
import { formatarBRL, formatarComSinal } from '../../regras/dinheiro';
import { ehEmpresa } from '../../regras/espacos';
import { intervaloDoMes, mesDe } from '../../regras/livroCaixa';
import { nomeDoMes, somarMeses } from '../../regras/relatorios';
import { apiConfigurada, classificarCustos, listarCategorias, listarLancamentos } from '../../servicos/livroCaixa';
import SimboloDoVazio from '../componentes/SimboloDoVazio';
import { classeDaCategoria, CLASSES, faixasDaVenda, montarCustos } from '../regras/custos';
import '../estilos/gestao.css';

const periodo = (mes) => intervaloDoMes(mesDe(`${mes}-01`));
const OPCOES_DE_CLASSE = CLASSES.map(({ valor, rotulo }) => ({ valor, rotulo }));
const ROTULO_DA_CLASSE = Object.fromEntries(CLASSES.map((classe) => [classe.valor, classe.rotulo]));

function Numero({ rotulo, icone, valor, rodape, className = '' }) {
  return (
    <article className={`of-kpi ${className}`.trim()}>
      <p className="of-kpi-rotulo">
        <span className="of-kpi-icone" aria-hidden="true">
          <Icone nome={icone} tamanho={18} />
        </span>
        {rotulo}
      </p>
      <p className="of-kpi-valor">{valor}</p>
      <p className="of-kpi-rodape">{rodape}</p>
    </article>
  );
}

// A classe de uma despesa, trocada ali mesmo: a escolha fica gravada na
// categoria e vale para todos os meses.
function TrocaDeClasse({ categoria, aoTrocar, ocupado }) {
  return (
    <Seletor
      name={`classe-${categoria.id}`}
      value={classeDaCategoria(categoria)}
      opcoes={OPCOES_DE_CLASSE}
      disabled={ocupado}
      aria-label={`Classe de ${categoria.nome}`}
      className="compacto"
      onChange={(evento) => aoTrocar(categoria, evento.target.value)}
    />
  );
}

// Aba Custos da empresa: custos variáveis, fixos e despesas operacionais do
// mês, a margem de contribuição, o lucro e a margem de lucro, o ponto de
// equilíbrio e "para onde vai cada R$ 100 vendidos". Cada despesa entra numa
// classe (a escolhida ou a sugerida pelo nome), trocada na própria tela. A
// conta está em regras/custos.ts. No espaço pessoal, volta à Visão geral.
export default function Custos() {
  const { espaco } = useOutletContext();
  const toast = useToast();
  const [hoje] = useState(hojeIso);
  const mesDeHoje = hoje.slice(0, 7);
  const [mes, setMes] = useState(mesDeHoje);
  const [salvando, setSalvando] = useState(false);
  const espacoId = espaco.dados?.id;
  const daEmpresa = ehEmpresa(espaco.dados);
  const buscar = useMemo(
    () =>
      apiConfigurada && espacoId && daEmpresa
        ? () =>
            Promise.all([listarCategorias(espacoId), listarLancamentos(espacoId, periodo(mes))]).then(
              ([categorias, lancamentos]) => ({ categorias, lancamentos }),
            )
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
  const custos = dados ? montarCustos(dados.lancamentos, dados.categorias, periodo(mes)) : null;
  const faixas = custos ? faixasDaVenda(custos) : [];
  const despesas = dados ? dados.categorias.filter((categoria) => categoria.tipo === 'DESPESA') : [];
  const categoriaPorId = new Map(despesas.map((categoria) => [categoria.id, categoria]));

  async function trocarClasse(categoria, classe) {
    setSalvando(true);
    try {
      await classificarCustos(espacoId, { [categoria.id]: classe });
      toast.sucesso(`${categoria.nome} agora conta em ${ROTULO_DA_CLASSE[classe].toLowerCase()}, em todos os meses.`, {
        titulo: 'Classe trocada',
      });
      livro.recarregar();
    } catch (falha) {
      toast.erro(falha.message, { titulo: 'Classe não mudou' });
    } finally {
      setSalvando(false);
    }
  }

  const equilibrio = custos?.pontoDeEquilibrio;
  return (
    <div className="of-empresa of-gestao">
      <header className="of-cabecalho">
        <div>
          <h1>Custos</h1>
          <p>Quanto custa manter a empresa e quanto sobra de cada venda, pela data de cada lançamento.</p>
        </div>
        <div className="of-cabecalho-acoes of-dre-mes" role="group" aria-label="Mês dos custos">
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

      {custos && custos.lancamentos === 0 && (
        <section className="cartao vazio">
          <SimboloDoVazio icone="rosca" semente={47} />
          <h3>Nenhuma venda ou despesa em {nomeDoMes(mes)}</h3>
          <p>Os custos aparecem com os lançamentos da empresa: vendas e serviços de um lado, fornecedores, folha e o resto do outro.</p>
          <Link to="/lancamentos" className="botao">
            <Icone nome="mais" tamanho={16} />
            Lançar agora
          </Link>
        </section>
      )}

      {custos && custos.lancamentos > 0 && (
        <>
          <section className="of-kpis of-empresa-numeros" aria-label="Resumo dos custos do mês">
            <Numero rotulo="Receita do mês" icone="entrada" valor={formatarBRL(custos.receita)}
              rodape="Vendas e serviços, sem os aportes dos sócios" />
            <Numero
              rotulo="Margem de contribuição"
              icone="rosca"
              valor={formatarComSinal(custos.margemDeContribuicao)}
              className={custos.margemDeContribuicao < 0 ? 'negativo' : ''}
              rodape={custos.margemDeContribuicaoPct === null ? 'Sem receita no mês' : `${custos.margemDeContribuicaoPct}% de cada venda, depois dos variáveis`}
            />
            <Numero
              rotulo="Lucro"
              icone="alvo"
              valor={formatarComSinal(custos.lucro)}
              className={custos.lucro < 0 ? 'negativo' : ''}
              rodape={custos.margemDeLucroPct === null ? 'Sem receita no mês' : `Margem de lucro de ${custos.margemDeLucroPct}%`}
            />
            <Numero
              rotulo="Ponto de equilíbrio"
              icone="crescimento"
              valor={equilibrio === null ? '—' : formatarBRL(equilibrio)}
              rodape={
                equilibrio === null
                  ? 'Sem margem de contribuição para cobrir os fixos'
                  : custos.receita >= equilibrio
                    ? `Passou ${formatarBRL(custos.receita - equilibrio)} do equilíbrio`
                    : `Faltam ${formatarBRL(equilibrio - custos.receita)} em vendas`
              }
            />
          </section>

          <section className="cartao of-painel" aria-labelledby="titulo-cada-100">
            <div className="of-painel-cabecalho">
              <h2 id="titulo-cada-100">Para onde vai cada R$ 100 vendidos</h2>
              <small>{nomeDoMes(mes)}</small>
            </div>
            {faixas.length > 0 ? (
              <>
                <div className="of-cada-100" role="img"
                  aria-label={faixas.map((faixa) => `${faixa.rotulo}: R$ ${faixa.parte}`).join('; ')}>
                  {faixas.map((faixa) => (
                    <span key={faixa.classe} className={`faixa ${faixa.classe.toLowerCase()}`} style={{ '--parte': faixa.parte }} />
                  ))}
                </div>
                <ul className="of-cada-100-legenda">
                  {faixas.map((faixa) => (
                    <li key={faixa.classe}>
                      <i className={`chave ${faixa.classe.toLowerCase()}`} aria-hidden="true" />
                      {faixa.rotulo} <b>R$ {faixa.parte}</b>
                    </li>
                  ))}
                </ul>
                {custos.lucro < 0 && (
                  <p className="of-discreto">
                    Os custos passaram da receita em {formatarBRL(-custos.lucro)}: o mês fechou no prejuízo.
                  </p>
                )}
              </>
            ) : (
              <p className="of-discreto">Sem receita no mês: a barra aparece quando houver vendas.</p>
            )}
          </section>

          <div className="of-custos-grade">
            {CLASSES.filter((classe) => classe.valor !== 'FORA' || custos.grupos.FORA.total !== 0).map((classe) => {
              const grupo = custos.grupos[classe.valor];
              return (
                <section key={classe.valor} className={`cartao of-painel of-custos-grupo ${classe.valor.toLowerCase()}`}
                  aria-labelledby={`titulo-${classe.valor}`}>
                  <div className="of-painel-cabecalho">
                    <h2 id={`titulo-${classe.valor}`}>
                      <i className={`chave ${classe.valor.toLowerCase()}`} aria-hidden="true" />
                      {classe.rotulo}
                    </h2>
                    <b className="of-custos-total">
                      {formatarBRL(grupo.total)}
                      {grupo.parte !== null && <small> · {grupo.parte}% da receita</small>}
                    </b>
                  </div>
                  <p className="of-custos-descricao">{classe.descricao}</p>
                  {grupo.categorias.length > 0 ? (
                    <ul className="of-custos-lista">
                      {grupo.categorias.map((item) => (
                        <li key={item.id}>
                          <span className="nome">
                            {item.nome}
                            {!item.escolhida && item.id !== 'sem-categoria' && <small>sugerida pelo nome</small>}
                          </span>
                          <b>{formatarBRL(item.valor)}</b>
                          {categoriaPorId.get(item.id) && (
                            <TrocaDeClasse categoria={categoriaPorId.get(item.id)} aoTrocar={trocarClasse} ocupado={salvando} />
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="of-discreto">Nenhuma despesa desta classe no mês.</p>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {dados && despesas.length > 0 && (
        <details className="cartao of-painel of-custos-todas">
          <summary>
            <span>
              <b>Classe de todas as despesas da empresa</b>
              <small>Escolha antes de lançar: vale para todos os meses.</small>
            </span>
            <Icone nome="seta" tamanho={16} />
          </summary>
          <ul className="of-custos-lista">
            {despesas.map((categoria) => (
              <li key={categoria.id}>
                <span className="nome">
                  {categoria.nome}
                  {!categoria.classe_de_custo && <small>sugerida pelo nome</small>}
                </span>
                <TrocaDeClasse categoria={categoria} aoTrocar={trocarClasse} ocupado={salvando} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
