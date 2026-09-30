import { useState, type FormEvent } from 'react';
import Campo from './Campo';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import { errosDaApi } from '../regras/livroCaixa';
import { limparTexto } from '../regras/sanitizacao';
import {
  lerPercentual,
  ORDEM_DO_SOCIO,
  TAMANHO_DO_NOME_DO_SOCIO,
  validarSocio,
  type Socio,
} from '../olifine/regras/sociedade';
import { editarSocio, incluirSocio } from '../servicos/livroCaixa';

interface Props {
  espacoId: string;
  socios: readonly Socio[];
  // Sem sócio: inclui. Com sócio: troca nome e participação.
  emEdicao?: Socio | null;
  aoSalvar: () => void;
  aoCancelar: () => void;
  aoMudarOcupado?: (ocupado: boolean) => void;
}

interface ErroDaApi {
  message: string;
  campos?: Record<string, string>;
}

const participacaoParaCampo = (centesimos: number) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(centesimos / 100);

// Formulário do sócio (aba Sociedade & Aportes): o nome, que liga o sócio aos
// aportes, ao pró-labore e às distribuições (o "responsável" deles), e a
// participação no quadro, em porcentagem com até duas casas.
export default function FormularioDeSocio({ espacoId, socios, emEdicao = null, aoSalvar, aoCancelar, aoMudarOcupado }: Props) {
  const toast = useToast();
  const [nome, setNome] = useState(emEdicao?.nome ?? '');
  const [participacao, setParticipacao] = useState(emEdicao ? participacaoParaCampo(emEdicao.participacao_centesimos) : '');
  const [erros, setErros] = useState<Record<string, string | undefined>>({});
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const encontrados = validarSocio({ nome, participacao }, socios, emEdicao?.id ?? null);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DO_SOCIO);
    if (primeiro) {
      evento.currentTarget.querySelector<HTMLElement>(`[name="${primeiro}"]`)?.focus();
      return;
    }

    setEnviando(true);
    aoMudarOcupado?.(true);
    try {
      const corpo = { nome: limparTexto(nome), participacao_centesimos: lerPercentual(participacao) };
      if (emEdicao) {
        const editado = await editarSocio(espacoId, emEdicao.id, corpo);
        toast.sucesso(
          editado.lancamentos_renomeados > 0
            ? `${editado.lancamentos_renomeados} lançamento(s) passaram para o nome novo.`
            : 'O quadro societário já mostra os dados novos.',
          { titulo: `Dados de ${editado.nome} atualizados` },
        );
      } else {
        const incluido = await incluirSocio(espacoId, corpo);
        toast.sucesso('Aportes, pró-labore e distribuições do sócio entram pelo menu da linha.', {
          titulo: `${incluido.nome} entrou no quadro`,
        });
      }
      aoSalvar();
    } catch (falha) {
      const erro = falha as ErroDaApi;
      const campos = errosDaApi(erro.campos);
      setErros({ ...campos, participacao: campos.participacao_centesimos ?? campos.participacao });
      toast.erro(erro.message, { titulo: emEdicao ? 'Sócio não atualizado' : 'Sócio não incluído' });
      setEnviando(false);
      aoMudarOcupado?.(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <Campo
        rotulo="Nome"
        name="nome"
        mascara="texto"
        autoComplete="off"
        maxLength={TAMANHO_DO_NOME_DO_SOCIO}
        placeholder="Ex.: Ana Souza"
        dica="É o nome que vai como responsável nos aportes e nas distribuições."
        data-foco-inicial
        value={nome}
        onChange={(evento: { target: { value: string } }) => {
          setNome(evento.target.value);
          setErros((atuais) => ({ ...atuais, nome: undefined }));
        }}
        erro={erros.nome}
      />
      <Campo
        rotulo="Participação (%)"
        name="participacao"
        inputMode="decimal"
        autoComplete="off"
        maxLength={6}
        placeholder="Ex.: 50 ou 33,33"
        dica="A parte do sócio no lucro. O quadro soma até 100%."
        value={participacao}
        onChange={(evento: { target: { value: string } }) => {
          setParticipacao(evento.target.value);
          setErros((atuais) => ({ ...atuais, participacao: undefined }));
        }}
        erro={erros.participacao}
      />
      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Salvando…' : emEdicao ? 'Salvar' : 'Incluir sócio'}
        </button>
      </div>
    </form>
  );
}
