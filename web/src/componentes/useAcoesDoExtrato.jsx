import { useState } from 'react';
import Confirmacao from './Confirmacao';
import FormularioDeEdicao from './FormularioDeEdicao';
import Modal from './Modal';
import { useToast } from './toast/useToast';
import { formatarBRL } from '../regras/dinheiro';
import { formatarData } from '../regras/datas';
import { estornar, excluir, excluirVarios } from '../servicos/livroCaixa';

const contar = (quantidade, singular, plural) => `${quantidade} ${quantidade === 1 ? singular : plural}`;

// O que cada ação faz, dito no próprio menu da linha: editar muda o
// lançamento, estornar deixa rastro, excluir não. A parcela de uma compra no
// cartão não se estorna sozinha: excluir leva a compra inteira (a API faz o
// mesmo).
function itensDaLinha(linha, { aoEditar, aoEstornar, aoExcluir }) {
  const itens = [
    {
      id: 'editar',
      rotulo: 'Editar',
      descricao: linha.parcela
        ? 'Renomeia ou muda a categoria e o responsável da compra inteira.'
        : 'Renomeia ou corrige valor, data, categoria, responsável e meio.',
      icone: 'editar',
      aoEscolher: () => aoEditar(linha),
    },
  ];
  if (!linha.estorno && !linha.estornado && !linha.parcela) {
    itens.push({
      id: 'estornar',
      rotulo: 'Estornar',
      descricao: 'Lança hoje o valor contrário. O original fica no extrato, riscado.',
      icone: 'estornar',
      aoEscolher: () => aoEstornar(linha),
    });
  }
  let descricao = 'Apaga de vez, sem histórico. Para erro de digitação ou duplicado.';
  if (linha.estorno) {
    descricao = 'Apaga este estorno. O original volta a contar no saldo.';
  } else if (linha.parcela) {
    descricao = `Apaga a compra inteira: as ${linha.parcela.total} parcelas, em todas as faturas.`;
  }
  itens.push({
    id: 'excluir',
    rotulo: linha.parcela ? 'Excluir compra' : 'Excluir',
    descricao,
    icone: 'excluir',
    perigo: true,
    aoEscolher: () => aoExcluir(linha),
  });
  return itens;
}

// O que sai junto numa remoção em lote, dito antes de confirmar.
function consequenciasDoLote(linhas) {
  const avisos = [];
  const parcelas = linhas.filter((linha) => linha.parcela).length;
  const pagamentos = linhas.filter((linha) => linha.tipo === 'pagamento').length;
  const estornados = linhas.filter((linha) => linha.estornado).length;
  if (parcelas) {
    avisos.push('Compra parcelada sai inteira: as parcelas das outras faturas também, e o limite ocupado por elas volta.');
  }
  if (pagamentos) {
    avisos.push(
      `${contar(pagamentos, 'pagamento de fatura sai', 'pagamentos de fatura saem')} da conta e da fatura: o saldo da conta volta, e o valor volta a ocupar o limite do cartão.`,
    );
  }
  if (estornados) {
    avisos.push('O estorno de cada lançamento estornado sai junto.');
  }
  return avisos;
}

