// Ícones de traço do Pessoal Finance, desenhados aqui (sem biblioteca e sem
// emoji): mesma grade de 24, mesma espessura e as mesmas pontas arredondadas
// do painel administrativo (api/painel/icones.js).

const TRACOS = {
  resumo: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  lancamentos: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="3.5" cy="6" r="1" />
      <circle cx="3.5" cy="12" r="1" />
      <circle cx="3.5" cy="18" r="1" />
    </>
  ),
  contas: (
    <>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5z" />
      <path d="M3 9h18M16 13h2" />
    </>
  ),
  categorias: (
    <>
      <path d="M12.6 3.4 20.6 11.4a2 2 0 0 1 0 2.8l-6.4 6.4a2 2 0 0 1-2.8 0L3.4 12.6A2 2 0 0 1 3 11.4V5a2 2 0 0 1 2-2h6.4a2 2 0 0 1 1.2.4z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </>
  ),
  relatorios: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  entrada: <path d="M17 7 7 17M7 8v9h9" />,
  saida: <path d="M7 17 17 7M8 7h9v9" />,
  transferencia: <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7" />,
  calendario: (
    <>
      <rect x="3" y="4.5" width="18" height="17" rx="2" />
      <path d="M16 2.5v4M8 2.5v4M3 10h18" />
    </>
  ),
  olho: (
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  olhoFechado: <path d="M3 3l18 18M10.6 6.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.3 4M6.3 8.3A17 17 0 0 0 2 12s3.6 7 10 7c1.5 0 2.8-.3 4-.8M9.9 9.9a3 3 0 0 0 4.2 4.2" />,
  sair: <path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3M16 16l4-4-4-4M20 12H10" />,
  seta: <path d="m6 9 6 6 6-6" />,
  anterior: <path d="m15 18-6-6 6-6" />,
  proximo: <path d="m9 18 6-6-6-6" />,
  mais: <path d="M12 5v14M5 12h14" />,
  editar: (
    <>
      <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  estornar: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </>
  ),
  alerta: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v5M12 16v.5" />
    </>
  ),
};

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
      {TRACOS[nome]}
    </svg>
  );
}
