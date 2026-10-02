import { estiloDoPlastico } from '../regras/cores';
import { formatarData } from '../regras/datas';

// Miniatura fiel de um cartão de crédito de verdade (85,6 × 54 mm, a mesma
// proporção): o plástico na cor escolhida com o brilho e a textura fina, o
// chip dourado com os contatos, o símbolo de aproximação, os números
// mascarados, o nome do titular em relevo (titular: o nome do cadastro) e o
// vencimento da fatura no lugar da validade.
// Nenhum número de cartão existe no app: os pontos são só desenho. Sem
// bandeira de verdade (marca de terceiros), só a palavra "crédito".
//
// É enfeite: o nome e os valores estão escritos ao lado, na legenda de quem
// usa a miniatura, então o desenho inteiro fica fora do leitor de tela.
export default function MiniaturaDoCartao({ cartao, titular = '' }) {
  const vencimento = cartao.fatura_atual?.vencimento;
  const plastico = estiloDoPlastico(cartao.cor);
  return (
    <span className={`miniatura-do-cartao ${plastico.classe}${cartao.ativa === false ? ' desativado' : ''}`} style={plastico.estilo}
      aria-hidden="true">
      <span className="miniatura-topo">
        <span className="miniatura-nome-do-cartao">{cartao.nome}</span>
        <span className="miniatura-rede">crédito</span>
      </span>
      <span className="miniatura-meio">
        <span className="miniatura-chip">
          <i />
        </span>
        <svg className="miniatura-aproximacao" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round">
          <path d="M8.5 7.5a6 6 0 0 1 0 9" />
          <path d="M12 5a10 10 0 0 1 0 14" />
          <path d="M15.5 2.8a13.5 13.5 0 0 1 0 18.4" />
        </svg>
      </span>
      <span className="miniatura-numero">•••• •••• •••• ••••</span>
      <span className="miniatura-rodape">
        <span className="miniatura-titular">{titular}</span>
        {vencimento && (
          <span className="miniatura-validade">
            <small>vence</small>
            {formatarData(vencimento).slice(0, 5)}
          </span>
        )}
      </span>
    </span>
  );
}
