import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AvisoFirebase from '../componentes/AvisoFirebase';
import Icone from '../componentes/Icone';
import { firebaseConfigurado } from '../firebase';
import { formatarBRL, formatarComSinal, VALOR_VAZIO } from '../regras/dinheiro';
import { formatarData } from '../regras/datas';
import { mensagemDeErro } from '../regras/erros';
import {
  A_VENCER_DE_EXEMPLO,
  CONTAS_DE_EXEMPLO,
  COR_DA_CATEGORIA,
  LANCAMENTOS_DE_EXEMPLO,
  SALDO_DE_EXEMPLO,
} from '../regras/exemplo';
import { agruparPorDia, gastoPorCategoria, somarMes, usoDaRenda } from '../regras/resumo';
import { buscarDadosPessoais, observarSessao } from '../servicos/contas';

const FILTROS = [
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'entradas', rotulo: 'Entradas' },
  { id: 'saidas', rotulo: 'Saídas' },
];

const MES = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const DIA_LONGO = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' });
const DIA_CURTO = new Intl.DateTimeFormat('pt-BR', { day: '2-digit' });
const MES_CURTO = new Intl.DateTimeFormat('pt-BR', { month: 'short' });

// 'AAAA-MM-DD' vira Date sem o fuso mudar o dia (o Date do ISO puro é UTC).
const comoData = (iso) => new Date(`${iso}T12:00:00`);
const corDaCategoria = (categoria) => `var(--cat-${COR_DA_CATEGORIA[categoria] ?? 'neutro'})`;

