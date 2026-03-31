"use client";

// Aca renderizo pacientes, filtros y CRUD persistido en Neon desde esta ruta.

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
    plan: doctors[0]?.plan || "",
    doctorId: doctors[0]?.id || "",
    phone: "",
    lastVisit: "",
    nextAppointment: "",
    status: "active"
  };
}

function getPatientDoctorId(patient, doctors) {
  if (typeof patient?.doctorId === "string" && patient.doctorId) {
    return patient.doctorId;
  }

  return doctors.find((doctor) => doctor.name === patient.doctor)?.id || doctors[0]?.id || "";
}

function buildPatientForm(patient, doctors) {
  const doctorId = getPatientDoctorId(patient, doctors);
  const selectedDoctor = doctors.find((doctor) => doctor.id === doctorId);

  return {
    name: patient.name || "",
    age: String(patient.age || ""),
    insurance: patient.insurance || "",
    plan: patient.plan || selectedDoctor?.plan || "",
    doctorId,
    phone: patient.phone || "",
    lastVisit: patient.lastVisit || "",
    nextAppointment: patient.nextAppointment || "",
    status: patient.status || "active"
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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingPatientId, setEditingPatientId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const deferredSearch = useDeferredValue(search);
  const canManage = Boolean(storage?.writable) && doctors.length > 0;
  const canDelete = Boolean(storage?.writable);
  const isEditing = formMode === "edit";
  const selectedDoctor = doctors.find((doctorOption) => doctorOption.id === form.doctorId) || null;
  const isOverlayOpen = isFormOpen || Boolean(deleteTarget);

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

  useEffect(() => {
    if (!isOverlayOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsFormOpen(false);
        setDeleteTarget(null);
      }
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOverlayOpen]);

  const visiblePatients = patients.filter((patient) => {
    const matchesSearch =
      !deferredSearch.trim() ||
      [patient.name, patient.insurance, patient.plan, patient.doctor, patient.specialty, patient.phone]
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

  function closeFormModal() {
    setIsFormOpen(false);
    setFormMode("create");
    setEditingPatientId("");
  }

  function openCreateModal() {
    if (!canManage) {
      return;
    }

    setMessage("");
    setFormMode("create");
    setEditingPatientId("");
    setForm(buildInitialPatientForm(doctors));
    setIsFormOpen(true);
  }

  function openEditModal(patient) {
    if (!canManage) {
      return;
    }

    setMessage("");
    setFormMode("edit");
    setEditingPatientId(patient.id);
    setForm(buildPatientForm(patient, doctors));
    setIsFormOpen(true);
  }

  function openDeleteModal(patient) {
    if (!canDelete) {
      return;
    }

    setMessage("");
    setDeleteTarget(patient);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting || !canManage) {
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const endpoint = isEditing ? `/api/patients/${editingPatientId}` : "/api/patients";
      const method = isEditing ? "PUT" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(form)
      });
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(
          payload?.error ||
            `No se pudo ${isEditing ? "actualizar" : "crear"} el paciente. HTTP ${response.status}.`
        );
      }

      setForm(buildInitialPatientForm(doctors));
      setMessageType("success");
      setMessage(payload?.message || (isEditing ? "Paciente actualizado." : "Paciente creado."));
      closeFormModal();
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el paciente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || isDeleting || !canDelete) {
      return;
    }

    setIsDeleting(true);
    setMessage("");

    try {
      const response = await fetch(`/api/patients/${deleteTarget.id}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json"
        }
      });
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(payload?.error || `No se pudo eliminar el paciente. HTTP ${response.status}.`);
      }

      setMessageType("success");
      setMessage(payload?.message || "Paciente eliminado.");
      setDeleteTarget(null);
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "No se pudo eliminar el paciente.");
    } finally {
      setIsDeleting(false);
    }
  }

  const formModal = isFormOpen ? (
    <div className="sheet-backdrop sheet-backdrop--center" onClick={closeFormModal}>
      <section
        className="sheet sheet--event"
        aria-modal="true"
        role="dialog"
        aria-labelledby="patient-form-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet__header">
          <div>
            <p className="sheet__eyebrow">Pacientes</p>
            <h2 id="patient-form-title">{isEditing ? "Editar paciente" : "Crear paciente"}</h2>
          </div>
          <button type="button" className="sheet__close" onClick={closeFormModal}>
            Cerrar
          </button>
        </div>

        <form className="sheet-form" onSubmit={handleSubmit}>
          <p className="sheet-copy">
            {isEditing
              ? "Ajusta los datos del paciente y guarda los cambios en la base."
              : "Completa los datos y el paciente quedara vinculado al profesional elegido."}
          </p>

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
              <span>Obra social <small>(opcional)</small></span>
              <input
                value={form.insurance}
                onChange={(event) => updateField("insurance", event.target.value)}
                placeholder="OSDE 210"
              />
            </label>

            <label className="field field--stacked">
              <span>Plan <small>(opcional)</small></span>
              <input
                value={form.plan}
                onChange={(event) => updateField("plan", event.target.value)}
                placeholder="Plan A, Plan B, OSDE 2100"
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
              <span>Ultima visita <small>(opcional)</small></span>
              <input
                type="date"
                value={form.lastVisit}
                onChange={(event) => updateField("lastVisit", event.target.value)}
              />
            </label>

            <label className="field field--stacked">
              <span>Proximo turno <small>(opcional)</small></span>
              <input
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
                ? `El paciente quedara asociado a ${selectedDoctor.specialty}. Plan sugerido del profesional: ${selectedDoctor.plan || "sin plan"}.`
                : "Selecciona un doctor para completar el guardado."}
            </p>
          </div>

          <div className="sheet__actions">
            <button type="button" className="secondary-button" onClick={closeFormModal}>
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={isSubmitting || !canManage}>
              {isSubmitting ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear paciente"}
            </button>
          </div>
        </form>
      </section>
    </div>
  ) : null;

  const deleteModal = deleteTarget ? (
    <div className="sheet-backdrop sheet-backdrop--center" onClick={() => setDeleteTarget(null)}>
      <section
        className="sheet sheet--event"
        aria-modal="true"
        role="dialog"
        aria-labelledby="patient-delete-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet__header">
          <div>
            <p className="sheet__eyebrow">Pacientes</p>
            <h2 id="patient-delete-title">Eliminar paciente</h2>
          </div>
          <button type="button" className="sheet__close" onClick={() => setDeleteTarget(null)}>
            Cerrar
          </button>
        </div>

        <div className="sheet-form">
          <p className="sheet-copy">
            Vas a eliminar a <strong>{deleteTarget.name}</strong>. Esta accion no se puede deshacer.
          </p>

          <div className="sheet-callout">
            <strong>{deleteTarget.doctor}</strong>
            <p>Plan del paciente: {deleteTarget.plan || "Sin plan cargado"}. Revisa la ficha antes de confirmar la baja.</p>
          </div>

          <div className="sheet__actions">
            <button type="button" className="secondary-button" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </button>
            <button type="button" className="danger-button" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Eliminando..." : "Eliminar paciente"}
            </button>
          </div>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <section className="hero-panel">
        <div>
          <p className="hero-panel__eyebrow">Pacientes y seguimiento</p>
          <h1>Pacientes</h1>
          <p className="hero-panel__copy">
            Busqueda rapida por nombre, doctor o cobertura. Esta ruta ya permite alta, edicion y baja
            persistida de pacientes cuando la base esta conectada.
          </p>
        </div>

        <div className="integration-card">
          <span className={`integration-card__badge ${storage?.connected ? "is-live" : "is-idle"}`}>
            {storage?.connected ? "Neon conectado" : "Modo semilla"}
          </span>
          <h2>{patients.length} historias</h2>
          <p>
            {storage?.connected
              ? "Listado operativo para admision, seguimiento y cambios persistidos en la base."
              : storage?.error || "Sin base de datos conectada, esta ruta queda solo de lectura."}
          </p>
        </div>
      </section>

      <section className="content-card">
        <div className="content-card__header">
          <h2>Gestion de pacientes</h2>
          <button type="button" className="primary-button" onClick={openCreateModal} disabled={!canManage}>
            Crear paciente
          </button>
        </div>

        {message ? (
          <div className={`inline-message ${messageType === "success" ? "inline-message--success" : "inline-message--error"}`}>
            {message}
          </div>
        ) : null}

        {!storage?.connected ? (
          <div className="inline-message inline-message--error">
            {storage?.error || "Falta configurar DATABASE_URL o POSTGRES_URL para habilitar cambios reales."}
          </div>
        ) : null}

        {storage?.connected && doctors.length === 0 ? (
          <div className="inline-message inline-message--error">
            Primero crea al menos un doctor. Sin profesional no puedo vincular ni editar pacientes.
          </div>
        ) : null}
      </section>

      <section className="content-card">
        <div className="content-card__header">
          <div>
            <h2>Listado de pacientes</h2>
            <p>Filtra por obra social o profesional para limpiar la vista. La busqueda tambien contempla el plan.</p>
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
              <span>Plan</span>
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
                    <small>Cobertura registrada</small>
                  </div>

                  <div>
                    <strong>{patient.plan || "Sin plan"}</strong>
                    <small>Plan del paciente</small>
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
                    <div className="record-row__actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openEditModal(patient)}
                        disabled={!canManage}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => openDeleteModal(patient)}
                        disabled={!canDelete}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      {formModal && typeof document !== "undefined" ? createPortal(formModal, document.body) : null}
      {deleteModal && typeof document !== "undefined" ? createPortal(deleteModal, document.body) : null}
    </>
  );
}
