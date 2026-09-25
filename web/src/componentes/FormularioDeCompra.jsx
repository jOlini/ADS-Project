import { useState } from 'react';
import AvisoComAtalho from './AvisoComAtalho';
import Campo from './Campo';
import DivisaoEntrePessoas from './DivisaoEntrePessoas';
import Seletor from './Seletor';
import SeletorDeData from './SeletorDeData';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import { compraVazia, corpoDaCompra, OPCOES_DE_PARCELAS, ORDEM_DA_COMPRA, textoDasParcelas, validarCompra } from '../regras/cartoes';
import { camposDaDivisao } from '../regras/divisao';
import { lerValor } from '../regras/dinheiro';
import { errosDaApi } from '../regras/livroCaixa';
import { comprarNoCartao } from '../servicos/livroCaixa';

// Formulário da "Nova compra" no cartão (dentro do modal): à vista ou
// parcelada. O valor é o total da compra; a API cria uma despesa por parcela,
// cada uma numa fatura, e o total ocupa o limite desde já. Racha entre
// pessoas só na compra à vista. aoComprar recebe as parcelas criadas.
export default function FormularioDeCompra({ espacoId, cartao, categorias, pessoasConhecidas, aoComprar, aoCancelar, aoMudarOcupado }) {
  const toast = useToast();
  const [formulario, setFormulario] = useState(compraVazia);
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);

  if (!cartao.ativa) {
    return (
      <AvisoComAtalho
        icone="cartao"
        titulo="Cartão desativado"
        atalho={{ para: '/contas#cartoes', rotulo: 'Abrir Contas & Cartões', icone: 'cartao' }}
        aoFechar={aoCancelar}
      >
        Cartão desativado não recebe compras novas. Para lançar, reative-o em Contas & Cartões (Editar).
      </AvisoComAtalho>
    );
  }

  const categoriasDeDespesa = categorias.filter((categoria) => categoria.ativa && categoria.tipo === 'DESPESA');
  const total = lerValor(formulario.valor);
  const parcelas = Number(formulario.parcelas);
  const ordem = [...ORDEM_DA_COMPRA, ...camposDaDivisao(formulario.divisao)];

  function mudar(campo, valor, campoDoErro = campo) {
    setFormulario((atual) => ({ ...atual, [campo]: valor, ...(campo === 'parcelas' && valor !== '1' ? { divisao: [] } : {}) }));
    setErros((atuais) => ({ ...atuais, [campoDoErro]: undefined, ...(campo === 'valor' || campo === 'divisao' ? { divisao: undefined } : {}) }));
  }

  function focar(elementos, campo) {
    if (campo) {
      (elementos[campo] ?? elementos[`${campo}.0.pessoa`])?.focus();
    }
  }

  async function enviar(evento) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements;
    const encontrados = validarCompra(formulario);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ordem);
    if (primeiro) {
      focar(elementos, primeiro);
      return;
    }

    setEnviando(true);
    aoMudarOcupado?.(true);
    try {
      const criadas = await comprarNoCartao(espacoId, cartao.id, corpoDaCompra(formulario));
      toast.sucesso(`${criadas[0].descricao} · ${textoDasParcelas(total, parcelas)}`, { titulo: 'Compra lançada no cartão' });
      aoComprar(criadas);
    } catch (erro) {
      const campos = errosDaApi(erro.campos);
      setErros(campos);
      toast.erro(erro.message, { titulo: 'Compra não lançada' });
      focar(elementos, primeiroCampoComErro(campos, ordem));
      setEnviando(false);
      aoMudarOcupado?.(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <Campo rotulo="Descrição" name="descricao" autoComplete="off" maxLength={120} placeholder="Ex.: Supermercado"
        value={formulario.descricao} onChange={(evento) => mudar('descricao', evento.target.value)} erro={erros.descricao} />

      <div className="duas-colunas">
        <Campo rotulo="Valor total (R$)" name="valor" inputMode="decimal" autoComplete="off" placeholder="0,00"
          value={formulario.valor} onChange={(evento) => mudar('valor', evento.target.value)} erro={erros.valor} />
        <Campo elemento={SeletorDeData} rotulo="Data da compra" name="data"
          value={formulario.data} onChange={(evento) => mudar('data', evento.target.value)} erro={erros.data} />
      </div>

      <div className="duas-colunas">
        <Campo elemento={Seletor} rotulo="Categoria" name="categoria_id" placeholder="Escolha a categoria"
          opcoes={categoriasDeDespesa.map((categoria) => ({ valor: categoria.id, rotulo: categoria.nome, cor: categoria.cor }))}
          value={formulario.categoria_id} onChange={(evento) => mudar('categoria_id', evento.target.value)} erro={erros.categoria_id} />
        <Campo elemento={Seletor} rotulo="Parcelas" name="parcelas" opcoes={OPCOES_DE_PARCELAS}
          value={formulario.parcelas} onChange={(evento) => mudar('parcelas', evento.target.value)} erro={erros.parcelas}
          dica={total ? textoDasParcelas(total, parcelas) : undefined} />
      </div>

      {categoriasDeDespesa.length === 0 && (
        <AvisoComAtalho compacto atalho={{ para: '/categorias?cadastrar=DESPESA', rotulo: 'Criar categoria', icone: 'categorias' }}>
          Nenhuma categoria de despesa ativa.
        </AvisoComAtalho>
      )}

      {parcelas > 1 ? (
        <p className="dica-do-campo">
          A primeira parcela cai na fatura da data da compra, e cada uma das outras na fatura seguinte. O valor total ocupa o
          limite desde já e volta a cada pagamento.
        </p>
      ) : (
        <DivisaoEntrePessoas
          partes={formulario.divisao}
          total={total || null}
          erros={erros}
          pessoasConhecidas={pessoasConhecidas}
          aoMudar={(partes, campo) => mudar('divisao', partes, campo)}
        />
      )}

      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Lançando…' : 'Lançar compra'}
        </button>
      </div>
    </form>
  );
}
