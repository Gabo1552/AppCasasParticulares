/**
 * Página de arranque.
 *
 * Las pantallas del recorrido vertical (registro → conciliación) se implementan
 * en la Etapa 3, según docs/implementation-roadmap.md §4. Esta página existe para
 * que el build de Next tenga una ruta y el pipeline verifique la app entera.
 */
export default function HomePage() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '3rem', maxWidth: '48rem' }}>
      <h1>Plataforma de casas particulares</h1>
      <p>
        Administración de relaciones laborales de personal de casas particulares y niñeras en
        Argentina.
      </p>

      <section
        style={{
          marginTop: '2rem',
          padding: '1rem',
          border: '1px solid #d97706',
          borderRadius: '0.5rem',
          background: '#fffbeb',
        }}
      >
        <strong>Entorno de desarrollo</strong>
        <p style={{ marginTop: '0.5rem' }}>
          Los parámetros de liquidación cargados son <strong>datos de prueba</strong>, no valores
          oficiales. Ningún importe calculado representa una liquidación válida hasta que un
          contador matriculado cargue y publique los parámetros reales.
        </p>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2>Estado</h2>
        <p>
          Etapa 2 completa: base técnica del monorepo, dominio, motor de liquidación, esquema de
          datos y adaptadores. Las pantallas llegan en la Etapa 3.
        </p>
      </section>
    </main>
  );
}
