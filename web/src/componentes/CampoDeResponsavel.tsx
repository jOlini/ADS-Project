import Campo from './Campo';
import Icone from './Icone';
import { mesmaPessoa, sugestoesDeResponsavel, TAMANHO_DO_RESPONSAVEL } from '../regras/responsavel';

interface Props {
  valor: string;
  aoMudar: (valor: string) => void;
  erro?: string;
  // Pessoas já usadas no espaço (divisões e responsáveis), como atalho.
  pessoasConhecidas?: readonly string[];
  // O que a pessoa lê embaixo do campo; muda entre despesa e receita.
  dica?: string;
}

// "Responsável" do lançamento: de quem é o gasto (ou a receita), com o valor
// inteiro. Resolve o que antes pedia a divisão entre pessoas como contorno.
// O campo aceita qualquer nome, e as pessoas já usadas viram atalhos: um
// toque escolhe, outro toque no mesmo atalho volta para "você". A lista de
// atalhos é fixa enquanto a pessoa digita, para nada pular de lugar.
export default function CampoDeResponsavel({ valor, aoMudar, erro, pessoasConhecidas = [], dica }: Props) {
  const sugestoes = sugestoesDeResponsavel(pessoasConhecidas);
  return (
    <div className="campo-de-responsavel">
      <Campo
        rotulo={
          <>
            Responsável <span className="rotulo-opcional">(opcional)</span>
          </>
        }
        name="responsavel"
        mascara="texto"
        autoComplete="off"
        maxLength={TAMANHO_DO_RESPONSAVEL}
        placeholder="Você"
        dica={dica ?? 'De quem é o lançamento. Vazio, fica com você.'}
        value={valor}
        onChange={(evento: { target: { value: string } }) => aoMudar(evento.target.value)}
        erro={erro}
      />
      {sugestoes.length > 0 && (
        <div className="atalhos-de-pessoa" role="group" aria-label="Pessoas já usadas">
          {sugestoes.map((nome) => {
            const escolhida = mesmaPessoa(nome, valor);
            return (
              <button
                key={nome}
                type="button"
                className="sugestao"
                aria-pressed={escolhida}
                onClick={() => aoMudar(escolhida ? '' : nome)}
              >
                <Icone nome={escolhida ? 'certo' : 'usuario'} tamanho={14} />
                {nome}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
