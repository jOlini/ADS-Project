import { useState } from 'react';
import AvisoComAtalho from './AvisoComAtalho';
import Campo from './Campo';
import Seletor from './Seletor';
import SeletorDeData from './SeletorDeData';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import { hojeIso } from '../regras/datas';
import { formatarBRL, valorParaCampo } from '../regras/dinheiro';
import { errosDaApi } from '../regras/livroCaixa';
import { corpoDoMovimento, ORDEM_DO_MOVIMENTO, TAMANHO_DA_DESCRICAO, validarMovimento } from '../olifine/regras/movimento';

// Dinheiro que a gestão da empresa lança numa conta, dentro de um modal:
// aporte do sócio (entra), pró-labore, distribuição de lucros e guia de
// imposto (saem). A conta, o valor (sugerido pela tela, editável: juros,
// multa, arredondamento), a data e, se quiser, a descrição. aoEnviar(corpo)
// chama a API e devolve o lançamento; um erro dela volta para os campos.
export default function FormularioDeMovimento({
  contas,
  valorSugerido = 0,
  dataSugerida,
  entra = false,
  comDescricao = true,
  dica,
  rotuloDoBotao,
  tituloDoErro,
  aoEnviar,
  aoCancelar,
  aoMudarOcupado,
}) {
  const toast = useToast();
  const [formulario, setFormulario] = useState(() => ({
    conta_id: contas.length === 1 ? contas[0].id : '',
    valor: valorSugerido > 0 ? valorParaCampo(valorSugerido) : '',
    data: dataSugerida ?? hojeIso(),
    descricao: '',
  }));
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);

  if (contas.length === 0) {
    return (
      <AvisoComAtalho
        icone="contas"
        titulo="Nenhuma conta da empresa"
        atalho={{ para: '/contas?cadastrar=conta', rotulo: 'Cadastrar conta', icone: 'contas' }}
        aoFechar={aoCancelar}
      >
        O dinheiro entra ou sai de uma conta da empresa (corrente, poupança, carteira). Cadastre a conta com o saldo de
        hoje e volte.
      </AvisoComAtalho>
    );
  }

  function mudar(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  async function enviar(evento) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements;
    const encontrados = validarMovimento(formulario, { entra });
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DO_MOVIMENTO);
    if (primeiro) {
      elementos[primeiro]?.focus();
      return;
    }
    setEnviando(true);
    aoMudarOcupado?.(true);
    try {
      await aoEnviar(corpoDoMovimento(formulario));
    } catch (erro) {
      const campos = errosDaApi(erro.campos);
      setErros({ ...campos, valor: campos.valor_centavos ?? campos.valor });
      toast.erro(erro.message, { titulo: tituloDoErro });
      setEnviando(false);
      aoMudarOcupado?.(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <Campo elemento={Seletor} rotulo={entra ? 'Entra na conta' : 'Sai da conta'} name="conta_id" placeholder="Escolha a conta"
        opcoes={contas.map((conta) => ({ valor: conta.id, rotulo: `${conta.nome} · ${formatarBRL(conta.saldo_centavos)}` }))}
        value={formulario.conta_id} onChange={(evento) => mudar('conta_id', evento.target.value)} erro={erros.conta_id} />

      <div className="duas-colunas">
        <Campo rotulo="Valor (R$)" name="valor" mascara="moeda" autoComplete="off" placeholder="0,00"
          value={formulario.valor} onChange={(evento) => mudar('valor', evento.target.value)} erro={erros.valor} />
        <Campo elemento={SeletorDeData} rotulo="Data" name="data"
          value={formulario.data} onChange={(evento) => mudar('data', evento.target.value)} erro={erros.data} />
      </div>

      {comDescricao && (
        <Campo
          rotulo={
            <>
              Descrição <span className="rotulo-opcional">(opcional)</span>
            </>
          }
          name="descricao" mascara="texto" autoComplete="off" maxLength={TAMANHO_DA_DESCRICAO}
          placeholder="Sem descrição, vai o tipo e o nome"
          value={formulario.descricao} onChange={(evento) => mudar('descricao', evento.target.value)} erro={erros.descricao} />
      )}
      {dica && <p className="dica-do-campo">{dica}</p>}

      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Lançando…' : rotuloDoBotao}
        </button>
      </div>
    </form>
  );
}
