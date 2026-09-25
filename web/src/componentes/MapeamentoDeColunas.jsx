import Campo from './Campo';
import Icone from './Icone';
import Seletor from './Seletor';
import { linhasDeDados, nomesDasColunas, PAPEIS_DAS_COLUNAS, SEPARADORES } from '../regras/importacao';

// Linhas de dados mostradas na prévia das colunas: o bastante para
// reconhecer cada coluna sem esticar a janela.
const LINHAS_NA_PREVIA = 8;
// "arquivo" traz o erro do arquivo que depende das colunas (ex.: nada depois
// do cabeçalho escolhido).
const ORDEM_DOS_ERROS = ['arquivo', 'data', 'descricao', 'valor', 'credito', 'debito', 'tipo', 'categoria'];

// Tela de colunas da importação: o começo do arquivo numa tabela e, em cima
// de cada coluna, o que ela é (Data, Descrição, Valor, Entrada, Saída, D/C,
// Categoria ou Ignorar). Aparece quando a API não reconhece o formato pelo
// nome das colunas, ou quando a pessoa quer ajustar o que foi reconhecido.
export default function MapeamentoDeColunas({
  linhas,
  delimitador,
  cabecalho,
  papeis,
  inverterSinal,
  erros = {},
  ocupado = false,
  aoMudarDelimitador,
  aoMudarCabecalho,
  aoMudarPapel,
  aoMudarInverterSinal,
}) {
  const nomes = nomesDasColunas(linhas, cabecalho);
  const dados = linhasDeDados(linhas, cabecalho).slice(0, LINHAS_NA_PREVIA);
  const opcoesDeCabecalho = [
    { valor: 0, rotulo: 'Sem cabeçalho', descricao: 'Os lançamentos começam na linha 1' },
    ...linhas.map((linha) => ({ valor: linha.numero, rotulo: `Linha ${linha.numero}`, descricao: linha.celulas.slice(0, 3).join(' · ') })),
  ];
  const mensagens = ORDEM_DOS_ERROS.map((papel) => erros[papel]).filter(Boolean);

  return (
    <div className="mapeamento">
      <div className="duas-colunas">
        <Campo elemento={Seletor} rotulo="Separador das colunas" name="delimitador" value={delimitador} opcoes={SEPARADORES}
          disabled={ocupado} onChange={(evento) => aoMudarDelimitador(evento.target.value)} />
        <Campo elemento={Seletor} rotulo="Linha do cabeçalho" name="cabecalho" value={cabecalho} opcoes={opcoesDeCabecalho}
          disabled={ocupado} onChange={(evento) => aoMudarCabecalho(evento.target.value)} />
      </div>

      {mensagens.length > 0 && (
        <ul className="erros-do-mapeamento" role="alert">
          {mensagens.map((mensagem) => (
            <li key={mensagem} className="erro-do-campo">
              <Icone nome="alerta" tamanho={14} />
              {mensagem}
            </li>
          ))}
        </ul>
      )}

      <div className="tabela-do-arquivo" role="region" aria-label="Começo do arquivo, com o que é cada coluna" tabIndex={0}>
        <table>
          <thead>
            <tr>
              {nomes.map((nome, coluna) => (
                <th key={`${coluna}-${nome}`} scope="col">
                  <span className="nome-da-coluna" title={nome}>
                    {nome}
                  </span>
                  <Seletor
                    name={`coluna-${coluna}`}
                    aria-label={`O que é a coluna "${nome}"`}
                    aria-invalid={Boolean(erros[papeis[coluna]])}
                    value={papeis[coluna] ?? ''}
                    opcoes={PAPEIS_DAS_COLUNAS}
                    disabled={ocupado}
                    className={papeis[coluna] ? 'com-papel' : undefined}
                    onChange={(evento) => aoMudarPapel(coluna, evento.target.value)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dados.map((linha) => (
              <tr key={linha.numero}>
                {nomes.map((nome, coluna) => (
                  <td key={`${coluna}-${nome}`} className={papeis[coluna] ? undefined : 'ignorada'}>
                    {linha.celulas[coluna] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dados.length === 0 && <p className="dica-do-campo">Nenhuma linha depois do cabeçalho escolhido.</p>}

      <label className="caixa-de-marcar">
        <input type="checkbox" checked={inverterSinal} disabled={ocupado} onChange={(evento) => aoMudarInverterSinal(evento.target.checked)} />
        <span>
          <b>Inverter o sinal dos valores</b>
          <small>Para fatura de cartão, em que a compra vem positiva. As compras viram saídas.</small>
        </span>
      </label>
    </div>
  );
}