// Página 3: mostra os dados pessoais gravados no Firestore e a estrutura do
// app financeiro. Enquanto não existir lançamento (release 0.2), a tela fica
// vazia de propósito; "Ver com dados de exemplo" enche a tela com dados
// fictícios, sempre marcados como exemplo, para conhecer o caminho.
export default function Principal() {
  const navigate = useNavigate();
  const [estado, setEstado] = useState({ carregando: true, dados: null, erro: '' });
  // ?exemplo na URL já abre a tela com os dados fictícios: serve para
  // mostrar o caminho a alguém sem precisar clicar no botão.
  const [exemplo, setExemplo] = useState(() => new URLSearchParams(window.location.search).has('exemplo'));
  // Filtro do extrato: 'tudo', 'entradas' ou 'saidas'. Trabalha sobre o que
  // já está na tela, sem nova consulta.
  const [filtro, setFiltro] = useState('tudo');

  useEffect(() => {
    if (!firebaseConfigurado) {
      return undefined;
    }

    // O Firebase restaura a sessão de forma assíncrona depois de recarregar a
    // página; por isso espera o aviso em vez de ler auth.currentUser direto.
    return observarSessao(async (usuario) => {
      if (!usuario) {
        navigate('/login', { replace: true });
        return;
      }
      try {
        const dados = await buscarDadosPessoais(usuario.uid);
        setEstado({
          carregando: false,
          dados,
          erro: dados ? '' : 'Não há dados pessoais gravados para esta conta.',
        });
      } catch (erro) {
        setEstado({ carregando: false, dados: null, erro: mensagemDeErro(erro.code) });
      }
    });
  }, [navigate]);

  const resumo = useMemo(() => {
    if (!exemplo) {
      return null;
    }
    const totais = somarMes(LANCAMENTOS_DE_EXEMPLO);
    return {
      totais,
      uso: usoDaRenda(totais),
      categorias: gastoPorCategoria(LANCAMENTOS_DE_EXEMPLO),
      dias: agruparPorDia(LANCAMENTOS_DE_EXEMPLO, CONTAS_DE_EXEMPLO[0].saldo),
    };
  }, [exemplo]);

  if (!firebaseConfigurado) {
    return <AvisoFirebase />;
  }

  if (estado.carregando) {
    return (
      <div className="carregando" aria-busy="true" aria-label="Carregando seus dados">
        <span className="esqueleto titulo" />
        <span className="esqueleto bloco" />
        <span className="esqueleto linha" />
      </div>
    );
  }

  const { dados } = estado;
  const mesAtual = MES.format(new Date());
  // O filtro esconde linhas, nunca muda o saldo: com filtro ligado, o saldo
  // do dia sai do cabeçalho para não sugerir uma conta diferente.
  const diasVisiveis = (resumo?.dias ?? [])
    .map((dia) => ({
      ...dia,
      lancamentos: dia.lancamentos.filter(
        (lancamento) =>
          filtro === 'tudo' ||
          (filtro === 'entradas' ? lancamento.valor > 0 : lancamento.valor < 0),
      ),
    }))
    .filter((dia) => dia.lancamentos.length > 0);
  const totalGasto = resumo?.categorias.reduce((soma, item) => soma + item.valor, 0) ?? 0;

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
      </header>

      {estado.erro && (
        <div className="cartao painel">
          <p className="mensagem erro" role="alert">
            <Icone nome="alerta" tamanho={16} />
            {estado.erro}
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
            {exemplo ? (
              <>
                <span className="moeda">R$</span>
                {formatarBRL(SALDO_DE_EXEMPLO).replace('R$ ', '')}
              </>
            ) : (
              <span className="vazio-valor">{VALOR_VAZIO}</span>
            )}
          </p>
          <dl className="contas">
            {(exemplo ? CONTAS_DE_EXEMPLO : [{ nome: 'Conta corrente' }, { nome: 'Poupança' }, { nome: 'Carteira' }]).map(
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
            <dd>{exemplo ? formatarComSinal(resumo.totais.entradas) : <span className="vazio-valor">{VALOR_VAZIO}</span>}</dd>
          </div>
          <div>
            <dt>
              <Icone nome="saida" tamanho={14} />
              Saídas
            </dt>
            <dd>{exemplo ? formatarComSinal(-resumo.totais.saidas) : <span className="vazio-valor">{VALOR_VAZIO}</span>}</dd>
          </div>
          <div>
            <dt>Sobra do mês</dt>
            <dd>{exemplo ? formatarBRL(resumo.totais.sobra) : <span className="vazio-valor">{VALOR_VAZIO}</span>}</dd>
          </div>
          <div className="uso">
            <div className="trilho">
              <i style={{ width: `${exemplo ? resumo.uso : 0}%` }} />
            </div>
            <p>
              {exemplo
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
            {exemplo && (
              <div className="abas" role="group" aria-label="Filtrar o extrato">
                {FILTROS.map((opcao) => (
                  <button
                    key={opcao.id}
                    type="button"
                    aria-pressed={filtro === opcao.id}
                    onClick={() => setFiltro(opcao.id)}
                  >
                    {opcao.rotulo}
                  </button>
                ))}
              </div>
            )}
          </div>

          {exemplo ? (
            diasVisiveis.map((dia) => (
              <div key={dia.data}>
                <p className="dia">
                  <span>{DIA_LONGO.format(comoData(dia.data))}</span>
                  {filtro === 'tudo' && <span>Saldo do dia {formatarBRL(dia.saldo)}</span>}
                </p>
                {dia.lancamentos.map((lancamento) => (
                  <article className="lancamento" key={`${lancamento.data}-${lancamento.descricao}`}>
                    <span
                      className="marca-da-categoria"
                      style={{ '--cor-da-categoria': corDaCategoria(lancamento.categoria) }}
                      aria-hidden="true"
                    >
                      <Icone
                        nome={lancamento.tipo === 'transferencia' ? 'transferencia' : lancamento.valor > 0 ? 'entrada' : 'saida'}
                        tamanho={16}
                      />
                    </span>
                    <span className="descricao">
                      <b>{lancamento.descricao}</b>
                      <small>
                        {lancamento.categoria} · {lancamento.conta}
                      </small>
                    </span>
                    <span className={`valor${lancamento.valor > 0 ? ' entrada' : ''}`}>
                      {formatarComSinal(lancamento.valor)}
                    </span>
                  </article>
                ))}
              </div>
            ))
          ) : (
            <div className="vazio">
              <span className="simbolo" aria-hidden="true">
                <Icone nome="lancamentos" tamanho={20} />
              </span>
              <h3>Nenhum lançamento ainda</h3>
              <p>
                Receitas, despesas e transferências entre contas chegam na versão 0.2. Cada lançamento entra aqui com
                data, categoria, conta e valor, e o extrato mostra o saldo de cada dia.
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
              {exemplo && <small>{formatarBRL(totalGasto)}</small>}
            </div>
            {exemplo ? (
              <>
                <div className="pilha" aria-hidden="true">
                  {resumo.categorias.map((item) => (
                    <i
                      key={item.categoria}
                      style={{ flex: item.valor, background: corDaCategoria(item.categoria) }}
                    />
                  ))}
                </div>
                <dl className="categorias">
                  {resumo.categorias.map((item) => (
                    <div key={item.categoria}>
                      <span className="ponto" style={{ background: corDaCategoria(item.categoria) }} aria-hidden="true" />
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
            {exemplo ? (
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
              <p className="discreto">Contas com data de vencimento aparecem aqui antes de vencer.</p>
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
