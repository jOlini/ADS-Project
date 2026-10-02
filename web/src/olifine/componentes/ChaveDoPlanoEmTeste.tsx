import Icone from '../../componentes/Icone';
import { semTipos } from '../../componentes/semTipos';
import { PLANOS, type Plano } from '../../regras/planos';
import FlutuanteJs from './Flutuante';

const Flutuante = semTipos(FlutuanteJs);

interface Props {
  // null: o plano gravado vale (sem simulação).
  plano: Plano | null;
  aoTrocar: (plano: Plano | null) => void;
}

const nomeDoPlano = (plano: Plano) => PLANOS.find((item) => item.id === plano)?.nome ?? plano;

// Chave "Plano em teste" do topo, só para os super admins (SUPER_ADMINS na
// API). Troca a experiência do app inteiro entre Free, Família e Empresarial,
// com as travas de verdade da API, sem mudar o plano gravado: é o caminho
// para testar de ponta a ponta com e sem as restrições de cada assinatura.
// O visual tracejado em âmbar avisa que é uma ferramenta de teste, não uma
// parte do produto.
export default function ChaveDoPlanoEmTeste({ plano, aoTrocar }: Props) {
  const opcoes: { valor: Plano | null; rotulo: string; descricao: string }[] = [
    { valor: null, rotulo: 'Plano real', descricao: 'O plano gravado na sua conta.' },
    ...PLANOS.map((item) => ({ valor: item.id, rotulo: item.nome, descricao: item.apoio })),
  ];
  return (
    <Flutuante
      rotulo={`Plano em teste: ${plano ? nomeDoPlano(plano) : 'plano real'}. Trocar`}
      className={`of-plano-em-teste${plano ? ' simulando' : ''}`}
      classeDoPainel="of-painel-plano-em-teste"
      botao={
        <>
          <Icone nome="escudo" tamanho={16} />
          <span className="of-plano-em-teste-rotulo">{plano ? nomeDoPlano(plano) : 'Plano real'}</span>
        </>
      }
    >
      {(fechar: () => void) => (
        <>
          <p className="of-flutuante-titulo">Plano em teste</p>
          <p className="of-plano-em-teste-dica">
            Só super admins veem esta chave. A API aplica as travas do plano escolhido; o plano gravado não muda.
          </p>
          <ul role="group" aria-label="Plano em teste">
            {opcoes.map((opcao) => (
              <li key={opcao.valor ?? 'real'}>
                <button
                  type="button"
                  className="of-plano-em-teste-opcao"
                  aria-pressed={plano === opcao.valor}
                  onClick={() => {
                    fechar();
                    if (plano !== opcao.valor) {
                      aoTrocar(opcao.valor);
                    }
                  }}
                >
                  <span className="of-plano-em-teste-marca" aria-hidden="true">
                    {plano === opcao.valor && <Icone nome="certo" tamanho={14} />}
                  </span>
                  <span>
                    <b>{opcao.rotulo}</b>
                    <small>{opcao.descricao}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Flutuante>
  );
}
