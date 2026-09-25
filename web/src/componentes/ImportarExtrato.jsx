import { useId, useState } from 'react';
import AvisoComAtalho from './AvisoComAtalho';
import Campo from './Campo';
import Icone from './Icone';
import MapeamentoDeColunas from './MapeamentoDeColunas';
import Seletor from './Seletor';
import { useToast } from './toast/useToast';
import { primeiroCampoComErro } from '../regras/cadastro';
import { formatarData } from '../regras/datas';
import { formatarComSinal } from '../regras/dinheiro';
import {
  cabecalhoProvavel,
  categoriaSugerida,
  decodificarExtrato,
  descreverMapeamento,
  errosDaImportacao,
  mapeamentoDosPapeis,
  nomesDasColunas,
  ORDEM_DA_IMPORTACAO,
  papeisDoMapeamento,
  resumoDaImportacao,
  ROTULO_DA_SITUACAO,
  trocarPapel,
  validarImportacao,
  validarMapeamento,
} from '../regras/importacao';
import { estruturaDoExtrato, importarExtrato } from '../servicos/livroCaixa';

const ETAPAS = [
  { id: 'arquivo', rotulo: 'Arquivo' },
  { id: 'colunas', rotulo: 'Colunas' },
  { id: 'previa', rotulo: 'Conferir' },
];
const CAMPOS_DO_DESTINO = ['conta_id', 'categoria_despesa_id', 'categoria_receita_id'];

const opcoesDoTipo = (categorias, tipo) =>
  categorias
    .filter((categoria) => categoria.ativa && categoria.tipo === tipo)
    .map((categoria) => ({ valor: categoria.id, rotulo: categoria.nome, cor: categoria.cor }));

