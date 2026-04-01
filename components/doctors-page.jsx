"use client";

// Aca renderizo la vista de profesionales y permito CRUD persistido en Neon.

import { startTransition, useDeferredValue, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

function buildInitialDoctorForm() {
  return {
    name: "",
    specialty: "",
    room: "",
    shift: "",
    plan: "",
    insurances: "",
    notes: ""
  };
}

function buildDoctorForm(doctor) {
  return {
    name: doctor.name || "",
    specialty: doctor.specialty || "",
    room: doctor.room || "",
    shift: doctor.shift || "",
    plan: doctor.plan || "",
    insurances: Array.isArray(doctor.insurances) ? doctor.insurances.join(", ") : "",
    notes: doctor.notes || ""
  };
}

function getDoctorInsurances(doctor) {
  return Array.isArray(doctor?.insurances) ? doctor.insurances.filter(Boolean) : [];
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
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(buildInitialDoctorForm);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingDoctorId, setEditingDoctorId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("success");
  const deferredSearch = useDeferredValue(search);
  const canManage = Boolean(storage?.writable);
  const isEditing = formMode === "edit";
  const isOverlayOpen = isFormOpen || Boolean(deleteTarget);
  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const visibleDoctors = doctors.filter((doctor) => {
    if (!normalizedSearch) {
      return true;
    }

    return [
      doctor.name,
      doctor.specialty,
      doctor.room,
      doctor.shift,
      doctor.plan,
      doctor.notes,
      getDoctorInsurances(doctor).join(" ")
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch);
  });

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

  function updateField(key, value) {
    setForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  function closeFormModal() {
    setIsFormOpen(false);
    setFormMode("create");
    setEditingDoctorId("");
  }

  function openCreateModal() {
    if (!canManage) {
      return;
    }

    setMessage("");
    setFormMode("create");
    setEditingDoctorId("");
    setForm(buildInitialDoctorForm());
    setIsFormOpen(true);
  }

  function openEditModal(doctor) {
    if (!canManage) {
      return;
    }

    setMessage("");
    setFormMode("edit");
    setEditingDoctorId(doctor.id);
    setForm(buildDoctorForm(doctor));
    setIsFormOpen(true);
  }

  function openDeleteModal(doctor) {
    if (!canManage) {
      return;
    }

    setMessage("");
    setDeleteTarget(doctor);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (isSubmitting || !canManage) {
      return;
    }

    setIsSubmitting(true);
    setMessage("");

    try {
      const endpoint = isEditing ? `/api/doctors/${editingDoctorId}` : "/api/doctors";
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
          payload?.error || `No se pudo ${isEditing ? "actualizar" : "crear"} el doctor. HTTP ${response.status}.`
        );
      }

      setForm(buildInitialDoctorForm());
      setMessageType("success");
      setMessage(payload?.message || (isEditing ? "Doctor actualizado." : "Doctor creado."));
      closeFormModal();
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "No se pudo guardar el doctor.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget || isDeleting || !canManage) {
      return;
    }

    setIsDeleting(true);
    setMessage("");

    try {
      const response = await fetch(`/api/doctors/${deleteTarget.id}`, {
        method: "DELETE",
        headers: {
          Accept: "application/json"
        }
      });
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(payload?.error || `No se pudo eliminar el doctor. HTTP ${response.status}.`);
      }

      setMessageType("success");
      setMessage(payload?.message || "Doctor eliminado.");
      setDeleteTarget(null);
      startTransition(() => {
        router.refresh();
      });
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "No se pudo eliminar el doctor.");
    } finally {
      setIsDeleting(false);
    }
  }

  const formModal = isFormOpen ? (
    <div className="sheet-backdrop sheet-backdrop--center" onClick={closeFormModal}>
      <section
        className="sheet"
        aria-modal="true"
        role="dialog"
        aria-labelledby="doctor-form-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet__header">
          <div>
            <p className="sheet__eyebrow">Profesionales</p>
            <h2 id="doctor-form-title">{isEditing ? "Editar doctor" : "Crear doctor"}</h2>
          </div>
          <button type="button" className="sheet__close" onClick={closeFormModal}>
            Cerrar
          </button>
        </div>

        <form className="sheet-form" onSubmit={handleSubmit}>
          <p className="sheet-copy">
            {isEditing
              ? "Actualiza la ficha del profesional y guarda los cambios en la base."
              : "Carga nombre, especialidad, consultorio, horario, plan y coberturas aceptadas."}
          </p>

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

          <div className="sheet-form__grid">
            <label className="field field--stacked">
              <span>Plan</span>
              <input
                required
                value={form.plan}
                onChange={(event) => updateField("plan", event.target.value)}
                placeholder="Plan A, Plan B, OSDE 2100"
              />
            </label>

            <label className="field field--stacked">
              <span>Obras sociales</span>
              <input
                required
                value={form.insurances}
                onChange={(event) => updateField("insurances", event.target.value)}
                placeholder="OSDE, Galeno, Particular"
              />
            </label>
          </div>

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
            <button type="button" className="secondary-button" onClick={closeFormModal}>
              Cancelar
            </button>
            <button type="submit" className="primary-button" disabled={isSubmitting || !canManage}>
              {isSubmitting ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear doctor"}
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
        aria-labelledby="doctor-delete-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet__header">
          <div>
            <p className="sheet__eyebrow">Profesionales</p>
            <h2 id="doctor-delete-title">Eliminar doctor</h2>
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
            <strong>{deleteTarget.specialty}</strong>
            <p>Plan actual: {deleteTarget.plan || "Sin plan cargado"}. Si tiene pacientes vinculados, el backend va a bloquear la baja.</p>
          </div>

          <div className="sheet__actions">
            <button type="button" className="secondary-button" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </button>
            <button type="button" className="danger-button" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Eliminando..." : "Eliminar doctor"}
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
          <p className="hero-panel__eyebrow">Profesionales</p>
          <h1>Doctores</h1>
          <p className="hero-panel__copy">
            Informacion separada por ruta: especialidad, consultorio, horario, plan y obras sociales de
            cada profesional. Desde aca ya puedes crear, editar y eliminar fichas persistidas en Neon.
          </p>
        </div>

        <div className="integration-card">
          <span className={`integration-card__badge ${storage?.connected ? "is-live" : "is-idle"}`}>
            {storage?.connected ? "Neon conectado" : "Modo semilla"}
          </span>
          <h2>{doctors.length} profesionales</h2>
          <p>
            {storage?.connected
              ? "Las altas, ediciones y bajas se guardan en la base de datos de la empresa."
              : storage?.error || "Sin base de datos conectada, la pantalla queda solo de lectura."}
          </p>
        </div>
      </section>

      <section className="content-card">
        <div className="content-card__header">
          <h2>Gestion de doctores</h2>
          <button type="button" className="primary-button" onClick={openCreateModal} disabled={!canManage}>
            Crear doctor
          </button>
        </div>

        {message ? (
          <div className={`inline-message ${messageType === "success" ? "inline-message--success" : "inline-message--error"}`}>
            {message}
          </div>
        ) : null}

        {!canManage ? (
          <div className="inline-message inline-message--error">
            {storage?.error || "Falta configurar DATABASE_URL o POSTGRES_URL para habilitar cambios reales."}
          </div>
        ) : null}
      </section>

      <section className="content-card">
        <div className="content-card__header">
          <div>
            <h2>Datos de doctores</h2>
            <p>Especialidad, horarios, plan, consultorio y coberturas aceptadas. La busqueda revisa todos esos campos.</p>
          </div>
          <span className="content-card__meta">{visibleDoctors.length} visibles</span>
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
              placeholder="Buscar doctores, especialidad, plan o cobertura..."
            />
          </label>
        </section>

        {visibleDoctors.length === 0 ? (
          <div className="empty-state">
            <h3>{doctors.length === 0 ? "Sin doctores" : "Sin coincidencias"}</h3>
            <p>
              {doctors.length === 0
                ? "Todavia no hay doctores cargados."
                : "No hay doctores que entren en la busqueda actual."}
            </p>
          </div>
        ) : (
          <div className="record-table">
            <div className="record-table__head">
              <span>Profesional</span>
              <span>Consultorio</span>
              <span>Horario</span>
              <span>Plan y coberturas</span>
              <span>Gestion</span>
            </div>

            <div className="record-table__body">
              {visibleDoctors.map((doctor) => {
                const insurances = getDoctorInsurances(doctor);

                return (
                  <article key={doctor.id} className="record-row">
                    <div className="record-row__main">
                      <strong>{doctor.name}</strong>
                      <p>{doctor.specialty}</p>
                      <small>{doctor.notes || "Sin notas operativas"}</small>
                    </div>

                    <div>
                      <strong>{doctor.room}</strong>
                      <small>Consultorio asignado</small>
                    </div>

                    <div>
                      <strong>{doctor.shift}</strong>
                      <small>Horario de atencion</small>
                    </div>

                    <div>
                      <strong>{doctor.plan || "Sin plan"}</strong>
                      <small>{insurances.length > 0 ? `${insurances.length} coberturas cargadas` : "Sin coberturas cargadas"}</small>
                      {insurances.length > 0 ? (
                        <div className="chip-list">
                          {insurances.map((insurance) => (
                            <span key={`${doctor.id}-${insurance}`} className="tag">
                              {insurance}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="record-row__sync">
                      <div className="record-row__actions">
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => openEditModal(doctor)}
                          disabled={!canManage}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => openDeleteModal(doctor)}
                          disabled={!canManage}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {formModal && typeof document !== "undefined" ? createPortal(formModal, document.body) : null}
      {deleteModal && typeof document !== "undefined" ? createPortal(deleteModal, document.body) : null}
    </>
  );
}
