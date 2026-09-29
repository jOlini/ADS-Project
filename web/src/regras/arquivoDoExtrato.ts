// O arquivo do extrato antes de ir à API: tipo, tamanho e texto. A API
// confere tudo de novo (importacao.conferir_arquivo): aqui a pessoa fica
// sabendo na hora, sem esperar a rede, e o que não é CSV nem sai do navegador.

// Mesmo teto da API (TAMANHO_MAXIMO_DO_CSV, em caracteres). Em bytes o arquivo
// tem pelo menos o mesmo tamanho, então conferir os bytes já basta.
export const TAMANHO_MAXIMO_DO_ARQUIVO = 500_000;

// Extensões e tipos (MIME) de um CSV. O Windows diz que o .csv é
// "application/vnd.ms-excel" quando o Excel está instalado, e alguns
// navegadores não dizem nada (tipo vazio): os dois são aceitos, e o começo do
// arquivo decide.
const EXTENSOES = ['.csv', '.txt'];
const TIPOS_ACEITOS = new Set([
  '',
  'text/csv',
  'text/plain',
  'text/x-csv',
  'text/comma-separated-values',
  'application/csv',
  'application/x-csv',
  'application/vnd.ms-excel',
]);

// Começo (bytes) de arquivos que não são texto, com o que dizer à pessoa.
const ASSINATURAS: { bytes: number[]; mensagem: string }[] = [
  { bytes: [0x50, 0x4b, 0x03, 0x04], mensagem: 'Este arquivo é uma planilha do Excel (.xlsx) ou um .zip. No banco, exporte o extrato em CSV.' },
  { bytes: [0xd0, 0xcf, 0x11, 0xe0], mensagem: 'Este arquivo é uma planilha antiga do Excel (.xls). No banco, exporte o extrato em CSV.' },
  { bytes: [0x25, 0x50, 0x44, 0x46], mensagem: 'Este arquivo é um PDF. No banco, exporte o extrato em CSV.' },
  { bytes: [0x89, 0x50, 0x4e, 0x47], mensagem: 'Este arquivo é uma imagem. No banco, exporte o extrato em CSV.' },
  { bytes: [0xff, 0xd8, 0xff], mensagem: 'Este arquivo é uma imagem. No banco, exporte o extrato em CSV.' },
];
const MENSAGEM_BINARIO = 'Este arquivo não é um texto CSV. No banco, exporte o extrato em CSV.';
const MENSAGEM_TIPO = 'Escolha um arquivo .csv (o extrato exportado pelo banco).';
// Bytes do começo conferidos: o bastante para achar um arquivo binário.
const TRECHO = 4096;

export interface ArquivoEscolhido {
  name: string;
  size: number;
  type: string;
}

// Erro do arquivo pelo nome, tipo e tamanho (sem ler nada), ou ''.
export function conferirArquivo(arquivo: ArquivoEscolhido | null | undefined): string {
  if (!arquivo) {
    return 'Escolha o arquivo do extrato.';
  }
  const nome = arquivo.name.toLowerCase();
  if (!EXTENSOES.some((extensao) => nome.endsWith(extensao)) || !TIPOS_ACEITOS.has(arquivo.type)) {
    return MENSAGEM_TIPO;
  }
  if (arquivo.size === 0) {
    return 'O arquivo está vazio.';
  }
  if (arquivo.size > TAMANHO_MAXIMO_DO_ARQUIVO) {
    return 'Arquivo grande demais (máximo de 500 KB). Exporte um período menor.';
  }
  return '';
}

const comecaCom = (bytes: Uint8Array, assinatura: number[]) => assinatura.every((byte, indice) => bytes[indice] === byte);
const temBom = (bytes: Uint8Array, bom: number[]) => comecaCom(bytes, bom);
const BOM_UTF16_LE = [0xff, 0xfe];
const BOM_UTF16_BE = [0xfe, 0xff];

// Erro do conteúdo pelo começo dos bytes (planilha, PDF, imagem, binário), ou
// ''. Texto em UTF-16 (o "Unicode" do Excel) tem zeros entre as letras e não
// é binário: ele passa, e decodificarExtrato o lê.
export function conferirConteudo(bytes: Uint8Array): string {
  const assinatura = ASSINATURAS.find((item) => comecaCom(bytes, item.bytes));
  if (assinatura) {
    return assinatura.mensagem;
  }
  if (temBom(bytes, BOM_UTF16_LE) || temBom(bytes, BOM_UTF16_BE)) {
    return '';
  }
  const trecho = bytes.subarray(0, TRECHO);
  // Byte zero ou controle demais (fora tabulação e quebras de linha): não é texto.
  let controles = 0;
  for (const byte of trecho) {
    if (byte === 0) {
      return MENSAGEM_BINARIO;
    }
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) {
      controles += 1;
    }
  }
  return controles > trecho.length * 0.01 ? MENSAGEM_BINARIO : '';
}

// Texto do arquivo. Muitos bancos exportam o CSV em Windows-1252 (o "ANSI" do
// Excel): lido como UTF-8, "Descrição" viraria "Descri��o" e o cabeçalho não
// seria achado. Com BOM de UTF-16, lê em UTF-16; senão, tenta UTF-8 estrito e,
// se o arquivo não for UTF-8 válido, lê como Windows-1252.
export function decodificarExtrato(bytes: ArrayBuffer | Uint8Array): string {
  const vista = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (temBom(vista, BOM_UTF16_LE)) {
    return new TextDecoder('utf-16le').decode(vista);
  }
  if (temBom(vista, BOM_UTF16_BE)) {
    return new TextDecoder('utf-16be').decode(vista);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(vista);
  } catch {
    return new TextDecoder('windows-1252').decode(vista);
  }
}

// Lê e confere o arquivo escolhido: { texto } pronto para a API, ou
// { erro } com a mensagem para o campo do arquivo.
export async function lerArquivoDoExtrato(arquivo: File): Promise<{ texto: string; erro?: undefined } | { erro: string; texto?: undefined }> {
  const problema = conferirArquivo(arquivo);
  if (problema) {
    return { erro: problema };
  }
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const doConteudo = conferirConteudo(bytes);
  if (doConteudo) {
    return { erro: doConteudo };
  }
  return { texto: decodificarExtrato(bytes) };
}
