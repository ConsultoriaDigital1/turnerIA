// Aca compongo la pantalla de calendario con agenda rapida y el panel de Google Calendar.

import { CalendarEventForm } from "@/components/calendar-event-form";
import { LiveAgendaPanel } from "@/components/live-agenda-panel";

export function CalendarPage({ calendar, googleCalendar, agendaMeta }) {
  const defaultDate = calendar[0]?.date ?? "";
  const googleCalendarStatus = googleCalendar.connected ? "Conectado" : "No conectado";

  return (
    <>
      <section className="hero-panel">
        <div>
          <p className="hero-panel__eyebrow">Agenda medica</p>
          <h1>Calendario</h1>

          <div className="hero-panel__actions">
            <CalendarEventForm
              canCreateFromApp={googleCalendar.canCreateFromApp}
              defaultDate={defaultDate}
              createEventUrl={googleCalendar.createEventUrl}
            />
            <a href={googleCalendar.openUrl} target="_blank" rel="noreferrer" className="secondary-button">
              Abrir Google Calendar
            </a>
          </div>
        </div>

        <div className="integration-card">
          <span className={`integration-card__badge ${googleCalendar.connected ? "is-live" : "is-idle"}`}>
            Google Calendar
          </span>
          <h2>{googleCalendarStatus}</h2>
          <p>{googleCalendar.connected ? "Listo para usar." : "Todavia no configurado."}</p>
        </div>
      </section>

      <section className="detail-grid detail-grid--wide">
        <LiveAgendaPanel initialCalendar={calendar} initialAgendaMeta={agendaMeta} />

        <article className="content-card">
          <div className="content-card__header">
            <div>
              <h2>Google Calendar</h2>
            </div>
            <span className="content-card__meta">{googleCalendarStatus}</span>
          </div>

          {googleCalendar.connected ? (
            <div className="calendar-embed-wrap">
              <iframe
                title="Google Calendar"
                src={googleCalendar.embedUrl}
                className="calendar-embed"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="empty-state empty-state--compact">
              <h3>Google Calendar no conectado</h3>
              <p>Configuralo para verlo aca.</p>
            </div>
          )}
        </article>
      </section>
    </>
  );
}
