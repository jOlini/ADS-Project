import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import ConfirmacaoJs from '../../componentes/Confirmacao';
import FormularioDeEmpresa from '../../componentes/FormularioDeEmpresa';
import Icone from '../../componentes/Icone';
import ModalJs from '../../componentes/Modal';
import { semTipos } from '../../componentes/semTipos';
import { useToast } from '../../componentes/toast/useToast';
import {
  empresasDe,
  nomeDoEspaco,
  podeGerenciar,
  REGIMES,
  secaoDaRota,
  TIPOS_DE_ESPACO,
  type Espaco,
  type TipoDeEspaco,
} from '../../regras/espacos';
import { excluirEspaco } from '../../servicos/livroCaixa';
import ChaveDaFamilia from './ChaveDaFamilia';
import FlutuanteJs from './Flutuante';

const Confirmacao = semTipos(ConfirmacaoJs);
const Flutuante = semTipos(FlutuanteJs);
const Modal = semTipos(ModalJs);

interface Props {
  espacos: Espaco[];
  ativo: Espaco | null;
  trocarEspaco: (id: string) => void;
  // Pessoal ou Empresarial: abre o pessoal ou a última empresa usada. false
  // quando ainda não há empresa.
  trocarContexto: (tipo: TipoDeEspaco) => boolean;
  recarregarEspacos: (abrir?: string | null) => Promise<void>;
}

type Janela = { tipo: 'criar' } | { tipo: 'editar'; espaco: Espaco } | { tipo: 'excluir'; espaco: Espaco } | null;

const CONTEXTOS: readonly TipoDeEspaco[] = ['PF', 'PJ'];

function MarcaDoEspaco({ espaco, tamanho = 16 }: { espaco: Pick<Espaco, 'tipo'>; tamanho?: number }) {
  return (
    <span className={`marca-do-espaco ${espaco.tipo.toLowerCase()}`} aria-hidden="true">
      <Icone nome={TIPOS_DE_ESPACO[espaco.tipo].icone} tamanho={tamanho} />
    </span>
  );
}

const rotuloDoRegime = (espaco: Espaco) =>
  REGIMES.find((opcao) => opcao.valor === espaco.regime)?.rotulo ?? 'Regime não informado';

