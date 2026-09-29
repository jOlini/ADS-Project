import { useState } from 'react';
import Campo from './Campo';
import Seletor from './Seletor';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import { CORES_DE_CATEGORIA, errosDaApi, ORDEM_DA_CATEGORIA, TIPOS_DE_CATEGORIA, validarCategoria } from '../regras/livroCaixa';
import { atualizarCategoria, criarCategoria } from '../servicos/livroCaixa';

// Formulário de categoria (no modal "Nova categoria" ou "Editar
// categoria"): nome, tipo (só na criação: uma categoria de despesa com
// lançamentos não vira de receita) e cor. Na edição, pode ser desativada.
// tipoInicial vem do atalho ?cadastrar=DESPESA|RECEITA. aoSalvar recebe a
// categoria salva.
export default function FormularioDeCategoria({ espacoId, emEdicao = null, tipoInicial = 'DESPESA', aoSalvar, aoCancelar, aoMudarOcupado }) {
  const toast = useToast();
  const [formulario, setFormulario] = useState(() =>
    emEdicao
      ? { nome: emEdicao.nome, tipo: emEdicao.tipo, cor: emEdicao.cor, ativa: emEdicao.ativa }
      : { nome: '', tipo: tipoInicial, cor: 'neutro', ativa: true },
  );
  const [erros, setErros] = useState({});
  const [enviando, setEnviando] = useState(false);

  function mudar(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  async function enviar(evento) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements;
    const encontrados = validarCategoria(formulario);
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DA_CATEGORIA);
    if (primeiro) {
      elementos[primeiro]?.focus();
      return;
    }

    setEnviando(true);
    aoMudarOcupado?.(true);
    try {
      const nome = formulario.nome.trim();
      const salva = emEdicao
        ? await atualizarCategoria(espacoId, emEdicao.id, { nome, cor: formulario.cor, ativa: formulario.ativa })
        : await criarCategoria(espacoId, { nome, tipo: formulario.tipo, cor: formulario.cor });
      toast.sucesso(emEdicao ? 'Os lançamentos dela mostram o nome novo.' : 'Já aparece no formulário de lançamento.', {
        titulo: `Categoria "${salva.nome}" ${emEdicao ? 'salva' : 'criada'}`,
      });
      aoSalvar(salva);
    } catch (erro) {
      setErros(errosDaApi(erro.campos));
      toast.erro(erro.message, { titulo: 'Categoria não salva' });
      setEnviando(false);
      aoMudarOcupado?.(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate>
      <Campo rotulo="Nome" name="nome" mascara="texto" autoComplete="off" maxLength={60} placeholder="Ex.: Pets" data-foco-inicial
        value={formulario.nome} onChange={(evento) => mudar('nome', evento.target.value)} erro={erros.nome} />

      {emEdicao ? (
        <p className="dica-do-campo">
          Categoria de {emEdicao.tipo === 'DESPESA' ? 'despesa' : 'receita'}. O tipo não muda depois de criado.
        </p>
      ) : (
        <Campo elemento={Seletor} rotulo="Tipo" name="tipo" value={formulario.tipo} opcoes={TIPOS_DE_CATEGORIA}
          onChange={(evento) => mudar('tipo', evento.target.value)} erro={erros.tipo} />
      )}

      <Campo elemento={Seletor} rotulo="Cor" name="cor" value={formulario.cor}
        opcoes={CORES_DE_CATEGORIA.map((cor) => ({ ...cor, cor: cor.valor }))}
        onChange={(evento) => mudar('cor', evento.target.value)} erro={erros.cor} />

      {emEdicao && (
        <label className="caixa-de-marcar">
          <input type="checkbox" name="ativa" checked={formulario.ativa} onChange={(evento) => mudar('ativa', evento.target.checked)} />
          <span>
            <b>Categoria ativa</b>
            <small>Desativada, sai das opções de novos lançamentos e mantém o histórico.</small>
          </span>
        </label>
      )}

      <div className="acoes-do-formulario">
        <button type="button" className="secundario" onClick={aoCancelar} disabled={enviando}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} aria-busy={enviando}>
          {enviando ? 'Salvando…' : emEdicao ? 'Salvar' : 'Criar categoria'}
        </button>
      </div>
    </form>
  );
}
