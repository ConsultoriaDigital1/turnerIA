// Aca muestro el estado tecnico de n8n y Google Calendar en una pagina separada.

import Link from "next/link";

export function IntegrationsPage({ integrations }) {
  return (
    <>
      <section className="hero-panel">
        <div>
          <p className="hero-panel__eyebrow">Conexiones del consultorio</p>
          <h1>Webhook / API</h1>
          <p className="hero-panel__copy">
            Esta pagina separa las integraciones del resto del producto. n8n va por backend seguro y
            Google Calendar por una via simple de embed o enlace directo.
          </p>
        </div>

        <div className="integration-card">
          <span className={`integration-card__badge ${integrations.n8n.configured ? "is-live" : "is-idle"}`}>
            {integrations.n8n.configured ? "n8n conectado" : "n8n pendiente"}
          </span>
          <h2>{integrations.n8n.mode === "api" ? "Modo API" : "Modo webhook"}</h2>
          <p>
            {integrations.n8n.configured
              ? "Listo para recordatorios, confirmaciones y seguimiento."
              : "Falta definir variables de entorno para activar n8n."}
          </p>
        </div>
      </section>

      <section className="detail-grid detail-grid--wide">
        <article className="content-card">
          <div className="content-card__header">
            <div>
              <h2>n8n</h2>
              <p>La recomendacion sigue siendo webhook para disparos simples desde el consultorio.</p>
            </div>
            <span className="content-card__meta">{integrations.n8n.mode}</span>
          </div>

          <div className="stack-grid">
            <div className="integration-line">
              <div>
                <strong>Estado</strong>
                <p>{integrations.n8n.configured ? "Conectado" : "Pendiente de configuracion"}</p>
              </div>
              <span
                className={`status-chip ${
                  integrations.n8n.configured ? "status-chip--success" : "status-chip--warning"
                }`}
              >
                {integrations.n8n.configured ? "Activo" : "Pendiente"}
              </span>
            </div>

            <div className="env-box">
              <strong>Variables esperadas</strong>
              <p>
                <code>N8N_MODE</code>, <code>N8N_WEBHOOK_URL</code>, <code>N8N_API_BASE_URL</code>,{" "}
                <code>N8N_API_KEY</code>, <code>N8N_API_PATH</code>
              </p>
            </div>

            <p className="subtle-copy">
              Brutalmente honesto: si solo queres disparar mensajes o recordatorios, meter API completa
              de n8n es exceso. Webhook alcanza.
            </p>
          </div>
        </article>

        <article className="content-card">
          <div className="content-card__header">
            <div>
              <h2>Google Calendar</h2>
              <p>Conexion facil para ver la agenda dentro de la app sin montar OAuth completo.</p>
            </div>
            <span className="content-card__meta">
              {integrations.googleCalendar.connected ? "Conectado" : "Manual"}
            </span>
          </div>

          <div className="stack-grid">
            <div className="integration-line">
              <div>
                <strong>Modo</strong>
                <p>{integrations.googleCalendar.mode}</p>
              </div>
              <span
                className={`status-chip ${
                  integrations.googleCalendar.connected ? "status-chip--success" : "status-chip--warning"
                }`}
              >
                {integrations.googleCalendar.connected ? "Listo" : "Pendiente"}
              </span>
            </div>

            <div className="env-box">
              <strong>Conexion rapida</strong>
              <p>
                Defini <code>NEXT_PUBLIC_GOOGLE_CALENDAR_EMBED_URL</code> o, si preferis algo mas
                prolijo, <code>GOOGLE_CALENDAR_ID</code> + <code>GOOGLE_CALENDAR_TIMEZONE</code>. Eso
                sirve para ver el calendario, no para leer eventos privados desde backend.
              </p>
            </div>

            <div className="env-box">
              <strong>Agenda rapida real</strong>
              <p>
                Si queres que la agenda de hoy y manana lea eventos reales sin OAuth, agrega{" "}
                <code>GOOGLE_CALENDAR_ICS_URL</code> con la URL publica o secreta de iCal.
              </p>
            </div>

            <div className="env-box">
              <strong>Multiusuario razonable</strong>
              <p>
                Si queres que la izquierda se vea igual para todos, configura{" "}
                <code>GOOGLE_CALENDAR_CLIENT_ID</code>, <code>GOOGLE_CALENDAR_CLIENT_SECRET</code> y{" "}
                <code>GOOGLE_CALENDAR_REFRESH_TOKEN</code>. Eso hace que el backend lea Google Calendar con
                una sola cuenta compartida.
              </p>
            </div>

            <div className="env-box">
              <strong>Sin humo</strong>
              <p>{integrations.googleCalendar.guidance.honest}</p>
            </div>

            <div className="hero-panel__actions">
              <Link href="/calendar" className="primary-button">
                Ver pagina de calendario
              </Link>
              <a href={integrations.googleCalendar.openUrl} target="_blank" rel="noreferrer" className="secondary-button">
                Abrir Google Calendar
              </a>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}