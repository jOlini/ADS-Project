import { useState } from 'react';
import Campo from './Campo';
import Icone from './Icone';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import { formatarData } from '../regras/datas';
import { formatarComSinal } from '../regras/dinheiro';
import {
  categoriaSugerida,
  decodificarExtrato,
  errosDaImportacao,
  ORDEM_DA_IMPORTACAO,
  resumoDaImportacao,
  ROTULO_DA_SITUACAO,
  validarImportacao,
} from '../regras/importacao';
import { importarExtrato } from '../servicos/livroCaixa';

// Importação do extrato do banco (CSV) em dois passos: "Conferir" manda o
// arquivo com simular=true e mostra o que entraria, linha por linha;
// "Importar" grava. Linha já importada antes aparece como tal e não entra de
// novo (a API guarda uma chave por linha).
export default function ImportarExtrato({ espacoId, contas, categorias, aoImportar }) {
  const toast = useToast();
  const [formulario, setFormulario] = useState(() => ({
    conta_id: contas.length === 1 ? contas[0].id : '',
    categoria_despesa_id: categoriaSugerida(categorias, 'DESPESA'),
    categoria_receita_id: categoriaSugerida(categorias, 'RECEITA'),
  }));
  const [arquivo, setArquivo] = useState(null);
  // Trocar a key remonta o <input type="file">: é o jeito de limpá-lo.
  const [versaoDoSeletor, setVersaoDoSeletor] = useState(0);
  const [previa, setPrevia] = useState(null);
  const [erros, setErros] = useState({});
  const [ocupado, setOcupado] = useState(null);

  const doTipo = (tipo) => categorias.filter((categoria) => categoria.ativa && categoria.tipo === tipo);

  // Qualquer mudança invalida a prévia: ela vale para aquele arquivo e aquela conta.
  function mudar(campo, valor) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
    setPrevia(null);
  }

  function escolherArquivo(evento) {
    setArquivo(evento.target.files?.[0] ?? null);
    setErros((atuais) => ({ ...atuais, arquivo: undefined }));
    setPrevia(null);
  }

  async function conferir(evento) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements;
    const encontrados = validarImportacao({ arquivo, ...formulario });
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DA_IMPORTACAO);
    if (primeiro) {
      elementos[primeiro]?.focus();
      return;
    }

    setOcupado('conferindo');
    try {
      const csv = decodificarExtrato(await arquivo.arrayBuffer());
      const resposta = await importarExtrato(espacoId, { ...formulario, csv, simular: true });
      setPrevia({ csv, resposta });
    } catch (erro) {
      const campos = errosDaImportacao(erro.campos);
      setErros(campos);
      toast.erro(erro.message, { titulo: 'Extrato não conferido' });
      elementos[primeiroCampoComErro(campos, ORDEM_DA_IMPORTACAO)]?.focus();
    } finally {
      setOcupado(null);
    }
  }

  async function importar() {
    setOcupado('importando');
    try {
      const resposta = await importarExtrato(espacoId, { ...formulario, csv: previa.csv, simular: false });
      toast.sucesso(resumoDaImportacao(resposta), { titulo: 'Extrato importado' });
      setPrevia(null);
      setArquivo(null);
      setVersaoDoSeletor((versao) => versao + 1);
      aoImportar(resposta);
    } catch (erro) {
      setErros(errosDaImportacao(erro.campos));
      toast.erro(erro.message, { titulo: 'Extrato não importado' });
    } finally {
      setOcupado(null);
    }
  }

  const novas = previa?.resposta.novas ?? 0;

  return (
    <section className="cartao painel" aria-labelledby="titulo-importar-extrato">
      <div className="cabecalho-do-painel">
        <h2 id="titulo-importar-extrato">Importar extrato</h2>
      </div>

      <form onSubmit={conferir} noValidate>
        <Campo key={versaoDoSeletor} rotulo="Arquivo CSV do banco" type="file" name="arquivo" accept=".csv,text/csv"
          onChange={escolherArquivo} erro={erros.arquivo}
          dica="Colunas Data, Descrição e Valor, com as saídas negativas." />

        <Campo elemento="select" rotulo="Conta do extrato" name="conta_id"
          value={formulario.conta_id} onChange={(evento) => mudar('conta_id', evento.target.value)} erro={erros.conta_id}>
          <option value="">Escolha a conta</option>
          {contas.map((conta) => (
            <option key={conta.id} value={conta.id}>
              {conta.nome}
            </option>
          ))}
        </Campo>

        <Campo elemento="select" rotulo="Categoria das saídas" name="categoria_despesa_id"
          value={formulario.categoria_despesa_id} onChange={(evento) => mudar('categoria_despesa_id', evento.target.value)}
          erro={erros.categoria_despesa_id}>
          <option value="">Escolha a categoria</option>
          {doTipo('DESPESA').map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nome}
            </option>
          ))}
        </Campo>

        <Campo elemento="select" rotulo="Categoria das entradas" name="categoria_receita_id"
          value={formulario.categoria_receita_id} onChange={(evento) => mudar('categoria_receita_id', evento.target.value)}
          erro={erros.categoria_receita_id}>
          <option value="">Escolha a categoria</option>
          {doTipo('RECEITA').map((categoria) => (
            <option key={categoria.id} value={categoria.id}>
              {categoria.nome}
            </option>
          ))}
        </Campo>

        {!previa && (
          <button type="submit" className="largo secundario" disabled={Boolean(ocupado)} aria-busy={ocupado === 'conferindo'}>
            {ocupado === 'conferindo' ? 'Conferindo…' : 'Conferir extrato'}
          </button>
        )}
      </form>

      {previa && (
        <div className="previa-da-importacao">
          <p className="resumo-da-importacao" role="status">
            {resumoDaImportacao(previa.resposta)}
          </p>
          <ul className="linhas-da-importacao">
            {previa.resposta.linhas.map((linha) => (
              <li key={linha.linha} className={`situacao-${linha.situacao.toLowerCase()}`}>
                <span className="descricao">{linha.descricao ?? `Linha ${linha.linha}`}</span>
                <span className={`valor${linha.valor_centavos > 0 ? ' entrada' : ''}`}>
                  {linha.valor_centavos == null ? '' : formatarComSinal(linha.valor_centavos)}
                </span>
                <small>
                  {linha.erro ?? `${formatarData(linha.data)} · ${ROTULO_DA_SITUACAO[linha.situacao]}`}
                </small>
              </li>
            ))}
          </ul>
          <div className="acoes-do-formulario">
            <button type="button" className="secundario" onClick={() => setPrevia(null)} disabled={Boolean(ocupado)}>
              {novas > 0 ? 'Cancelar' : 'Fechar'}
            </button>
            {novas > 0 && (
              <button type="button" onClick={importar} disabled={Boolean(ocupado)} aria-busy={ocupado === 'importando'}>
                <Icone nome="mais" tamanho={16} />
                {ocupado === 'importando' ? 'Importando…' : `Importar ${novas === 1 ? '1 lançamento' : `${novas} lançamentos`}`}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
