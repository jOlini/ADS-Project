import { useState, type FormEvent } from 'react';
import Campo from './Campo';
import SeletorDeCorJs from './SeletorDeCor';
import { semTipos } from './semTipos';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import type { PessoaDaFamilia } from '../regras/espacos';
import { CORES_DA_FAMILIA, ORDEM_DA_PESSOA, proximaCor, TAMANHO_DO_NOME_DA_PESSOA, validarPessoa } from '../regras/familia';
import { errosDaApi } from '../regras/livroCaixa';
import { limparTexto } from '../regras/sanitizacao';
import { editarPessoa, incluirPessoa } from '../servicos/livroCaixa';

const SeletorDeCor = semTipos(SeletorDeCorJs);

interface Props {
  espacoId: string;
  // As pessoas que já estão na família (nome repetido é recusado).
  pessoas: readonly PessoaDaFamilia[];
  // Sem pessoa: inclui uma nova. Com pessoa: troca nome e cor.
  emEdicao?: PessoaDaFamilia | null;
  aoSalvar: () => void;
  aoCancelar: () => void;
  aoMudarOcupado?: (ocupado: boolean) => void;
}

interface ErroDaApi {
  message: string;
  campos?: Record<string, string>;
}

// Formulário da pessoa da família (modal da página Família): o nome, que
// liga a pessoa aos lançamentos dela (o "responsável"), e a cor, que marca a
// pessoa nos filtros, no extrato e no gasto por pessoa. Renomear leva os
// lançamentos junto (a API troca o nome neles).
export default function FormularioDePessoa({ espacoId, pessoas, emEdicao = null, aoSalvar, aoCancelar, aoMudarOcupado }: Props) {
  const toast = useToast();
  const [nome, setNome] = useState(emEdicao?.nome ?? '');
  const [cor, setCor] = useState<string>(emEdicao?.cor ?? proximaCor(pessoas));
  const [erros, setErros] = useState<Record<string, string | undefined>>({});
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const encontrados = validarPessoa({ nome, cor }, pessoas, emEdicao?.id ?? null);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DA_PESSOA);
    if (primeiro) {
      evento.currentTarget.querySelector<HTMLElement>(`[name="${primeiro}"]`)?.focus();
      return;
    }

    setEnviando(true);
    aoMudarOcupado?.(true);
    try {
      const corpo = { nome: limparTexto(nome), cor };
      if (emEdicao) {
        const editada = await editarPessoa(espacoId, emEdicao.id, corpo);
        const renomeados = editada.lancamentos_renomeados;
        toast.sucesso(
          renomeados > 0
            ? `${renomeados === 1 ? '1 lançamento passou' : `${renomeados} lançamentos passaram`} para o nome novo.`
            : 'O nome e a cor novos já aparecem nas telas.',
          { titulo: `Dados de ${editada.nome} atualizados` },
        );
      } else {
        const incluida = await incluirPessoa(espacoId, corpo);
        toast.sucesso(`Escolha ${incluida.nome} em "Responsável" para lançar um gasto dela.`, {
          titulo: `${incluida.nome} entrou na família`,
        });
      }
      aoSalvar();
    } catch (falha) {
      const erro = falha as ErroDaApi;
      setErros(errosDaApi(erro.campos));
      toast.erro(erro.message, { titulo: emEdicao ? 'Pessoa não atualizada' : 'Pessoa não incluída' });
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
        maxLength={TAMANHO_DO_NOME_DA_PESSOA}
        placeholder="Ex.: Bruno"
        dica="É o nome que vai no campo Responsável dos lançamentos dela."
        data-foco-inicial
        value={nome}
        onChange={(evento: { target: { value: string } }) => {
          setNome(evento.target.value);
          setErros((atuais) => ({ ...atuais, nome: undefined }));
        }}
        erro={erros.nome}
      />

      <SeletorDeCor
        rotulo="Cor nos filtros e no extrato"
        name="cor"
        prefixo="pessoa-"
        valor={cor}
        opcoes={CORES_DA_FAMILIA}
        aoMudar={(valor: string) => {
          setCor(valor);
          setErros((atuais) => ({ ...atuais, cor: undefined }));
        }}
      />
      <span className="erro-do-campo" role={erros.cor ? 'alert' : undefined}>
        {erros.cor}
      </span>

      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Salvando…' : emEdicao ? 'Salvar' : 'Incluir na família'}
        </button>
      </div>
    </form>
  );
}
