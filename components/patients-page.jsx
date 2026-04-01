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
    status: patient.status || "active"
  };
}

function formatHistoryTimestamp(value) {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    return "";
  }

  const safeValue = normalized.includes("T") ? normalized : normalized.replace(" ", "T");
  const parsed = new Date(safeValue);

  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }

  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(parsed);
}

function normalizeDateTimeInput(value) {
  const normalized = typeof value === "string" ? value.trim() : "";

  if (!normalized) {
    return "";
  }

  return normalized.includes("T") ? normalized.slice(0, 16) : normalized.replace(" ", "T").slice(0, 16);
}

function getRoundedDateTimeInput(baseDate = new Date()) {
  const nextDate = new Date(baseDate);

  nextDate.setSeconds(0, 0);
  nextDate.setMinutes(Math.ceil(nextDate.getMinutes() / 5) * 5);

  const year = nextDate.getFullYear();
  const month = String(nextDate.getMonth() + 1).padStart(2, "0");
  const day = String(nextDate.getDate()).padStart(2, "0");
  const hours = String(nextDate.getHours()).padStart(2, "0");
  const minutes = String(nextDate.getMinutes()).padStart(2, "0");

  return year + "-" + month + "-" + day + "T" + hours + ":" + minutes;
}

function buildInitialHistoryForm(defaultDoctorId = "") {
  return {
    visitAt: getRoundedDateTimeInput(),
    doctorId: defaultDoctorId,
    reason: "",
    notes: "",
    observations: "",
    requestedStudies: ""
  };
}

function buildHistoryForm(entry, defaultDoctorId = "") {
  return {
    visitAt: normalizeDateTimeInput(entry?.visitAt || entry?.visitDate),
    doctorId: entry?.doctorId || defaultDoctorId,
    reason: entry?.reason || "",
    notes: entry?.notes || "",
    observations: entry?.observations || "",
    requestedStudies: Array.isArray(entry?.requestedStudies) ? entry.requestedStudies.join("\n") : entry?.requestedStudies || ""
  };
}