// Importação do extrato do banco (CSV), dentro do modal "Importar CSV", em
// três etapas:
// 1. Arquivo, conta e categorias padrão. A API lê o começo do arquivo e tenta
//    reconhecer as colunas pelo nome (vários bancos, vários formatos).
// 2. Colunas: só aparece se o formato não foi reconhecido, ou se a pessoa
//    pede para ajustar. Ela diz o que é cada coluna.
// 3. Conferir: a API simula e mostra linha por linha o que entraria (linha
//    já importada antes aparece e não entra de novo); "Importar" grava.
//
// Com contaFixa (a fatura de um cartão de crédito), o arquivo entra direto
// naquele cartão e a escolha de conta some: saídas viram compras na fatura, e
// entradas, créditos (estorno, reembolso).
export default function ImportarExtrato({ espacoId, contas = [], contaFixa = null, categorias, aoImportar, aoCancelar, aoMudarOcupado }) {
  const toast = useToast();
  const idDoArquivo = useId();
  const [etapa, setEtapa] = useState('arquivo');
  const [destino, setDestino] = useState(() => ({
    conta_id: contaFixa?.id ?? (contas.length === 1 ? contas[0].id : ''),
    categoria_despesa_id: categoriaSugerida(categorias, 'DESPESA'),
    categoria_receita_id: categoriaSugerida(categorias, 'RECEITA'),
  }));
  const [arquivo, setArquivo] = useState(null);
  const [csv, setCsv] = useState('');
  const [linhas, setLinhas] = useState([]);
  const [colunas, setColunas] = useState({ delimitador: ';', cabecalho: 0, papeis: {}, inverterSinal: false });
  const [reconhecido, setReconhecido] = useState(false);
  const [previa, setPrevia] = useState(null);
  const [erros, setErros] = useState({});
  const [ocupado, setOcupadoLocal] = useState(null);

  function setOcupado(valor) {
    setOcupadoLocal(valor);
    aoMudarOcupado?.(Boolean(valor));
  }

  const mapeamento = mapeamentoDosPapeis(colunas.papeis, {
    delimitador: colunas.delimitador,
    cabecalho: colunas.cabecalho,
    inverter_sinal: colunas.inverterSinal,
  });
  const nomeDaCategoria = new Map(categorias.map((categoria) => [categoria.id, categoria.nome]));

  function mudarDestino(campo, valor) {
    setDestino((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: undefined }));
  }

  function escolherArquivo(evento) {
    setArquivo(evento.target.files?.[0] ?? null);
    setErros((atuais) => ({ ...atuais, arquivo: undefined }));
  }

  // Colunas vindas da API: as reconhecidas, ou um palpite para a pessoa ajustar.
  function aplicarEstrutura(estrutura) {
    setLinhas(estrutura.linhas);
    setReconhecido(Boolean(estrutura.mapeamento));
    setColunas({
      delimitador: estrutura.delimitador,
      cabecalho: estrutura.mapeamento?.cabecalho ?? cabecalhoProvavel(estrutura.linhas),
      papeis: papeisDoMapeamento(estrutura.mapeamento),
      inverterSinal: estrutura.mapeamento?.inverter_sinal ?? false,
    });
  }

  // Erro da API: cada um volta para a etapa onde a pessoa pode corrigi-lo.
  // Conta e categorias ficam na etapa do arquivo. Um erro do arquivo que
  // aparece depois de indicar as colunas ("nada depois do cabeçalho") se
  // corrige nas colunas, e é lá que ele aparece.
  function mostrarErro(erro, titulo, etapaDeOrigem) {
    const campos = errosDaImportacao(erro.campos);
    setErros(campos);
    toast.erro(erro.message, { titulo });
    if (CAMPOS_DO_DESTINO.some((campo) => campos[campo]) || (campos.arquivo && etapaDeOrigem === 'arquivo')) {
      setEtapa('arquivo');
    } else if (Object.keys(campos).length > 0) {
      setEtapa('colunas');
    }
  }

  async function conferir(comMapeamento, etapaDeOrigem) {
    setOcupado('conferindo');
    try {
      const resposta = await importarExtrato(espacoId, { ...destino, csv: comMapeamento.csv, mapeamento: comMapeamento.mapeamento, simular: true });
      setPrevia({ resposta, mapeamento: comMapeamento.mapeamento });
      setErros({});
      setEtapa('previa');
    } catch (erro) {
      mostrarErro(erro, 'Extrato não conferido', etapaDeOrigem);
    } finally {
      setOcupado(null);
    }
  }

  async function continuar(evento) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements;
    const encontrados = validarImportacao({ arquivo, ...destino });
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DA_IMPORTACAO);
    if (primeiro) {
      elementos[primeiro]?.focus();
      return;
    }

    setOcupado('lendo');
    let estrutura;
    let texto;
    try {
      texto = decodificarExtrato(await arquivo.arrayBuffer());
      estrutura = await estruturaDoExtrato(espacoId, { csv: texto });
    } catch (erro) {
      setOcupado(null);
      mostrarErro(erro, 'Arquivo não lido', 'arquivo');
      return;
    }
    setCsv(texto);
    aplicarEstrutura(estrutura);
    if (estrutura.mapeamento) {
      await conferir({ csv: texto, mapeamento: estrutura.mapeamento }, 'arquivo');
    } else {
      setOcupado(null);
      setEtapa('colunas');
    }
  }

  async function trocarDelimitador(delimitador) {
    setOcupado('lendo');
    try {
      aplicarEstrutura(await estruturaDoExtrato(espacoId, { csv, delimitador }));
      setErros({});
    } catch (erro) {
      mostrarErro(erro, 'Arquivo não lido', 'colunas');
    } finally {
      setOcupado(null);
    }
  }

  function conferirColunas() {
    const encontrados = validarMapeamento(mapeamento);
    setErros(encontrados);
    if (Object.keys(encontrados).length === 0) {
      conferir({ csv, mapeamento }, 'colunas');
    }
  }

  async function importar() {
    setOcupado('importando');
    try {
      const resposta = await importarExtrato(espacoId, { ...destino, csv, mapeamento: previa.mapeamento, simular: false });
      toast.sucesso(resumoDaImportacao(resposta), { titulo: 'Extrato importado' });
      setOcupado(null);
      aoImportar(resposta);
    } catch (erro) {
      setOcupado(null);
      mostrarErro(erro, 'Extrato não importado', 'previa');
    }
  }

  const novas = previa?.resposta.novas ?? 0;
  const indiceDaEtapa = ETAPAS.findIndex((item) => item.id === etapa);
  const semCategorias = opcoesDoTipo(categorias, 'DESPESA').length === 0 || opcoesDoTipo(categorias, 'RECEITA').length === 0;

  return (
    <div className="importacao">
      <ol className="etapas" aria-label="Etapas da importação">
        {ETAPAS.map((item, indice) => (
          <li key={item.id} aria-current={item.id === etapa ? 'step' : undefined} className={indice < indiceDaEtapa ? 'feita' : undefined}>
            <span className="numero-da-etapa" aria-hidden="true">
              {indice < indiceDaEtapa ? <Icone nome="certo" tamanho={14} /> : indice + 1}
            </span>
            {item.rotulo}
          </li>
        ))}
      </ol>

      {etapa === 'arquivo' && (
        <form onSubmit={continuar} noValidate>
          <div className="campo">
            <span className="rotulo-do-campo" id={`${idDoArquivo}-rotulo`}>
              {contaFixa ? 'Arquivo CSV da fatura' : 'Arquivo CSV do banco'}
            </span>
            <label className={`zona-de-arquivo${erros.arquivo ? ' com-erro' : ''}`}>
              <input
                id={idDoArquivo}
                type="file"
                name="arquivo"
                accept=".csv,text/csv,text/plain"
                className="apenas-leitor"
                aria-labelledby={`${idDoArquivo}-rotulo`}
                aria-describedby={`${idDoArquivo}-dica${erros.arquivo ? ` ${idDoArquivo}-erro` : ''}`}
                aria-invalid={Boolean(erros.arquivo)}
                onChange={escolherArquivo}
              />
              <Icone nome="importar" tamanho={20} />
              <span className="texto-da-zona">
                <b>{arquivo ? arquivo.name : 'Escolher arquivo'}</b>
                <small>
                  {arquivo ? 'Clique para trocar' : contaFixa ? 'A fatura exportada pelo banco, em .csv' : 'O extrato exportado pelo banco, em .csv'}
                </small>
              </span>
            </label>
            <span id={`${idDoArquivo}-dica`} className="dica-do-campo">
              As colunas são reconhecidas sozinhas; se não forem, você indica cada uma no próximo passo.
            </span>
            {erros.arquivo && (
              <span id={`${idDoArquivo}-erro`} className="erro-do-campo">
                {erros.arquivo}
              </span>
            )}
          </div>

          {contaFixa ? (
            <p className="dica-do-campo">
              As compras entram como saídas na fatura de {contaFixa.nome}. Se aparecerem como entradas na conferência, use
              &quot;Ajustar colunas&quot; e marque &quot;Inverter o sinal dos valores&quot;.
            </p>
          ) : (
            <Campo elemento={Seletor} rotulo="Conta do extrato" name="conta_id" placeholder="Escolha a conta"
              opcoes={contas.map((conta) => ({ valor: conta.id, rotulo: conta.nome }))}
              value={destino.conta_id} onChange={(evento) => mudarDestino('conta_id', evento.target.value)} erro={erros.conta_id} />
          )}

          <div className="duas-colunas">
            <Campo elemento={Seletor} rotulo="Categoria das saídas" name="categoria_despesa_id" placeholder="Escolha"
              opcoes={opcoesDoTipo(categorias, 'DESPESA')} value={destino.categoria_despesa_id}
              onChange={(evento) => mudarDestino('categoria_despesa_id', evento.target.value)} erro={erros.categoria_despesa_id} />
            <Campo elemento={Seletor} rotulo="Categoria das entradas" name="categoria_receita_id" placeholder="Escolha"
              opcoes={opcoesDoTipo(categorias, 'RECEITA')} value={destino.categoria_receita_id}
              onChange={(evento) => mudarDestino('categoria_receita_id', evento.target.value)} erro={erros.categoria_receita_id} />
          </div>
          <p className="dica-do-campo">
            Se o arquivo tiver uma coluna de categoria com o nome de uma categoria sua, a linha vai para ela.
          </p>
          {semCategorias && (
            <AvisoComAtalho compacto atalho={{ para: '/categorias', rotulo: 'Abrir categorias', icone: 'categorias' }}>
              A importação precisa de uma categoria ativa de despesa e outra de receita.
            </AvisoComAtalho>
          )}

          <div className="acoes-do-formulario">
            <button type="button" className="secundario" onClick={aoCancelar} disabled={Boolean(ocupado)}>
              Cancelar
            </button>
            <button type="submit" disabled={Boolean(ocupado)} aria-busy={Boolean(ocupado)}>
              {ocupado ? 'Lendo o arquivo…' : 'Continuar'}
            </button>
          </div>
        </form>
      )}

      {etapa === 'colunas' && (
        <div className="etapa-de-colunas">
          <p className={`aviso-da-etapa${reconhecido ? '' : ' destaque'}`}>
            <Icone nome="colunas" tamanho={18} />
            {reconhecido
              ? 'Confira o que é cada coluna e ajuste o que precisar.'
              : 'Não reconheci as colunas deste arquivo. Diga o que é cada uma: a data, a descrição e o valor (ou as colunas de entrada e saída).'}
          </p>
          <MapeamentoDeColunas
            linhas={linhas}
            delimitador={colunas.delimitador}
            cabecalho={colunas.cabecalho}
            papeis={colunas.papeis}
            inverterSinal={colunas.inverterSinal}
            erros={erros}
            ocupado={Boolean(ocupado)}
            aoMudarDelimitador={trocarDelimitador}
            aoMudarCabecalho={(cabecalho) => setColunas((atual) => ({ ...atual, cabecalho }))}
            aoMudarPapel={(coluna, papel) => {
              setColunas((atual) => ({ ...atual, papeis: trocarPapel(atual.papeis, coluna, papel) }));
              setErros({});
            }}
            aoMudarInverterSinal={(inverterSinal) => setColunas((atual) => ({ ...atual, inverterSinal }))}
          />
          <div className="acoes-do-formulario">
            <button type="button" className="secundario" onClick={() => setEtapa('arquivo')} disabled={Boolean(ocupado)}>
              Voltar
            </button>
            <button type="button" onClick={conferirColunas} disabled={Boolean(ocupado)} aria-busy={ocupado === 'conferindo'}>
              {ocupado === 'conferindo' ? 'Conferindo…' : 'Conferir lançamentos'}
            </button>
          </div>
        </div>
      )}

      {etapa === 'previa' && previa && (
        <div className="previa-da-importacao">
          <p className="resumo-da-importacao" role="status">
            {resumoDaImportacao(previa.resposta)}
          </p>
          <div className="formato-reconhecido">
            <span>
              <small>Colunas</small>
              {descreverMapeamento(previa.mapeamento, nomesDasColunas(linhas, previa.mapeamento.cabecalho))}
            </span>
            <button type="button" className="discreto-botao" onClick={() => setEtapa('colunas')} disabled={Boolean(ocupado)}>
              <Icone nome="colunas" tamanho={16} />
              Ajustar colunas
            </button>
          </div>
          <ul className="linhas-da-importacao">
            {previa.resposta.linhas.map((linha) => (
              <li key={linha.linha} className={`situacao-${linha.situacao.toLowerCase()}`}>
                <span className="descricao">{linha.descricao ?? `Linha ${linha.linha}`}</span>
                <span className={`valor${linha.valor_centavos > 0 ? ' entrada' : ''}`}>
                  {linha.valor_centavos == null ? '' : formatarComSinal(linha.valor_centavos)}
                </span>
                <small>
                  {linha.erro ??
                    [formatarData(linha.data), nomeDaCategoria.get(linha.categoria_id), ROTULO_DA_SITUACAO[linha.situacao]].filter(Boolean).join(' · ')}
                </small>
              </li>
            ))}
          </ul>
          <div className="acoes-do-formulario">
            <button type="button" className="secundario" onClick={() => setEtapa('arquivo')} disabled={Boolean(ocupado)}>
              Voltar
            </button>
            {novas > 0 ? (
              <button type="button" onClick={importar} disabled={Boolean(ocupado)} aria-busy={ocupado === 'importando'}>
                <Icone nome="importar" tamanho={16} />
                {ocupado === 'importando' ? 'Importando…' : `Importar ${novas === 1 ? '1 lançamento' : `${novas} lançamentos`}`}
              </button>
            ) : (
              <button type="button" onClick={aoCancelar}>
                Fechar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
