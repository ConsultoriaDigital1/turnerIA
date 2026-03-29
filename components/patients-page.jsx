"use client";

// Aca renderizo pacientes, filtros y altas persistidas en Neon desde esta ruta.

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { formatShortSpanishDate } from "@/lib/date-format";

const PATIENT_STATUS_COPY = {
  active: {
    label: "Activo",
    className: "status-chip status-chip--success"
  },
  follow_up: {
    label: "Seguimiento",
    className: "status-chip status-chip--neutral"
  },
  waiting_docs: {
    label: "Falta documentacion",
    className: "status-chip status-chip--warning"
  },
  priority: {
    label: "Prioritario",
    className: "status-chip status-chip--danger"
  }
};

function buildInitialPatientForm(doctors) {
  return {
    name: "",
    age: "",
    insurance: "",
    doctorId: doctors[0]?.id || "",
    phone: "",
    lastVisit: "",
    nextAppointment: "",
    status: "active"
  };
}

function normalizeDateTimeInput(value) {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    return "";
  }

  return normalized.includes("T") ? normalized.slice(0, 16) : normalized.replace(" ", "T").slice(0, 16);
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

export function PatientsPage({ patients, filters, doctors, storage }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [insurance, setInsurance] = useState("all");
  const [doctor, setDoctor] = useState("all");
  const [form, setForm] = useState(() => buildInitialPatientForm(doctors));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const deferredSearch = useDeferredValue(search);
  const canCreate = Boolean(storage?.writable) && doctors.length > 0;
  const selectedDoctor = doctors.find((doctorOption) => doctorOption.id === form.doctorId) || null;

  useEffect(() => {
    setForm((current) => {
      if (current.doctorId && doctors.some((doctorOption) => doctorOption.id === current.doctorId)) {
        return current;
      }

      return {
        ...current,
        doctorId: doctors[0]?.id || ""
      };
    });
  }, [doctors]);

  const visiblePatients = patients.filter((patient) => {
    const matchesSearch =
      !deferredSearch.trim() ||
      [patient.name, patient.insurance, patient.doctor, patient.specialty, patient.phone]
        .join(" ")
        .toLowerCase()
        .includes(deferredSearch.trim().toLowerCase());
    const matchesInsurance = insurance === "all" || patient.insurance === insurance;
    const matchesDoctor = doctor === "all" || patient.doctor === doctor;

    return matchesSearch && matchesInsurance && matchesDoctor;
  });

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
      const response = await fetch("/api/patients", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(form)
      });
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(payload?.error || `No se pudo crear el paciente. HTTP ${response.status}.`);
      }

      setForm(buildInitialPatientForm(doctors));
      setMessageType("success");
      setMessage(payload?.message || "Paciente creado.");
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "No se pudo crear el paciente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <section className="hero-panel">
        <div>
          <p className="hero-panel__eyebrow">Pacientes y seguimiento</p>
          <h1>Pacientes</h1>
          <p className="hero-panel__copy">
            Busqueda rapida por nombre, doctor o cobertura. Esta ruta ahora tambien permite cargar altas
            reales y persistirlas en Neon.
          </p>
        </div>

        <div className="integration-card">
          <span className={`integration-card__badge ${storage?.connected ? "is-live" : "is-idle"}`}>
            {storage?.connected ? "Neon conectado" : "Modo semilla"}
          </span>
          <h2>{patients.length} historias</h2>
          <p>
            {storage?.connected
              ? "Listado operativo para admision, seguimiento y altas nuevas persistidas."
              : storage?.error || "Sin base de datos conectada, esta ruta queda solo de lectura."}
          </p>
        </div>
      </section>

      <section className="content-card">
        <div className="content-card__header">
          <div>
            <h2>Alta de paciente</h2>
            <p>Los pacientes nuevos quedan vinculados al doctor seleccionado dentro de Neon.</p>
          </div>
          <span className="content-card__meta">{canCreate ? "Persistente" : "Bloqueado"}</span>
        </div>

        {message ? (
          <div className={`inline-message ${messageType === "success" ? "inline-message--success" : "inline-message--error"}`}>
            {message}
          </div>
        ) : null}

        {!storage?.connected ? (
          <div className="inline-message inline-message--error">
            {storage?.error || "Falta configurar DATABASE_URL o POSTGRES_URL para habilitar altas reales."}
          </div>
        ) : null}

        {storage?.connected && doctors.length === 0 ? (
          <div className="inline-message inline-message--error">
            Primero crea al menos un doctor. Sin profesional no puedo vincular el paciente a la base.
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
                placeholder="Lucia Fernandez"
              />
            </label>

            <label className="field field--stacked">
              <span>Edad</span>
              <input
                required
                type="number"
                min="1"
                max="120"
                value={form.age}
                onChange={(event) => updateField("age", event.target.value)}
                placeholder="34"
              />
            </label>

            <label className="field field--stacked">
              <span>Obra social</span>
              <input
                required
                value={form.insurance}
                onChange={(event) => updateField("insurance", event.target.value)}
                placeholder="OSDE 210"
              />
            </label>

            <label className="field field--stacked">
              <span>Doctor</span>
              <select
                required
                value={form.doctorId}
                onChange={(event) => updateField("doctorId", event.target.value)}
              >
                {doctors.length === 0 ? <option value="">Sin doctores cargados</option> : null}
                {doctors.map((doctorOption) => (
                  <option key={doctorOption.id} value={doctorOption.id}>
                    {doctorOption.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field--stacked">
              <span>Telefono</span>
              <input
                required
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
                placeholder="+54 11 5555 1320"
              />
            </label>

            <label className="field field--stacked">
              <span>Ultima visita</span>
              <input
                required
                type="date"
                value={form.lastVisit}
                onChange={(event) => updateField("lastVisit", event.target.value)}
              />
            </label>

            <label className="field field--stacked">
              <span>Proximo turno</span>
              <input
                required
                type="datetime-local"
                value={normalizeDateTimeInput(form.nextAppointment)}
                onChange={(event) => updateField("nextAppointment", event.target.value)}
              />
            </label>

            <label className="field field--stacked">
              <span>Estado</span>
              <select value={form.status} onChange={(event) => updateField("status", event.target.value)}>
                <option value="active">Activo</option>
                <option value="follow_up">Seguimiento</option>
                <option value="waiting_docs">Falta documentacion</option>
                <option value="priority">Prioritario</option>
              </select>
            </label>
          </div>

          <div className="sheet-callout">
            <strong>{selectedDoctor ? selectedDoctor.name : "Sin doctor seleccionado"}</strong>
            <p>
              {selectedDoctor
                ? `El paciente se guardara con la especialidad ${selectedDoctor.specialty}.`
                : "Selecciona un doctor para completar el alta."}
            </p>
          </div>

          <div className="sheet__actions">
            <p className="subtle-copy">Los filtros de esta ruta se actualizan despues de guardar y refrescar.</p>
            <button type="submit" className="primary-button" disabled={isSubmitting || !canCreate}>
              {isSubmitting ? "Guardando..." : "Crear paciente"}
            </button>
          </div>
        </form>
      </section>

      <section className="content-card">
        <div className="content-card__header">
          <div>
            <h2>Listado de pacientes</h2>
            <p>Filtra por obra social o profesional para limpiar la vista.</p>
          </div>
          <span className="content-card__meta">{visiblePatients.length} visibles</span>
        </div>

        <section className="toolbar toolbar--dense">
          <label className="field field--search">
            <span className="field__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar pacientes, cobertura o doctor..."
            />
          </label>

          <div className="toolbar__actions">
            <label className="field field--select">
              <select value={insurance} onChange={(event) => setInsurance(event.target.value)}>
                <option value="all">Todas las obras</option>
                {filters.insurances.map((insuranceOption) => (
                  <option key={insuranceOption} value={insuranceOption}>
                    {insuranceOption}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field--select">
              <select value={doctor} onChange={(event) => setDoctor(event.target.value)}>
                <option value="all">Todos los doctores</option>
                {filters.doctors.map((doctorOption) => (
                  <option key={doctorOption} value={doctorOption}>
                    {doctorOption}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {visiblePatients.length === 0 ? (
          <div className="empty-state">
            <h3>Sin coincidencias</h3>
            <p>No hay pacientes que entren en los filtros actuales.</p>
          </div>
        ) : (
          <div className="record-table">
            <div className="record-table__head">
              <span>Paciente</span>
              <span>Obra social</span>
              <span>Profesional</span>
              <span>Seguimiento</span>
            </div>

            <div className="record-table__body">
              {visiblePatients.map((patient) => (
                <article key={patient.id} className="record-row">
                  <div className="record-row__main">
                    <strong>{patient.name}</strong>
                    <p>
                      {patient.age} anos | {patient.phone}
                    </p>
                    <small>Ultima visita {formatShortSpanishDate(patient.lastVisit)}</small>
                  </div>

                  <div>
                    <strong>{patient.insurance}</strong>
                    <small>{patient.specialty}</small>
                  </div>

                  <div>
                    <strong>{patient.doctor}</strong>
                    <small>{patient.specialty}</small>
                  </div>

                  <div className="record-row__sync">
                    <span className={PATIENT_STATUS_COPY[patient.status]?.className || "status-chip"}>
                      {PATIENT_STATUS_COPY[patient.status]?.label || patient.status}
                    </span>
                    <small>Proximo turno {patient.nextAppointment}</small>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>
    </>
  );
}