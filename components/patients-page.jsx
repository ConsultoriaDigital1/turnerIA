"use client";

// Aca renderizo el listado de pacientes con filtros operativos del lado cliente.

import { useDeferredValue, useState } from "react";

import { formatShortSpanishDate } from "@/lib/date-format";

// Aca fijo el copy y el estilo de cada estado para no hardcodearlo en el render.
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

export function PatientsPage({ patients, filters }) {
  const [search, setSearch] = useState("");
  const [insurance, setInsurance] = useState("all");
  const [doctor, setDoctor] = useState("all");

  const deferredSearch = useDeferredValue(search);

  // Aca filtro en cliente para mantener la busqueda y los selects bien rapidos.
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

  return (
    <>
      <section className="hero-panel">
        <div>
          <p className="hero-panel__eyebrow">Pacientes y seguimiento</p>
          <h1>Pacientes</h1>
          <p className="hero-panel__copy">
            Busqueda rapida por nombre, doctor o cobertura. Esta vista vive en su propia ruta para no
            mezclar pacientes con agenda o integraciones.
          </p>
        </div>

        <div className="integration-card">
          <span className="integration-card__badge is-live">Recepcion activa</span>
          <h2>{patients.length} historias</h2>
          <p>Listado operativo para admision, control de documentacion y seguimiento medico.</p>
        </div>
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
