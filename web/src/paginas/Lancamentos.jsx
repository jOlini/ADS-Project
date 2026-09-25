import { useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import AvisoApi from '../componentes/AvisoApi';
import AvisoComAtalho from '../componentes/AvisoComAtalho';
import CampoDeBusca from '../componentes/CampoDeBusca';
import Carregando from '../componentes/Carregando';
import Extrato from '../componentes/Extrato';
import FormularioDeLancamento from '../componentes/FormularioDeLancamento';
import Icone from '../componentes/Icone';
import ImportarExtrato from '../componentes/ImportarExtrato';
import Menu from '../componentes/Menu';
import Modal from '../componentes/Modal';
import SeletorDeMes from '../componentes/SeletorDeMes';
import { useAcoesDoExtrato } from '../componentes/useAcoesDoExtrato';
import { useCarga } from '../componentes/useCarga';
import { buscarNoExtrato } from '../regras/busca';
import { nomeDoMes } from '../regras/calendario';
import { formatarBRL } from '../regras/dinheiro';
import { dataMaisRecente } from '../regras/importacao';
import {
  cartoesDe,
  contasBancarias,
  estaNoMes,
  intervaloDoMes,
  lancamentosDasContas,
  mesDe,
  mudarMes,
  paraExtrato,
  saldoTotal,
} from '../regras/livroCaixa';
import { agruparPorDia, filtrarDias, saldoAntesDe, somarMes } from '../regras/resumo';
import {
  apiConfigurada,
  LIMITE_DE_LANCAMENTOS,
  listarCategorias,
  listarContas,
  listarLancamentos,
  listarPessoas,
} from '../servicos/livroCaixa';
import '../estilos/lancamentos.css';

const FILTROS = [
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'entradas', rotulo: 'Entradas' },
  { id: 'saidas', rotulo: 'Saídas' },
];

// Contas, categorias e pessoas já usadas em rachas (nomes no extrato e
// opções dos formulários). As pessoas são só sugestão: se a busca falhar,
// a tela abre sem elas em vez de mostrar erro.
async function carregarCadastros(espacoId) {
  const [contas, categorias, pessoas] = await Promise.all([
    listarContas(espacoId),
    listarCategorias(espacoId),
    listarPessoas(espacoId).catch(() => []),
  ]);
  return { contas, categorias, pessoas };
}

// Lançamentos do mês e, à parte, os que vieram depois dele: estes só servem
// para achar o saldo do fim do mês a partir do saldo de hoje.
async function carregarMes(espacoId, mes) {
  const [doMes, depois] = await Promise.all([
    listarLancamentos(espacoId, intervaloDoMes(mes)),
    listarLancamentos(espacoId, { de: intervaloDoMes(mudarMes(mes, 1)).de }),
  ]);
  return { doMes, depois };
}