// Editar, estornar e excluir linhas do extrato (da conta ou da fatura do
// cartão), uma por uma pelo menu ou em lote pela seleção, com a confirmação
// de cada ação. Devolve os itens do menu de uma linha, removerEmLote(linhas)
// e os diálogos, que a página desenha uma vez. aoMudar recarrega a tela;
// removerEmLote chama aoConcluir (limpar a seleção) quando dá certo.
export function useAcoesDoExtrato({ espacoId, categorias = [], familia = [], aoMudar }) {
  const toast = useToast();
  const [aEditar, setAEditar] = useState(null);
  const [editando, setEditando] = useState(false);
  const [aEstornar, setAEstornar] = useState(null);
  const [aExcluir, setAExcluir] = useState(null);
  const [lote, setLote] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function confirmarEstorno() {
    setOcupado(true);
    try {
      const estorno = await estornar(espacoId, aEstornar.id);
      toast.sucesso(`Entrou em ${formatarData(estorno.data)}, com o valor no sentido contrário.`, { titulo: 'Lançamento estornado' });
      setAEstornar(null);
      aoMudar();
    } catch (erro) {
      toast.erro(erro.message, { titulo: 'Estorno não registrado' });
    } finally {
      setOcupado(false);
    }
  }

  async function confirmarExclusao() {
    setOcupado(true);
    try {
      await excluir(espacoId, aExcluir.id);
      let detalhe = 'Ele saiu do extrato e do saldo.';
      if (aExcluir.parcela) {
        detalhe = `As ${aExcluir.parcela.total} parcelas saíram das faturas, e o limite voltou.`;
      } else if (aExcluir.estornado) {
        detalhe = 'O estorno dele saiu junto.';
      }
      toast.sucesso(detalhe, { titulo: `"${aExcluir.descricao}" excluído` });
      setAExcluir(null);
      aoMudar();
    } catch (erro) {
      toast.erro(erro.message, { titulo: 'Lançamento não excluído' });
    } finally {
      setOcupado(false);
    }
  }

  async function confirmarLote() {
    setOcupado(true);
    try {
      const { excluidos } = await excluirVarios(
        espacoId,
        lote.linhas.map((linha) => linha.id),
      );
      const extras = excluidos - lote.linhas.length;
      const detalhe =
        extras > 0
          ? `Inclui ${contar(extras, 'lançamento ligado', 'lançamentos ligados')} aos escolhidos (parcelas e estornos).`
          : 'Saíram do extrato e do saldo.';
      toast.sucesso(detalhe, { titulo: contar(excluidos, 'lançamento excluído', 'lançamentos excluídos') });
      lote.aoConcluir?.();
      setLote(null);
      aoMudar();
    } catch (erro) {
      toast.erro(erro.message, { titulo: 'Lançamentos não excluídos' });
    } finally {
      setOcupado(false);
    }
  }

  function aposEditar(salvo) {
    setAEditar(null);
    setEditando(false);
    if (salvo) {
      aoMudar();
    }
  }

  const itens = (linha) => itensDaLinha(linha, { aoEditar: setAEditar, aoEstornar: setAEstornar, aoExcluir: setAExcluir });

  // linhas: as linhas do extrato a remover (marcadas ou todas as da tela).
  const removerEmLote = (linhas, aoConcluir) => {
    if (linhas.length > 0) {
      setLote({ linhas, aoConcluir });
    }
  };

  const total = lote ? lote.linhas.reduce((soma, linha) => soma + Math.abs(linha.valor), 0) : 0;

  const dialogos = (
    <>
      <Modal aberta={Boolean(aEditar)} titulo="Editar lançamento" descricao={aEditar?.descricao}
        aoFechar={() => aposEditar(null)} ocupado={editando}>
        {aEditar && (
          <FormularioDeEdicao
            espacoId={espacoId}
            linha={aEditar}
            categorias={categorias}
            familia={familia}
            aoSalvar={aposEditar}
            aoCancelar={() => aposEditar(null)}
            aoMudarOcupado={setEditando}
          />
        )}
      </Modal>

      <Confirmacao
        aberta={Boolean(aEstornar)}
        titulo={aEstornar ? `Estornar "${aEstornar.descricao}"?` : ''}
        rotuloDeConfirmar="Estornar"
        ocupado={ocupado}
        aoConfirmar={confirmarEstorno}
        aoCancelar={() => !ocupado && setAEstornar(null)}
      >
        {aEstornar && (
          <p>
            Entra hoje um lançamento de {formatarBRL(Math.abs(aEstornar.valor))} no sentido contrário, e o saldo volta ao que
            era. O original continua no extrato, marcado como estornado: o histórico fica. Um lançamento só pode ser estornado
            uma vez.
          </p>
        )}
      </Confirmacao>

      <Confirmacao
        aberta={Boolean(aExcluir)}
        titulo={aExcluir ? `Excluir "${aExcluir.descricao}"?` : ''}
        rotuloDeConfirmar={aExcluir?.parcela ? 'Excluir compra' : 'Excluir'}
        perigo
        ocupado={ocupado}
        aoConfirmar={confirmarExclusao}
        aoCancelar={() => !ocupado && setAExcluir(null)}
      >
        {aExcluir && !aExcluir.parcela && (
          <>
            <p>
              O lançamento de {formatarBRL(Math.abs(aExcluir.valor))} some do extrato e do saldo, sem deixar registro. Use para
              erro de digitação ou lançamento duplicado; para desfazer mantendo o histórico, use Estornar.
            </p>
            {aExcluir.estornado && <p>O estorno dele também será excluído.</p>}
            {aExcluir.estorno && <p>O lançamento original volta a contar no saldo.</p>}
          </>
        )}
        {aExcluir?.parcela && (
          <p>
            Esta é a parcela {aExcluir.parcela.numero} de {aExcluir.parcela.total}. A compra sai inteira: as{' '}
            {aExcluir.parcela.total} parcelas somem de todas as faturas, e o limite ocupado por elas volta. Não há como desfazer.
          </p>
        )}
      </Confirmacao>

      <Confirmacao
        aberta={Boolean(lote)}
        titulo={lote ? `Remover ${contar(lote.linhas.length, 'lançamento', 'lançamentos')}?` : ''}
        rotuloDeConfirmar="Remover"
        perigo
        ocupado={ocupado}
        aoConfirmar={confirmarLote}
        aoCancelar={() => !ocupado && setLote(null)}
      >
        {lote && (
          <>
            <p>
              {lote.linhas.length === 1 ? 'Ele some' : 'Eles somem'} do extrato e do saldo ({formatarBRL(total)} ao todo), sem
              deixar registro. Não há como desfazer.
            </p>
            {consequenciasDoLote(lote.linhas).map((aviso) => (
              <p key={aviso}>{aviso}</p>
            ))}
          </>
        )}
      </Confirmacao>
    </>
  );

  return { itens, removerEmLote, dialogos };
}
