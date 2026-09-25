import { useState } from 'react';
import AvisoComAtalho from './AvisoComAtalho';
import Campo from './Campo';
import DivisaoEntrePessoas from './DivisaoEntrePessoas';
import Seletor from './Seletor';
import SeletorDeData from './SeletorDeData';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import { hojeIso } from '../regras/datas';
import { formatarBRL, lerValor } from '../regras/dinheiro';
import { corpoDoLancamento, errosDaApi, ordemDoLancamento, TIPOS_DE_LANCAMENTO, validarLancamento } from '../regras/livroCaixa';
import { lancar } from '../servicos/livroCaixa';

const formularioVazio = (contas) => ({
  tipo: 'DESPESA',
  descricao: '',
  valor: '',
  data: hojeIso(),
  // Com uma conta só, ela já vem escolhida.
  conta_id: contas.length === 1 ? contas[0].id : '',
  categoria_id: '',
  conta_destino_id: '',
  divisao: [],
});

const opcoesDeConta = (contas) => contas.map((conta) => ({ valor: conta.id, rotulo: conta.nome }));

// Formulário do "+ Novo lançamento" (dentro do modal): receita, despesa ou
// transferência entre contas, com o racha entre pessoas nas duas primeiras.
// Confere tudo antes de ir à API e põe o foco no primeiro campo com erro.
// aoLancar recebe o lançamento criado. Compras no crédito não entram aqui: com
// cartões cadastrados, o formulário aponta a fatura (temCartoes).
export default function FormularioDeLancamento({ espacoId, contas, temCartoes = false, categorias, pessoasConhecidas, aoLancar, aoCancelar, aoMudarOcupado }) {
  const toast = useToast();
  const [formulario, setFormulario] = useState(() => formularioVazio(contas));
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);

  if (contas.length === 0) {
    return (
      <AvisoComAtalho
        icone="contas"
        titulo="Nenhuma conta para lançar"
        atalho={{ para: '/contas?cadastrar=conta', rotulo: 'Cadastrar conta', icone: 'contas' }}
        aoFechar={aoCancelar}
      >
        Todo lançamento sai de uma conta ou entra nela. Cadastre a conta (com o saldo de hoje) e volte para lançar.
      </AvisoComAtalho>
    );
  }

  const transferencia = formulario.tipo === 'TRANSFERENCIA';
  const categoriasDoTipo = categorias.filter((categoria) => categoria.ativa && categoria.tipo === formulario.tipo);
  const total = lerValor(formulario.valor);

  function mudar(campo, valor, campoDoErro = campo) {
    setFormulario((atual) => {
      const novo = { ...atual, [campo]: valor };
      // Trocar o tipo apaga a categoria escolhida: despesa e receita têm listas próprias.
      if (campo === 'tipo') {
        novo.categoria_id = '';
        novo.conta_destino_id = '';
      }
      return novo;
    });
    // Mexer no valor muda a conta da divisão; mexer numa parte, o total dela.
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
    const encontrados = validarLancamento(formulario);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ordemDoLancamento(formulario));
    if (primeiro) {
      focar(elementos, primeiro);
      return;
    }

    setEnviando(true);
    aoMudarOcupado?.(true);
    try {
      const criado = await lancar(espacoId, corpoDoLancamento(formulario));
      toast.sucesso(`${criado.descricao} · ${formatarBRL(lerValor(formulario.valor))}`, { titulo: 'Lançamento registrado' });
      aoLancar(criado);
    } catch (erro) {
      const campos = errosDaApi(erro.campos);
      setErros(campos);
      toast.erro(erro.message, { titulo: 'Lançamento não registrado' });
      focar(elementos, primeiroCampoComErro(campos, ordemDoLancamento(formulario)));
      setEnviando(false);
      aoMudarOcupado?.(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      {temCartoes && (
        <AvisoComAtalho icone="cartao" compacto atalho={{ para: '/contas#cartoes', rotulo: 'Abrir cartões', icone: 'cartao' }}>
          Compra no crédito entra na fatura do cartão, não aqui.
        </AvisoComAtalho>
      )}
      <div className="abas largas" role="group" aria-label="Tipo de lançamento">
        {TIPOS_DE_LANCAMENTO.map((tipo) => (
          <button key={tipo.valor} type="button" aria-pressed={formulario.tipo === tipo.valor} onClick={() => mudar('tipo', tipo.valor)}>
            {tipo.rotulo}
          </button>
        ))}
      </div>

      <Campo rotulo="Descrição" name="descricao" autoComplete="off" maxLength={120}
        placeholder={transferencia ? 'Ex.: Para a poupança' : 'Ex.: Churrasco de sábado'}
        value={formulario.descricao} onChange={(evento) => mudar('descricao', evento.target.value)} erro={erros.descricao} />

      <div className="duas-colunas">
        <Campo rotulo="Valor (R$)" name="valor" inputMode="decimal" autoComplete="off" placeholder="0,00"
          value={formulario.valor} onChange={(evento) => mudar('valor', evento.target.value)} erro={erros.valor} />
        <Campo elemento={SeletorDeData} rotulo="Data" name="data"
          value={formulario.data} onChange={(evento) => mudar('data', evento.target.value)} erro={erros.data} />
      </div>

      <div className="duas-colunas">
        <Campo elemento={Seletor} rotulo={transferencia ? 'Sai da conta' : 'Conta'} name="conta_id" placeholder="Escolha a conta"
          opcoes={opcoesDeConta(contas)} value={formulario.conta_id}
          onChange={(evento) => mudar('conta_id', evento.target.value)} erro={erros.conta_id} />

        {transferencia ? (
          <Campo elemento={Seletor} rotulo="Entra na conta" name="conta_destino_id" placeholder="Escolha o destino"
            opcoes={opcoesDeConta(contas).map((opcao) => ({ ...opcao, desabilitada: opcao.valor === formulario.conta_id }))}
            value={formulario.conta_destino_id}
            onChange={(evento) => mudar('conta_destino_id', evento.target.value)} erro={erros.conta_destino_id} />
        ) : (
          <Campo elemento={Seletor} rotulo="Categoria" name="categoria_id" placeholder="Escolha a categoria"
            opcoes={categoriasDoTipo.map((categoria) => ({ valor: categoria.id, rotulo: categoria.nome, cor: categoria.cor }))}
            value={formulario.categoria_id}
            onChange={(evento) => mudar('categoria_id', evento.target.value)} erro={erros.categoria_id} />
        )}
      </div>

      {!transferencia && categoriasDoTipo.length === 0 && (
        <AvisoComAtalho compacto
          atalho={{ para: `/categorias?cadastrar=${formulario.tipo}`, rotulo: 'Criar categoria', icone: 'categorias' }}>
          Nenhuma categoria de {formulario.tipo === 'DESPESA' ? 'despesa' : 'receita'} ativa.
        </AvisoComAtalho>
      )}

      {!transferencia && (
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
          {enviando ? 'Lançando…' : 'Lançar'}
        </button>
      </div>
    </form>
  );
}
