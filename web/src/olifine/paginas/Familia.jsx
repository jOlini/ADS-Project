import { useState } from 'react';
import { Link, Navigate, useOutletContext } from 'react-router-dom';
import Confirmacao from '../../componentes/Confirmacao';
import Esqueleto from '../../componentes/Esqueleto';
import FormularioDePessoa from '../../componentes/FormularioDePessoa';
import Icone from '../../componentes/Icone';
import Menu from '../../componentes/Menu';
import Modal from '../../componentes/Modal';
import { useToast } from '../../componentes/toast/useToast';
import { familiaLiberada, planoDoEspaco } from '../../regras/planos';
import { removerPessoa } from '../../servicos/livroCaixa';
import ChaveDaFamilia from '../componentes/ChaveDaFamilia';
import SimboloDoVazio from '../componentes/SimboloDoVazio';
import '../estilos/familia.css';

const iniciais = (nome) =>
  nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase();

// Página da Família (Modo Família do espaço pessoal): liga e desliga o modo,
// cadastra quem mora com você (nome e cor), edita e tira. As pessoas são
// perfis dentro do espaço pessoal, sem login: um lançamento é de uma delas
// quando o "responsável" tem o nome dela, e é assim que as telas separam o
// gasto de cada um. Uma assinatura só, a do titular, cobre a casa inteira.
// Numa empresa, a página volta à Visão geral.
//
// No Plano Free, a página explica o Plano Família em vez de cadastrar: sem
// "Incluir pessoa" e sem editar. Quem já estava na família (de um plano
// anterior) aparece e ainda pode sair, porque apagar dado é sempre possível.
// A API confere o plano de novo (403) em cada ação.
export default function Familia() {
  const { espaco, pessoa, recarregarEspacos } = useOutletContext();
  const toast = useToast();
  const [janela, setJanela] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  if (espaco.carregando || pessoa.carregando) {
    return <Esqueleto />;
  }
  const pessoal = espaco.dados;
  if (!pessoal || pessoal.tipo !== 'PF') {
    return <Navigate to="/principal" replace />;
  }

  const familia = pessoal.familia ?? { ativa: false, pessoas: [], maximo_de_pessoas: 4 };
  const pessoas = familia.pessoas;
  const liberada = familiaLiberada(planoDoEspaco(pessoal));
  const cabe = liberada && pessoas.length < familia.maximo_de_pessoas;
  const titular = pessoa.dados ? `${pessoa.dados.nome} ${pessoa.dados.sobrenome}`.trim() : 'Você';

  function fechar() {
    setJanela(null);
    setOcupado(false);
  }

  async function aposSalvar() {
    fechar();
    await recarregarEspacos(pessoal.id);
  }

  async function confirmarRemocao(alvo) {
    setOcupado(true);
    try {
      await removerPessoa(pessoal.id, alvo.id);
      toast.sucesso('Os lançamentos continuam no extrato, com o nome escrito.', { titulo: `${alvo.nome} saiu da família` });
      fechar();
      await recarregarEspacos(pessoal.id);
    } catch (falha) {
      toast.erro(falha.message, { titulo: 'Pessoa não removida' });
      setOcupado(false);
    }
  }

  return (
    <div className="of-familia">
      <header className="of-cabecalho">
        <div>
          <h1>Família</h1>
          <p>Quem mora com você, cada um com a sua cor. O gasto de cada pessoa aparece separado, e a casa toda também.</p>
        </div>
        <div className="of-cabecalho-acoes">
          <ChaveDaFamilia espaco={pessoal} recarregarEspacos={recarregarEspacos} />
          {liberada && (
            <button type="button" onClick={() => setJanela({ tipo: 'pessoa' })} disabled={!cabe}>
              <Icone nome="mais" tamanho={16} />
              Incluir pessoa
            </button>
          )}
        </div>
      </header>

      {!liberada && (
        <section className="cartao of-painel of-familia-plano" aria-labelledby="titulo-plano-familia">
          <span className="of-familia-plano-icone" aria-hidden="true">
            <Icone nome="cadeado" tamanho={20} />
          </span>
          <div>
            <h2 id="titulo-plano-familia">O Modo Família faz parte do Plano Família</h2>
            <p>
              No Free, o espaço pessoal é só seu. Com o Plano Família, você inclui até {familia.maximo_de_pessoas} convidados
              da casa ({familia.maximo_de_pessoas + 1} pessoas com você), vê quanto cada um gastou e divide um gasto com o
              nome e a parte de cada pessoa.
            </p>
          </div>
          <Link to="/#planos" className="botao">
            Conhecer os planos
          </Link>
        </section>
      )}

      {liberada && !familia.ativa && (
        <p className="mensagem info of-familia-desligada" role="status">
          <Icone nome="alerta" tamanho={16} />
          O Modo Família está desligado: os filtros por pessoa e o gasto de cada um não aparecem nas telas. As pessoas
          continuam guardadas aqui.
        </p>
      )}

      <div className="of-grade of-familia-grade">
        <section className="cartao of-painel" aria-labelledby="titulo-pessoas">
          <div className="of-painel-cabecalho">
            <h2 id="titulo-pessoas">Pessoas da casa</h2>
            <small>
              {pessoas.length} de {familia.maximo_de_pessoas} convidados
            </small>
          </div>
          <ul className="of-pessoas">
            <li>
              <span className="of-pessoa-marca pessoa-titular" aria-hidden="true">
                {iniciais(titular) || 'EU'}
              </span>
              <span className="of-pessoa-textos">
                <b>{titular}</b>
                <small>Você, o titular: lançamento sem responsável é seu</small>
              </span>
            </li>
            {pessoas.map((alvo) => (
              <li key={alvo.id}>
                <span className={`of-pessoa-marca pessoa-${alvo.cor}`} aria-hidden="true">
                  {iniciais(alvo.nome)}
                </span>
                <span className="of-pessoa-textos">
                  <b>{alvo.nome}</b>
                  <small>Responsável "{alvo.nome}" nos lançamentos</small>
                </span>
                <Menu
                  rotulo={`Ações de ${alvo.nome}`}
                  itens={[
                    ...(liberada
                      ? [{ id: 'editar', rotulo: 'Editar nome e cor', icone: 'editar', aoEscolher: () => setJanela({ tipo: 'pessoa', alvo }) }]
                      : []),
                    {
                      id: 'remover',
                      rotulo: 'Tirar da família',
                      descricao: 'Os lançamentos ficam, com o nome escrito.',
                      icone: 'excluir',
                      perigo: true,
                      aoEscolher: () => setJanela({ tipo: 'remover', alvo }),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
          {pessoas.length === 0 && (
            <div className="vazio of-familia-vazio">
              <SimboloDoVazio icone="pessoas" semente={31} />
              <h3>Ninguém da família ainda</h3>
              <p>
                {liberada
                  ? 'Inclua quem mora com você: cônjuge, filhos, quem divide as contas da casa.'
                  : 'Com o Plano Família, quem mora com você entra aqui, cada um com a sua cor.'}
              </p>
            </div>
          )}
          {liberada && !cabe && (
            <p className="of-discreto">
              A família está completa: a assinatura cobre você e mais {familia.maximo_de_pessoas} convidados.
            </p>
          )}
        </section>

        <section className="cartao of-painel" aria-labelledby="titulo-como-funciona">
          <div className="of-painel-cabecalho">
            <h2 id="titulo-como-funciona">Como funciona</h2>
          </div>
          <ul className="of-familia-regras">
            <li>
              <Icone nome="escudo" tamanho={18} />
              <span>
                <b>Uma assinatura só, a sua.</b> Ela cobre a casa inteira: você e até {familia.maximo_de_pessoas} convidados,
                {familia.maximo_de_pessoas + 1} pessoas no total.
                Ninguém da família precisa assinar nem criar conta.
              </span>
            </li>
            <li>
              <Icone nome="usuario" tamanho={18} />
              <span>
                <b>De quem é o gasto.</b> No lançamento, escolha a pessoa em "Responsável". Sem ninguém escolhido, o
                lançamento é seu.
              </span>
            </li>
            <li>
              <Icone nome="relatorios" tamanho={18} />
              <span>
                <b>A casa toda ou uma pessoa.</b> Visão geral, Lançamentos e Relatórios ganham o filtro "de quem"; a
                Visão geral mostra o gasto de cada um no mês.
              </span>
            </li>
            <li>
              <Icone nome="cadeado" tamanho={18} />
              <span>
                <b>Continua sendo o seu espaço.</b> Contas, cartões e metas são os mesmos; a família só separa quem
                gastou. Desligar o modo esconde a família sem apagar ninguém.
              </span>
            </li>
          </ul>
        </section>
      </div>

      <Modal
        aberta={janela?.tipo === 'pessoa'}
        titulo={janela?.alvo ? 'Editar pessoa' : 'Incluir pessoa na família'}
        descricao={janela?.alvo ? janela.alvo.nome : 'Nome e cor. Ela aparece nos filtros e no campo Responsável.'}
        ocupado={ocupado}
        aoFechar={fechar}
      >
        {janela?.tipo === 'pessoa' && (
          <FormularioDePessoa
            espacoId={pessoal.id}
            pessoas={pessoas}
            emEdicao={janela.alvo ?? null}
            aoSalvar={aposSalvar}
            aoCancelar={fechar}
            aoMudarOcupado={setOcupado}
          />
        )}
      </Modal>

      <Confirmacao
        aberta={janela?.tipo === 'remover'}
        titulo={janela?.tipo === 'remover' ? `Tirar ${janela.alvo.nome} da família?` : ''}
        rotuloDeConfirmar="Tirar da família"
        perigo
        ocupado={ocupado}
        aoConfirmar={() => janela?.tipo === 'remover' && confirmarRemocao(janela.alvo)}
        aoCancelar={() => !ocupado && fechar()}
      >
        Os lançamentos continuam no extrato, com o nome escrito como responsável, mas saem do filtro da família.
      </Confirmacao>
    </div>
  );
}
