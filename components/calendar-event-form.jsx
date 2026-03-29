"use client";

// Aca resuelvo el alta de eventos desde la UI con modal, validacion y salida a Google Calendar si hace falta.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

function normalizeValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

// Aca defino la forma base del formulario para abrir y resetear el modal siempre igual.
function buildInitialForm(defaultDate) {
  return {
    title: "",
    date: defaultDate || "",
    startTime: "09:00",
    endTime: "09:30",
    location: "",
    description: ""
  };
}

// Valido lo minimo antes de pegarle a la API o abrir Google Calendar.
function validateForm(input) {
  const title = normalizeValue(input?.title);
  const date = normalizeValue(input?.date);
  const startTime = normalizeValue(input?.startTime);
  const endTime = normalizeValue(input?.endTime);

  if (!title || !date || !startTime || !endTime) {
    throw new Error("Titulo, fecha, hora de inicio y hora de fin son obligatorios.");
  }

  if (endTime <= startTime) {
    throw new Error("La hora de fin debe ser mayor que la hora de inicio.");
  }
}

function buildTemplateDate(date, time) {
  return `${date.replaceAll("-", "")}T${time.replace(":", "")}00`;
}

// Si no puedo crear desde backend, dejo armado el borrador para seguir en Google Calendar.
function buildGoogleCalendarDraftUrl(baseUrl, input) {
  const safeBaseUrl = normalizeValue(baseUrl) || "https://calendar.google.com/calendar/render?action=TEMPLATE";
  const url = new URL(safeBaseUrl);

  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", normalizeValue(input?.title));
  url.searchParams.set(
    "dates",
    `${buildTemplateDate(input.date, input.startTime)}/${buildTemplateDate(input.date, input.endTime)}`
  );

  if (normalizeValue(input?.location)) {
    url.searchParams.set("location", normalizeValue(input.location));
  }

  if (normalizeValue(input?.description)) {
    url.searchParams.set("details", normalizeValue(input.description));
  }

  return url.toString();
}

function getSubmitLabel(canCreateFromApp, isSubmitting) {
  if (isSubmitting) {
    return "Guardando...";
  }

  return canCreateFromApp ? "Guardar evento" : "Continuar en Google Calendar";
}

// Este componente resuelve modal, validacion y alta real o derivacion al borrador externo.
export function CalendarEventForm({ canCreateFromApp, defaultDate, createEventUrl }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const [form, setForm] = useState(() => buildInitialForm(defaultDate));

  useEffect(() => {
    setForm((current) => ({
      ...current,
      date: current.date || defaultDate || ""
    }));
  }, [defaultDate]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  function updateField(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  function resetForm() {
    setForm(buildInitialForm(defaultDate));
  }

  function openModal() {
    setMessage("");
    setIsOpen(true);
  }

  // Aca separo el flujo segun haya o no credenciales para crear el evento desde la app.
async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    setMessage("");

    try {
      validateForm(form);

      if (!canCreateFromApp) {
        const draftUrl = buildGoogleCalendarDraftUrl(createEventUrl, form);
        const popup = window.open(draftUrl, "_blank", "noopener,noreferrer");

        if (!popup) {
          window.location.href = draftUrl;
        }

        setMessageType("success");
        setMessage("Se abrio Google Calendar con el evento precargado.");
        setIsOpen(false);
        resetForm();
        return;
      }

      setIsSubmitting(true);

      const response = await fetch("/api/calendar/events", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(form)
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || `La creacion devolvio ${response.status}.`);
      }

      setMessageType("success");
      setMessage(payload?.message || "Evento creado.");
      setIsOpen(false);
      resetForm();
      window.dispatchEvent(new CustomEvent("agenda:refresh"));
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "No se pudo crear el evento.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Renderizo el modal por portal para que no quede atrapado por el stacking del layout.
const modal = isOpen ? (
    <div className="sheet-backdrop sheet-backdrop--center" onClick={() => setIsOpen(false)}>
      <section
        className="sheet sheet--event"
        aria-modal="true"
        role="dialog"
        aria-labelledby="calendar-event-form-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet__header">
          <div>
            <p className="sheet__eyebrow">Google Calendar</p>
            <h2 id="calendar-event-form-title">Crear evento</h2>
          </div>
          <button type="button" className="sheet__close" onClick={() => setIsOpen(false)}>
            Cerrar
          </button>
        </div>

        <form className="sheet-form sheet-form--event" onSubmit={handleSubmit}>
          <p className="sheet-copy">Completa los datos.</p>

          <label className="field field--stacked">
            <span>Titulo</span>
            <input
              required
              value={form.title}
              onChange={(event) => updateField("title", event.target.value)}
              placeholder="Consulta con paciente"
            />
          </label>

          <div className="sheet-form__event-grid">
            <label className="field field--stacked">
              <span>Fecha</span>
              <input
                type="date"
                required
                value={form.date}
                onChange={(event) => updateField("date", event.target.value)}
              />
            </label>

            <label className="field field--stacked">
              <span>Ubicacion</span>
              <input
                value={form.location}
                onChange={(event) => updateField("location", event.target.value)}
                placeholder="Consultorio 2"
              />
            </label>

            <label className="field field--stacked">
              <span>Inicio</span>
              <input
                type="time"
                required
                value={form.startTime}
                onChange={(event) => updateField("startTime", event.target.value)}
              />
            </label>

            <label className="field field--stacked">
              <span>Fin</span>
              <input
                type="time"
                required
                value={form.endTime}
                onChange={(event) => updateField("endTime", event.target.value)}
              />
            </label>
          </div>

          <label className="field field--stacked">
            <span>Detalle</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(event) => updateField("description", event.target.value)}
              placeholder="Paciente, motivo y notas operativas."
            />
          </label>

          <div className="sheet__actions">
            <button type="button" className="secondary-button" onClick={() => setIsOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={isSubmitting}>
              {getSubmitLabel(canCreateFromApp, isSubmitting)}
            </button>
          </div>
        </form>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button type="button" className={canCreateFromApp ? "primary-button" : "secondary-button"} onClick={openModal}>
        Crear evento en app
      </button>

      {message ? (
        <p className={`inline-message ${messageType === "success" ? "inline-message--success" : "inline-message--error"}`}>
          {message}
        </p>
      ) : null}

      {modal && typeof document !== "undefined" ? createPortal(modal, document.body) : null}
    </>
  );
}