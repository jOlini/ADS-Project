import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icone from '../../componentes/Icone';
import { useToast } from '../../componentes/toast/useToast';
import type { Espaco, Familia } from '../../regras/espacos';
import { ligarFamilia } from '../../servicos/livroCaixa';

interface Props {
  // O espaço pessoal (a chave só aparece nele).
  espaco: Espaco;
  recarregarEspacos: (abrir?: string | null) => Promise<void>;
}

// Chave do Modo Família no topo, ao lado de Pessoal e Empresarial: liga e
// desliga a família dentro do espaço pessoal (não é um terceiro espaço).
// Ligada, os filtros "de quem" e o gasto por pessoa aparecem nas telas, e o
// menu ganha a página da família. Ligando sem ninguém cadastrado, a página
// abre para cadastrar quem mora com você. Desligar só esconde: as pessoas
// continuam guardadas.
export default function ChaveDaFamilia({ espaco, recarregarEspacos }: Props) {
  const toast = useToast();
  const navigate = useNavigate();
  const [ocupado, setOcupado] = useState(false);
  const ativa = Boolean(espaco.familia?.ativa);

  async function alternar() {
    setOcupado(true);
    try {
      const familia: Familia = await ligarFamilia(espaco.id, !ativa);
      await recarregarEspacos(espaco.id);
      if (familia.ativa && familia.pessoas.length === 0) {
        toast.info('Cadastre quem mora com você: cada pessoa ganha uma cor e o filtro dela.', {
          titulo: 'Modo Família ligado',
        });
        navigate('/familia');
      } else {
        toast.sucesso(
          familia.ativa
            ? 'Os filtros "de quem" e o gasto por pessoa já aparecem nas telas.'
            : 'As pessoas da família continuam guardadas para quando você religar.',
          { titulo: familia.ativa ? 'Modo Família ligado' : 'Modo Família desligado' },
        );
      }
    } catch (falha) {
      toast.erro((falha as Error).message, { titulo: 'Modo Família não mudou' });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={ativa}
      aria-busy={ocupado}
      disabled={ocupado}
      className="of-chave-da-familia"
      onClick={alternar}
      title={ativa ? 'Desligar o Modo Família' : 'Ligar o Modo Família'}
    >
      <Icone nome="casa" tamanho={16} />
      <span className="of-chave-rotulo">Família</span>
      <span className="of-chave-trilho" aria-hidden="true">
        <span className="of-chave-botao" />
      </span>
    </button>
  );
}
