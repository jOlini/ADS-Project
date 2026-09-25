import { useState } from 'react';
import Confirmacao from './Confirmacao';
import { useToast } from './toast/useToast';
import { formatarBRL } from '../regras/dinheiro';
import { formatarData } from '../regras/datas';
import { estornar, excluir } from '../servicos/livroCaixa';

// O que cada ação faz, dito no próprio menu da linha: estornar deixa rastro,
// excluir não. A parcela de uma compra no cartão não se estorna sozinha:
// excluir leva a compra inteira (a API faz o mesmo).
function itensDaLinha(linha, { aoEstornar, aoExcluir }) {
  const itens = [];
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

// Estornar e excluir uma linha do extrato (da conta ou da fatura do cartão),
// com a confirmação de cada um. Devolve os itens do menu de uma linha e os
// diálogos, que a página desenha uma vez. aoMudar recarrega a tela.
export function useAcoesDoExtrato({ espacoId, aoMudar }) {
  const toast = useToast();
  const [aEstornar, setAEstornar] = useState(null);
  const [aExcluir, setAExcluir] = useState(null);
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

  const itens = (linha) => itensDaLinha(linha, { aoEstornar: setAEstornar, aoExcluir: setAExcluir });

  const dialogos = (
    <>
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
    </>
  );

  return { itens, dialogos };
}
