import { useMemo, type CSSProperties } from 'react';
import { gerarFolhasEmVolta, type ArranjoDasFolhas } from '../regras/folhasEmVolta';

interface Props {
  arranjo: ArranjoDasFolhas;
  semente?: number;
  className?: string;
}

// As folhas e moedas da landing dentro do app, em CSS 3D: cada peça tem a
// posição, a profundidade e o tempo que regras/folhasEmVolta.ts sorteia, e o
// movimento (subir e virar, orbitar, explodir e cair) está em olifine.css.
// Nada de canvas: um estado vazio ou um cabeçalho não pede um contexto WebGL
// a mais, e a animação é só de transform e opacity (fica no compositor).
// Pedindo menos movimento, as peças ficam paradas no lugar.
//
// Decoração pura: fora da árvore de acessibilidade e sem receber o ponteiro.
export default function FolhasEmVolta({ arranjo, semente = 2026, className = '' }: Props) {
  const pecas = useMemo(() => gerarFolhasEmVolta(arranjo, semente), [arranjo, semente]);
  return (
    <span className={`of-folhas-3d ${arranjo} ${className}`.trim()} aria-hidden="true">
      {pecas.map((peca, indice) => (
        <i
          // A lista é fixa pela semente: a posição é a identidade da peça.
          key={indice}
          className={peca.tipo}
          style={
            {
              '--x': arranjo === 'cabecalho' ? `${peca.x * 100}%` : arranjo === 'vazio' ? `${peca.x}deg` : `${peca.x}px`,
              '--y': arranjo === 'cabecalho' ? `${peca.y * 100}%` : `${peca.y}px`,
              '--z': `${peca.z}px`,
              '--tamanho': `${peca.tamanho}px`,
              '--atraso': `${peca.atraso}s`,
              '--duracao': `${peca.duracao}s`,
              '--giro': `${peca.giro}deg`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}
