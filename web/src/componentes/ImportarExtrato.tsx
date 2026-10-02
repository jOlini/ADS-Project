import { useId, useState, type ChangeEvent, type FormEvent } from 'react';
import AvisoComAtalhoJs from './AvisoComAtalho';
import Campo from './Campo';
import ConferenciaDaImportacao from './ConferenciaDaImportacao';
import Icone from './Icone';
import MapeamentoDeColunasJs from './MapeamentoDeColunas';
import Seletor from './Seletor';
import { semTipos } from './semTipos';
import { useToast } from './toast/useToast';
import { lerArquivoDoExtrato, pareceUmPdf } from '../regras/arquivoDoExtrato';
import { primeiroCampoComErro } from '../regras/cadastro';
import { hojeIso } from '../regras/datas';
import { formatarBRL } from '../regras/dinheiro';
import { escolherLeitor, LEITOR_AUTOMATICO, opcoesDeLeitor } from '../regras/extratos/leitores';
import { ErroDoLeitor, type ArquivoLido, type ExtratoPreparado, type LeitorDeExtrato } from '../regras/extratos/tipos';
import {
  ajustesParaAApi,
  cabecalhoProvavel,
  categoriaSugerida,
  categoriasReconhecidas,
  descreverMapeamento,
  destinoDaImportacao,
  errosDaImportacao,
  mapeamentoDosPapeis,
  nomesDasColunas,
  opcoesDaCategoria,
  ORDEM_DA_IMPORTACAO,
  papeisDoMapeamento,
  resumoDaImportacao,
  ROTULO_DA_ORIGEM_DAS_COLUNAS,
  textoDasDuvidas,
  trocarPapel,
  validarAjustes,
  validarImportacao,
  validarMapeamento,
  type Ajustes,
  type Categoria,
  type LinhaDaResposta,
  type LinhaDoArquivo,
  type Mapeamento,
  type Papel,
  type Papeis,
} from '../regras/importacao';
import { lerDocumentoPdf } from '../servicos/leitorDePdf';
import { estruturaDoExtrato, importarExtrato } from '../servicos/livroCaixa';

const AvisoComAtalho = semTipos(AvisoComAtalhoJs);
const MapeamentoDeColunas = semTipos(MapeamentoDeColunasJs);

const ETAPAS = [
  { id: 'arquivo', rotulo: 'Arquivo' },
  { id: 'colunas', rotulo: 'Colunas' },
  { id: 'previa', rotulo: 'Conferir' },
] as const;
type Etapa = (typeof ETAPAS)[number]['id'];
const CAMPOS_DO_DESTINO = ['conta_id', 'categoria_despesa_id', 'categoria_receita_id'];

interface Conta {
  id: string;
  nome: string;
}

interface Resposta {
  simulacao: boolean;
  novas: number;
  importadas: number;
  ja_importadas: number;
  invalidas: number;
  parcelas_futuras?: number;
  linhas: LinhaDaResposta[];
}

interface Estrutura {
  delimitador: string;
  linhas: LinhaDoArquivo[];
  mapeamento: Mapeamento | null;
  origem?: 'CABECALHO' | 'CONTEUDO' | null;
  duvidas?: string[];
}

interface ErroDaApi {
  message: string;
  campos?: Record<string, string>;
}

interface Props {
  espacoId: string;
  contas?: Conta[];
  contaFixa?: Conta | null;
  categorias: Categoria[];
  aoImportar: (resposta: Resposta) => void;
  aoVerImportados?: (resposta: Resposta) => void;
  aoCancelar: () => void;
  aoMudarOcupado?: (ocupado: boolean) => void;
}

