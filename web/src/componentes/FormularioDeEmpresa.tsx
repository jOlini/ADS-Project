import { useState, type FormEvent } from 'react';
import Campo from './Campo';
import SeletorJs from './Seletor';
import { semTipos } from './semTipos';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import {
  corpoDaEmpresa,
  formatarCnpj,
  ORDEM_DA_EMPRESA,
  REGIMES,
  TAMANHO_DO_NOME,
  validarEmpresa,
  type Espaco,
} from '../regras/espacos';
import { errosDaApi } from '../regras/livroCaixa';
import { atualizarEmpresa, criarEmpresa } from '../servicos/livroCaixa';

const Seletor = semTipos(SeletorJs);
const OPCOES_DE_REGIME = REGIMES.map(({ valor, rotulo, descricao }) => ({ valor, rotulo, descricao }));

interface Props {
  // Sem empresa: cadastra uma nova. Com empresa: edita nome, CNPJ e regime.
  emEdicao?: Espaco | null;
  aoSalvar: (empresa: Espaco) => void;
  aoCancelar: () => void;
  aoMudarOcupado?: (ocupado: boolean) => void;
}

interface ErroDaApi {
  message: string;
  campos?: Record<string, string>;
}

// Formulário do modal "Nova empresa" ou "Editar empresa": nome, CNPJ
// (opcional, numérico ou alfanumérico, formatado ao sair do campo) e regime
// tributário (decide os tributos sugeridos na aba Impostos).
export default function FormularioDeEmpresa({ emEdicao = null, aoSalvar, aoCancelar, aoMudarOcupado }: Props) {
  const toast = useToast();
  const [formulario, setFormulario] = useState({
    nome: emEdicao?.nome ?? '',
    cnpj: formatarCnpj(emEdicao?.cnpj),
    regime: emEdicao?.regime ?? '',
  });
  const [erros, setErros] = useState<Record<string, string | undefined>>({});
  const [enviando, setEnviando] = useState(false);

  function mudar(campo: keyof typeof formulario, valor: string) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const encontrados = validarEmpresa(formulario);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DA_EMPRESA);
    if (primeiro) {
      evento.currentTarget.querySelector<HTMLElement>(`[name="${primeiro}"]`)?.focus();
      return;
    }

    setEnviando(true);
    aoMudarOcupado?.(true);
    try {
      const corpo = corpoDaEmpresa(formulario);
      const salva: Espaco = emEdicao ? await atualizarEmpresa(emEdicao.id, corpo) : await criarEmpresa(corpo);
      toast.sucesso(
        emEdicao ? 'Os dados novos já valem no topo e nos impostos.' : 'Começa com as categorias de empresa e sem contas.',
        { titulo: `Empresa "${salva.nome}" ${emEdicao ? 'atualizada' : 'cadastrada'}` },
      );
      aoSalvar(salva);
    } catch (falha) {
      const erro = falha as ErroDaApi;
      setErros(errosDaApi(erro.campos));
      toast.erro(erro.message, { titulo: emEdicao ? 'Empresa não atualizada' : 'Empresa não cadastrada' });
      setEnviando(false);
      aoMudarOcupado?.(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <Campo
        rotulo="Nome da empresa"
        name="nome"
        mascara="texto"
        autoComplete="organization"
        maxLength={TAMANHO_DO_NOME}
        placeholder="Ex.: Ateliê da Ana"
        data-foco-inicial
        value={formulario.nome}
        onChange={(evento: { target: { value: string } }) => mudar('nome', evento.target.value)}
        erro={erros.nome}
      />

      <Campo
        rotulo={
          <>
            CNPJ <span className="rotulo-opcional">(opcional)</span>
          </>
        }
        name="cnpj"
        autoComplete="off"
        spellCheck={false}
        maxLength={18}
        placeholder="00.000.000/0000-00"
        dica="Números ou o novo CNPJ com letras. Só aparece para você."
        value={formulario.cnpj}
        onChange={(evento: { target: { value: string } }) => mudar('cnpj', evento.target.value)}
        onBlur={() => setFormulario((atual) => ({ ...atual, cnpj: formatarCnpj(atual.cnpj) }))}
        erro={erros.cnpj}
      />

      <Campo
        elemento={Seletor}
        rotulo="Regime tributário"
        name="regime"
        value={formulario.regime}
        opcoes={OPCOES_DE_REGIME}
        placeholder="Escolha o regime"
        dica="Decide os tributos sugeridos na aba Impostos. Muda quando quiser."
        onChange={(evento: { target: { value: string } }) => mudar('regime', evento.target.value)}
        erro={erros.regime}
      />

      {!emEdicao && (
        <p className="dica-do-campo">
          Cada empresa é um livro-caixa separado: contas, lançamentos, DRE e folha de uma não aparecem na outra nem no
          espaço pessoal.
        </p>
      )}

      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Salvando…' : emEdicao ? 'Salvar' : 'Cadastrar empresa'}
        </button>
      </div>
    </form>
  );
}
