import Campo from './Campo';
import Icone from './Icone';
import { formatarBRL } from '../regras/dinheiro';
import { parteDeCada } from '../regras/divisao';

// A divisão do gasto no Plano Free: só em quantas pessoas ele foi dividido,
// contando você, como anotação. Sem nomes, o lançamento continua inteiro seu
// (o valor todo sai da conta) e nada separa o gasto de cada pessoa. Dividir
// com o nome e a parte de cada um é do Plano Família (DivisaoEntrePessoas), e
// a API recusa a divisão por pessoa no Free, mesmo que a tela seja burlada.
//
// A dica existe sempre (muda só o texto): o campo não empurra nada ao digitar.
export default function DivididoEntre({ valor, aoMudar, total, erro }) {
  const parte = parteDeCada(total, valor);
  return (
    <div className="divisao divisao-do-free">
      <Campo
        rotulo="Dividido entre quantas pessoas, com você? (opcional)"
        name="dividido_entre"
        mascara="inteiro"
        digitos={2}
        inputMode="numeric"
        autoComplete="off"
        placeholder="Ex.: 3"
        value={valor}
        onChange={(evento) => aoMudar(evento.target.value)}
        erro={erro}
        dica={
          parte
            ? `Só uma anotação: cada um fica com cerca de ${formatarBRL(parte)}.`
            : 'Só uma anotação: o valor todo continua saindo da sua conta.'
        }
      />
      <p className="divisao-do-plano">
        <Icone nome="cadeado" tamanho={14} />
        Dividir com o nome e a parte de cada pessoa faz parte do Plano Família.
      </p>
    </div>
  );
}
