import { useState } from 'react';
import Campo from './Campo';
import Seletor from './Seletor';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import { valorParaCampo } from '../regras/dinheiro';
import { errosDaApi } from '../regras/livroCaixa';
import {
  BASES,
  corpoDoTributo,
  ORDEM_DO_TRIBUTO,
  PERIODICIDADES,
  TIPOS_DE_TRIBUTO,
  validarTributo,
} from '../olifine/regras/impostos';
import { editarTributo, incluirTributo } from '../servicos/livroCaixa';

const aliquotaParaCampo = (centesimos) =>
  centesimos ? new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(centesimos / 100) : '';

function paraFormulario(tributo) {
  return {
    nome: tributo?.nome ?? '',
    tipo: tributo?.tipo ?? '',
    base: tributo?.base ?? 'FATURAMENTO',
    aliquota: aliquotaParaCampo(tributo?.aliquota_centesimos),
    valor_fixo: tributo?.valor_fixo_centavos ? valorParaCampo(tributo.valor_fixo_centavos) : '',
    dia_vencimento: String(tributo?.dia_vencimento ?? 20),
    periodicidade: tributo?.periodicidade ?? 'MENSAL',
    ativo: tributo?.ativo ?? true,
  };
}

// Formulário do tributo recorrente (aba Impostos): a guia (DAS, DARF, ISS,
// INSS, FGTS), a base da provisão (alíquota sobre o faturamento ou a folha,
// ou valor fixo), o dia do vencimento no mês seguinte e a periodicidade.
// inicial preenche com uma sugestão do regime; emEdicao edita um cadastrado.
export default function FormularioDeTributo({ espacoId, inicial = null, emEdicao = null, aoSalvar, aoCancelar, aoMudarOcupado }) {
  const toast = useToast();
  const [formulario, setFormulario] = useState(() => paraFormulario(emEdicao ?? inicial));
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);
  const fixo = formulario.base === 'FIXO';

  function mudar(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  async function enviar(evento) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements;
    const encontrados = validarTributo(formulario);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DO_TRIBUTO);
    if (primeiro) {
      elementos[primeiro]?.focus();
      return;
    }
    setEnviando(true);
    aoMudarOcupado?.(true);
    try {
      const corpo = corpoDoTributo(formulario);
      const salvo = emEdicao ? await editarTributo(espacoId, emEdicao.id, corpo) : await incluirTributo(espacoId, corpo);
      toast.sucesso('A agenda de vencimentos já usa os dados novos.', {
        titulo: `${salvo.nome} ${emEdicao ? 'atualizado' : 'cadastrado'}`,
      });
      aoSalvar(salvo);
    } catch (erro) {
      const campos = errosDaApi(erro.campos);
      setErros({ ...campos, aliquota: campos.aliquota_centesimos, valor_fixo: campos.valor_fixo_centavos });
      toast.erro(erro.message, { titulo: emEdicao ? 'Tributo não atualizado' : 'Tributo não cadastrado' });
      setEnviando(false);
      aoMudarOcupado?.(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <div className="duas-colunas">
        <Campo rotulo="Nome" name="nome" mascara="texto" autoComplete="off" maxLength={60} placeholder="Ex.: DAS"
          data-foco-inicial value={formulario.nome} onChange={(evento) => mudar('nome', evento.target.value)} erro={erros.nome} />
        <Campo elemento={Seletor} rotulo="Guia" name="tipo" placeholder="Escolha a guia"
          opcoes={TIPOS_DE_TRIBUTO.map(({ valor, rotulo, descricao }) => ({ valor, rotulo, descricao }))}
          value={formulario.tipo} onChange={(evento) => mudar('tipo', evento.target.value)} erro={erros.tipo} />
      </div>

      <Campo elemento={Seletor} rotulo="Como calcular" name="base"
        opcoes={BASES.map(({ valor, rotulo, descricao }) => ({ valor, rotulo, descricao }))}
        value={formulario.base} onChange={(evento) => mudar('base', evento.target.value)} erro={erros.base} />

      <div className="duas-colunas">
        {fixo ? (
          <Campo rotulo="Valor da guia (R$)" name="valor_fixo" mascara="moeda" autoComplete="off" placeholder="0,00"
            value={formulario.valor_fixo} onChange={(evento) => mudar('valor_fixo', evento.target.value)} erro={erros.valor_fixo} />
        ) : (
          <Campo rotulo="Alíquota (%)" name="aliquota" inputMode="decimal" autoComplete="off" maxLength={6} placeholder="Ex.: 6 ou 4,8"
            value={formulario.aliquota} onChange={(evento) => mudar('aliquota', evento.target.value)} erro={erros.aliquota} />
        )}
        <Campo rotulo="Dia do vencimento" name="dia_vencimento" mascara="inteiro" digitos={2} autoComplete="off"
          dica="No mês seguinte à competência."
          value={formulario.dia_vencimento} onChange={(evento) => mudar('dia_vencimento', evento.target.value)} erro={erros.dia_vencimento} />
      </div>

      <fieldset className="campo">
        <legend className="rotulo-do-campo">Competência</legend>
        <div className="abas largas" role="group" aria-label="Competência">
          {PERIODICIDADES.map((opcao) => (
            <button key={opcao.valor} type="button" name="periodicidade" aria-pressed={formulario.periodicidade === opcao.valor}
              onClick={() => mudar('periodicidade', opcao.valor)}>
              {opcao.rotulo}
            </button>
          ))}
        </div>
        <span className="erro-do-campo">{erros.periodicidade}</span>
      </fieldset>

      {emEdicao && (
        <label className="caixa-de-marcar">
          <input type="checkbox" checked={formulario.ativo} onChange={(evento) => mudar('ativo', evento.target.checked)} />
          Ativo (desligado, some da agenda; os pagamentos ficam)
        </label>
      )}

      <p className="dica-do-campo">
        Valores de referência: a alíquota e o vencimento dependem da faixa, do município e da lei. Confira com a sua
        contabilidade.
      </p>

      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Salvando…' : emEdicao ? 'Salvar' : 'Cadastrar tributo'}
        </button>
      </div>
    </form>
  );
}
