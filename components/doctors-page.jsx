"use client";

// Aca renderizo la vista de profesionales y permito altas persistidas en Neon.

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

function buildInitialDoctorForm() {
  return {
    name: "",
    specialty: "",
    room: "",
    shift: "",
    insurances: "",
    notes: ""
  };
}

async function readJsonSafely(response) {
  const rawBody = await response.text();

  if (!rawBody) {
    return null;
  }

  try {
    return JSON.parse(rawBody);
  } catch {
    return {
      error: rawBody
    };
  }
}

export function DoctorsPage({ doctors, storage }) {
  const router = useRouter();
  const [form, setForm] = useState(buildInitialDoctorForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const canCreate = Boolean(storage?.writable);

  function updateField(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting || !canCreate) {
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/doctors", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(form)
      });
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(payload?.error || `No se pudo crear el doctor. HTTP ${response.status}.`);
      }

      setForm(buildInitialDoctorForm());
      setMessageType("success");
      setMessage(payload?.message || "Doctor creado.");
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "No se pudo crear el doctor.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <section className="hero-panel">
        <div>
          <p className="hero-panel__eyebrow">Profesionales</p>
          <h1>Doctores</h1>
          <p className="hero-panel__copy">
            Informacion separada por ruta: especialidad, consultorio, horario y obras sociales de cada
            profesional. Desde aca tambien puedes dar de alta nuevas fichas persistidas en Neon.
          </p>
        </div>

        <div className="integration-card">
          <span className={`integration-card__badge ${storage?.connected ? "is-live" : "is-idle"}`}>
            {storage?.connected ? "Neon conectado" : "Modo semilla"}
          </span>
          <h2>{doctors.length} profesionales</h2>
          <p>
            {storage?.connected
              ? "Las altas nuevas se guardan en la base de datos de la empresa."
              : storage?.error || "Sin base de datos conectada, la pantalla queda solo de lectura."}
          </p>
        </div>
      </section>

      <section className="content-card">
        <div className="content-card__header">
          <div>
            <h2>Alta de doctor</h2>
            <p>Nombre, especialidad, consultorio, horario y obras sociales aceptadas.</p>
          </div>
          <span className="content-card__meta">{storage?.connected ? "Persistente" : "Solo lectura"}</span>
        </div>

        {message ? (
          <div className={`inline-message ${messageType === "success" ? "inline-message--success" : "inline-message--error"}`}>
            {message}
          </div>
        ) : null}

        {!canCreate ? (
          <div className="inline-message inline-message--error">
            {storage?.error || "Falta configurar DATABASE_URL o POSTGRES_URL para habilitar altas reales."}
          </div>
        ) : null}

        <form className="sheet-form" onSubmit={handleSubmit}>
          <div className="sheet-form__grid">
            <label className="field field--stacked">
              <span>Nombre</span>
              <input
                required
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                placeholder="Dra. Paula Torres"
              />
            </label>

            <label className="field field--stacked">
              <span>Especialidad</span>
              <input
                required
                value={form.specialty}
                onChange={(event) => updateField("specialty", event.target.value)}
                placeholder="Clinica medica"
              />
            </label>

            <label className="field field--stacked">
              <span>Consultorio</span>
              <input
                required
                value={form.room}
                onChange={(event) => updateField("room", event.target.value)}
                placeholder="Consultorio 2"
              />
            </label>

            <label className="field field--stacked">
              <span>Horario</span>
              <input
                required
                value={form.shift}
                onChange={(event) => updateField("shift", event.target.value)}
                placeholder="Lunes a viernes 08:00 - 16:00"
              />
            </label>
          </div>

          <label className="field field--stacked">
            <span>Obras sociales</span>
            <input
              required
              value={form.insurances}
              onChange={(event) => updateField("insurances", event.target.value)}
              placeholder="OSDE, Galeno, Particular"
            />
          </label>

          <label className="field field--stacked">
            <span>Notas</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              placeholder="Detalle operativo del profesional."
            />
          </label>

          <div className="sheet__actions">
            <p className="subtle-copy">Las obras sociales se separan con coma y quedan normalizadas en Neon.</p>
            <button type="submit" className="primary-button" disabled={isSubmitting || !canCreate}>
              {isSubmitting ? "Guardando..." : "Crear doctor"}
            </button>
          </div>
        </form>
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