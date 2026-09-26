import { useId } from 'react';
import '../estilos/marca.css';

export const SLOGAN = 'Tecnologia a favor do seu dinheiro';

// Monograma OF: o anel do O aberto no alto, onde o F nasce; os braços do F
// são duas folhas (crescimento). Mesmo desenho de public/olifine.svg. Os ids
// dos degradês são únicos por instância, porque o logo aparece mais de uma
// vez na mesma página (barra lateral, landing, rodapé).
export function MarcaOliFine({ tamanho = 32, titulo }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg
      className="of-monograma"
      viewBox="0 0 48 48"
      width={tamanho}
      height={tamanho}
      role={titulo ? 'img' : undefined}
      aria-label={titulo}
      aria-hidden={titulo ? undefined : 'true'}
    >
      <defs>
        <linearGradient id={`${id}-anel`} x1="6" y1="42" x2="34" y2="12" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'var(--of-monograma-escuro, #065f46)' }} />
          <stop offset="1" style={{ stopColor: 'var(--of-monograma-claro, #16a34a)' }} />
        </linearGradient>
        <linearGradient id={`${id}-folha`} x1="30" y1="24" x2="46" y2="4" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#16A34A" />
          <stop offset="0.55" stopColor="#22C55E" />
          <stop offset="1" stopColor="#84CC16" />
        </linearGradient>
      </defs>
      <path
        d="M31.5 27A12.5 12.5 0 1 1 25.25 16.17"
        fill="none"
        stroke={`url(#${id}-anel)`}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path d="M31.5 39.5V21.5" stroke={`url(#${id}-anel)`} strokeWidth="6.5" strokeLinecap="round" />
      <path d="M29.6 23.2C30.6 12.6 37.4 6.6 46 5c-.4 8.8-6 16.2-16.4 18.2Z" fill={`url(#${id}-folha)`} />
      <path d="M31.2 32.2c1.8-5.2 5.8-7.6 11.8-7.8-1 4.8-5 7.9-11.8 7.8Z" fill={`url(#${id}-folha)`} />
      <path d="M31.6 21.6Q38 13.8 44.6 6.6M32.4 31.2q4.4-3.8 9.8-6.2" stroke="#fff" strokeOpacity="0.4" strokeWidth="0.9" fill="none" strokeLinecap="round" />
    </svg>
  );
}

// Monograma + "OliFine", com o slogan embaixo quando pedido.
export default function Logo({ tamanho = 32, slogan = false, className = '' }) {
  return (
    <span className={`of-logo ${className}`.trim()}>
      <MarcaOliFine tamanho={tamanho} />
      <span className="of-logo-textos">
        <span className="of-logo-nome">OliFine</span>
        {slogan && <span className="of-logo-slogan">{SLOGAN}</span>}
      </span>
    </span>
  );
}
