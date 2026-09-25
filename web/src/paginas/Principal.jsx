import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import Carregando from '../componentes/Carregando';
import Extrato from '../componentes/Extrato';
import Icone from '../componentes/Icone';
import { useCarga } from '../componentes/useCarga';
import { formatarBRL, formatarComSinal, VALOR_VAZIO } from '../regras/dinheiro';
import { formatarData } from '../regras/datas';
import {
  A_VENCER_DE_EXEMPLO,
  CONTAS_DE_EXEMPLO,
  COR_DA_CATEGORIA,
  LANCAMENTOS_DE_EXEMPLO,
  SALDO_DE_EXEMPLO,
} from '../regras/exemplo';
import { faturasAVencer } from '../regras/cartoes';
import { contasBancarias, estaNoMes, intervaloDoMes, lancamentosDasContas, mesDe, paraExtrato, saldoTotal } from '../regras/livroCaixa';
import { agruparPorDia, filtrarDias, gastoPorCategoria, somarMes, usoDaRenda } from '../regras/resumo';
import {
  apiConfigurada,
  LIMITE_DE_LANCAMENTOS,
  listarCartoes,
  listarCategorias,
  listarContas,
  listarLancamentos,
} from '../servicos/livroCaixa';
import '../estilos/cartoes.css';

const FILTROS = [
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'entradas', rotulo: 'Entradas' },
  { id: 'saidas', rotulo: 'Saídas' },
];

const MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const NOME_DO_MES = new Intl.DateTimeFormat('pt-BR', { month: 'long' });
const DIA_CURTO = new Intl.DateTimeFormat('pt-BR', { day: '2-digit' });
const MES_CURTO = new Intl.DateTimeFormat('pt-BR', { month: 'short' });

const comoData = (iso) => new Date(`${iso}T12:00:00`);
const corVisual = (cor) => `var(--cat-${cor ?? 'neutro'})`;

// Contas, categorias e lançamentos do mês atual em diante. Os posteriores ao
// mês entram só para o saldo de cada dia sair certo, andando para trás a
// partir do saldo de hoje. Os cartões trazem as faturas a vencer (sem eles,
// a tela abre do mesmo jeito).
async function carregarResumo(espacoId, mes) {
  const [contas, categorias, lancamentos, cartoes] = await Promise.all([
    listarContas(espacoId),
    listarCategorias(espacoId),
    listarLancamentos(espacoId, { de: intervaloDoMes(mes).de }),
    listarCartoes(espacoId).catch(() => []),
  ]);
  return { contas, categorias, lancamentos, cartoes };
}

// Monta os números da tela. Mesmo cálculo para os dados reais e para os de
// exemplo. O extrato e o saldo de cada dia são só das contas; as entradas,
// as saídas e o "Para onde foi" do mês contam também as compras no cartão,
// na data de cada parcela (linhasDosNumeros), e deixam de fora o pagamento
// da fatura, que só quita o que já foi contado na compra.
function resumir({ linhasDoMes, todasAsLinhas, linhasDosNumeros, saldo, contas, corPorCategoria, saldoDoDiaConfiavel }) {
  const totais = somarMes(linhasDosNumeros);
  return {
    saldo,
    contas,
    totais,
    uso: usoDaRenda(totais),
    categorias: gastoPorCategoria(linhasDosNumeros).map((item) => ({ ...item, cor: corPorCategoria[item.categoria] })),
    dias: agruparPorDia(todasAsLinhas, saldo).filter((dia) => linhasDoMes.some((linha) => linha.data === dia.data)),
    saldoDoDiaConfiavel,
  };
}

