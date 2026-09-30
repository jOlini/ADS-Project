import { useState } from 'react';
import AvisoComAtalho from './AvisoComAtalho';
import Campo from './Campo';
import Seletor from './Seletor';
import SeletorDeData from './SeletorDeData';
import { useToast } from './toast/useToast';
import { dataExiste, formatarData } from '../regras/datas';
import { formatarBRL } from '../regras/dinheiro';
import { errosDaApi } from '../regras/livroCaixa';
import { nomeDoMes } from '../regras/relatorios';
import { custoMensal, dataDoPagamento, somarCompetencia } from '../olifine/regras/folha';
import { lancarFolha } from '../servicos/livroCaixa';

// Lançar a folha de uma competência (aba Pessoal): quem ainda falta, a conta
// de onde sai e a data. Sem data única, cada pessoa recebe no dia de
// pagamento dela, no mês seguinte à competência. A API lança o salário e os
// benefícios de cada um e pula quem já estava lançado: repetir não duplica.
export default function FormularioDaFolha({ espacoId, situacao, contas, aoLancar, aoCancelar, aoMudarOcupado }) {
  const toast = useToast();
  const [conta, setConta] = useState(contas.length === 1 ? contas[0].id : '');
  const [dataUnica, setDataUnica] = useState(false);
  const [data, setData] = useState('');
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);

  if (contas.length === 0) {
    return (
      <AvisoComAtalho
        icone="contas"
        titulo="Nenhuma conta para pagar a folha"
        atalho={{ para: '/contas?cadastrar=conta', rotulo: 'Cadastrar conta', icone: 'contas' }}
        aoFechar={aoCancelar}
      >
        A folha sai de uma conta da empresa (corrente, poupança, carteira). Cadastre a conta com o saldo de hoje e volte.
      </AvisoComAtalho>
    );
  }

  async function enviar(evento) {
    evento.preventDefault();
    const encontrados = {};
    if (!conta) {
      encontrados.conta_id = 'Escolha a conta de onde a folha sai.';
    }
    if (dataUnica && !dataExiste(data)) {
      encontrados.data = 'Informe uma data válida.';
    }
    setErros(encontrados);
    if (Object.keys(encontrados).length > 0) {
      evento.currentTarget.elements[Object.keys(encontrados)[0]]?.focus();
      return;
    }
    setEnviando(true);
    aoMudarOcupado?.(true);
    try {
      const resultado = await lancarFolha(espacoId, {
        competencia: situacao.competencia,
        conta_id: conta,
        ...(dataUnica ? { data } : {}),
      });
      const puladas = resultado.ja_lancados > 0 ? ` ${resultado.ja_lancados} pessoa(s) já estava(m) lançada(s).` : '';
      toast.sucesso(`${resultado.lancados} lançamento(s), ${formatarBRL(resultado.total_centavos)} no fluxo de caixa.${puladas}`, {
        titulo: `Folha de ${nomeDoMes(situacao.competencia)} lançada`,
      });
      aoLancar(resultado);
    } catch (erro) {
      setErros(errosDaApi(erro.campos));
      toast.erro(erro.message, { titulo: 'Folha não lançada' });
      setEnviando(false);
      aoMudarOcupado?.(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <ul className="of-folha-pendentes" aria-label="Quem entra nesta folha">
        {situacao.pendentes.map((pessoa) => (
          <li key={pessoa.id}>
            <span>
              <b>{pessoa.nome}</b>
              <small>
                {pessoa.vinculo === 'PRO_LABORE' ? 'Pró-labore' : pessoa.vinculo} · dia {pessoa.dia_pagamento}
              </small>
            </span>
            <b>{formatarBRL(custoMensal(pessoa))}</b>
          </li>
        ))}
        <li className="total">
          <span>Total</span>
          <b>{formatarBRL(situacao.totalPendente)}</b>
        </li>
      </ul>

      <Campo elemento={Seletor} rotulo="Sai da conta" name="conta_id" placeholder="Escolha a conta"
        opcoes={contas.map((item) => ({ valor: item.id, rotulo: `${item.nome} · ${formatarBRL(item.saldo_centavos)}` }))}
        value={conta} onChange={(evento) => { setConta(evento.target.value); setErros((atuais) => ({ ...atuais, conta_id: undefined })); }}
        erro={erros.conta_id} />

      <label className="caixa-de-marcar">
        <input type="checkbox" checked={dataUnica} onChange={(evento) => setDataUnica(evento.target.checked)} />
        Pagar todos na mesma data
      </label>
      {dataUnica ? (
        <Campo elemento={SeletorDeData} rotulo="Data do pagamento" name="data" value={data}
          onChange={(evento) => { setData(evento.target.value); setErros((atuais) => ({ ...atuais, data: undefined })); }}
          erro={erros.data} />
      ) : (
        <p className="dica-do-campo">
          Cada pessoa no próprio dia de pagamento, em {nomeDoMes(somarCompetencia(situacao.competencia, 1))}
          {situacao.pendentes.length > 0 &&
            ` (a primeira em ${formatarData(dataDoPagamento(situacao.competencia, Math.min(...situacao.pendentes.map((pessoa) => pessoa.dia_pagamento))))})`}
          .
        </p>
      )}
      <p className="dica-do-campo">
        Salário (na categoria do vínculo) e benefícios viram lançamentos com o nome de cada pessoa como responsável.
      </p>

      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Lançando…' : 'Lançar folha'}
        </button>
      </div>
    </form>
  );
}
