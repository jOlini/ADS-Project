// Mostrado no lugar das páginas do cliente quando o web/.env não tem a
// configuração do Firebase (ver web/.env.example e o README).
export default function AvisoFirebase() {
  return (
    <section className="aviso-configuracao" role="alert">
      <h1>Configuração pendente</h1>
      <p className="discreto">
        O Firebase não está configurado. Crie o arquivo <code>web/.env</code> a partir de{' '}
        <code>web/.env.example</code> com os dados do seu projeto e reinicie o <code>npm run dev</code>.
      </p>
    </section>
  );
}