// Página 3 (Principal): saldo, números do mês e extrato. Com a API do
// livro-caixa, mostra os dados de verdade do espaço pessoal. Sem ela (versão
// publicada no Pages), a tela fica vazia de propósito, e "Ver com dados de
// exemplo" a enche com dados fictícios, sempre marcados como exemplo.
export default function Principal() {
  const { pessoa, espaco } = useOutletContext();
  // ?exemplo na URL já abre a tela com os dados fictícios.
  const [exemplo, setExemplo] = useState(
    () => !apiConfigurada && new URLSearchParams(window.location.search).has('exemplo'),
  );
  // Filtro do extrato: trabalha sobre o que já está na tela, sem nova consulta.
  const [filtro, setFiltro] = useState('tudo');
  const [mes] = useState(() => mesDe(new Date()));

  const espacoId = espaco.dados?.id;
  const buscarResumo = useMemo(
    () => (apiConfigurada && espacoId ? () => carregarResumo(espacoId, mes) : null),
    [espacoId, mes],
  );
  const livro = useCarga(buscarResumo);

  const resumo = useMemo(() => {
    if (exemplo) {
      return resumir({
        linhasDoMes: LANCAMENTOS_DE_EXEMPLO,
        todasAsLinhas: LANCAMENTOS_DE_EXEMPLO,
        linhasDosNumeros: LANCAMENTOS_DE_EXEMPLO,
        saldo: SALDO_DE_EXEMPLO,
        contas: CONTAS_DE_EXEMPLO,
        corPorCategoria: COR_DA_CATEGORIA,
        saldoDoDiaConfiavel: true,
      });
    }
    if (!livro.dados) {
      return null;
    }
    const { contas, categorias, lancamentos } = livro.dados;
    const todasAsLinhas = paraExtrato(lancamentosDasContas(lancamentos, contas), contas, categorias);
    const comCartoes = paraExtrato(lancamentos, contas, categorias);
    return resumir({
      linhasDoMes: todasAsLinhas.filter((linha) => estaNoMes(linha.data, mes)),
      todasAsLinhas,
      linhasDosNumeros: comCartoes.filter((linha) => estaNoMes(linha.data, mes) && linha.tipo !== 'pagamento'),
      saldo: saldoTotal(contas),
      // Conta desativada só aparece se ainda tiver dinheiro. Cartão não é
      // saldo: a fatura dele aparece em "A vencer".
      contas: contasBancarias(contas)
        .filter((conta) => conta.ativa || conta.saldo_centavos !== 0)
        .map((conta) => ({ nome: conta.nome, saldo: conta.saldo_centavos })),
      corPorCategoria: Object.fromEntries(categorias.map((categoria) => [categoria.nome, categoria.cor])),
      // No teto da consulta, pode faltar lançamento: o saldo do dia sai da tela.
      saldoDoDiaConfiavel: lancamentos.length < LIMITE_DE_LANCAMENTOS,
    });
  }, [exemplo, livro.dados, mes]);

  // Dados de verdade: API ligada e exemplo desligado.
  const real = apiConfigurada && !exemplo;
  const carregandoLivro = real && (espaco.carregando || (Boolean(espacoId) && livro.carregando && !livro.dados));
  if (pessoa.carregando || carregandoLivro) {
    return <Carregando />;
  }

  const dados = pessoa.dados;
  const mesAtual = MES.format(new Date());
  const erroDoLivro = real ? espaco.erro || livro.erro?.message : '';
  const semContas = real && Boolean(livro.dados) && livro.dados.contas.length === 0;
  const faturas = real && livro.dados ? faturasAVencer(livro.dados.cartoes) : [];
  const diasVisiveis = filtrarDias(resumo?.dias ?? [], filtro);
  const totalGasto = resumo?.categorias.reduce((soma, item) => soma + item.valor, 0) ?? 0;
  const comNumeros = Boolean(resumo) && !semContas;

  return (
    <>
      <header className="cabecalho-da-pagina">
        <h1>{dados ? `Olá, ${dados.nome}` : 'Olá'}</h1>
        <span className="mes">
          <Icone nome="calendario" tamanho={16} />
          {mesAtual}
        </span>
        {exemplo && (
          <span className="selo-exemplo">
            <Icone nome="alerta" tamanho={14} />
            Dados de exemplo
          </span>
        )}
        {/* Com a tela vazia, a chamada fica dentro do card do extrato, onde a
            explicação está; ligada, o botão de desligar vem para o topo. */}
        {exemplo && (
          <div className="acoes-da-pagina">
            <button type="button" className="secundario" onClick={() => setExemplo(false)}>
              <Icone nome="olhoFechado" tamanho={16} />
              Ocultar exemplo
            </button>
          </div>
        )}
        {real && comNumeros && (
          <div className="acoes-da-pagina">
            <Link className="botao" to="/lancamentos">
              <Icone nome="mais" tamanho={16} />
              Novo lançamento
            </Link>
          </div>
        )}
      </header>

      {(pessoa.erro || erroDoLivro) && (
        <div className="cartao painel">
          <p className="mensagem erro" role="alert">
            <Icone nome="alerta" tamanho={16} />
            {erroDoLivro || pessoa.erro}
          </p>
          <button type="button" className="secundario" onClick={() => window.location.reload()}>
            Tentar de novo
          </button>
        </div>
      )}

      <div className="resumo">
        <section className="cartao saldo" aria-labelledby="titulo-saldo">
          <h2 id="titulo-saldo" className="rotulo">
            Saldo em contas
          </h2>
          <p className="valor">
            {comNumeros ? (
              <>
                <span className="moeda">R$</span>
                {formatarBRL(resumo.saldo).replace('R$ ', '')}
              </>
            ) : (
              <span className="vazio-valor">{VALOR_VAZIO}</span>
            )}
          </p>
          <dl className="contas">
            {(comNumeros ? resumo.contas : [{ nome: 'Conta corrente' }, { nome: 'Poupança' }, { nome: 'Carteira' }]).map(
              (conta) => (
                <div key={conta.nome}>
                  <dt>{conta.nome}</dt>
                  <dd>{conta.saldo === undefined ? <span className="vazio-valor">{VALOR_VAZIO}</span> : formatarBRL(conta.saldo)}</dd>
                </div>
              ),
            )}
          </dl>
        </section>

        <dl className="cartao mes-numeros" aria-label={`Resumo de ${mesAtual}`}>
          <div className="entrada">
            <dt>
              <Icone nome="entrada" tamanho={14} />
              Entradas
            </dt>
            <dd>{comNumeros ? formatarComSinal(resumo.totais.entradas) : <span className="vazio-valor">{VALOR_VAZIO}</span>}</dd>
          </div>
          <div>
            <dt>
              <Icone nome="saida" tamanho={14} />
              Saídas
            </dt>
            <dd>{comNumeros ? formatarComSinal(-resumo.totais.saidas) : <span className="vazio-valor">{VALOR_VAZIO}</span>}</dd>
          </div>
          <div>
            <dt>Sobra do mês</dt>
            <dd>{comNumeros ? formatarBRL(resumo.totais.sobra) : <span className="vazio-valor">{VALOR_VAZIO}</span>}</dd>
          </div>
          <div className="uso">
            <div className="trilho">
              <i style={{ width: `${comNumeros ? resumo.uso : 0}%` }} />
            </div>
            <p>
              {comNumeros
                ? `Você usou ${resumo.uso}% do que entrou neste mês.`
                : 'A barra mostra quanto do que entrou já foi gasto.'}
            </p>
          </div>
        </dl>
      </div>

      <div className="corpo-do-resumo">
        <section className="cartao extrato" aria-labelledby="titulo-extrato">
          <div className="cabecalho-do-painel">
            <h2 id="titulo-extrato">Extrato</h2>
            {diasVisiveis.length > 0 || filtro !== 'tudo' ? (
              <div className="abas" role="group" aria-label="Filtrar o extrato">
                {FILTROS.map((opcao) => (
                  <button key={opcao.id} type="button" aria-pressed={filtro === opcao.id} onClick={() => setFiltro(opcao.id)}>
                    {opcao.rotulo}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {diasVisiveis.length > 0 ? (
            <Extrato dias={diasVisiveis} mostrarSaldo={filtro === 'tudo' && resumo.saldoDoDiaConfiavel} />
          ) : semContas ? (
            <div className="vazio">
              <span className="simbolo" aria-hidden="true">
                <Icone nome="contas" tamanho={20} />
              </span>
              <h3>Comece pelas suas contas</h3>
              <p>
                Cadastre onde o seu dinheiro está (conta corrente, poupança, carteira) com o saldo de hoje. Depois, cada
                receita, despesa ou transferência entra aqui com data, categoria e valor.
              </p>
              <Link className="botao" to="/contas">
                <Icone nome="mais" tamanho={16} />
                Cadastrar conta
              </Link>
            </div>
          ) : comNumeros ? (
            <div className="vazio">
              <span className="simbolo" aria-hidden="true">
                <Icone nome="lancamentos" tamanho={20} />
              </span>
              <h3>{filtro === 'tudo' ? `Nenhum lançamento em ${NOME_DO_MES.format(new Date())}` : 'Nada com esse filtro'}</h3>
              <p>
                {filtro === 'tudo'
                  ? 'Registre o que entrou e o que saiu: o extrato mostra cada dia com o saldo de todas as contas.'
                  : 'Troque o filtro para ver os outros lançamentos do mês.'}
              </p>
              {filtro === 'tudo' && (
                <Link className="botao" to="/lancamentos">
                  <Icone nome="mais" tamanho={16} />
                  Lançar
                </Link>
              )}
            </div>
          ) : real ? (
            // A API não respondeu: o aviso com "Tentar de novo" está no topo.
            <p className="vazio discreto">O extrato aparece aqui quando o servidor responder.</p>
          ) : (
            <div className="vazio">
              <span className="simbolo" aria-hidden="true">
                <Icone nome="lancamentos" tamanho={20} />
              </span>
              <h3>Nenhum lançamento ainda</h3>
              <p>
                Receitas, despesas e transferências ficam na API do livro-caixa, que não está ligada a esta versão do
                site. Cada lançamento entra aqui com data, categoria, conta e valor, e o extrato mostra o saldo de cada
                dia.
              </p>
              <button type="button" onClick={() => setExemplo(true)}>
                <Icone nome="olho" tamanho={16} />
                Ver com dados de exemplo
              </button>
            </div>
          )}
        </section>

        <div className="lado">
          <section className="cartao painel" aria-labelledby="titulo-categorias">
            <div className="cabecalho-do-painel">
              <h2 id="titulo-categorias">Para onde foi</h2>
              {comNumeros && resumo.categorias.length > 0 && <small>{formatarBRL(totalGasto)}</small>}
            </div>
            {comNumeros && resumo.categorias.length > 0 ? (
              <>
                <div className="pilha" aria-hidden="true">
                  {resumo.categorias.map((item) => (
                    <i key={item.categoria} style={{ flex: item.valor, background: corVisual(item.cor) }} />
                  ))}
                </div>
                <dl className="categorias">
                  {resumo.categorias.map((item) => (
                    <div key={item.categoria}>
                      <span className="ponto" style={{ background: corVisual(item.cor) }} aria-hidden="true" />
                      <dt>{item.categoria}</dt>
                      <dd>{formatarBRL(item.valor)}</dd>
                      <span className="fatia">{item.fatia}%</span>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="discreto">Quando houver despesas, elas aparecem aqui divididas por categoria.</p>
            )}
          </section>

          <section className="cartao painel" aria-labelledby="titulo-a-vencer">
            <div className="cabecalho-do-painel">
              <h2 id="titulo-a-vencer">A vencer</h2>
              {exemplo && <small>próximos 15 dias</small>}
            </div>
            {faturas.length > 0 ? (
              <dl className="a-vencer">
                {faturas.map((fatura) => (
                  <div key={fatura.id}>
                    <span className="data" aria-hidden="true">
                      <b>{DIA_CURTO.format(comoData(fatura.data))}</b>
                      <small>{MES_CURTO.format(comoData(fatura.data)).replace('.', '')}</small>
                    </span>
                    <dt>
                      <Link to={`/contas/cartoes/${fatura.id}`}>{fatura.descricao}</Link>
                      {fatura.vencida && <span className="etiqueta">Vencida</span>}
                    </dt>
                    <dd>{formatarBRL(fatura.valor)}</dd>
                  </div>
                ))}
              </dl>
            ) : exemplo ? (
              <dl className="a-vencer">
                {A_VENCER_DE_EXEMPLO.map((conta) => (
                  <div key={conta.descricao}>
                    <span className="data" aria-hidden="true">
                      <b>{DIA_CURTO.format(comoData(conta.data))}</b>
                      <small>{MES_CURTO.format(comoData(conta.data)).replace('.', '')}</small>
                    </span>
                    <dt>{conta.descricao}</dt>
                    <dd>{formatarBRL(conta.valor)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="discreto">Faturas de cartão fechadas e ainda não pagas aparecem aqui, com o vencimento.</p>
            )}
          </section>

          {dados && (
            <section className="cartao painel" aria-labelledby="titulo-dados">
              <div className="cabecalho-do-painel">
                <h2 id="titulo-dados">Seus dados</h2>
              </div>
              <dl className="dados-pessoais">
                <div>
                  <dt>Nome</dt>
                  <dd>{dados.nome}</dd>
                </div>
                <div>
                  <dt>Sobrenome</dt>
                  <dd>{dados.sobrenome}</dd>
                </div>
                <div>
                  <dt>Data de nascimento</dt>
                  <dd>{formatarData(dados.dataNascimento)}</dd>
                </div>
              </dl>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