function getHistorySortTime(entry) {
  const visitValue = typeof entry?.visitAt === "string" ? entry.visitAt.trim() : "";
  const createdValue = typeof entry?.createdAt === "string" ? entry.createdAt.trim() : "";
  const rawValue = visitValue || createdValue;

  if (!rawValue) {
    return 0;
  }

  const parsed = new Date(rawValue.includes("T") ? rawValue : rawValue.replace(" ", "T"));

  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function sortHistoryEntries(entries) {
  return [...entries].sort((leftEntry, rightEntry) => getHistorySortTime(rightEntry) - getHistorySortTime(leftEntry));
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
  const [historyEntries, setHistoryEntries] = useState([]);
  const [historyForm, setHistoryForm] = useState(() => buildInitialHistoryForm(doctors[0]?.id || ""));
  const [editingHistoryId, setEditingHistoryId] = useState("");
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isHistorySubmitting, setIsHistorySubmitting] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyMessage, setHistoryMessage] = useState("");
  const [historyMessageType, setHistoryMessageType] = useState("success");
  const deferredSearch = useDeferredValue(search);
  const canManage = Boolean(storage?.writable) && doctors.length > 0;
  const canManageHistory = Boolean(storage?.writable);
  const canDelete = Boolean(storage?.writable);
  const isEditing = formMode === "edit";
  const isPatientReadOnly = isEditing && !canManage;
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
    setHistoryForm((current) => {
      if (!current.doctorId || doctors.some((doctorOption) => doctorOption.id === current.doctorId)) {
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
        closeFormModal();
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

  useEffect(() => {
    if (!isFormOpen || !isEditing || !editingPatientId) {
      resetHistoryState();
      return undefined;
    }

    let isCancelled = false;

    async function loadPatientHistory() {
      setIsHistoryLoading(true);
      setHistoryError("");
      setHistoryMessage("");

      try {
        const response = await fetch("/api/patients/" + editingPatientId + "/history", {
          headers: {
            Accept: "application/json"
          }
        });
        const payload = await readJsonSafely(response);

        if (!response.ok) {
          throw new Error(payload?.error || "No se pudo leer el historial del paciente. HTTP " + response.status + ".");
        }

        if (!isCancelled) {
          setHistoryEntries(sortHistoryEntries(Array.isArray(payload?.history) ? payload.history : []));
        }
      } catch (error) {
        if (!isCancelled) {
          setHistoryEntries([]);
          setHistoryError(error instanceof Error ? error.message : "No se pudo leer el historial del paciente.");
        }
      } finally {
        if (!isCancelled) {
          setIsHistoryLoading(false);
        }
      }
    }

    loadPatientHistory();

    return () => {
      isCancelled = true;
    };
  }, [editingPatientId, isEditing, isFormOpen]);

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

  function updateHistoryField(key, value) {
    setHistoryForm((current) => ({
      ...current,
      [key]: value
    }));
  }

  function resetHistoryComposer(defaultDoctorId = "") {
    setEditingHistoryId("");
    setHistoryForm(buildInitialHistoryForm(defaultDoctorId));
    setHistoryMessage("");
    setHistoryMessageType("success");
    setIsHistorySubmitting(false);
  }

  function resetHistoryState(defaultDoctorId = "") {
    setHistoryEntries([]);
    setHistoryError("");
    setIsHistoryLoading(false);
    resetHistoryComposer(defaultDoctorId);
  }

  function closeFormModal() {
    setIsFormOpen(false);
    setFormMode("create");
    setEditingPatientId("");
    resetHistoryState();
  }

  function openCreateModal() {
    if (!canManage) {
      return;
    }

    setMessage("");
    setFormMode("create");
    setEditingPatientId("");
    setForm(buildInitialPatientForm(doctors));
    resetHistoryState(doctors[0]?.id || "");
    setIsFormOpen(true);
  }

  function openEditModal(patient) {
    const patientForm = buildPatientForm(patient, doctors);

    setMessage("");
    setFormMode("edit");
    setEditingPatientId(patient.id);
    setForm(patientForm);
    resetHistoryState(patientForm.doctorId || "");
    setIsFormOpen(true);
  }

  function startNewHistoryEntry() {
    resetHistoryComposer(form.doctorId || "");
  }

  function startHistoryEdit(entry) {
    setHistoryMessage("");
    setHistoryMessageType("success");
    setEditingHistoryId(entry.id);
    setHistoryForm(buildHistoryForm(entry, entry.doctorId || form.doctorId || ""));
  }

  function applyQuickHistoryTime(nextValue) {
    updateHistoryField("visitAt", nextValue);
  }

  function openDeleteModal(patient) {
    if (!canDelete) {
      return;
    }

    setMessage("");
    setDeleteTarget(patient);
  }

  async function handleHistorySubmit(event) {
    event.preventDefault();

    if (!editingPatientId || isHistorySubmitting || !canManageHistory) {
      return;
    }

    const isEditingHistoryEntry = Boolean(editingHistoryId);

    setIsHistorySubmitting(true);
    setHistoryError("");
    setHistoryMessage("");

    try {
      const endpoint = isEditingHistoryEntry
        ? "/api/patients/" + editingPatientId + "/history/" + editingHistoryId
        : "/api/patients/" + editingPatientId + "/history";
      const method = isEditingHistoryEntry ? "PUT" : "POST";
      const response = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json"
        },
        body: JSON.stringify(historyForm)
      });
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(
          payload?.error ||
            "No se pudo " + (isEditingHistoryEntry ? "actualizar" : "guardar") + " la visita. HTTP " + response.status + "."
        );
      }

      const savedEntry = payload?.entry;

      if (!savedEntry?.id) {
        throw new Error("La API devolvio una respuesta incompleta para el historial del paciente.");
      }

      setHistoryEntries((current) =>
        sortHistoryEntries(
          isEditingHistoryEntry
            ? current.map((entry) => (entry.id === savedEntry.id ? savedEntry : entry))
            : [savedEntry, ...current]
        )
      );
      setEditingHistoryId("");
      setHistoryForm(buildInitialHistoryForm(form.doctorId || savedEntry.doctorId || ""));
      setHistoryMessageType("success");
      setHistoryMessage(payload?.message || (isEditingHistoryEntry ? "Visita actualizada." : "Visita agregada."));
    } catch (error) {
      setHistoryMessageType("error");
      setHistoryMessage(error instanceof Error ? error.message : "No se pudo guardar la visita.");
    } finally {
      setIsHistorySubmitting(false);
    }
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
        className="sheet sheet--event sheet--patient"
        aria-modal="true"
        role="dialog"
        aria-labelledby="patient-form-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet__header">
          <div>
            <p className="sheet__eyebrow">Pacientes</p>
            <h2 id="patient-form-title">{isEditing ? "Ficha del paciente" : "Crear paciente"}</h2>
          </div>
          <button type="button" className="sheet__close" onClick={closeFormModal}>
            Cerrar
          </button>
        </div>

        <div className="stack-grid patient-sheet">
          <form className="sheet-form" onSubmit={handleSubmit}>
            <p className="sheet-copy">
              {isEditing
                ? canManage
                  ? "Revisa la ficha del paciente. Si hace falta, ajusta sus datos y guarda los cambios. Debajo ves el historial clinico."
                  : "Ficha del paciente en modo lectura. Debajo ves el historial clinico con sus notas y observaciones."
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
                  disabled={isPatientReadOnly}
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
                  disabled={isPatientReadOnly}
                />
              </label>

              <label className="field field--stacked">
                <span>Obra social <small>(opcional)</small></span>
                <input
                  value={form.insurance}
                  onChange={(event) => updateField("insurance", event.target.value)}
                  placeholder="OSDE 210"
                  disabled={isPatientReadOnly}
                />
              </label>

              <label className="field field--stacked">
                <span>Plan <small>(opcional)</small></span>
                <input
                  value={form.plan}
                  onChange={(event) => updateField("plan", event.target.value)}
                  placeholder="Plan A, Plan B, OSDE 2100"
                  disabled={isPatientReadOnly}
                />
              </label>

              <label className="field field--stacked">
                <span>Doctor</span>
                <select
                  required
                  value={form.doctorId}
                  onChange={(event) => updateField("doctorId", event.target.value)}
                  disabled={isPatientReadOnly}
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
                  disabled={isPatientReadOnly}
                />
              </label>

              <label className="field field--stacked">
                <span>Ultima visita <small>(opcional)</small></span>
                <input
                  type="date"
                  value={form.lastVisit}
                  onChange={(event) => updateField("lastVisit", event.target.value)}
                  disabled={isPatientReadOnly}
                />
              </label>

              <label className="field field--stacked">
                <span>Estado</span>
                <select
                  value={form.status}
                  onChange={(event) => updateField("status", event.target.value)}
                  disabled={isPatientReadOnly}
                >
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
                  ? "El paciente esta asociado a " + selectedDoctor.specialty + ". Plan sugerido del profesional: " + (selectedDoctor.plan || "sin plan") + "."
                  : "Selecciona un doctor para completar el guardado."}
              </p>
            </div>

            <div className="sheet__actions">
              <button type="button" className="secondary-button" onClick={closeFormModal}>
                {isPatientReadOnly ? "Cerrar" : "Cancelar"}
              </button>
              {!isPatientReadOnly ? (
                <button type="submit" className="primary-button" disabled={isSubmitting || !canManage}>
                  {isSubmitting ? "Guardando..." : isEditing ? "Guardar cambios" : "Crear paciente"}
                </button>
              ) : null}
            </div>
          </form>

          {isEditing ? (
            <section className="patient-history">
              <div className="patient-history__header">
                <div>
                  <p className="sheet__eyebrow">Historial clinico</p>
                  <h3>Visitas y notas</h3>
                  <p className="sheet-copy">Carga cada visita con fecha y hora, motivo, nota clinica, observaciones y estudios pedidos.</p>
                </div>
                <div className="patient-history__header-side">
                  <span className="content-card__meta">
                    {historyEntries.length === 1 ? "1 entrada" : historyEntries.length + " entradas"}
                  </span>
                  {canManageHistory ? (
                    <button type="button" className="secondary-button button--compact" onClick={startNewHistoryEntry}>
                      Nueva visita
                    </button>
                  ) : null}
                </div>
              </div>

              {canManageHistory ? (
                <form className="patient-history__composer" onSubmit={handleHistorySubmit}>
                  <div className="patient-history__composer-head">
                    <div>
                      <h4>{editingHistoryId ? "Editar visita" : "Agregar visita"}</h4>
                      <p className="sheet-copy">La carga rapida esta pensada para abrir, anotar y guardar sin salir del popup.</p>
                    </div>
                    <div className="patient-history__quick-actions">
                      <button
                        type="button"
                        className="secondary-button button--compact"
                        onClick={() => applyQuickHistoryTime(getRoundedDateTimeInput())}
                      >
                        Ahora
                      </button>
                      {editingHistoryId ? (
                        <button type="button" className="secondary-button button--compact" onClick={startNewHistoryEntry}>
                          Nueva visita
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {historyMessage ? (
                    <div
                      className={"inline-message " + (historyMessageType === "error" ? "inline-message--error" : "inline-message--success")}
                    >
                      {historyMessage}
                    </div>
                  ) : null}

                  <div className="sheet-form__grid patient-history__form-grid">
                    <label className="field field--stacked">
                      <span>Fecha y hora</span>
                      <input
                        required
                        type="datetime-local"
                        step="300"
                        value={historyForm.visitAt}
                        onChange={(event) => updateHistoryField("visitAt", event.target.value)}
                      />
                    </label>

                    <label className="field field--stacked">
                      <span>Profesional <small>(opcional)</small></span>
                      <select
                        value={historyForm.doctorId}
                        onChange={(event) => updateHistoryField("doctorId", event.target.value)}
                      >
                        <option value="">Sin profesional asignado</option>
                        {doctors.map((doctorOption) => (
                          <option key={doctorOption.id} value={doctorOption.id}>
                            {doctorOption.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field field--stacked patient-history__full">
                      <span>Motivo de consulta</span>
                      <textarea
                        rows={2}
                        value={historyForm.reason}
                        onChange={(event) => updateHistoryField("reason", event.target.value)}
                        placeholder="Dolor cervical, control post operatorio, cefalea persistente..."
                      />
                    </label>

                    <label className="field field--stacked patient-history__full">
                      <span>Notas o indicaciones</span>
                      <textarea
                        rows={4}
                        value={historyForm.notes}
                        onChange={(event) => updateHistoryField("notes", event.target.value)}
                        placeholder="Ejemplo: se indica resonancia, reposo relativo y control en 7 dias."
                      />
                    </label>

                    <label className="field field--stacked patient-history__full">
                      <span>Observaciones</span>
                      <textarea
                        rows={3}
                        value={historyForm.observations}
                        onChange={(event) => updateHistoryField("observations", event.target.value)}
                        placeholder="Paciente refiere molestias al mover el cuello, sin fiebre, con antecedente de..."
                      />
                    </label>

                    <label className="field field--stacked patient-history__full">
                      <span>Estudios solicitados <small>(uno por linea o separados por coma)</small></span>
                      <textarea
                        rows={3}
                        value={historyForm.requestedStudies}
                        onChange={(event) => updateHistoryField("requestedStudies", event.target.value)}
                        placeholder={"Resonancia de columna cervical\nLaboratorio completo"}
                      />
                    </label>
                  </div>

                  <div className="sheet__actions patient-history__footer">
                    <p className="sheet-copy">
                      {editingHistoryId
                        ? "Estas editando una visita ya cargada. Guarda o cancela para volver al modo rapido."
                        : "Cada visita queda guardada dentro del paciente y se puede volver a editar desde la lista."}
                    </p>
                    <div className="patient-history__quick-actions">
                      {editingHistoryId ? (
                        <button type="button" className="secondary-button button--compact" onClick={startNewHistoryEntry}>
                          Cancelar edicion
                        </button>
                      ) : null}
                      <button type="submit" className="primary-button" disabled={isHistorySubmitting}>
                        {isHistorySubmitting ? "Guardando..." : editingHistoryId ? "Guardar visita" : "Agregar visita"}
                      </button>
                    </div>
                  </div>
                </form>
              ) : null}

              {historyError ? <div className="inline-message inline-message--error">{historyError}</div> : null}

              {isHistoryLoading ? (
                <div className="empty-state empty-state--compact">
                  <h3>Cargando historial</h3>
                  <p>Estoy trayendo las visitas registradas para este paciente.</p>
                </div>
              ) : historyEntries.length === 0 ? (
                <div className="empty-state empty-state--compact">
                  <h3>Sin historial cargado</h3>
                  <p>
                    {storage?.connected
                      ? canManageHistory
                        ? "Todavia no hay visitas o notas registradas. Puedes cargar la primera desde este mismo popup."
                        : "Todavia no hay visitas o notas registradas para este paciente."
                      : "El historial persistido se habilita cuando Neon esta conectado."}
                  </p>
                </div>
              ) : (
                <div className="patient-history__list">
                  {historyEntries.map((entry) => (
                    <article key={entry.id} className="patient-history__entry">
                      <div className="patient-history__entry-head">
                        <div>
                          <strong>{formatHistoryTimestamp(entry.visitAt || entry.visitDate) || formatShortSpanishDate(entry.visitDate)}</strong>
                          <p>{entry.doctor || "Profesional no registrado"}</p>
                        </div>
                        <div className="patient-history__entry-actions">
                          {entry.updatedAt || entry.createdAt ? (
                            <small>
                              {(entry.updatedAt && entry.createdAt && entry.updatedAt !== entry.createdAt ? "Editado " : "Cargado ") +
                                formatHistoryTimestamp(entry.updatedAt || entry.createdAt)}
                            </small>
                          ) : null}
                          {canManageHistory ? (
                            <button
                              type="button"
                              className="secondary-button button--compact"
                              onClick={() => startHistoryEdit(entry)}
                            >
                              Editar
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {entry.reason ? (
                        <div className="patient-history__block">
                          <span>Motivo</span>
                          <p>{entry.reason}</p>
                        </div>
                      ) : null}

                      {entry.notes ? (
                        <div className="patient-history__block">
                          <span>Notas o indicaciones</span>
                          <p>{entry.notes}</p>
                        </div>
                      ) : null}

                      {entry.observations ? (
                        <div className="patient-history__block">
                          <span>Observaciones</span>
                          <p>{entry.observations}</p>
                        </div>
                      ) : null}

                      {entry.requestedStudies?.length > 0 ? (
                        <div className="patient-history__studies">
                          <span>Estudios solicitados</span>
                          <div className="chip-list">
                            {entry.requestedStudies.map((study) => (
                              <span key={entry.id + "-" + study} className="tag">
                                {study}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </section>
          ) : null}
        </div>
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
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="button"
              className="secondary-button"
              onClick={() => startTransition(() => router.refresh())}
            >
              Actualizar
            </button>
            <button type="button" className="primary-button" onClick={openCreateModal} disabled={!canManage}>
              Crear paciente
            </button>
          </div>
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
                      {patient.age != null ? `${patient.age} anos` : "Edad no registrada"} | {patient.phone}
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
                    
                    <div className="record-row__actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => openEditModal(patient)}
                      >
                        Ver
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
