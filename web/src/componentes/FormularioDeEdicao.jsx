import { useState } from 'react';
import Campo from './Campo';
import CampoDeResponsavel from './CampoDeResponsavel';
import SeletorDeMeio from './SeletorDeMeio';
import Seletor from './Seletor';
import SeletorDeData from './SeletorDeData';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import { camposEditaveis, corpoDaEdicao, formularioDaEdicao, ORDEM_DA_EDICAO, validarEdicao } from '../regras/edicao';
import { errosDaApi } from '../regras/livroCaixa';
import { editarLancamento } from '../servicos/livroCaixa';

// Por que um campo não aparece: dito antes dos campos, para a pessoa não
// procurar o valor que não pode mudar.
function avisoDoLancamento(lancamento) {
  if (lancamento.estorno_de) {
    return 'Estorno: só a descrição, o responsável e o meio mudam, porque ele espelha o lançamento original.';
  }
  if (lancamento.estornado_por) {
    return 'Lançamento estornado: só a descrição, o responsável e o meio mudam, porque o estorno espelha este valor.';
  }
  if (lancamento.compra_id) {
    return `Parcela ${lancamento.parcela} de ${lancamento.parcelas}: a descrição, a categoria e o responsável mudam nas ${lancamento.parcelas} parcelas. Para mudar data ou valor, exclua a compra e lance de novo.`;
  }
  return '';
}

// Formulário do "Editar" do menu da linha (dentro do modal): renomear e
// corrigir um lançamento já gravado. Só aparecem os campos que aquele
// lançamento deixa mudar (regras/edicao.js), e só o que mudou vai à API.
// linha é a linha do extrato (paraExtrato), com o lançamento em original.
// aoSalvar recebe o lançamento salvo (ou null quando nada mudou).
// familia: as pessoas da casa (Plano Família); sem elas, o responsável não
// aparece e não muda.
export default function FormularioDeEdicao({ espacoId, linha, categorias, familia = [], aoSalvar, aoCancelar, aoMudarOcupado }) {
  const toast = useToast();
  const lancamento = linha.original;
  const campos = camposEditaveis(lancamento, { noCartao: linha.noCartao });
  const [formulario, setFormulario] = useState(() => formularioDaEdicao(lancamento));
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);

  // Categorias ativas do mesmo tipo; a atual entra mesmo desativada, para o
  // seletor não aparecer vazio.
  const opcoesDeCategoria = categorias
    .filter((categoria) => categoria.tipo === lancamento.tipo && (categoria.ativa || categoria.id === lancamento.categoria_id))
    .map((categoria) => ({ valor: categoria.id, rotulo: categoria.nome, cor: categoria.cor }));
  const aviso = avisoDoLancamento(lancamento);

  function mudar(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  async function enviar(evento) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements;
    const encontrados = validarEdicao(formulario, lancamento, campos);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DA_EDICAO);
    if (primeiro) {
      elementos[primeiro]?.focus();
      return;
    }
    const mudancas = corpoDaEdicao(formulario, lancamento, campos);
    if (Object.keys(mudancas).length === 0) {
      aoSalvar(null);
      return;
    }

    setEnviando(true);
    aoMudarOcupado?.(true);
    try {
      const salvo = await editarLancamento(espacoId, lancamento.id, mudancas);
      toast.sucesso(lancamento.compra_id ? `As ${lancamento.parcelas} parcelas mudaram juntas.` : 'O extrato já mostra a mudança.', {
        titulo: `"${salvo.descricao}" salvo`,
      });
      aoSalvar(salvo);
    } catch (erro) {
      setErros(errosDaApi(erro.campos));
      toast.erro(erro.message, { titulo: 'Lançamento não salvo' });
      setEnviando(false);
      aoMudarOcupado?.(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      {aviso && <p className="dica-do-campo">{aviso}</p>}

      <Campo rotulo="Descrição" name="descricao" mascara="texto" autoComplete="off" maxLength={120} data-foco-inicial
        value={formulario.descricao} onChange={(evento) => mudar('descricao', evento.target.value)} erro={erros.descricao} />

      {(campos.valor || campos.data) && (
        <div className="duas-colunas">
          <Campo rotulo="Valor (R$)" name="valor" mascara="moeda" autoComplete="off" placeholder="0,00"
            value={formulario.valor} onChange={(evento) => mudar('valor', evento.target.value)} erro={erros.valor} />
          <Campo elemento={SeletorDeData} rotulo="Data" name="data"
            value={formulario.data} onChange={(evento) => mudar('data', evento.target.value)} erro={erros.data} />
        </div>
      )}

      {campos.categoria && (
        <Campo elemento={Seletor} rotulo="Categoria" name="categoria_id" placeholder="Escolha a categoria" opcoes={opcoesDeCategoria}
          value={formulario.categoria_id} onChange={(evento) => mudar('categoria_id', evento.target.value)} erro={erros.categoria_id} />
      )}

      {campos.responsavel && (
        <CampoDeResponsavel valor={formulario.responsavel} aoMudar={(nome) => mudar('responsavel', nome)}
          erro={erros.responsavel} familia={familia}
          dica={lancamento.compra_id ? `Vale para as ${lancamento.parcelas} parcelas.` : undefined} />
      )}

      {campos.meio && (
        <SeletorDeMeio valor={formulario.meio} aoMudar={(meio) => mudar('meio', meio)} erro={erros.meio} opcional />
      )}

      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
