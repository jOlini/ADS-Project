import { useMemo, useState } from 'react';
import { Navigate, useOutletContext } from 'react-router-dom';
import Confirmacao from '../../componentes/Confirmacao';
import Esqueleto from '../../componentes/Esqueleto';
import FormularioDaFolha from '../../componentes/FormularioDaFolha';
import FormularioDeColaborador from '../../componentes/FormularioDeColaborador';
import Icone from '../../componentes/Icone';
import Menu from '../../componentes/Menu';
import Modal from '../../componentes/Modal';
import { useToast } from '../../componentes/toast/useToast';
import { useCarga } from '../../componentes/useCarga';
import { formatarData, hojeIso } from '../../regras/datas';
import { formatarBRL } from '../../regras/dinheiro';
import { ehEmpresa } from '../../regras/espacos';
import { contasBancarias } from '../../regras/livroCaixa';
import { nomeDoMes } from '../../regras/relatorios';
import {
  apiConfigurada,
  editarColaborador,
  listarColaboradores,
  listarContas,
  listarSocios,
  removerColaborador,
} from '../../servicos/livroCaixa';
import SimboloDoVazio from '../componentes/SimboloDoVazio';
import {
  competenciasParaLancar,
  corpoDaPessoa,
  custoMensal,
  proximaFolha,
  resumoDaFolha,
  situacaoDaFolha,
  totalDosBeneficios,
  VINCULOS,
} from '../regras/folha';
import '../estilos/gestao.css';

const rotuloDoVinculo = (vinculo) => VINCULOS.find((opcao) => opcao.valor === vinculo)?.rotulo ?? vinculo;

async function carregar(espacoId) {
  const [colaboradores, contas, socios] = await Promise.all([
    listarColaboradores(espacoId),
    listarContas(espacoId),
    listarSocios(espacoId).catch(() => []),
  ]);
  return { colaboradores, contas, socios };
}

