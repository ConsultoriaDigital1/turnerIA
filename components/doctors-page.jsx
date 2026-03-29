// Aca renderizo la vista de profesionales con sus datos operativos.

export function DoctorsPage({ doctors }) {
  return (
    <>
      <section className="hero-panel">
        <div>
          <p className="hero-panel__eyebrow">Profesionales</p>
          <h1>Doctores</h1>
          <p className="hero-panel__copy">
            Informacion separada por ruta: especialidad, consultorio, horario y obras sociales de cada
            profesional.
          </p>
        </div>

        <div className="integration-card">
          <span className="integration-card__badge is-live">Equipo medico</span>
          <h2>{doctors.length} profesionales</h2>
          <p>Panel listo para recepcion, administracion y coordinacion de turnos.</p>
        </div>
      </section>

      <section className="content-card">
        <div className="content-card__header">
          <div>
            <h2>Datos de doctores</h2>
            <p>Especialidad, horarios, consultorio y coberturas aceptadas.</p>
          </div>
          <span className="content-card__meta">{doctors.length} fichas</span>
        </div>

        <div className="doctor-grid">
          {doctors.map((doctor) => (
            <article key={doctor.id} className="doctor-card">
              <div className="doctor-card__header">
                <div>
                  <strong>{doctor.name}</strong>
                  <p>{doctor.specialty}</p>
                </div>
                <span className="tag">{doctor.room}</span>
              </div>

              <div className="doctor-card__meta">
                <div className="info-line">
                  <span>Horario</span>
                  <strong>{doctor.shift}</strong>
                </div>
                <p className="subtle-copy">{doctor.notes}</p>
              </div>

              <div className="chip-list">
                {doctor.insurances.map((insurance) => (
                  <span key={`${doctor.id}-${insurance}`} className="tag">
                    {insurance}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
