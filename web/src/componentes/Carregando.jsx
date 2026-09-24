// Esqueleto mostrado enquanto a sessão ou os dados chegam.
export default function Carregando({ rotulo = 'Carregando seus dados' }) {
  return (
    <div className="carregando" aria-busy="true" aria-label={rotulo}>
      <span className="esqueleto titulo" />
      <span className="esqueleto bloco" />
      <span className="esqueleto linha" />
    </div>
  );
}