function Numero({ rotulo, icone, valor, rodape }) {
  return (
    <article className="of-kpi">
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

// Aba Pessoal (RH) da empresa: as pessoas da folha (CLT, PJ e sócio com
// pró-labore), com salário, benefícios e o custo de cada uma, e o lançamento
// da folha de uma competência no fluxo de caixa: um clique lança o salário e
// os benefícios de todos (cada um no seu dia de pagamento), e repetir não
// duplica. A conta está em regras/folha.ts. No espaço pessoal, volta à Visão
// geral.
export default function Pessoal() {
  const { espaco } = useOutletContext();
  const toast = useToast();
  const [hoje] = useState(hojeIso);
  const [competenciaEscolhida, setCompetencia] = useState(null);
  const [janela, setJanela] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const espacoId = espaco.dados?.id;
  const daEmpresa = ehEmpresa(espaco.dados);
  const buscar = useMemo(() => (apiConfigurada && espacoId && daEmpresa ? () => carregar(espacoId) : null), [espacoId, daEmpresa]);
  const livro = useCarga(buscar);

  if (!apiConfigurada || (!espaco.carregando && espaco.dados && !daEmpresa)) {
    return <Navigate to="/principal" replace />;
  }
  if (espaco.carregando || (livro.carregando && !livro.dados)) {
    return <Esqueleto />;
  }

  const erro = espaco.erro || livro.erro?.message;
  const dados = livro.dados;
  const pessoas = dados?.colaboradores ?? [];
  const contas = dados ? contasBancarias(dados.contas).filter((conta) => conta.ativa) : [];
  const { opcoes, sugerida } = competenciasParaLancar(pessoas, hoje);
  const competencia = competenciaEscolhida ?? sugerida;
  const situacao = situacaoDaFolha(pessoas, competencia);
  const resumo = resumoDaFolha(pessoas, hoje.slice(0, 7));
  const proxima = proximaFolha(pessoas, hoje);

  function fechar() {
    setJanela(null);
    setOcupado(false);
  }

  function aposSalvar() {
    fechar();
    livro.recarregar();
  }

  async function alternarAtivo(pessoa) {
    try {
      await editarColaborador(espacoId, pessoa.id, corpoDaPessoa(pessoa, { ativo: !pessoa.ativo }));
      toast.sucesso(pessoa.ativo ? 'Sai da próxima folha; as lançadas ficam.' : 'Volta para a próxima folha.', {
        titulo: `${pessoa.nome} ${pessoa.ativo ? 'fora da folha' : 'de volta à folha'}`,
      });
      livro.recarregar();
    } catch (falha) {
      toast.erro(falha.message, { titulo: 'Folha não mudou' });
    }
  }

  async function confirmarRemocao(pessoa) {
    setOcupado(true);
    try {
      await removerColaborador(espacoId, pessoa.id);
      toast.sucesso('As folhas já lançadas continuam no extrato.', { titulo: `${pessoa.nome} saiu do cadastro` });
      aposSalvar();
    } catch (falha) {
      toast.erro(falha.message, { titulo: 'Pessoa não removida' });
      setOcupado(false);
    }
  }

  return (
    <div className="of-empresa of-gestao">
      <header className="of-cabecalho">
        <div>
          <h1>Pessoal</h1>
          <p>Quem trabalha na empresa, quanto custa por mês e a folha lançada no fluxo de caixa com um clique.</p>
        </div>
        <div className="of-cabecalho-acoes">
          <button type="button" onClick={() => setJanela({ tipo: 'pessoa' })}>
            <Icone nome="mais" tamanho={16} />
            Incluir pessoa
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

      {dados && pessoas.length === 0 && (
        <section className="cartao vazio">
          <SimboloDoVazio icone="cracha" semente={71} />
          <h3>Ninguém na folha ainda</h3>
          <p>Inclua quem trabalha na empresa: CLT, prestador PJ ou o sócio com pró-labore. A folha de cada mês entra no fluxo de caixa com um clique.</p>
          <button type="button" onClick={() => setJanela({ tipo: 'pessoa' })}>
            <Icone nome="mais" tamanho={16} />
            Incluir pessoa
          </button>
        </section>
      )}

      {dados && pessoas.length > 0 && (
        <>
          <section className="of-kpis of-empresa-numeros" aria-label="Resumo da folha">
            <Numero rotulo="Custo mensal da folha" icone="cracha" valor={formatarBRL(resumo.total)}
              rodape={`${formatarBRL(resumo.salarios)} em salários · ${formatarBRL(resumo.beneficios)} em benefícios`} />
            <Numero rotulo="Pessoas na folha" icone="pessoas" valor={String(resumo.pessoas)}
              rodape={VINCULOS.map((vinculo) => `${resumo.porVinculo[vinculo.valor].pessoas} ${vinculo.rotulo}`).join(' · ')} />
            <Numero rotulo="Provisões CLT do mês" icone="calendario" valor={formatarBRL(resumo.decimoTerceiro + resumo.ferias)}
              rodape={`13º e férias; FGTS estimado em ${formatarBRL(resumo.fgts)}`} />
            <Numero rotulo="Próxima folha" icone="saida" valor={proxima ? formatarBRL(proxima.total) : 'Em dia'}
              rodape={proxima ? `A partir de ${formatarData(proxima.data)}, falta lançar` : 'Todas as folhas até este mês lançadas'} />
          </section>

          <section className="cartao of-painel" aria-labelledby="titulo-folha">
            <div className="of-painel-cabecalho">
              <h2 id="titulo-folha">Folha de {nomeDoMes(competencia)}</h2>
              <div className="abas of-periodo-da-gestao" role="group" aria-label="Competência da folha">
                {opcoes.map((opcao) => (
                  <button key={opcao} type="button" aria-pressed={competencia === opcao} onClick={() => setCompetencia(opcao)}>
                    {nomeDoMes(opcao).replace(/ de \d{4}$/, '')}
                  </button>
                ))}
              </div>
            </div>
            {situacao.ativos.length === 0 ? (
              <p className="of-discreto">Ninguém ativo nesta competência.</p>
            ) : situacao.pendentes.length === 0 ? (
              <p className="of-folha-em-dia">
                <Icone nome="certo" tamanho={18} />
                Folha lançada: {situacao.lancados.length} pessoa(s) no fluxo de caixa.
              </p>
            ) : (
              <div className="of-folha-pendente">
                <p>
                  <b>{situacao.pendentes.length} pessoa(s) sem a folha lançada</b>
                  <small>
                    {formatarBRL(situacao.totalPendente)} em salários e benefícios
                    {situacao.lancados.length > 0 && ` · ${situacao.lancados.length} já lançada(s)`}
                  </small>
                </p>
                <button type="button" onClick={() => setJanela({ tipo: 'folha' })}>
                  <Icone nome="saida" tamanho={16} />
                  Lançar folha de {nomeDoMes(competencia).replace(/ de \d{4}$/, '')}
                </button>
              </div>
            )}
          </section>

          <section className="cartao of-painel" aria-labelledby="titulo-pessoas-da-folha">
            <div className="of-painel-cabecalho">
              <h2 id="titulo-pessoas-da-folha">Pessoas</h2>
              <small>{pessoas.filter((pessoa) => pessoa.ativo).length} na folha</small>
            </div>
            <div className="of-tabela-da-gestao">
              <table>
                <caption className="apenas-leitor">Pessoas da folha com vínculo, salário, benefícios e custo mensal</caption>
                <thead>
                  <tr>
                    <th scope="col">Pessoa</th>
                    <th scope="col">Vínculo</th>
                    <th scope="col">Salário</th>
                    <th scope="col">Benefícios</th>
                    <th scope="col">Custo mensal</th>
                    <th scope="col">Pagamento</th>
                    <th scope="col">
                      <span className="apenas-leitor">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pessoas.map((pessoa) => (
                    <tr key={pessoa.id} className={pessoa.ativo ? undefined : 'inativo'}>
                      <th scope="row">
                        <span className="of-pessoa-da-folha">
                          <b>{pessoa.nome}</b>
                          <small>{pessoa.ativo ? (pessoa.cargo ?? '—') : 'Fora da folha'}</small>
                        </span>
                      </th>
                      <td>
                        <span className={`of-vinculo ${pessoa.vinculo.toLowerCase()}`}>{rotuloDoVinculo(pessoa.vinculo)}</span>
                      </td>
                      <td>{formatarBRL(pessoa.salario_centavos)}</td>
                      <td>{formatarBRL(totalDosBeneficios(pessoa))}</td>
                      <td className="destaque">{formatarBRL(custoMensal(pessoa))}</td>
                      <td>dia {pessoa.dia_pagamento}</td>
                      <td className="acao">
                        <Menu
                          rotulo={`Ações de ${pessoa.nome}`}
                          itens={[
                            { id: 'editar', rotulo: 'Editar', icone: 'editar', aoEscolher: () => setJanela({ tipo: 'pessoa', emEdicao: pessoa }) },
                            {
                              id: 'ativo',
                              rotulo: pessoa.ativo ? 'Tirar da folha' : 'Voltar à folha',
                              descricao: pessoa.ativo ? 'Saiu da empresa: as folhas lançadas ficam.' : 'Entra de novo na próxima folha.',
                              icone: pessoa.ativo ? 'olhoFechado' : 'olho',
                              aoEscolher: () => alternarAtivo(pessoa),
                            },
                            {
                              id: 'remover',
                              rotulo: 'Excluir do cadastro',
                              descricao: 'As folhas lançadas continuam no extrato.',
                              icone: 'excluir',
                              perigo: true,
                              aoEscolher: () => setJanela({ tipo: 'remover', pessoa }),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="of-discreto">
              Custo mensal = salário (ou contrato, ou pró-labore) + benefícios. As provisões de 13º, férias e FGTS são
              estimativas sobre os salários CLT; os encargos entram como tributos sobre a folha na aba Impostos.
            </p>
          </section>
        </>
      )}

      <Modal
        aberta={janela?.tipo === 'pessoa'}
        titulo={janela?.emEdicao ? 'Editar pessoa' : 'Incluir pessoa na folha'}
        descricao={janela?.emEdicao ? janela.emEdicao.nome : 'Vínculo, valor mensal, benefícios e o dia do pagamento.'}
        ocupado={ocupado}
        largura="larga"
        aoFechar={fechar}
      >
        {janela?.tipo === 'pessoa' && (
          <FormularioDeColaborador espacoId={espacoId} pessoas={pessoas} emEdicao={janela.emEdicao ?? null}
            sugestoesDeNome={(dados?.socios ?? []).map((socio) => socio.nome)}
            aoSalvar={aposSalvar} aoCancelar={fechar} aoMudarOcupado={setOcupado} />
        )}
      </Modal>

      <Modal
        aberta={janela?.tipo === 'folha'}
        titulo={`Lançar a folha de ${nomeDoMes(competencia)}`}
        descricao="Salário e benefícios de quem ainda falta, no fluxo de caixa."
        ocupado={ocupado}
        aoFechar={fechar}
      >
        {janela?.tipo === 'folha' && (
          <FormularioDaFolha espacoId={espacoId} situacao={situacao} contas={contas} aoLancar={aposSalvar}
            aoCancelar={fechar} aoMudarOcupado={setOcupado} />
        )}
      </Modal>

      <Confirmacao
        aberta={janela?.tipo === 'remover'}
        titulo={janela?.tipo === 'remover' ? `Excluir ${janela.pessoa.nome} do cadastro?` : ''}
        rotuloDeConfirmar="Excluir do cadastro"
        perigo
        ocupado={ocupado}
        aoConfirmar={() => janela?.tipo === 'remover' && confirmarRemocao(janela.pessoa)}
        aoCancelar={() => !ocupado && fechar()}
      >
        Para quem saiu da empresa, prefira "Tirar da folha": o cadastro fica. As folhas já lançadas continuam no extrato
        de qualquer jeito.
      </Confirmacao>
    </div>
  );
}
