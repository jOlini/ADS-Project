import CampoJs from './Campo';
import SeletorJs from './Seletor';
import { semTipos } from './semTipos';
import { opcoesDeResponsavel } from '../regras/responsavel';
import type { PessoaDaFamilia } from '../regras/espacos';

const Campo = semTipos(CampoJs);
const Seletor = semTipos(SeletorJs);

interface Props {
  valor: string;
  aoMudar: (valor: string) => void;
  erro?: string;
  // As pessoas da casa (regras/familia.ts, pessoasDaFamilia): só existem com o
  // Modo Família ligado e um plano que o libera.
  familia: readonly PessoaDaFamilia[];
  // O que a pessoa lê embaixo do campo; muda entre despesa e receita.
  dica?: string;
}

// "Responsável" do lançamento: de quem é o gasto (ou a receita), com o valor
// inteiro. Só no Plano Família, e só com as pessoas cadastradas na família
// ("Você" é o titular): fora disso o campo nem aparece, para ninguém separar
// o gasto por pessoa sem o plano. A API confere de novo (403 no Free, 400
// para um nome de fora da família).
export default function CampoDeResponsavel({ valor, aoMudar, erro, familia, dica }: Props) {
  if (familia.length === 0) {
    return null;
  }
  return (
    <Campo
      elemento={Seletor}
      rotulo={
        <>
          Responsável <span className="rotulo-opcional">(opcional)</span>
        </>
      }
      name="responsavel"
      opcoes={opcoesDeResponsavel(familia, valor)}
      value={valor}
      onChange={(evento: { target: { value: string } }) => aoMudar(evento.target.value)}
      dica={dica ?? 'De quem é o lançamento, entre as pessoas da casa.'}
      erro={erro}
    />
  );
}