// Importação do extrato ou da fatura do banco (CSV ou PDF), dentro do modal
// "Importar extrato", em três etapas:
// 1. Arquivo, conta e categorias padrão. O arquivo é conferido aqui (tipo,
//    tamanho, começo dos bytes: planilha renomeada não sai do navegador) e um
//    leitor (regras/extratos, padrão Strategy) o prepara: o do PDF de cada
//    banco tira as linhas de lançamento no próprio navegador (o PDF não sai
//    dele); o do CSV o manda inteiro, e a API reconhece as colunas sozinha,
//    pelo cabeçalho de vários bancos ou pelo conteúdo das células. O leitor é
//    escolhido sozinho pelo arquivo, e a pessoa pode trocá-lo.
// 2. Colunas: só aparece quando a API não reconheceu o formato, quando ficou
//    dúvida (duas colunas "Valor", célula que não confere) ou quando a pessoa
//    pede para ajustar. Vem preenchida, com a dúvida marcada.
// 3. Conferir: a API simula e mostra linha por linha o que entraria, com a
//    categoria sugerida pela descrição ou pelo histórico. A descrição e a
//    categoria de cada linha nova se editam ali mesmo; "Importar" grava com
//    as edições (a linha já importada antes aparece e não entra de novo).
//
// Com contaFixa (a fatura de um cartão de crédito), o arquivo entra direto
// naquele cartão e a escolha de conta some: saídas viram compras na fatura, e
// entradas, créditos (estorno, reembolso). A compra com a parcela no fim da
// descrição ("LOJA 03/12") gera as parcelas das próximas faturas; a
// conferência diz em que fatura cada linha entra.
//
// Sem nada novo no arquivo (tudo já importado), aoVerImportados leva a tela
// até o mês (ou a fatura) onde as linhas já estão.
export default function ImportarExtrato({
  espacoId,
  contas = [],
  contaFixa = null,
  categorias,
  aoImportar,
  aoVerImportados,
  aoCancelar,
  aoMudarOcupado,
}: Props) {
  const toast = useToast();
  const idDoArquivo = useId();
  const [etapa, setEtapa] = useState<Etapa>('arquivo');
  const [destino, setDestino] = useState(() => ({
    conta_id: contaFixa?.id ?? (contas.length === 1 ? (contas[0]?.id ?? '') : ''),
    categoria_despesa_id: categoriaSugerida(categorias, 'DESPESA'),
    categoria_receita_id: categoriaSugerida(categorias, 'RECEITA'),
  }));
  const [arquivo, setArquivo] = useState<File | null>(null);
  // O leitor pedido (o automático, por padrão) e o que leu o arquivo.
  const [leitor, setLeitor] = useState(LEITOR_AUTOMATICO);
  const [lido, setLido] = useState<{ leitor: LeitorDeExtrato; extrato: ExtratoPreparado } | null>(null);
  const [csv, setCsv] = useState('');
  const [linhas, setLinhas] = useState<LinhaDoArquivo[]>([]);
  const [colunas, setColunas] = useState<{ delimitador: string; cabecalho: number; papeis: Papeis; inverterSinal: boolean }>({
    delimitador: ';',
    cabecalho: 0,
    papeis: {},
    inverterSinal: false,
  });
  const [origem, setOrigem] = useState<string | null>(null);
  const [duvidas, setDuvidas] = useState<string[]>([]);
  const [previa, setPrevia] = useState<{ resposta: Resposta; mapeamento: Mapeamento } | null>(null);
  const [ajustes, setAjustes] = useState<Ajustes>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [ocupado, setOcupadoLocal] = useState<'lendo' | 'conferindo' | 'importando' | null>(null);

  function setOcupado(valor: typeof ocupado) {
    setOcupadoLocal(valor);
    aoMudarOcupado?.(Boolean(valor));
  }

  const mapeamento = mapeamentoDosPapeis(colunas.papeis, {
    delimitador: colunas.delimitador,
    cabecalho: colunas.cabecalho,
    inverter_sinal: colunas.inverterSinal,
  });

  function mudarDestino(campo: keyof typeof destino, valor: string) {
    setDestino((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => ({ ...atuais, [campo]: '' }));
  }

  function escolherArquivo(evento: ChangeEvent<HTMLInputElement>) {
    setArquivo(evento.target.files?.[0] ?? null);
    // Outro arquivo, talvez de outro formato: o leitor volta ao automático.
    setLeitor(LEITOR_AUTOMATICO);
    setErros((atuais) => ({ ...atuais, arquivo: '' }));
  }

  // O arquivo lido e preparado pelo leitor (o escolhido ou o automático), ou a
  // mensagem para o campo do arquivo.
  async function prepararArquivo(escolhido: File): Promise<{ leitor: LeitorDeExtrato; extrato: ExtratoPreparado } | string> {
    const conteudo = await lerArquivoDoExtrato(escolhido);
    if (conteudo.formato === null) {
      return conteudo.erro;
    }
    try {
      const arquivoLido: ArquivoLido =
        conteudo.formato === 'pdf' ? { formato: 'pdf', documento: await lerDocumentoPdf(conteudo.bytes) } : conteudo;
      const doArquivo = escolherLeitor(arquivoLido, leitor);
      if (!doArquivo) {
        return 'Nenhum leitor reconhece este arquivo. Exporte o extrato em CSV pelo app do banco.';
      }
      return { leitor: doArquivo, extrato: doArquivo.preparar(arquivoLido, { cartao: Boolean(contaFixa), hoje: hojeIso() }) };
    } catch (erro) {
      if (erro instanceof ErroDoLeitor) {
        return erro.message;
      }
      throw erro;
    }
  }

  // Colunas vindas da API: as reconhecidas, ou um palpite para a pessoa ajustar.
  function aplicarEstrutura(estrutura: Estrutura) {
    setLinhas(estrutura.linhas);
    setOrigem(estrutura.mapeamento ? (estrutura.origem ?? 'CABECALHO') : null);
    setDuvidas(estrutura.duvidas ?? []);
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
  // corrige nas colunas, e é lá que ele aparece. O de uma linha editada fica
  // na conferência, na linha.
  function mostrarErro(erro: ErroDaApi, titulo: string, etapaDeOrigem: Etapa) {
    const campos = errosDaImportacao(erro.campos);
    setErros(campos);
    toast.erro(erro.message, { titulo });
    const nomes = Object.keys(campos);
    if (CAMPOS_DO_DESTINO.some((campo) => campos[campo]) || (campos.arquivo && etapaDeOrigem === 'arquivo')) {
      setEtapa('arquivo');
    } else if (nomes.length > 0 && nomes.every((nome) => nome.startsWith('linha-'))) {
      setEtapa('previa');
    } else if (nomes.length > 0) {
      setEtapa('colunas');
    }
  }

  async function conferir(comMapeamento: { csv: string; mapeamento: Mapeamento }, etapaDeOrigem: Etapa) {
    setOcupado('conferindo');
    try {
      const resposta = await importarExtrato(espacoId, { ...destino, csv: comMapeamento.csv, mapeamento: comMapeamento.mapeamento, simular: true });
      setPrevia({ resposta, mapeamento: comMapeamento.mapeamento });
      // Outras colunas, outras linhas: o que foi editado antes não vale mais.
      setAjustes({});
      setErros({});
      setEtapa('previa');
    } catch (erro) {
      mostrarErro(erro as ErroDaApi, 'Extrato não conferido', etapaDeOrigem);
    } finally {
      setOcupado(null);
    }
  }

  async function continuar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const elementos = evento.currentTarget.elements as unknown as Record<string, HTMLElement | undefined>;
    const encontrados = validarImportacao({ arquivo, ...destino });
    setErros(encontrados);
    const primeiro = primeiroCampoComErro(encontrados, ORDEM_DA_IMPORTACAO);
    if (primeiro || !arquivo) {
      elementos[primeiro ?? 'arquivo']?.focus();
      return;
    }

    setOcupado('lendo');
    let estrutura: Estrutura;
    let texto: string;
    try {
      const preparado = await prepararArquivo(arquivo);
      if (typeof preparado === 'string') {
        setOcupado(null);
        setLido(null);
        setErros({ arquivo: preparado });
        elementos.arquivo?.focus();
        return;
      }
      setLido(preparado);
      texto = preparado.extrato.csv;
      // O leitor já sabe as colunas (o PDF vira um CSV simples): direto para
      // a conferência, sem a etapa das colunas.
      if (preparado.extrato.mapeamento) {
        setCsv(texto);
        setLinhas([]);
        setDuvidas([]);
        setOrigem('LEITOR');
        await conferir({ csv: texto, mapeamento: preparado.extrato.mapeamento }, 'arquivo');
        return;
      }
      estrutura = await estruturaDoExtrato(espacoId, { csv: texto });
    } catch (erro) {
      setOcupado(null);
      mostrarErro(erro as ErroDaApi, 'Arquivo não lido', 'arquivo');
      return;
    }
    setCsv(texto);
    aplicarEstrutura(estrutura);
    // Reconhecido sem dúvida: direto para a conferência, sem pedir nada.
    if (estrutura.mapeamento && (estrutura.duvidas ?? []).length === 0) {
      await conferir({ csv: texto, mapeamento: estrutura.mapeamento }, 'arquivo');
    } else {
      setOcupado(null);
      setEtapa('colunas');
    }
  }

  async function trocarDelimitador(delimitador: string) {
    setOcupado('lendo');
    try {
      aplicarEstrutura(await estruturaDoExtrato(espacoId, { csv, delimitador }));
      setErros({});
    } catch (erro) {
      mostrarErro(erro as ErroDaApi, 'Arquivo não lido', 'colunas');
    } finally {
      setOcupado(null);
    }
  }

  function conferirColunas() {
    const encontrados = validarMapeamento(mapeamento);
    setErros(encontrados);
    if (Object.keys(encontrados).length === 0) {
      setOrigem((atual) => (duvidas.length > 0 || !atual ? 'PESSOA' : atual));
      conferir({ csv, mapeamento }, 'colunas');
    }
  }

  async function importar() {
    if (!previa) {
      return;
    }
    const doAjuste = validarAjustes(ajustes);
    setErros(doAjuste);
    if (Object.keys(doAjuste).length > 0) {
      toast.erro('Confira as descrições marcadas antes de importar.', { titulo: 'Descrição vazia' });
      return;
    }
    setOcupado('importando');
    try {
      const resposta = await importarExtrato(espacoId, {
        ...destino,
        csv,
        mapeamento: previa.mapeamento,
        simular: false,
        ajustes: ajustesParaAApi(ajustes),
      });
      toast.sucesso(resumoDaImportacao(resposta), { titulo: contaFixa ? 'Fatura importada' : 'Extrato importado' });
      setOcupado(null);
      aoImportar(resposta);
    } catch (erro) {
      setOcupado(null);
      mostrarErro(erro as ErroDaApi, 'Extrato não importado', 'previa');
    }
  }

  const novas = previa?.resposta.novas ?? 0;
  const indiceDaEtapa = ETAPAS.findIndex((item) => item.id === etapa);
  const semCategorias = opcoesDaCategoria(categorias, 'DESPESA').length === 0 || opcoesDaCategoria(categorias, 'RECEITA').length === 0;
  const reconhecidas = categoriasReconhecidas(previa?.resposta.linhas);
  const textoDaDuvida = textoDasDuvidas(duvidas);
  const descricaoDoArquivo = [`${idDoArquivo}-dica`, erros.arquivo && `${idDoArquivo}-erro`].filter(Boolean).join(' ');
  const formatoDoArquivo = arquivo ? (pareceUmPdf(arquivo) ? 'pdf' : 'csv') : null;
  const pelaLeitura = origem === 'LEITOR' && lido;

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
              {contaFixa ? 'Arquivo da fatura (CSV ou PDF)' : 'Arquivo do banco (CSV ou PDF)'}
            </span>
            <label className={`zona-de-arquivo${erros.arquivo ? ' com-erro' : ''}`}>
              <input
                id={idDoArquivo}
                type="file"
                name="arquivo"
                accept=".csv,.txt,.pdf,text/csv,text/plain,application/pdf"
                className="apenas-leitor"
                aria-labelledby={`${idDoArquivo}-rotulo`}
                aria-describedby={descricaoDoArquivo}
                aria-invalid={Boolean(erros.arquivo)}
                onChange={escolherArquivo}
              />
              <Icone nome="importar" tamanho={20} />
              <span className="texto-da-zona">
                <b>{arquivo ? arquivo.name : 'Escolher arquivo'}</b>
                <small>
                  {arquivo
                    ? 'Clique para trocar'
                    : contaFixa
                      ? 'A fatura do banco, em .csv ou .pdf'
                      : 'O extrato do banco, em .csv ou .pdf'}
                </small>
              </span>
            </label>
            <span id={`${idDoArquivo}-dica`} className="dica-do-campo">
              O banco, as colunas e as categorias são reconhecidos sozinhos; você confere tudo antes de importar. O PDF é
              lido aqui no navegador: só os lançamentos vão para o servidor.
            </span>
            <span id={`${idDoArquivo}-erro`} className="erro-do-campo">
              {erros.arquivo && (
                <>
                  <Icone nome="alerta" tamanho={14} />
                  {erros.arquivo}
                </>
              )}
            </span>
          </div>

          {arquivo && (
            <Campo elemento={Seletor} rotulo="Leitor do arquivo" name="leitor" value={leitor}
              opcoes={opcoesDeLeitor(formatoDoArquivo)}
              dica="Se o banco não for reconhecido certo, escolha o leitor aqui."
              onChange={(evento: { target: { value: string } }) => setLeitor(evento.target.value)} />
          )}

          {contaFixa ? (
            <p className="dica-do-campo">
              As compras entram como saídas na fatura de {contaFixa.nome}. Se aparecerem como entradas na conferência, use
              &quot;Ajustar colunas&quot; e marque &quot;Inverter o sinal dos valores&quot;.
            </p>
          ) : (
            <Campo elemento={Seletor} rotulo="Conta do extrato" name="conta_id" placeholder="Escolha a conta"
              opcoes={contas.map((conta) => ({ valor: conta.id, rotulo: conta.nome }))}
              value={destino.conta_id} onChange={(evento: { target: { value: string } }) => mudarDestino('conta_id', evento.target.value)}
              erro={erros.conta_id} />
          )}

          <div className="duas-colunas">
            <Campo elemento={Seletor} rotulo="Categoria das saídas sem pista" name="categoria_despesa_id" placeholder="Escolha"
              opcoes={opcoesDaCategoria(categorias, 'DESPESA')} value={destino.categoria_despesa_id}
              onChange={(evento: { target: { value: string } }) => mudarDestino('categoria_despesa_id', evento.target.value)}
              erro={erros.categoria_despesa_id} />
            <Campo elemento={Seletor} rotulo="Categoria das entradas sem pista" name="categoria_receita_id" placeholder="Escolha"
              opcoes={opcoesDaCategoria(categorias, 'RECEITA')} value={destino.categoria_receita_id}
              onChange={(evento: { target: { value: string } }) => mudarDestino('categoria_receita_id', evento.target.value)}
              erro={erros.categoria_receita_id} />
          </div>
          <p className="dica-do-campo">
            Cada linha vai para a categoria da coluna de categoria do arquivo, de onde o mesmo estabelecimento foi antes ou
            da palavra da descrição (Uber, farmácia, salário). Sem nenhuma pista, vai para a categoria acima.
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
              {ocupado === 'conferindo' ? 'Conferindo…' : ocupado ? 'Lendo o arquivo…' : 'Continuar'}
            </button>
          </div>
        </form>
      )}

      {etapa === 'colunas' && (
        <div className="etapa-de-colunas">
          <p className={`aviso-da-etapa${origem && !textoDaDuvida ? '' : ' destaque'}`}>
            <Icone nome="colunas" tamanho={18} />
            {!origem
              ? 'Não reconheci as colunas deste arquivo. Diga o que é cada uma: a data, a descrição e o valor (ou as colunas de entrada e saída).'
              : textoDaDuvida || 'Confira o que é cada coluna e ajuste o que precisar.'}
          </p>
          <MapeamentoDeColunas
            linhas={linhas}
            delimitador={colunas.delimitador}
            cabecalho={colunas.cabecalho}
            papeis={colunas.papeis}
            inverterSinal={colunas.inverterSinal}
            duvidas={duvidas}
            erros={erros}
            ocupado={Boolean(ocupado)}
            aoMudarDelimitador={trocarDelimitador}
            aoMudarCabecalho={(cabecalho: number) => setColunas((atual) => ({ ...atual, cabecalho }))}
            aoMudarPapel={(coluna: number, papel: Papel | '') => {
              setColunas((atual) => ({ ...atual, papeis: trocarPapel(atual.papeis, coluna, papel) }));
              // A pessoa mexeu na coluna em dúvida: a dúvida está resolvida.
              setDuvidas((atuais) => atuais.filter((duvida) => duvida !== papel && duvida !== papelDaColuna(colunas.papeis, coluna)));
              setErros({});
            }}
            aoMudarInverterSinal={(inverterSinal: boolean) => setColunas((atual) => ({ ...atual, inverterSinal }))}
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
            {reconhecidas.novas > 0 && (
              <small>
                {reconhecidas.reconhecidas} de {reconhecidas.novas} com a categoria reconhecida. Edite a descrição e a
                categoria na própria linha, se precisar.
              </small>
            )}
          </p>
          <div className="formato-reconhecido">
            <span>
              <small>{ROTULO_DA_ORIGEM_DAS_COLUNAS[origem ?? 'PESSOA']}</small>
              {pelaLeitura ? lido.leitor.nome : descreverMapeamento(previa.mapeamento, nomesDasColunas(linhas, previa.mapeamento.cabecalho))}
            </span>
            {!pelaLeitura && (
              <button type="button" className="discreto-botao" onClick={() => setEtapa('colunas')} disabled={Boolean(ocupado)}>
                <Icone nome="colunas" tamanho={16} />
                Ajustar colunas
              </button>
            )}
          </div>
          {lido && (lido.extrato.conferencias.length > 0 || lido.extrato.avisos.length > 0) && (
            <ul className="conferencia-do-documento" aria-label="Conferência com o documento">
              {lido.extrato.conferencias.map((item) => {
                const bate = item.esperadoCentavos === item.lidoCentavos;
                return (
                  <li key={item.rotulo} className={bate ? 'bate' : 'nao-bate'}>
                    <Icone nome={bate ? 'certo' : 'alerta'} tamanho={16} />
                    {bate
                      ? `${item.rotulo}: ${formatarBRL(item.lidoCentavos)}, igual ao documento.`
                      : `${item.rotulo}: lidos ${formatarBRL(item.lidoCentavos)}, o documento diz ${formatarBRL(item.esperadoCentavos)}. Confira se falta alguma linha.`}
                  </li>
                );
              })}
              {lido.extrato.avisos.map((aviso) => (
                <li key={aviso}>
                  <Icone nome="info" tamanho={16} />
                  {aviso}
                </li>
              ))}
            </ul>
          )}
          <ConferenciaDaImportacao
            linhas={previa.resposta.linhas}
            categorias={categorias}
            ajustes={ajustes}
            erros={erros}
            ocupado={Boolean(ocupado)}
            aoAjustar={(novos) => {
              setAjustes(novos);
              setErros({});
            }}
          />
          <div className="acoes-do-formulario">
            <button type="button" className="secundario" onClick={() => setEtapa('arquivo')} disabled={Boolean(ocupado)}>
              Voltar
            </button>
            {novas > 0 ? (
              <button type="button" onClick={importar} disabled={Boolean(ocupado)} aria-busy={ocupado === 'importando'}>
                <Icone nome="importar" tamanho={16} />
                {ocupado === 'importando' ? 'Importando…' : `Importar ${novas === 1 ? '1 lançamento' : `${novas} lançamentos`}`}
              </button>
            ) : aoVerImportados && destinoDaImportacao(previa.resposta.linhas) ? (
              <button type="button" onClick={() => aoVerImportados(previa.resposta)}>
                <Icone nome={contaFixa ? 'cartao' : 'lancamentos'} tamanho={16} />
                {contaFixa ? 'Ver na fatura' : 'Ver no extrato'}
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

// O papel que a coluna tinha antes da troca (para tirar a dúvida dele também).
const papelDaColuna = (papeis: Papeis, coluna: number): Papel | undefined => papeis[coluna];
