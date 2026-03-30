"use client";

// Aca mantengo una agenda corta que se refresca sin recargar toda la pagina.

import { useCallback, useEffect, useRef, useState } from "react";

import { formatShortSpanishDate } from "@/lib/date-format";

const REFRESH_INTERVAL_MS = 15000;

function getRefreshLabel() {
  return `Actualizacion automatica cada ${Math.round(REFRESH_INTERVAL_MS / 1000)} s`;
}

// Este panel refresca una agenda chica para que recepcion vea cambios sin recargar todo.
export function LiveAgendaPanel({ initialCalendar, initialAgendaMeta }) {
  const [calendar, setCalendar] = useState(initialCalendar);
  const [agendaMeta, setAgendaMeta] = useState(initialAgendaMeta);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastStatus, setLastStatus] = useState("");
  const inFlightRef = useRef(false);

  // Aca centralizo el refresh para usarlo igual en auto-refresh, boton manual y eventos internos.
  const refreshAgenda = useCallback(
    async ({ silent = false } = {}) => {
      if (inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;

      if (!silent) {
        setIsRefreshing(true);
      }

      try {
        const response = await fetch("/api/calendar/agenda", {
          cache: "no-store",
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          throw new Error(`La agenda devolvio ${response.status}.`);
        }

        const payload = await response.json();

        setCalendar(Array.isArray(payload.calendar) ? payload.calendar : initialCalendar);
        setAgendaMeta(payload.meta || initialAgendaMeta);
        setLastStatus("Sincronizado");
      } catch (error) {
        setLastStatus(error instanceof Error ? error.message : "No se pudo actualizar la agenda.");
      } finally {
        inFlightRef.current = false;

        if (!silent) {
          setIsRefreshing(false);
        }
      }
    },
    [initialAgendaMeta, initialCalendar]
  );

  useEffect(() => {
    refreshAgenda({ silent: true });

    const intervalId = window.setInterval(() => {
      refreshAgenda({ silent: true });
    }, REFRESH_INTERVAL_MS);
    const handleRefreshEvent = () => {
      refreshAgenda();
    };

    window.addEventListener("agenda:refresh", handleRefreshEvent);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("agenda:refresh", handleRefreshEvent);
    };
  }, [refreshAgenda]);

  return (
    <article className="content-card">
      <div className="content-card__header">
        <div>
          <h2>Agenda del consultorio</h2>
          {agendaMeta?.note ? <p>{agendaMeta.note}</p> : null}
        </div>

        <div className="stack-grid">
          <span className="content-card__meta">{agendaMeta?.label || `${calendar.length} dias`}</span>
          <button type="button" className="secondary-button" onClick={() => refreshAgenda()} disabled={isRefreshing}>
            {isRefreshing ? "Actualizando..." : "Actualizar ahora"}
          </button>
        </div>
      </div>

      <p className="subtle-copy">
        {getRefreshLabel()}
        {lastStatus ? ` | ${lastStatus}` : ""}
      </p>

      <div className="stack-grid">
        {calendar.map((day) => (
          <article key={day.id} className="schedule-day">
            <div className="schedule-day__header">
              <div>
                <strong>{day.label}</strong>
                <p>{formatShortSpanishDate(day.date)}</p>
              </div>
              <span className="tag">{day.slots.length} turnos</span>
            </div>

            {day.slots.length > 0 ? (
              <div className="list-rows">
                {day.slots.map((slot) => (
                  <div key={`${day.id}-${slot.time}-${slot.patient}`} className="list-row">
                    <strong className="list-row__time">{slot.time}</strong>
                    <div>
                      <strong>{slot.patient}</strong>
                      <p>
                        {slot.type} | {slot.doctor}
                      </p>
                    </div>
                    <span
                      className={`status-chip ${
                        slot.status === "confirmed" ? "status-chip--success" : "status-chip--warning"
                      }`}
                    >
                      {slot.status === "confirmed" ? "Confirmado" : "Pendiente"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state empty-state--compact">
                <h3>Sin eventos</h3>
                <p>No hay turnos visibles para este bloque.</p>
              </div>
            )}
          </article>
        ))}
      </div>
    </article>
  );
}