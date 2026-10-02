import Icone from './Icone';
import { COR_DO_TIPO_DE_CONTA, estiloDoPlastico } from '../regras/cores';
import { formatarBRL } from '../regras/dinheiro';
import { rotuloDoTipoDeConta } from '../regras/livroCaixa';
import { sobreOTipo, type TipoDeConta } from '../olifine/regras/saldos';

export interface ContaDoCard {
  id: string;
  nome: string;
  tipo: TipoDeConta;
  saldo_centavos: number;
  ativa: boolean;
  cor?: string | null;
}

interface Props {
  conta: ContaDoCard;
  marcado?: boolean;
  aoMarcar?: () => void;
  aoEditar?: () => void;
}

// Conta bancária no mesmo estilo dos cartões da carteira: o plástico na cor
// escolhida (ou na cor do tipo da conta), o ícone do tipo, o nome por
// extenso (quebra em duas linhas antes de cortar), o saldo em destaque e o
// tipo embaixo. A caixa de seleção e o editar ficam no topo, como no cartão.
export default function ContaVisual({ conta, marcado = false, aoMarcar, aoEditar }: Props) {
  const { classe, estilo } = estiloDoPlastico(conta.cor, COR_DO_TIPO_DE_CONTA[conta.tipo] ?? 'grafite');
  const sobre = sobreOTipo(conta.tipo);
  const classes = ['cartao-visual', 'conta-visual', classe, conta.ativa ? '' : 'desativado', marcado ? 'marcado' : ''];
  return (
    <article className={classes.filter(Boolean).join(' ')} style={estilo}>
      <div className="topo-do-plastico">
        {aoMarcar && (
          <input type="checkbox" className="marcar-cartao" checked={marcado} onChange={aoMarcar} aria-label={`Selecionar ${conta.nome}`} />
        )}
        <span className="simbolo-da-conta" aria-hidden="true">
          <Icone nome={sobre.icone} tamanho={18} />
        </span>
        <h3 className="nome-no-plastico" title={conta.nome}>
          {conta.nome}
        </h3>
        {aoEditar && (
          <button type="button" className="botao-icone sobre-o-plastico" onClick={aoEditar} aria-label={`Editar ${conta.nome}`}>
            <Icone nome="editar" tamanho={16} />
          </button>
        )}
      </div>

      <dl className="numeros-do-plastico saldo-da-conta">
        <div>
          <dt>Saldo</dt>
          <dd className={conta.saldo_centavos < 0 ? 'negativo' : undefined}>{formatarBRL(conta.saldo_centavos)}</dd>
        </div>
      </dl>

      <small className="rodape-da-conta">
        {!conta.ativa && <b>Desativada · </b>}
        {rotuloDoTipoDeConta(conta.tipo)} · {sobre.texto}
      </small>
    </article>
  );
}
