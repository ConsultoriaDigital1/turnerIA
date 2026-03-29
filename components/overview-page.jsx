// Aca armo la vista general del dashboard con resumenes, rutas y estado de integraciones.

import Link from "next/link";

import { APP_NAME, NAVIGATION } from "@/lib/navigation";

// Aca aplano la agenda para sacar proximos turnos sin depender de la estructura por dias.
function flattenSlots(calendar) {
  return calendar.flatMap((day) =>
    day.slots.map((slot) => ({
      ...slot,
      dayLabel: day.label,
      date: day.date
    }))
  );
}

// Esta vista mezcla resumen, accesos rapidos e integraciones en una sola pantalla.
export function OverviewPage({ data }) {
  const nextAppointments = flattenSlots(data.calendar).slice(0, 3);
  const agendaLabel = data.calendarMeta?.label || "Agenda";
  const agendaNote = data.calendarMeta?.note || "";

  return (
    <>
      <section className="hero-panel">
        <div>
          <p className="hero-panel__eyebrow">Plataforma principal del consultorio</p>
          <h1>{APP_NAME}</h1>
          <p className="hero-panel__copy">
            Unifica pacientes, agenda medica, Google Calendar y automatizaciones con n8n en una sola
            interfaz hecha con Next.js.
          </p>

          <div className="hero-panel__actions">
            <Link href="/patients" className="primary-button">
              Ver pacientes
            </Link>
            <Link href="/calendar" className="secondary-button">
              Abrir calendario
            </Link>
          </div>
        </div>

        <div className="integration-card">
          <span
            className={`integration-card__badge ${
              data.integrations.googleCalendar.connected ? "is-live" : "is-idle"
            }`}
          >
            {data.integrations.googleCalendar.connected ? "Google Calendar listo" : "Google Calendar pendiente"}
          </span>
          <h2>{data.clinic.name}</h2>
          <p>
            {data.clinic.address} | {data.clinic.city}
          </p>

          <div className="chip-list">
            {data.clinic.specialties.map((specialty) => (
              <span key={specialty} className="tag">
                {specialty}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="stat-grid">
        <article className="stat-card">
          <span className="stat-card__label">Pacientes activos</span>
          <strong>{data.summary.activePatients}</strong>
          <p>Historias visibles para recepcion y seguimiento</p>
        </article>

        <article className="stat-card">
          <span className="stat-card__label">Turnos hoy</span>
          <strong>{data.summary.todayAppointments}</strong>
          <p>Atenciones previstas para la jornada actual</p>
        </article>

        <article className="stat-card">
          <span className="stat-card__label">Turnos manana</span>
          <strong>{data.summary.tomorrowAppointments}</strong>
          <p>Agenda inmediata para organizar el consultorio</p>
        </article>

        <article className="stat-card">
          <span className="stat-card__label">Obras sociales</span>
          <strong>{data.summary.insurances}</strong>
          <p>Coberturas aceptadas por los profesionales cargados</p>
        </article>
      </section>

      <section className="content-card">
        <div className="content-card__header">
          <div>
            <h2>Rutas principales</h2>
            <p>Cada seccion vive en su propia pagina de Next.js para mantener la app ordenada.</p>
          </div>
          <span className="content-card__meta">{NAVIGATION.length} secciones</span>
        </div>

        <div className="route-grid">
          {NAVIGATION.map((item) => (
            <Link key={item.href} href={item.href} className="nav-card">
              <span className="nav-card__eyebrow">{item.label}</span>
              <strong>{item.hint}</strong>
              <p>Entrar a {item.label.toLowerCase()}.</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="detail-grid detail-grid--wide">
        <article className="content-card">
          <div className="content-card__header">
            <div>
              <h2>Proximos turnos</h2>
              <p>{agendaNote || "Vista rapida de la agenda inmediata."}</p>
            </div>
            <span className="content-card__meta">{agendaLabel}</span>
          </div>

          {nextAppointments.length > 0 ? (
            <div className="list-rows">
              {nextAppointments.map((slot) => (
                <div key={`${slot.date}-${slot.time}-${slot.patient}`} className="list-row">
                  <strong className="list-row__time">{slot.time}</strong>
                  <div>
                    <strong>{slot.patient}</strong>
                    <p>
                      {slot.dayLabel} | {slot.doctor}
                    </p>
                  </div>
                  <span className="tag">{slot.type}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state empty-state--compact">
              <h3>Sin turnos visibles</h3>
              <p>{agendaNote || "No hay eventos disponibles para mostrar en este bloque."}</p>
            </div>
          )}
        </article>

        <article className="content-card">
          <div className="content-card__header">
            <div>
              <h2>Estado de integraciones</h2>
              <p>Conexion rapida con Google Calendar y n8n.</p>
            </div>
          </div>

          <div className="stack-grid">
            <div className="integration-line">
              <div>
                <strong>Google Calendar</strong>
                <p>
                  {data.integrations.googleCalendar.connected
                    ? "Vista embebida o URL configurada."
                    : "Todavia no hay calendario conectado."}
                </p>
              </div>
              <span
                className={`status-chip ${
                  data.integrations.googleCalendar.connected
                    ? "status-chip--success"
                    : "status-chip--warning"
                }`}
              >
                {data.integrations.googleCalendar.connected ? "Listo" : "Pendiente"}
              </span>
            </div>

            <div className="integration-line">
              <div>
                <strong>n8n</strong>
                <p>
                  {data.integrations.n8n.configured
                    ? "Automatizaciones disponibles para recordatorios y seguimiento."
                    : "Hace falta completar variables de entorno para activarlo."}
                </p>
              </div>
              <span
                className={`status-chip ${
                  data.integrations.n8n.configured ? "status-chip--success" : "status-chip--warning"
                }`}
              >
                {data.integrations.n8n.configured ? "Conectado" : "Pendiente"}
              </span>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}