// Lançamentos: o extrato das contas num mês, ocupando a tela, com rolagem
// própria. Só o que mexe no dinheiro das contas (lançamentos, débitos, PIX,
// transferências e o pagamento de fatura); as compras no crédito ficam na
// fatura do cartão, em Contas & Cartões. No topo, a barra com "+ Novo
// lançamento" e "Importar CSV" (os dois abrem um modal); logo abaixo, o mês,
// a busca e o filtro. Cada linha tem o menu com Estornar (lançamento inverso,
// o histórico fica) e Excluir (apaga de vez).
export default function Lancamentos() {
  const { espaco } = useOutletContext();
  const [mes, setMes] = useState(() => mesDe(new Date()));
  const [filtro, setFiltro] = useState('tudo');
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(null);
  const [modalOcupado, setModalOcupado] = useState(false);

  const espacoId = espaco.dados?.id;
  const buscarCadastros = useMemo(() => (espacoId ? () => carregarCadastros(espacoId) : null), [espacoId]);
  const buscarMes = useMemo(() => (espacoId ? () => carregarMes(espacoId, mes) : null), [espacoId, mes]);
  const cadastros = useCarga(buscarCadastros);
  const extrato = useCarga(buscarMes);
  const acoes = useAcoesDoExtrato({
    espacoId,
    aoMudar: () => {
      cadastros.recarregar();
      extrato.recarregar();
    },
  });

  const contas = useMemo(() => cadastros.dados?.contas ?? [], [cadastros.dados]);
  const categorias = useMemo(() => cadastros.dados?.categorias ?? [], [cadastros.dados]);
  // Lançar e importar aqui é só nas contas; o cartão tem a fatura dele.
  const contasAtivas = contasBancarias(contas).filter((conta) => conta.ativa);
  const temCartoes = cartoesDe(contas).length > 0;

  const visao = useMemo(() => {
    if (!cadastros.dados || !extrato.dados) {
      return null;
    }
    const linhasDoMes = paraExtrato(lancamentosDasContas(extrato.dados.doMes, contas), contas, categorias);
    const depois = paraExtrato(lancamentosDasContas(extrato.dados.depois, contas), contas, categorias);
    const saldoNoFimDoMes = saldoAntesDe(depois, saldoTotal(contas));
    return {
      dias: agruparPorDia(linhasDoMes, saldoNoFimDoMes),
      saldoNoFimDoMes,
      // No teto da consulta pode faltar lançamento: o saldo do dia sai da tela.
      saldoConfiavel: extrato.dados.depois.length < LIMITE_DE_LANCAMENTOS && extrato.dados.doMes.length < LIMITE_DE_LANCAMENTOS,
    };
  }, [cadastros.dados, extrato.dados, contas, categorias]);

  if (!apiConfigurada) {
    return (
      <>
        <header className="cabecalho-da-pagina">
          <h1>Extrato</h1>
        </header>
        <AvisoApi />
      </>
    );
  }
  if (espaco.carregando || (espacoId && cadastros.carregando && !cadastros.dados)) {
    return <Carregando />;
  }
  const falha = espaco.erro || cadastros.erro?.message;
  if (falha) {
    return (
      <div className="cartao painel">
        <p className="mensagem erro" role="alert">
          <Icone nome="alerta" tamanho={16} />
          {falha}
        </p>
        <button type="button" className="secundario" onClick={() => window.location.reload()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  function recarregar() {
    cadastros.recarregar();
    extrato.recarregar();
  }

  function fecharModal() {
    setModal(null);
    setModalOcupado(false);
  }

  function aposLancar(criado) {
    fecharModal();
    if (!estaNoMes(criado.data, mes)) {
      setMes(mesDe(criado.data));
    }
    recarregar();
  }

  // Depois da importação, o extrato abre no mês do lançamento mais recente
  // que entrou, se ele não for o mês na tela.
  function aposImportar(resposta) {
    fecharModal();
    const ultima = dataMaisRecente(resposta.linhas);
    if (ultima && !estaNoMes(ultima, mes)) {
      setMes(mesDe(ultima));
    }
    recarregar();
  }

  const filtrado = filtro !== 'tudo' || busca.trim() !== '';
  const diasVisiveis = buscarNoExtrato(filtrarDias(visao?.dias ?? [], filtro), busca);
  const linhasVisiveis = diasVisiveis.flatMap((dia) => dia.lancamentos);
  // Com filtro ou busca, os totais descrevem só o que está na tela.
  const totais = somarMes(linhasVisiveis);
  const pessoasConhecidas = cadastros.dados?.pessoas ?? [];

  return (
    <div className="pagina-do-extrato">
      <header className="barra-do-extrato">
        <h1>Extrato</h1>
        <div className="acoes-do-extrato" role="toolbar" aria-label="Ações do extrato">
          <button type="button" className="secundario" onClick={() => setModal('importar')}>
            <Icone nome="importar" tamanho={18} />
            Importar CSV
          </button>
          <button type="button" onClick={() => setModal('novo')}>
            <Icone nome="mais" tamanho={18} />
            Novo lançamento
          </button>
        </div>
      </header>

      <section className="cartao extrato extrato-cheio" aria-label={`Extrato de ${nomeDoMes(mes)}`}>
        <div className="ferramentas-do-extrato">
          <SeletorDeMes valor={mes} aoMudar={setMes} rotulo="Mês do extrato" />
          <CampoDeBusca valor={busca} aoMudar={setBusca} rotulo="Buscar no extrato"
            placeholder="Buscar por descrição, valor ou pessoa" className="busca-do-extrato" />
          <div className="abas" role="group" aria-label="Filtrar o extrato">
            {FILTROS.map((opcao) => (
              <button key={opcao.id} type="button" aria-pressed={filtro === opcao.id} onClick={() => setFiltro(opcao.id)}>
                {opcao.rotulo}
              </button>
            ))}
          </div>
        </div>

        {visao && visao.dias.length > 0 && (
          <p className="totais-do-mes" aria-live="polite">
            {filtrado && (
              <span className="contagem">
                {linhasVisiveis.length === 1 ? '1 lançamento' : `${linhasVisiveis.length} lançamentos`}
              </span>
            )}
            <span>
              Entradas <b className="entrada">{formatarBRL(totais.entradas)}</b>
            </span>
            <span>
              Saídas <b>{formatarBRL(totais.saidas)}</b>
            </span>
            {!filtrado && visao.saldoConfiavel && (
              <span>
                Saldo no fim do mês <b>{formatarBRL(visao.saldoNoFimDoMes)}</b>
              </span>
            )}
          </p>
        )}

        <div className="rolagem-do-extrato" tabIndex={0} role="region" aria-label={`Lançamentos de ${nomeDoMes(mes)}`}>
          {extrato.erro ? (
            <p className="mensagem erro" role="alert">
              <Icone nome="alerta" tamanho={16} />
              {extrato.erro.message}
            </p>
          ) : !visao ? (
            <Carregando rotulo="Carregando o extrato" />
          ) : diasVisiveis.length > 0 ? (
            <Extrato
              dias={diasVisiveis}
              mostrarSaldo={!filtrado && visao.saldoConfiavel}
              acoes={(linha) => <Menu rotulo={`Ações de ${linha.descricao}`} itens={acoes.itens(linha)} />}
            />
          ) : (
            <div className="vazio">
              <span className="simbolo" aria-hidden="true">
                <Icone nome={filtrado ? 'busca' : 'lancamentos'} tamanho={20} />
              </span>
              <h3>{filtrado ? 'Nada encontrado' : `Nenhum lançamento em ${nomeDoMes(mes)}`}</h3>
              <p>
                {filtrado
                  ? 'Troque a busca ou o filtro para ver os outros lançamentos do mês.'
                  : contasAtivas.length === 0
                    ? 'Os lançamentos aparecem aqui depois que você cadastrar uma conta.'
                    : 'Use "Novo lançamento" para registrar o que entrou ou saiu, ou traga o extrato do banco com "Importar CSV".'}
              </p>
              {!filtrado && contasAtivas.length === 0 && (
                <Link className="botao" to="/contas?cadastrar=conta">
                  <Icone nome="contas" tamanho={16} />
                  Cadastrar conta
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      <Modal aberta={modal === 'novo'} titulo="Novo lançamento" aoFechar={fecharModal} ocupado={modalOcupado}>
        <FormularioDeLancamento
          espacoId={espacoId}
          contas={contasAtivas}
          temCartoes={temCartoes}
          categorias={categorias}
          pessoasConhecidas={pessoasConhecidas}
          aoLancar={aposLancar}
          aoCancelar={fecharModal}
          aoMudarOcupado={setModalOcupado}
        />
      </Modal>

      <Modal aberta={modal === 'importar'} titulo="Importar CSV" largura="larga" aoFechar={fecharModal} ocupado={modalOcupado}
        descricao="Traga o extrato exportado pelo banco. Nada é gravado antes de você conferir.">
        {contasAtivas.length === 0 ? (
          <AvisoComAtalho
            icone="contas"
            titulo="Nenhuma conta para receber o extrato"
            atalho={{ para: '/contas?cadastrar=conta', rotulo: 'Cadastrar conta', icone: 'contas' }}
            aoFechar={fecharModal}
          >
            O extrato do banco entra numa conta. Cadastre a conta (com o saldo de hoje) e volte para importar. A fatura do
            cartão de crédito se importa na tela do cartão, em Contas & Cartões.
          </AvisoComAtalho>
        ) : (
          <ImportarExtrato
            espacoId={espacoId}
            contas={contasAtivas}
            categorias={categorias}
            aoImportar={aposImportar}
            aoCancelar={fecharModal}
            aoMudarOcupado={setModalOcupado}
          />
        )}
      </Modal>

      {acoes.dialogos}
    </div>
  );
}
