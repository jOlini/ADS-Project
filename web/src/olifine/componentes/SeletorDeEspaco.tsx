import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ConfirmacaoJs from '../../componentes/Confirmacao';
import FormularioDeEspaco from '../../componentes/FormularioDeEspaco';
import Icone from '../../componentes/Icone';
import ModalJs from '../../componentes/Modal';
import { semTipos } from '../../componentes/semTipos';
import { useToast } from '../../componentes/toast/useToast';
import { nomeCurto, nomeDoEspaco, podeGerenciar, secaoDaRota, TIPOS_DE_ESPACO, type Espaco } from '../../regras/espacos';
import { excluirEspaco } from '../../servicos/livroCaixa';
import FlutuanteJs from './Flutuante';

const Confirmacao = semTipos(ConfirmacaoJs);
const Flutuante = semTipos(FlutuanteJs);
const Modal = semTipos(ModalJs);

interface Props {
  espacos: Espaco[];
  ativo: Espaco | null;
  sobrenome?: string;
  trocarEspaco: (id: string) => void;
  recarregarEspacos: (abrir?: string | null) => Promise<void>;
}

type Janela = { tipo: 'criar' } | { tipo: 'renomear'; espaco: Espaco } | { tipo: 'excluir'; espaco: Espaco } | null;

function MarcaDoEspaco({ espaco, tamanho = 16 }: { espaco: Pick<Espaco, 'tipo'>; tamanho?: number }) {
  return (
    <span className={`marca-do-espaco ${espaco.tipo.toLowerCase()}`} aria-hidden="true">
      <Icone nome={TIPOS_DE_ESPACO[espaco.tipo].icone} tamanho={tamanho} />
    </span>
  );
}

// Seletor de espaço no topo da área logada: mostra em qual livro-caixa a
// pessoa está (pessoal, família ou empresa, cada um com a sua marca) e troca
// de um para o outro. Também cria espaço novo e, no espaço criado pela
// pessoa, renomeia e exclui (só o vazio: a API recusa com o motivo).
export default function SeletorDeEspaco({ espacos, ativo, sobrenome, trocarEspaco, recarregarEspacos }: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [janela, setJanela] = useState<Janela>(null);
  const [ocupado, setOcupado] = useState(false);
  const nome = nomeDoEspaco(ativo);

  // Troca o livro e volta ao começo da seção: o cartão ou a busca abertos
  // eram do espaço anterior.
  function abrir(espaco: Espaco) {
    trocarEspaco(espaco.id);
    const secao = secaoDaRota(pathname);
    if (secao !== pathname) {
      navigate(secao);
    }
  }

  async function aoSalvar(espaco: Espaco) {
    const criado = janela?.tipo === 'criar';
    setJanela(null);
    setOcupado(false);
    await recarregarEspacos(espaco.id);
    if (criado) {
      navigate('/principal');
    }
  }

  async function confirmarExclusao(espaco: Espaco) {
    setOcupado(true);
    try {
      await excluirEspaco(espaco.id);
      toast.sucesso('Você voltou ao espaço pessoal.', { titulo: `Espaço "${espaco.nome}" excluído` });
      setJanela(null);
      await recarregarEspacos(null);
      navigate('/principal');
    } catch (falha) {
      toast.erro((falha as Error).message, { titulo: 'Espaço não excluído' });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <Flutuante
        rotulo={`Espaço: ${nome}. Trocar de espaço`}
        className="of-espaco-botao"
        classeDoPainel="of-espacos"
        alinhar="inicio"
        botao={
          <>
            {ativo && <MarcaDoEspaco espaco={ativo} />}
            <span className="of-espaco-nome">{nomeCurto(ativo)}</span>
            <Icone nome="seta" tamanho={14} />
          </>
        }
      >
        {(fechar: () => void) => (
          <>
            <p className="of-flutuante-titulo">Espaços</p>
            <ul>
              {espacos.map((espaco) => {
                const atual = espaco.id === ativo?.id;
                return (
                  <li key={espaco.id}>
                    <button
                      type="button"
                      className="of-espaco-opcao"
                      aria-current={atual ? 'true' : undefined}
                      onClick={() => {
                        fechar();
                        if (!atual) {
                          abrir(espaco);
                        }
                      }}
                    >
                      <MarcaDoEspaco espaco={espaco} tamanho={18} />
                      <span>
                        <b>{nomeDoEspaco(espaco)}</b>
                        <small>{TIPOS_DE_ESPACO[espaco.tipo].rotulo}</small>
                      </span>
                      {atual && <Icone nome="certo" tamanho={16} />}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="of-espacos-acoes">
              <button
                type="button"
                className="of-conta-acao"
                onClick={() => {
                  fechar();
                  setJanela({ tipo: 'criar' });
                }}
              >
                <Icone nome="mais" />
                Novo espaço
              </button>
              {ativo && podeGerenciar(ativo) && (
                <>
                  <button
                    type="button"
                    className="of-conta-acao"
                    onClick={() => {
                      fechar();
                      setJanela({ tipo: 'renomear', espaco: ativo });
                    }}
                  >
                    <Icone nome="editar" />
                    Renomear este espaço
                  </button>
                  <button
                    type="button"
                    className="of-conta-acao of-espaco-excluir"
                    onClick={() => {
                      fechar();
                      setJanela({ tipo: 'excluir', espaco: ativo });
                    }}
                  >
                    <Icone nome="excluir" />
                    Excluir este espaço
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </Flutuante>

      <Modal
        aberta={janela?.tipo === 'criar' || janela?.tipo === 'renomear'}
        titulo={janela?.tipo === 'renomear' ? 'Renomear espaço' : 'Novo espaço'}
        descricao={janela?.tipo === 'renomear' ? janela.espaco.nome : 'Família ou empresa, com o próprio livro-caixa.'}
        ocupado={ocupado}
        aoFechar={() => setJanela(null)}
      >
        {(janela?.tipo === 'criar' || janela?.tipo === 'renomear') && (
          <FormularioDeEspaco
            emEdicao={janela.tipo === 'renomear' ? janela.espaco : null}
            sobrenome={sobrenome}
            aoSalvar={aoSalvar}
            aoCancelar={() => setJanela(null)}
            aoMudarOcupado={setOcupado}
          />
        )}
      </Modal>

      <Confirmacao
        aberta={janela?.tipo === 'excluir'}
        titulo={janela?.tipo === 'excluir' ? `Excluir "${janela.espaco.nome}"?` : ''}
        rotuloDeConfirmar="Excluir espaço"
        perigo
        ocupado={ocupado}
        aoConfirmar={() => janela?.tipo === 'excluir' && confirmarExclusao(janela.espaco)}
        aoCancelar={() => !ocupado && setJanela(null)}
      >
        Só dá para excluir um espaço vazio, sem contas nem lançamentos. As categorias dele saem junto, e o app volta ao
        espaço pessoal.
      </Confirmacao>
    </>
  );
}
