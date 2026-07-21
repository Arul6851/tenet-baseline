export default function HomePage() {
  return (
    <main>
      <section className="foundation-card" aria-labelledby="tenet-title">
        <p className="eyebrow">Control-plane foundation</p>
        <h1 id="tenet-title">Tenet</h1>
        <p>Git tells you what changed. Tenet tells you whether it still belongs.</p>
        <p>
          The dashboard UI is intentionally deferred while the deterministic
          validation, persistence, and policy foundations are established.
        </p>
        <p>
          Health endpoint: <code>/api/health</code>
        </p>
      </section>
    </main>
  );
}
