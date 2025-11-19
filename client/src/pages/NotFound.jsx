import '../App.css'

const NotFound = () => (
  <main className="app-shell">
    <section className="info-card info-card--waiting">
      <p className="info-card__label">Not Found</p>
      <h3>This game does not exist. Check the slug or create one via /admin.</h3>
    </section>
  </main>
)

export default NotFound
