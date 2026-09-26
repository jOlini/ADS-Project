// Ícones da OliFine, desenhados aqui (sem biblioteca e sem emoji), para o app
// ter a mesma letra em todo lugar e não a cara de um pacote genérico.
//
// Gramática da família:
// - grade de 24, traço de 1,75 com pontas e juntas arredondadas;
// - cantos em folha: todo recipiente (carteira, cartão, página, calendário)
//   tem dois cantos largos em diagonal e dois justos, como a folha do
//   monograma;
// - setas e vistos em curva, não em ângulo reto;
// - "seiva": uma área preenchida de leve (classe .seiva, 18% da cor) marca a
//   parte que importa (a moeda que entra, a faixa do cartão, o dia marcado);
// - dinheiro é sempre uma moeda (círculo), nunca um cifrão.

import { TRACOS } from './tracosDosIcones';

// Nome que não existe desenha nada (e não quebra a tela).
export default function Icone({ nome, tamanho = 18 }) {
  return (
    <svg
      className="icone"
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {TRACOS[nome] ?? null}
    </svg>
  );
}