// Seletor do topo da área logada. São dois espaços, e só dois: Pessoal e
// Empresarial, lado a lado como abas (a troca é instantânea: o livro-caixa já
// está na memória e a tela só remonta). No Pessoal, ao lado, a chave do Modo
// Família. No Empresarial, o seletor da empresa: cada empresa é um
// livro-caixa próprio, com cadastro (nome, CNPJ, regime), edição e exclusão
// (só a sem movimento: a API recusa com o motivo). Sem empresa ainda,
// "Empresarial" abre o cadastro da primeira.
export default function SeletorDeEspaco({ espacos, ativo, trocarEspaco, trocarContexto, recarregarEspacos }: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [janela, setJanela] = useState<Janela>(null);
  const [ocupado, setOcupado] = useState(false);
  const empresas = empresasDe(espacos);
  const contexto: TipoDeEspaco = ativo?.tipo ?? 'PF';

  // Troca o livro e volta ao começo da seção: o cartão ou a busca abertos
  // eram do espaço anterior.
  function voltarAoComecoDaSecao() {
    const secao = secaoDaRota(pathname);
    if (secao !== pathname) {
      navigate(secao);
    }
  }

  function escolherContexto(tipo: TipoDeEspaco) {
    if (tipo === contexto) {
      return;
    }
    if (trocarContexto(tipo)) {
      voltarAoComecoDaSecao();
    } else {
      setJanela({ tipo: 'criar' });
    }
  }

  function abrirEmpresa(empresa: Espaco) {
    trocarEspaco(empresa.id);
    voltarAoComecoDaSecao();
  }

  async function aoSalvar(empresa: Espaco) {
    const criada = janela?.tipo === 'criar';
    setJanela(null);
    setOcupado(false);
    await recarregarEspacos(empresa.id);
    if (criada) {
      navigate('/principal');
    }
  }

  async function confirmarExclusao(empresa: Espaco) {
    setOcupado(true);
    try {
      await excluirEspaco(empresa.id);
      const restantes = empresas.filter((outra) => outra.id !== empresa.id);
      toast.sucesso(restantes.length > 0 ? `Você está em "${restantes[0]?.nome}".` : 'Você voltou ao espaço pessoal.', {
        titulo: `Empresa "${empresa.nome}" excluída`,
      });
      setJanela(null);
      await recarregarEspacos(restantes[0]?.id ?? null);
      navigate('/principal');
    } catch (falha) {
      toast.erro((falha as Error).message, { titulo: 'Empresa não excluída' });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="of-espaco">
      <div className="abas of-alternador-de-espaco" role="group" aria-label="Espaço">
        {CONTEXTOS.map((tipo) => (
          <button
            key={tipo}
            type="button"
            aria-pressed={contexto === tipo}
            title={tipo === 'PF' ? 'Espaço pessoal' : 'Espaço empresarial'}
            onClick={() => escolherContexto(tipo)}
          >
            <Icone nome={TIPOS_DE_ESPACO[tipo].icone} tamanho={16} />
            <span className="of-alternador-rotulo">{TIPOS_DE_ESPACO[tipo].rotulo}</span>
          </button>
        ))}
      </div>

      {ativo?.tipo === 'PF' && <ChaveDaFamilia espaco={ativo} recarregarEspacos={recarregarEspacos} />}

      {ativo?.tipo === 'PJ' && (
        <Flutuante
          rotulo={`Empresa: ${ativo.nome}. Trocar de empresa`}
          className="of-espaco-botao"
          classeDoPainel="of-espacos"
          alinhar="inicio"
          botao={
            <>
              <MarcaDoEspaco espaco={ativo} />
              <span className="of-espaco-nome">{nomeDoEspaco(ativo)}</span>
              <Icone nome="seta" tamanho={14} />
            </>
          }
        >
          {(fechar: () => void) => (
            <>
              <p className="of-flutuante-titulo">Empresas</p>
              <ul>
                {empresas.map((empresa) => {
                  const atual = empresa.id === ativo.id;
                  return (
                    <li key={empresa.id}>
                      <button
                        type="button"
                        className="of-espaco-opcao"
                        aria-current={atual ? 'true' : undefined}
                        onClick={() => {
                          fechar();
                          if (!atual) {
                            abrirEmpresa(empresa);
                          }
                        }}
                      >
                        <MarcaDoEspaco espaco={empresa} tamanho={18} />
                        <span>
                          <b>{empresa.nome}</b>
                          <small>{rotuloDoRegime(empresa)}</small>
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
                  Nova empresa
                </button>
                {podeGerenciar(ativo) && (
                  <>
                    <button
                      type="button"
                      className="of-conta-acao"
                      onClick={() => {
                        fechar();
                        setJanela({ tipo: 'editar', espaco: ativo });
                      }}
                    >
                      <Icone nome="editar" />
                      Editar esta empresa
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
                      Excluir esta empresa
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </Flutuante>
      )}

      <Modal
        aberta={janela?.tipo === 'criar' || janela?.tipo === 'editar'}
        titulo={janela?.tipo === 'editar' ? 'Editar empresa' : empresas.length === 0 ? 'Sua primeira empresa' : 'Nova empresa'}
        descricao={
          janela?.tipo === 'editar'
            ? janela.espaco.nome
            : 'O espaço empresarial reúne as suas empresas, cada uma com o próprio caixa.'
        }
        ocupado={ocupado}
        aoFechar={() => setJanela(null)}
      >
        {(janela?.tipo === 'criar' || janela?.tipo === 'editar') && (
          <FormularioDeEmpresa
            emEdicao={janela.tipo === 'editar' ? janela.espaco : null}
            aoSalvar={aoSalvar}
            aoCancelar={() => setJanela(null)}
            aoMudarOcupado={setOcupado}
          />
        )}
      </Modal>

      <Confirmacao
        aberta={janela?.tipo === 'excluir'}
        titulo={janela?.tipo === 'excluir' ? `Excluir "${janela.espaco.nome}"?` : ''}
        rotuloDeConfirmar="Excluir empresa"
        perigo
        ocupado={ocupado}
        aoConfirmar={() => janela?.tipo === 'excluir' && confirmarExclusao(janela.espaco)}
        aoCancelar={() => !ocupado && setJanela(null)}
      >
        Só dá para excluir uma empresa sem movimento, sem contas nem lançamentos. As categorias, os sócios, os tributos e a
        folha dela saem junto.
      </Confirmacao>
    </div>
  );
}
