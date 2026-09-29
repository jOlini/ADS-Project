import { useState, type FormEvent } from 'react';
import Campo from './Campo';
import Icone from './Icone';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import {
  nomeSugerido,
  ORDEM_DO_ESPACO,
  TAMANHO_DO_NOME,
  TIPOS_DE_ESPACO,
  TIPOS_QUE_SE_CRIAM,
  validarEspaco,
  type Espaco,
} from '../regras/espacos';
import { errosDaApi } from '../regras/livroCaixa';
import { criarEspaco, renomearEspaco } from '../servicos/livroCaixa';

interface Props {
  // Sem espaço: cria um novo (família ou empresa). Com espaço: renomeia.
  emEdicao?: Espaco | null;
  // Sugere "Família <sobrenome>" no nome do espaço de família.
  sobrenome?: string;
  aoSalvar: (espaco: Espaco) => void;
  aoCancelar: () => void;
  aoMudarOcupado?: (ocupado: boolean) => void;
}

interface ErroDaApi {
  message: string;
  campos?: Record<string, string>;
}

// Formulário do modal "Novo espaço" (tipo e nome) ou "Renomear espaço" (só o
// nome). O tipo não muda depois: as categorias iniciais vêm dele.
export default function FormularioDeEspaco({ emEdicao = null, sobrenome = '', aoSalvar, aoCancelar, aoMudarOcupado }: Props) {
  const toast = useToast();
  const [tipo, setTipo] = useState<string>(emEdicao?.tipo ?? '');
  const [nome, setNome] = useState(emEdicao?.nome ?? '');
  // Enquanto a pessoa não digitou, o nome acompanha a sugestão do tipo.
  const [nomeTocado, setNomeTocado] = useState(Boolean(emEdicao));
  const [erros, setErros] = useState<Record<string, string | undefined>>({});
  const [enviando, setEnviando] = useState(false);

  function escolherTipo(novo: string) {
    setTipo(novo);
    setErros((atuais) => ({ ...atuais, tipo: undefined }));
    if (!nomeTocado) {
      setNome(nomeSugerido(novo, sobrenome));
    }
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const encontrados = validarEspaco({ tipo, nome }, { renomeando: Boolean(emEdicao) });
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DO_ESPACO);
    if (primeiro) {
      // O tipo é um grupo de opções: o foco vai para a primeira delas.
      formulario.querySelector<HTMLElement>(`[name="${primeiro}"]`)?.focus();
      return;
    }

    setEnviando(true);
    aoMudarOcupado?.(true);
    try {
      const salvo: Espaco = emEdicao ? await renomearEspaco(emEdicao.id, nome) : await criarEspaco({ tipo, nome });
      toast.sucesso(
        emEdicao
          ? 'O nome novo já aparece no topo.'
          : `${TIPOS_DE_ESPACO[salvo.tipo].rotulo}: começa com as categorias do tipo e sem contas.`,
        { titulo: `Espaço "${salvo.nome}" ${emEdicao ? 'renomeado' : 'criado'}` },
      );
      aoSalvar(salvo);
    } catch (falha) {
      const erro = falha as ErroDaApi;
      setErros(errosDaApi(erro.campos));
      toast.erro(erro.message, { titulo: emEdicao ? 'Espaço não renomeado' : 'Espaço não criado' });
      setEnviando(false);
      aoMudarOcupado?.(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      {!emEdicao && (
        <fieldset className="campo tipos-de-espaco" aria-describedby={erros.tipo ? 'erro-do-tipo-de-espaco' : undefined}>
          <legend>Tipo</legend>
          <div className="tipos-de-espaco-opcoes">
          {TIPOS_QUE_SE_CRIAM.map((opcao, indice) => (
            <label key={opcao} className={`tipo-de-espaco ${opcao.toLowerCase()}`}>
              <input
                type="radio"
                name="tipo"
                value={opcao}
                checked={tipo === opcao}
                onChange={() => escolherTipo(opcao)}
                data-foco-inicial={indice === 0 ? true : undefined}
              />
              <span className={`marca-do-espaco ${opcao.toLowerCase()}`} aria-hidden="true">
                <Icone nome={TIPOS_DE_ESPACO[opcao].icone} tamanho={18} />
              </span>
              <span>
                <b>{TIPOS_DE_ESPACO[opcao].rotulo}</b>
                <small>{TIPOS_DE_ESPACO[opcao].descricao}</small>
              </span>
            </label>
          ))}
          </div>
          <span className="erro-do-campo" id="erro-do-tipo-de-espaco" role={erros.tipo ? 'alert' : undefined}>
            {erros.tipo}
          </span>
        </fieldset>
      )}

      <Campo
        rotulo="Nome"
        name="nome"
        mascara="texto"
        autoComplete="off"
        maxLength={TAMANHO_DO_NOME}
        placeholder={tipo === 'PJ' ? 'Ex.: Ateliê da Ana' : 'Ex.: Família Souza'}
        data-foco-inicial={emEdicao ? true : undefined}
        value={nome}
        onChange={(evento: { target: { value: string } }) => {
          setNome(evento.target.value);
          setNomeTocado(true);
          setErros((atuais) => ({ ...atuais, nome: undefined }));
        }}
        erro={erros.nome}
      />

      {!emEdicao && (
        <p className="dica-do-campo">
          Cada espaço é um livro-caixa separado: contas, lançamentos e metas de um não aparecem no outro.
        </p>
      )}

      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Salvando…' : emEdicao ? 'Salvar' : 'Criar espaço'}
        </button>
      </div>
    </form>
  );
}
