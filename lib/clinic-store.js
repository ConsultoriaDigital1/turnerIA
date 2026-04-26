import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { CLINIC_DASHBOARD } from "@/lib/clinic-data";

const PATIENT_STATUS_VALUES = new Set(["active", "follow_up", "waiting_docs", "priority"]);
const DATABASE_UNAVAILABLE_MESSAGE = "DATABASE_URL o POSTGRES_URL no esta configurado. Las altas quedan deshabilitadas.";
const TABLES = {
  doctors: "doctors",
  patients: "patients",
  patientHistories: "patient_histories",
  tickets: "tickets"
};
const LEGACY_TABLES = {
  doctors: "turneria_doctors",
  patients: "turneria_patients",
  patientHistory: "patient_history",
  doctorInsurances: ["doctor_insurances", "turneria_doctor_insurances"]
};

function sanitizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cloneSeedDashboard() {
  return JSON.parse(JSON.stringify(CLINIC_DASHBOARD));
}

function getSeedDashboard() {
  const seedDashboard = cloneSeedDashboard();
  const doctorIdByName = new Map(seedDashboard.doctors.map((doctor) => [doctor.name, doctor.id]));

  seedDashboard.patients = seedDashboard.patients.map((patient) => ({
    ...patient,
    doctorId: doctorIdByName.get(patient.doctor) || ""
  }));

  return seedDashboard;
}

function buildStorageState({ connected, error = "" }) {
  return {
    provider: connected ? "neon" : "seed",
    connected,
    writable: connected,
    error
  };
}

function buildSeedDashboard(errorMessage = DATABASE_UNAVAILABLE_MESSAGE) {
  const seedDashboard = getSeedDashboard();

  return {
    ...seedDashboard,
    storage: buildStorageState({
      connected: false,
      error: errorMessage
    })
  };
}

function getConnectionString() {
  return sanitizeText(process.env.DATABASE_URL) || sanitizeText(process.env.POSTGRES_URL);
}

function getGlobalState() {
  if (!globalThis.__turneriaClinicState) {
    globalThis.__turneriaClinicState = {};
  }

  return globalThis.__turneriaClinicState;
}

function createStoreError(message, status = 400) {
  const error = new Error(message);

  error.status = status;

  return error;
}

function normalizeEntityId(value, entityLabel) {
  const normalized = sanitizeText(value);

  if (!normalized) {
    throw createStoreError(`Falta el identificador de ${entityLabel}.`, 400);
  }

  return normalized;
}

function getStoreErrorMessage(error) {
  return error instanceof Error ? error.message : "No se pudo leer la base de datos.";
}

function isTransientDatabaseError(error) {
  const message = getStoreErrorMessage(error).toLowerCase();

  return (
    error?.code === "ECONNRESET" ||
    message.includes("read econreset") ||
    message.includes("connection terminated unexpectedly") ||
    message.includes("server closed the connection unexpectedly") ||
    message.includes("socket hang up")
  );
}

async function closePoolSilently(pool) {
  if (!pool) {
    return;
  }

  try {
    await pool.end();
  } catch {
    // Si el pool ya esta roto, no fuerzo mas ruido.
  }
}

async function resetDatabaseState() {
  const globalState = getGlobalState();
  const currentPool = globalState.pool;

  globalState.pool = null;
  globalState.readyPromise = null;

  await closePoolSilently(currentPool);
}

function createPool(connectionString) {
  const pool = new Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    ssl: {
      rejectUnauthorized: false
    }
  });

  pool.on("error", (error) => {
    const globalState = getGlobalState();

    if (globalState.pool === pool) {
      globalState.pool = null;
      globalState.readyPromise = null;
    }

    console.warn(`Conexion inactiva de Neon interrumpida. Reinicio el pool. ${getStoreErrorMessage(error)}`);
  });

  return pool;
}

async function runDatabaseRead(operation) {
  let attempt = 0;

  while (attempt < 2) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientDatabaseError(error) || attempt === 1) {
        throw error;
      }

      attempt += 1;
      await resetDatabaseState();
    }
  }

  throw createStoreError("No se pudo completar la lectura de la base de datos.", 503);
}

async function rollbackQuietly(client) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Si la conexion se corto, no intento enmascarar el error real.
  }
}

function logDatabaseFallback(error, context = "lectura") {
  const prefix = isTransientDatabaseError(error)
    ? "Conexion con Neon interrumpida, vuelvo a datos semilla."
    : "No se pudo leer la base de Neon, vuelvo a datos semilla.";

  console.warn(`${prefix} ${context}: ${getStoreErrorMessage(error)}`);
}

function getPool() {
  const connectionString = getConnectionString();

  if (!connectionString) {
    return null;
  }

  const globalState = getGlobalState();

  if (!globalState.pool) {
    globalState.pool = createPool(connectionString);
  }

  return globalState.pool;
}

function normalizeTextList(value) {
  const sourceValues = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);

  return [...new Set(sourceValues.map(sanitizeText).filter(Boolean))];
}

function normalizeInsuranceList(value) {
  return normalizeTextList(value);
}

function formatDateParts(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatDateTimeParts(year, month, day, hours, minutes) {
  return `${formatDateParts(year, month, day)} ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function extractFallbackYear(value) {
  const normalized = sanitizeText(value);
  const isoYearMatch = normalized.match(/^(\d{4})-\d{2}-\d{2}/);

  if (isoYearMatch) {
    return Number(isoYearMatch[1]);
  }

  const parsed = new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    return new Date().getUTCFullYear();
  }

  return parsed.getUTCFullYear();
}

function normalizeStoredDateValue(value, fallbackYear = new Date().getUTCFullYear()) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }

  const normalized = sanitizeText(value);

  if (!normalized) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return normalized;
  }

  const shortMonthMatch = normalized.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})(?:\s+(\d{4}))?$/);

  if (shortMonthMatch) {
    const [, monthLabel, dayValue, explicitYear] = shortMonthMatch;
    const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(monthLabel.toLowerCase());

    if (monthIndex !== -1) {
      return formatDateParts(Number(explicitYear || fallbackYear), monthIndex + 1, Number(dayValue));
    }
  }

  const parsed = new Date(normalized);

  if (!Number.isNaN(parsed.getTime())) {
    return formatDateParts(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, parsed.getUTCDate());
  }

  return "";
}

function normalizeStoredDateTimeValue(value, fallbackYear = new Date().getUTCFullYear()) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateTimeParts(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
      value.getUTCHours(),
      value.getUTCMinutes()
    );
  }

  const normalized = sanitizeText(value).replace("T", " ");

  if (!normalized) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) {
    return normalized;
  }

  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(normalized)) {
    return normalized.slice(0, 16);
  }

  const shortDateTimeMatch = normalized.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})(?:\s+(\d{4}))?\s+(\d{1,2}):(\d{2})(?::\d{2})?$/);

  if (shortDateTimeMatch) {
    const [, monthLabel, dayValue, explicitYear, hoursValue, minutesValue] = shortDateTimeMatch;
    const monthIndex = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(monthLabel.toLowerCase());

    if (monthIndex !== -1) {
      return formatDateTimeParts(
        Number(explicitYear || fallbackYear),
        monthIndex + 1,
        Number(dayValue),
        Number(hoursValue),
        Number(minutesValue)
      );
    }
  }

  const parsed = new Date(normalized);

  if (!Number.isNaN(parsed.getTime())) {
    return formatDateTimeParts(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth() + 1,
      parsed.getUTCDate(),
      parsed.getUTCHours(),
      parsed.getUTCMinutes()
    );
  }

  return "";
}

function normalizeIsoDateTime(value) {
  if (!value) {
    return "";
  }

  const parsed = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toISOString();
}

function normalizeDateValue(value, fieldLabel) {
  const normalized = normalizeStoredDateValue(value);

  if (!normalized) {
    throw createStoreError(`${fieldLabel} es obligatoria.`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw createStoreError(`${fieldLabel} debe tener formato YYYY-MM-DD.`);
  }

  return normalized;
}

function normalizeHistoryVisitAt(value, fieldLabel) {
  const rawValue = sanitizeText(value);

  if (!rawValue) {
    throw createStoreError(`${fieldLabel} es obligatoria.`);
  }

  const normalizedDateTime = normalizeStoredDateTimeValue(rawValue);

  if (normalizedDateTime) {
    return normalizedDateTime;
  }

  const normalizedDate = normalizeStoredDateValue(rawValue);

  if (normalizedDate) {
    return `${normalizedDate} 00:00`;
  }

  throw createStoreError(`${fieldLabel} debe tener formato YYYY-MM-DD HH:MM.`);
}

function normalizeAge(value) {
  const parsedAge = Number(value);

  if (!Number.isInteger(parsedAge) || parsedAge <= 0 || parsedAge > 120) {
    throw createStoreError("La edad debe ser un numero entero entre 1 y 120.");
  }

  return parsedAge;
}

function normalizeDoctorInput(input) {
  const name = sanitizeText(input?.name);
  const specialty = sanitizeText(input?.specialty);
  const room = sanitizeText(input?.room);
  const shift = sanitizeText(input?.shift);
  const plan = sanitizeText(input?.plan);
  const notes = sanitizeText(input?.notes);
  const insurances = normalizeInsuranceList(input?.insurances);

  if (!name) {
    throw createStoreError("El nombre del doctor es obligatorio.");
  }

  if (!specialty) {
    throw createStoreError("La especialidad es obligatoria.");
  }

  if (!room) {
    throw createStoreError("El consultorio es obligatorio.");
  }

  if (!shift) {
    throw createStoreError("El horario es obligatorio.");
  }

  if (!plan) {
    throw createStoreError("El plan es obligatorio.");
  }

  if (insurances.length === 0) {
    throw createStoreError("Carga al menos una obra social para el doctor.");
  }

  return {
    name,
    specialty,
    room,
    shift,
    plan,
    notes,
    insurances
  };
}

function normalizePatientInput(input) {
  const name = sanitizeText(input?.name);
  const insurance = sanitizeText(input?.insurance);
  const plan = sanitizeText(input?.plan);
  const doctorId = sanitizeText(input?.doctorId);
  const phone = sanitizeText(input?.phone);
  const lastVisit = input?.lastVisit ? normalizeDateValue(input.lastVisit, "La ultima visita") : "";
  const nextAppointment = sanitizeText(input?.nextAppointment) || "";
  const status = sanitizeText(input?.status) || "";
  const age = input?.age ? normalizeAge(input.age) : null;

  if (status && !PATIENT_STATUS_VALUES.has(status)) {
    throw createStoreError("El estado del paciente no es valido.");
  }

  return {
    name,
    age,
    insurance,
    plan,
    doctorId,
    phone,
    lastVisit,
    nextAppointment,
    status
  };
}

function normalizePatientHistoryInput(input, { partial = false } = {}) {
  const doctorId = sanitizeText(input?.doctorId);
  const rawVisitAt = input?.visitAt ?? input?.visitDate ?? "";
  const visitAt = rawVisitAt ? normalizeHistoryVisitAt(rawVisitAt, "La fecha y hora de la visita") : "";
  const reason = sanitizeText(input?.reason);
  const notes = sanitizeText(input?.notes);
  const observations = sanitizeText(input?.observations);
  const requestedStudies = normalizeTextList(input?.requestedStudies);

  if (!partial && !visitAt) {
    throw createStoreError("La fecha y hora de la visita es obligatoria.");
  }

  if (!partial && !reason && !notes && !observations && requestedStudies.length === 0) {
    throw createStoreError("Carga al menos el motivo, notas, observaciones o estudios solicitados.");
  }

  return {
    doctorId,
    visitAt,
    reason,
    notes,
    observations,
    requestedStudies
  };
}

function mapDoctorRow(row) {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    room: row.room,
    shift: row.shift,
    plan: row.plan || "",
    notes: row.notes || "",
    insurances: Array.isArray(row.insurances) ? row.insurances.filter(Boolean) : []
  };
}

function mapPatientRow(row) {
  return {
    id: row.id,
    name: row.name,
    age: row.age != null ? Number(row.age) : null,
    insurance: row.insurance,
    plan: row.plan || "",
    doctorId: row.doctorId || row.doctor_id || "",
    doctor: row.doctor,
    specialty: row.specialty,
    phone: row.phone,
    lastVisit: normalizeStoredDateValue(row.lastVisit || row.last_visit) || "",
    status: row.status
  };
}

function buildPatientResponse(id, patient, doctor) {
  return {
    id,
    name: patient.name,
    age: patient.age,
    insurance: patient.insurance,
    plan: patient.plan || doctor.plan || "",
    doctorId: doctor.id,
    doctor: doctor.name,
    specialty: doctor.specialty,
    phone: patient.phone,
    lastVisit: patient.lastVisit,
    status: patient.status
  };
}

function mapPatientHistoryRow(row) {
  const visitAt = normalizeStoredDateTimeValue(row.visitAt || row.visit_at || row.visitDate || row.visit_date) || "";

  return {
    id: sanitizeText(row.id),
    patientId: sanitizeText(row.patientId || row.patient_id),
    patientName: sanitizeText(row.patientName || row.patient_name),
    doctorId: sanitizeText(row.doctorId || row.doctor_id),
    doctor: sanitizeText(row.doctor),
    visitAt,
    visitDate: visitAt ? visitAt.slice(0, 10) : normalizeStoredDateValue(row.visitDate || row.visit_date) || "",
    reason: sanitizeText(row.reason),
    notes: sanitizeText(row.notes),
    observations: sanitizeText(row.observations),
    requestedStudies: normalizeTextList(row.requestedStudies || row.requested_studies),
    createdAt: normalizeIsoDateTime(row.createdAt || row.created_at),
    updatedAt: normalizeIsoDateTime(row.updatedAt || row.updated_at)
  };
}

function todayDateString() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
}

function mapTicketRow(row) {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name || "",
    appointmentDate: normalizeStoredDateValue(row.appointment_date),
    ticketNumber: Number(row.ticket_number),
    phone: row.phone,
    status: row.status,
    createdAt: normalizeIsoDateTime(row.created_at),
    calledAt: row.called_at ? normalizeIsoDateTime(row.called_at) : null
  };
}

async function getPatientSummaryById(client, patientId) {
  const result = await client.query(
    `
      SELECT id, name, doctor_id AS "doctorId"
      FROM ${TABLES.patients}
      WHERE id = $1
    `,
    [patientId]
  );
  const patient = result.rows[0];

  if (!patient) {
    throw createStoreError("El paciente seleccionado ya no existe en la base.", 404);
  }

  return patient;
}

async function getDoctorSummaryById(client, doctorId) {
  const result = await client.query(
    `
      SELECT id, name, specialty, plan
      FROM ${TABLES.doctors}
      WHERE id = $1
    `,
    [doctorId]
  );
  const doctor = result.rows[0];

  if (!doctor) {
    throw createStoreError("El doctor seleccionado ya no existe en la base.", 404);
  }

  return doctor;
}

async function tableExists(client, tableName) {
  const result = await client.query("SELECT to_regclass($1) AS reg", [`public.${tableName}`]);

  return Boolean(result.rows[0]?.reg);
}

async function columnExists(client, tableName, columnName) {
  const result = await client.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
    `,
    [tableName, columnName]
  );

  return result.rowCount > 0;
}

async function ensureDoctorSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TABLES.doctors} (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      specialty TEXT NOT NULL,
      room TEXT NOT NULL,
      shift TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      insurances TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`ALTER TABLE ${TABLES.doctors} ADD COLUMN IF NOT EXISTS specialty TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE ${TABLES.doctors} ADD COLUMN IF NOT EXISTS room TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE ${TABLES.doctors} ADD COLUMN IF NOT EXISTS shift TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE ${TABLES.doctors} ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE ${TABLES.doctors} ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE ${TABLES.doctors} ADD COLUMN IF NOT EXISTS insurances TEXT[] NOT NULL DEFAULT '{}'::TEXT[]`);
  await client.query(`ALTER TABLE ${TABLES.doctors} ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await client.query(`UPDATE ${TABLES.doctors} SET plan = '' WHERE plan IS NULL`);
  await client.query(`UPDATE ${TABLES.doctors} SET notes = '' WHERE notes IS NULL`);
  await client.query(`UPDATE ${TABLES.doctors} SET insurances = '{}'::TEXT[] WHERE insurances IS NULL`);
}

async function ensurePatientSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TABLES.patients} (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      age INTEGER,
      insurance TEXT NOT NULL,
      plan TEXT NOT NULL DEFAULT '',
      doctor_id TEXT NOT NULL REFERENCES ${TABLES.doctors}(id) ON DELETE RESTRICT,
      phone TEXT NOT NULL,
      last_visit DATE,
      next_appointment TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`ALTER TABLE ${TABLES.patients} ADD COLUMN IF NOT EXISTS age INTEGER`);
  await client.query(`ALTER TABLE ${TABLES.patients} ALTER COLUMN age DROP NOT NULL`);
  await client.query(`ALTER TABLE ${TABLES.patients} ADD COLUMN IF NOT EXISTS insurance TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE ${TABLES.patients} ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE ${TABLES.patients} ADD COLUMN IF NOT EXISTS doctor_id TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE ${TABLES.patients} ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE ${TABLES.patients} ADD COLUMN IF NOT EXISTS last_visit DATE`);
  await client.query(`ALTER TABLE ${TABLES.patients} ADD COLUMN IF NOT EXISTS next_appointment TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE ${TABLES.patients} ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`);
  await client.query(`ALTER TABLE ${TABLES.patients} ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await client.query(`UPDATE ${TABLES.patients} SET plan = '' WHERE plan IS NULL`);
  await client.query(`CREATE INDEX IF NOT EXISTS patients_doctor_id_idx ON ${TABLES.patients} (doctor_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS patients_name_idx ON ${TABLES.patients} (name)`);
}

async function ensurePatientHistorySchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TABLES.patientHistories} (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES ${TABLES.patients}(id) ON DELETE CASCADE,
      doctor_id TEXT REFERENCES ${TABLES.doctors}(id) ON DELETE SET NULL,
      visit_at TIMESTAMP NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      observations TEXT NOT NULL DEFAULT '',
      requested_studies TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await client.query(`ALTER TABLE ${TABLES.patientHistories} ADD COLUMN IF NOT EXISTS doctor_id TEXT REFERENCES ${TABLES.doctors}(id) ON DELETE SET NULL`);
  await client.query(`ALTER TABLE ${TABLES.patientHistories} ADD COLUMN IF NOT EXISTS visit_at TIMESTAMP`);
  await client.query(`ALTER TABLE ${TABLES.patientHistories} ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE ${TABLES.patientHistories} ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE ${TABLES.patientHistories} ADD COLUMN IF NOT EXISTS observations TEXT NOT NULL DEFAULT ''`);
  await client.query(`ALTER TABLE ${TABLES.patientHistories} ADD COLUMN IF NOT EXISTS requested_studies TEXT[] NOT NULL DEFAULT '{}'::TEXT[]`);
  await client.query(`ALTER TABLE ${TABLES.patientHistories} ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);
  await client.query(`ALTER TABLE ${TABLES.patientHistories} ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`);

  if (await columnExists(client, TABLES.patientHistories, "visit_date")) {
    await client.query(`
      UPDATE ${TABLES.patientHistories}
      SET visit_at = COALESCE(visit_at, visit_date::timestamp)
      WHERE visit_at IS NULL AND visit_date IS NOT NULL
    `);
  }

  const legacyTableName = LEGACY_TABLES.patientHistory;

  if (legacyTableName !== TABLES.patientHistories && (await tableExists(client, legacyTableName))) {
    const legacyDoctorExpression = (await columnExists(client, legacyTableName, "doctor_id")) ? "doctor_id" : "NULL";
    const legacyVisitExpression = (await columnExists(client, legacyTableName, "visit_at"))
      ? "visit_at"
      : (await columnExists(client, legacyTableName, "visit_date"))
        ? "visit_date::timestamp"
        : (await columnExists(client, legacyTableName, "created_at"))
          ? "created_at::timestamp"
          : "NOW()::timestamp";
    const legacyReasonExpression = (await columnExists(client, legacyTableName, "reason")) ? "COALESCE(reason, '')" : "''";
    const legacyNotesExpression = (await columnExists(client, legacyTableName, "notes")) ? "COALESCE(notes, '')" : "''";
    const legacyObservationsExpression = (await columnExists(client, legacyTableName, "observations")) ? "COALESCE(observations, '')" : "''";
    const legacyStudiesExpression = (await columnExists(client, legacyTableName, "requested_studies")) ? "COALESCE(requested_studies, '{}'::TEXT[])" : "'{}'::TEXT[]";
    const legacyCreatedAtExpression = (await columnExists(client, legacyTableName, "created_at")) ? "created_at" : "NOW()";
    const legacyUpdatedAtExpression = (await columnExists(client, legacyTableName, "updated_at")) ? "updated_at" : legacyCreatedAtExpression;

    await client.query(`
      INSERT INTO ${TABLES.patientHistories} (
        id,
        patient_id,
        doctor_id,
        visit_at,
        reason,
        notes,
        observations,
        requested_studies,
        created_at,
        updated_at
      )
      SELECT
        id,
        patient_id,
        ${legacyDoctorExpression},
        COALESCE(${legacyVisitExpression}, NOW()::timestamp),
        ${legacyReasonExpression},
        ${legacyNotesExpression},
        ${legacyObservationsExpression},
        ${legacyStudiesExpression},
        ${legacyCreatedAtExpression},
        ${legacyUpdatedAtExpression}
      FROM ${legacyTableName}
      ON CONFLICT (id) DO UPDATE SET
        patient_id = EXCLUDED.patient_id,
        doctor_id = EXCLUDED.doctor_id,
        visit_at = EXCLUDED.visit_at,
        reason = EXCLUDED.reason,
        notes = EXCLUDED.notes,
        observations = EXCLUDED.observations,
        requested_studies = EXCLUDED.requested_studies,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at
    `);

    await client.query(`DROP TABLE ${legacyTableName}`);
  }

  await client.query(`UPDATE ${TABLES.patientHistories} SET reason = '' WHERE reason IS NULL`);
  await client.query(`UPDATE ${TABLES.patientHistories} SET notes = '' WHERE notes IS NULL`);
  await client.query(`UPDATE ${TABLES.patientHistories} SET observations = '' WHERE observations IS NULL`);
  await client.query(`UPDATE ${TABLES.patientHistories} SET requested_studies = '{}'::TEXT[] WHERE requested_studies IS NULL`);
  await client.query(`
    UPDATE ${TABLES.patientHistories}
    SET visit_at = COALESCE(visit_at, created_at::timestamp, NOW()::timestamp)
    WHERE visit_at IS NULL
  `);
  await client.query(`ALTER TABLE ${TABLES.patientHistories} ALTER COLUMN visit_at SET NOT NULL`);

  if (await columnExists(client, TABLES.patientHistories, "visit_date")) {
    await client.query(`ALTER TABLE ${TABLES.patientHistories} DROP COLUMN IF EXISTS visit_date`);
  }

  await client.query(`CREATE INDEX IF NOT EXISTS patient_histories_patient_id_idx ON ${TABLES.patientHistories} (patient_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS patient_histories_doctor_id_idx ON ${TABLES.patientHistories} (doctor_id)`);
  await client.query(`CREATE INDEX IF NOT EXISTS patient_histories_visit_at_idx ON ${TABLES.patientHistories} (visit_at DESC)`);
}

async function ensureTicketSchema(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${TABLES.tickets} (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL REFERENCES ${TABLES.patients}(id) ON DELETE CASCADE,
      doctor_id TEXT NOT NULL REFERENCES ${TABLES.doctors}(id) ON DELETE CASCADE,
      appointment_date DATE NOT NULL,
      ticket_number INTEGER NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      patient_name TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'waiting',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      called_at TIMESTAMPTZ,
      UNIQUE(doctor_id, appointment_date, ticket_number)
    )
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS tickets_doctor_date_idx ON ${TABLES.tickets} (doctor_id, appointment_date)`);
}

async function readDoctorsFromTable(client, tableName) {
  if (!(await tableExists(client, tableName))) {
    return [];
  }

  const result = await client.query(`SELECT * FROM ${tableName} ORDER BY id ASC`);

  return result.rows.map((row) => ({
    id: sanitizeText(row.id),
    name: sanitizeText(row.name),
    specialty: sanitizeText(row.specialty),
    room: sanitizeText(row.room),
    shift: sanitizeText(row.shift),
    plan: sanitizeText(row.plan),
    notes: sanitizeText(row.notes),
    insurances: normalizeInsuranceList(row.insurances)
  }));
}

async function readDoctorInsuranceMap(client, tableName) {
  const insuranceMap = new Map();

  if (!(await tableExists(client, tableName))) {
    return insuranceMap;
  }

  const result = await client.query(`
    SELECT doctor_id, ARRAY_AGG(DISTINCT insurance ORDER BY insurance) AS insurances
    FROM ${tableName}
    GROUP BY doctor_id
  `);

  result.rows.forEach((row) => {
    insuranceMap.set(sanitizeText(row.doctor_id), normalizeInsuranceList(row.insurances));
  });

  return insuranceMap;
}

async function upsertDoctors(client, doctors) {
  for (const doctor of doctors) {
    const doctorId = sanitizeText(doctor.id);

    if (!doctorId) {
      continue;
    }

    const insurances = normalizeInsuranceList(doctor.insurances);

    await client.query(
      `
        INSERT INTO ${TABLES.doctors} (id, name, specialty, room, shift, plan, notes, insurances)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE ${TABLES.doctors}.name END,
          specialty = CASE WHEN EXCLUDED.specialty <> '' THEN EXCLUDED.specialty ELSE ${TABLES.doctors}.specialty END,
          room = CASE WHEN EXCLUDED.room <> '' THEN EXCLUDED.room ELSE ${TABLES.doctors}.room END,
          shift = CASE WHEN EXCLUDED.shift <> '' THEN EXCLUDED.shift ELSE ${TABLES.doctors}.shift END,
          plan = CASE WHEN EXCLUDED.plan <> '' THEN EXCLUDED.plan ELSE ${TABLES.doctors}.plan END,
          notes = CASE WHEN EXCLUDED.notes <> '' THEN EXCLUDED.notes ELSE ${TABLES.doctors}.notes END,
          insurances = CASE
            WHEN COALESCE(array_length(EXCLUDED.insurances, 1), 0) > 0 THEN EXCLUDED.insurances
            ELSE ${TABLES.doctors}.insurances
          END
      `,
      [
        doctorId,
        sanitizeText(doctor.name),
        sanitizeText(doctor.specialty),
        sanitizeText(doctor.room),
        sanitizeText(doctor.shift),
        sanitizeText(doctor.plan),
        sanitizeText(doctor.notes),
        insurances
      ]
    );
  }
}

async function mergeDoctorsFromSource(client, sourceTable, insuranceTable = '') {
  if (sourceTable === TABLES.doctors) {
    return;
  }

  const doctors = await readDoctorsFromTable(client, sourceTable);

  if (doctors.length === 0) {
    return;
  }

  let insuranceMap = new Map();

  if (insuranceTable) {
    insuranceMap = await readDoctorInsuranceMap(client, insuranceTable);
  }

  const mergedDoctors = doctors.map((doctor) => ({
    ...doctor,
    insurances: doctor.insurances.length > 0 ? doctor.insurances : insuranceMap.get(doctor.id) || []
  }));

  await upsertDoctors(client, mergedDoctors);
}

async function mergeInsuranceSourceIntoDoctors(client, insuranceTable) {
  const insuranceMap = await readDoctorInsuranceMap(client, insuranceTable);

  if (insuranceMap.size === 0) {
    return;
  }

  const currentDoctors = await readDoctorsFromTable(client, TABLES.doctors);
  const doctorsById = new Map(currentDoctors.map((doctor) => [doctor.id, doctor]));
  const doctorsToUpdate = [];

  insuranceMap.forEach((insurances, doctorId) => {
    const currentDoctor = doctorsById.get(doctorId);

    if (!currentDoctor) {
      return;
    }

    doctorsToUpdate.push({
      ...currentDoctor,
      insurances: [...new Set([...currentDoctor.insurances, ...insurances])]
    });
  });

  await upsertDoctors(client, doctorsToUpdate);
}

async function readPatientsFromTable(client, tableName) {
  if (!(await tableExists(client, tableName))) {
    return [];
  }

  const result = await client.query(`SELECT * FROM ${tableName} ORDER BY id ASC`);

  return result.rows.map((row) => ({
    id: sanitizeText(row.id),
    name: sanitizeText(row.name),
    age: row.age != null ? Number(row.age) : null,
    insurance: sanitizeText(row.insurance),
    plan: sanitizeText(row.plan),
    doctorId: sanitizeText(row.doctor_id),
    phone: sanitizeText(row.phone),
    lastVisit: normalizeStoredDateValue(row.last_visit || row.lastVisit) || "",
    status: sanitizeText(row.status) || 'active'
  }));
}

async function upsertPatients(client, patients) {
  for (const patient of patients) {
    const patientId = sanitizeText(patient.id);

    if (!patientId) {
      continue;
    }

    const lastVisit = normalizeStoredDateValue(patient.lastVisit) || formatDateParts(new Date().getUTCFullYear(), 1, 1);

    await client.query(`
        INSERT INTO ${TABLES.patients} (id, name, age, insurance, plan, doctor_id, phone, last_visit, next_appointment, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '', $9)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          age = EXCLUDED.age,
          insurance = EXCLUDED.insurance,
          plan = CASE WHEN EXCLUDED.plan <> '' THEN EXCLUDED.plan ELSE ${TABLES.patients}.plan END,
          doctor_id = EXCLUDED.doctor_id,
          phone = EXCLUDED.phone,
          last_visit = EXCLUDED.last_visit,
          status = EXCLUDED.status
      `, [
        patientId,
        sanitizeText(patient.name),
        Number.isInteger(patient.age) ? patient.age : 0,
        sanitizeText(patient.insurance),
        sanitizeText(patient.plan),
        sanitizeText(patient.doctorId),
        sanitizeText(patient.phone),
        lastVisit,
        sanitizeText(patient.status) || 'active'
      ]);
  }
}

async function mergePatientsFromSource(client, sourceTable) {
  if (sourceTable === TABLES.patients) {
    return;
  }

  const patients = await readPatientsFromTable(client, sourceTable);

  if (patients.length === 0) {
    return;
  }

  await upsertPatients(client, patients);
}

async function backfillDoctorDefaults(client) {
  const seedDoctorsById = new Map(getSeedDashboard().doctors.map((doctor) => [doctor.id, doctor]));
  const currentDoctors = await readDoctorsFromTable(client, TABLES.doctors);
  const doctorsToUpdate = currentDoctors.map((doctor) => {
    const seedDoctor = seedDoctorsById.get(doctor.id);

    if (!seedDoctor) {
      return doctor;
    }

    return {
      ...doctor,
      specialty: doctor.specialty || seedDoctor.specialty,
      room: doctor.room || seedDoctor.room,
      shift: doctor.shift || seedDoctor.shift,
      plan: doctor.plan || seedDoctor.plan,
      notes: doctor.notes || seedDoctor.notes,
      insurances: doctor.insurances.length > 0 ? doctor.insurances : normalizeInsuranceList(seedDoctor.insurances)
    };
  });

  await upsertDoctors(client, doctorsToUpdate);
}

async function backfillPatientPlans(client) {
  const seedPatientsById = new Map(getSeedDashboard().patients.map((patient) => [patient.id, sanitizeText(patient.plan)]));
  const currentPatients = await readPatientsFromTable(client, TABLES.patients);
  const currentDoctors = await readDoctorsFromTable(client, TABLES.doctors);
  const planByDoctorId = new Map(currentDoctors.map((doctor) => [doctor.id, sanitizeText(doctor.plan)]));
  const patientsToUpdate = currentPatients.map((patient) => ({
    ...patient,
    plan: patient.plan || seedPatientsById.get(patient.id) || planByDoctorId.get(patient.doctorId) || ""
  }));

  await upsertPatients(client, patientsToUpdate);
}

async function dropObsoleteTables(client) {
  for (const tableName of [LEGACY_TABLES.doctors, LEGACY_TABLES.patients, LEGACY_TABLES.patientHistory, ...LEGACY_TABLES.doctorInsurances]) {
    if (tableName === TABLES.doctors || tableName === TABLES.patients) {
      continue;
    }

    if (await tableExists(client, tableName)) {
      await client.query(`DROP TABLE ${tableName} CASCADE`);
    }
  }
}

async function ensureDatabaseReady() {
  const pool = getPool();

  if (!pool) {
    throw createStoreError(DATABASE_UNAVAILABLE_MESSAGE, 503);
  }

  const globalState = getGlobalState();

  if (!globalState.readyPromise) {
    globalState.readyPromise = initializeDatabase(pool).catch((error) => {
      globalState.readyPromise = null;
      throw error;
    });
  }

  return globalState.readyPromise;
}

async function initializeDatabase(pool) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await ensureDoctorSchema(client);
    await ensurePatientSchema(client);
    await ensurePatientHistorySchema(client);
    await ensureTicketSchema(client);
    await mergeDoctorsFromSource(client, LEGACY_TABLES.doctors, "turneria_doctor_insurances");
    await mergeInsuranceSourceIntoDoctors(client, "doctor_insurances");
    await mergePatientsFromSource(client, LEGACY_TABLES.patients);

    const doctorCountResult = await client.query(`SELECT COUNT(*)::int AS count FROM ${TABLES.doctors}`);
    const patientCountResult = await client.query(`SELECT COUNT(*)::int AS count FROM ${TABLES.patients}`);
    const doctorCount = doctorCountResult.rows[0]?.count || 0;
    const patientCount = patientCountResult.rows[0]?.count || 0;

    if (doctorCount === 0 && patientCount === 0) {
      await seedDatabase(client);
    }

    await backfillDoctorDefaults(client);
    await backfillPatientPlans(client);
    await dropObsoleteTables(client);
    await client.query("COMMIT");
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

async function seedDatabase(client) {
  const seedDashboard = getSeedDashboard();

  await upsertDoctors(
    client,
    seedDashboard.doctors.map((doctor) => ({
      ...doctor,
      insurances: normalizeInsuranceList(doctor.insurances)
    }))
  );

  await upsertPatients(
    client,
    seedDashboard.patients.map((patient) => ({
      ...patient,
      doctorId: patient.doctorId
    }))
  );
}

async function getDoctorsFromDatabase() {
  return runDatabaseRead(async () => {
    await ensureDatabaseReady();

    const pool = getPool();
    const result = await pool.query(`
      SELECT id, name, specialty, room, shift, plan, notes, insurances
      FROM ${TABLES.doctors}
      ORDER BY name ASC
    `);

    return result.rows.map(mapDoctorRow);
  });
}

async function getPatientsFromDatabase({ phone } = {}) {
  return runDatabaseRead(async () => {
    await ensureDatabaseReady();

    const pool = getPool();

    if (phone) {
      const normalized = phone.replace(/\D/g, "");
      const result = await pool.query(`
        SELECT
          p.id,
          p.name,
          p.age,
          p.insurance,
          p.plan,
          p.doctor_id AS "doctorId",
          d.name AS doctor,
          d.specialty,
          p.phone,
          TO_CHAR(p.last_visit, 'YYYY-MM-DD') AS "lastVisit",
          p.status
        FROM ${TABLES.patients} p
        INNER JOIN ${TABLES.doctors} d ON d.id = p.doctor_id
        WHERE REGEXP_REPLACE(p.phone, '\D', '', 'g') LIKE $1
        ORDER BY p.name ASC
      `, [`%${normalized}`]);

      return result.rows.map(mapPatientRow);
    }

    const result = await pool.query(`
      SELECT
        p.id,
        p.name,
        p.age,
        p.insurance,
        p.plan,
        p.doctor_id AS "doctorId",
        d.name AS doctor,
        d.specialty,
        p.phone,
        TO_CHAR(p.last_visit, 'YYYY-MM-DD') AS "lastVisit",
        p.status
      FROM ${TABLES.patients} p
      INNER JOIN ${TABLES.doctors} d ON d.id = p.doctor_id
      ORDER BY p.name ASC
    `);

    return result.rows.map(mapPatientRow);
  });
}

async function getPatientHistoryEntryById(client, patientId, entryId) {
  const result = await client.query(
    `
      SELECT
        h.id,
        h.patient_id AS "patientId",
        p.name AS "patientName",
        h.doctor_id AS "doctorId",
        d.name AS doctor,
        TO_CHAR(h.visit_at, 'YYYY-MM-DD HH24:MI') AS "visitAt",
        h.reason,
        h.notes,
        h.observations,
        h.requested_studies AS "requestedStudies",
        h.created_at AS "createdAt",
        h.updated_at AS "updatedAt"
      FROM ${TABLES.patientHistories} h
      INNER JOIN ${TABLES.patients} p ON p.id = h.patient_id
      LEFT JOIN ${TABLES.doctors} d ON d.id = h.doctor_id
      WHERE h.id = $1 AND h.patient_id = $2
    `,
    [entryId, patientId]
  );

  return result.rows[0] ? mapPatientHistoryRow(result.rows[0]) : null;
}

async function getPatientHistoryFromDatabase(patientId) {
  const normalizedPatientId = normalizeEntityId(patientId, "paciente");

  return runDatabaseRead(async () => {
    await ensureDatabaseReady();

    const pool = getPool();
    const patientExists = await pool.query(
      `
        SELECT 1
        FROM ${TABLES.patients}
        WHERE id = $1
      `,
      [normalizedPatientId]
    );

    if (patientExists.rowCount === 0) {
      throw createStoreError("El paciente ya no existe.", 404);
    }

    const result = await pool.query(
      `
        SELECT
          h.id,
          h.patient_id AS "patientId",
          p.name AS "patientName",
          h.doctor_id AS "doctorId",
          d.name AS doctor,
          TO_CHAR(h.visit_at, 'YYYY-MM-DD HH24:MI') AS "visitAt",
          h.reason,
          h.notes,
          h.observations,
          h.requested_studies AS "requestedStudies",
          h.created_at AS "createdAt",
          h.updated_at AS "updatedAt"
        FROM ${TABLES.patientHistories} h
        INNER JOIN ${TABLES.patients} p ON p.id = h.patient_id
        LEFT JOIN ${TABLES.doctors} d ON d.id = h.doctor_id
        WHERE h.patient_id = $1
        ORDER BY h.visit_at DESC, h.created_at DESC
      `,
      [normalizedPatientId]
    );

    return result.rows.map(mapPatientHistoryRow);
  });
}

export function isClinicDatabaseConfigured() {
  return Boolean(getConnectionString());
}

export async function getClinicDoctors() {
  if (!isClinicDatabaseConfigured()) {
    return getSeedDashboard().doctors;
  }

  return getDoctorsFromDatabase();
}

export async function getClinicPatients({ phone } = {}) {
  if (!isClinicDatabaseConfigured()) {
    const patients = getSeedDashboard().patients;

    if (phone) {
      const normalized = phone.replace(/\D/g, "");
      return patients.filter((p) => p.phone.replace(/\D/g, "").endsWith(normalized));
    }

    return patients;
  }

  return getPatientsFromDatabase({ phone });
}

export async function getClinicDashboardData() {
  const seedDashboard = getSeedDashboard();

  if (!isClinicDatabaseConfigured()) {
    return {
      ...seedDashboard,
      storage: buildStorageState({
        connected: false,
        error: DATABASE_UNAVAILABLE_MESSAGE
      })
    };
  }

  try {
    const [doctors, patients] = await Promise.all([getDoctorsFromDatabase(), getPatientsFromDatabase()]);

    return {
      ...seedDashboard,
      doctors,
      patients,
      storage: buildStorageState({ connected: true })
    };
  } catch (error) {
    logDatabaseFallback(error, "dashboard");

    return buildSeedDashboard(getStoreErrorMessage(error));
  }
}

export async function getClinicDoctorsRouteData() {
  const seedDashboard = getSeedDashboard();

  if (!isClinicDatabaseConfigured()) {
    return {
      doctors: seedDashboard.doctors,
      storage: buildStorageState({
        connected: false,
        error: DATABASE_UNAVAILABLE_MESSAGE
      })
    };
  }

  try {
    const doctors = await getDoctorsFromDatabase();

    return {
      doctors,
      storage: buildStorageState({ connected: true })
    };
  } catch (error) {
    logDatabaseFallback(error, "ruta de doctores");

    return {
      doctors: seedDashboard.doctors,
      storage: buildStorageState({
        connected: false,
        error: getStoreErrorMessage(error)
      })
    };
  }
}

export async function getClinicPatientsRouteData() {
  const seedDashboard = getSeedDashboard();

  if (!isClinicDatabaseConfigured()) {
    return {
      doctors: seedDashboard.doctors,
      patients: seedDashboard.patients,
      storage: buildStorageState({
        connected: false,
        error: DATABASE_UNAVAILABLE_MESSAGE
      })
    };
  }

  try {
    const [doctors, patients] = await Promise.all([getDoctorsFromDatabase(), getPatientsFromDatabase()]);

    return {
      doctors,
      patients,
      storage: buildStorageState({ connected: true })
    };
  } catch (error) {
    logDatabaseFallback(error, "ruta de pacientes");

    return {
      doctors: seedDashboard.doctors,
      patients: seedDashboard.patients,
      storage: buildStorageState({
        connected: false,
        error: getStoreErrorMessage(error)
      })
    };
  }
}

export async function createDoctor(input) {
  const doctor = normalizeDoctorInput(input);

  await ensureDatabaseReady();

  const pool = getPool();
  const client = await pool.connect();
  const doctorId = `doc-${randomUUID().slice(0, 8)}`;

  try {
    await client.query("BEGIN");

    await client.query(
      `
        INSERT INTO ${TABLES.doctors} (id, name, specialty, room, shift, plan, notes, insurances)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [doctorId, doctor.name, doctor.specialty, doctor.room, doctor.shift, doctor.plan, doctor.notes, doctor.insurances]
    );

    await client.query("COMMIT");
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }

  return {
    id: doctorId,
    ...doctor
  };
}

export async function updateDoctor(doctorId, input) {
  const normalizedDoctorId = normalizeEntityId(doctorId, "doctor");
  const doctor = normalizeDoctorInput(input);

  await ensureDatabaseReady();

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        UPDATE ${TABLES.doctors}
        SET name = $2, specialty = $3, room = $4, shift = $5, plan = $6, notes = $7, insurances = $8
        WHERE id = $1
        RETURNING id
      `,
      [normalizedDoctorId, doctor.name, doctor.specialty, doctor.room, doctor.shift, doctor.plan, doctor.notes, doctor.insurances]
    );

    if (result.rowCount === 0) {
      throw createStoreError("El doctor ya no existe.", 404);
    }

    await client.query("COMMIT");

    return {
      id: normalizedDoctorId,
      ...doctor
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteDoctor(doctorId) {
  const normalizedDoctorId = normalizeEntityId(doctorId, "doctor");

  await ensureDatabaseReady();

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const linkedPatientsResult = await client.query(
      `
        SELECT COUNT(*)::int AS count
        FROM ${TABLES.patients}
        WHERE doctor_id = $1
      `,
      [normalizedDoctorId]
    );
    const linkedPatientsCount = linkedPatientsResult.rows[0]?.count || 0;

    if (linkedPatientsCount > 0) {
      throw createStoreError(
        `No se puede eliminar el doctor porque tiene ${linkedPatientsCount} paciente${linkedPatientsCount === 1 ? "" : "s"} vinculado${linkedPatientsCount === 1 ? "" : "s"}.`,
        409
      );
    }

    const result = await client.query(
      `
        DELETE FROM ${TABLES.doctors}
        WHERE id = $1
        RETURNING id, name
      `,
      [normalizedDoctorId]
    );

    if (result.rowCount === 0) {
      throw createStoreError("El doctor ya no existe.", 404);
    }

    await client.query("COMMIT");

    return {
      id: result.rows[0].id,
      name: result.rows[0].name
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function createPatient(input) {
  const patient = normalizePatientInput(input);

  if (!patient.name) {
    throw createStoreError("El nombre del paciente es obligatorio.");
  }

  if (!patient.doctorId) {
    throw createStoreError("Selecciona un doctor para el paciente.");
  }

  if (!patient.phone) {
    throw createStoreError("El telefono es obligatorio.");
  }

  const today = new Date().toISOString().slice(0, 10);
  if (!patient.lastVisit) patient.lastVisit = today;
  if (!patient.status) patient.status = "active";

  await ensureDatabaseReady();

  const pool = getPool();
  const client = await pool.connect();
  const patientId = `pat-${randomUUID().slice(0, 8)}`;

  try {
    await client.query("BEGIN");

    const doctor = await getDoctorSummaryById(client, patient.doctorId);

    await client.query(`
        INSERT INTO ${TABLES.patients} (id, name, age, insurance, plan, doctor_id, phone, last_visit, next_appointment, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, '', $9)
      `, [
        patientId,
        patient.name,
        patient.age,
        patient.insurance,
        patient.plan,
        doctor.id,
        patient.phone,
        patient.lastVisit || null,
        patient.status
      ]);

    await client.query("COMMIT");

    return buildPatientResponse(patientId, patient, doctor);
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function updatePatient(patientId, input) {
  const normalizedPatientId = normalizeEntityId(patientId, "paciente");
  const patient = normalizePatientInput(input);

  await ensureDatabaseReady();

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const doctor = patient.doctorId ? await getDoctorSummaryById(client, patient.doctorId) : null;
    const result = await client.query(`
        UPDATE ${TABLES.patients}
        SET
          name = COALESCE($2, name),
          age = COALESCE($3, age),
          insurance = COALESCE(NULLIF($4, ''), insurance),
          plan = COALESCE(NULLIF($5, ''), plan),
          doctor_id = COALESCE(NULLIF($6, ''), doctor_id),
          phone = COALESCE(NULLIF($7, ''), phone),
          last_visit = COALESCE(NULLIF($8, '')::date, last_visit),
          next_appointment = CASE WHEN $10::TEXT IS NOT NULL THEN $10::TEXT ELSE next_appointment END,
          status = COALESCE(NULLIF($9, ''), status)
        WHERE id = $1
        RETURNING id
      `, [
        normalizedPatientId,
        patient.name || null,
        patient.age || null,
        patient.insurance,
        patient.plan,
        doctor?.id || '',
        patient.phone,
        patient.lastVisit,
        patient.status,
        patient.nextAppointment !== undefined ? patient.nextAppointment : null
      ]);

    if (result.rowCount === 0) {
      throw createStoreError("El paciente ya no existe.", 404);
    }

    const updated = await client.query(`
        SELECT p.id, p.name, p.age, p.insurance, p.plan, p.doctor_id, p.phone,
               TO_CHAR(p.last_visit, 'YYYY-MM-DD') AS "lastVisit",
               p.next_appointment AS "nextAppointment",
               p.status,
               d.name AS doctor, d.specialty
        FROM ${TABLES.patients} p
        LEFT JOIN ${TABLES.doctors} d ON d.id = p.doctor_id
        WHERE p.id = $1
      `, [normalizedPatientId]);

    await client.query("COMMIT");

    return mapPatientRow(updated.rows[0]);
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function deletePatient(patientId) {
  const normalizedPatientId = normalizeEntityId(patientId, "paciente");

  await ensureDatabaseReady();

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        DELETE FROM ${TABLES.patients}
        WHERE id = $1
        RETURNING id, name
      `,
      [normalizedPatientId]
    );

    if (result.rowCount === 0) {
      throw createStoreError("El paciente ya no existe.", 404);
    }

    await client.query("COMMIT");

    return {
      id: result.rows[0].id,
      name: result.rows[0].name
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function getPatientHistory(patientId) {
  if (!isClinicDatabaseConfigured()) {
    return [];
  }

  return getPatientHistoryFromDatabase(patientId);
}

export async function createPatientHistoryEntry(patientId, input) {
  const normalizedPatientId = normalizeEntityId(patientId, "paciente");
  const entry = normalizePatientHistoryInput(input);

  await ensureDatabaseReady();

  const pool = getPool();
  const client = await pool.connect();
  const historyId = `hst-${randomUUID().slice(0, 8)}`;

  try {
    await client.query("BEGIN");

    const patient = await getPatientSummaryById(client, normalizedPatientId);
    const doctor = entry.doctorId
      ? await getDoctorSummaryById(client, entry.doctorId)
      : patient.doctorId
        ? await getDoctorSummaryById(client, patient.doctorId)
        : null;

    await client.query(
      `
        INSERT INTO ${TABLES.patientHistories} (
          id,
          patient_id,
          doctor_id,
          visit_at,
          reason,
          notes,
          observations,
          requested_studies
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
      [
        historyId,
        patient.id,
        doctor?.id || null,
        entry.visitAt,
        entry.reason,
        entry.notes,
        entry.observations,
        entry.requestedStudies
      ]
    );

    const createdEntry = await getPatientHistoryEntryById(client, normalizedPatientId, historyId);

    await client.query("COMMIT");

    return createdEntry;
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function updatePatientHistoryEntry(patientId, entryId, input) {
  const normalizedPatientId = normalizeEntityId(patientId, "paciente");
  const normalizedEntryId = normalizeEntityId(entryId, "entrada de historial");
  const payload = input || {};
  const entry = normalizePatientHistoryInput(payload, { partial: true });
  const explicitDoctorId = Object.prototype.hasOwnProperty.call(payload, "doctorId");
  const explicitVisitAt = Object.prototype.hasOwnProperty.call(payload, "visitAt") || Object.prototype.hasOwnProperty.call(payload, "visitDate");
  const explicitReason = Object.prototype.hasOwnProperty.call(payload, "reason");
  const explicitNotes = Object.prototype.hasOwnProperty.call(payload, "notes");
  const explicitObservations = Object.prototype.hasOwnProperty.call(payload, "observations");
  const explicitRequestedStudies = Object.prototype.hasOwnProperty.call(payload, "requestedStudies");

  await ensureDatabaseReady();

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await getPatientSummaryById(client, normalizedPatientId);

    let resolvedDoctorId = null;

    if (explicitDoctorId && entry.doctorId) {
      const doctor = await getDoctorSummaryById(client, entry.doctorId);
      resolvedDoctorId = doctor.id;
    }

    const result = await client.query(
      `
        UPDATE ${TABLES.patientHistories}
        SET
          doctor_id = CASE WHEN $3 THEN $4::text ELSE doctor_id END,
          visit_at = CASE WHEN $5 THEN COALESCE(NULLIF($6, '')::timestamp, visit_at) ELSE visit_at END,
          reason = CASE WHEN $7 THEN $8 ELSE reason END,
          notes = CASE WHEN $9 THEN $10 ELSE notes END,
          observations = CASE WHEN $11 THEN $12 ELSE observations END,
          requested_studies = CASE WHEN $13 THEN $14::text[] ELSE requested_studies END,
          updated_at = NOW()
        WHERE id = $1 AND patient_id = $2
        RETURNING id
      `,
      [
        normalizedEntryId,
        normalizedPatientId,
        explicitDoctorId,
        explicitDoctorId ? resolvedDoctorId : null,
        explicitVisitAt,
        entry.visitAt,
        explicitReason,
        entry.reason,
        explicitNotes,
        entry.notes,
        explicitObservations,
        entry.observations,
        explicitRequestedStudies,
        entry.requestedStudies
      ]
    );

    if (result.rowCount === 0) {
      throw createStoreError("La entrada de historial ya no existe.", 404);
    }

    const updatedEntry = await getPatientHistoryEntryById(client, normalizedPatientId, normalizedEntryId);

    await client.query("COMMIT");

    return updatedEntry;
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function createTicket(input) {
  if (!isClinicDatabaseConfigured()) {
    throw createStoreError(DATABASE_UNAVAILABLE_MESSAGE, 503);
  }

  const patientId = sanitizeText(input?.patientId);
  const doctorId = sanitizeText(input?.doctorId);
  const phone = sanitizeText(input?.phone);
  const patientName = sanitizeText(input?.patientName);
  const appointmentDate = input?.appointmentDate
    ? normalizeDateValue(input.appointmentDate, "La fecha del turno")
    : todayDateString();

  if (!patientId) throw createStoreError("Falta el ID del paciente.");
  if (!doctorId) throw createStoreError("Falta el ID del doctor.");
  if (!phone) throw createStoreError("Falta el telefono del paciente.");
  if (!patientName) throw createStoreError("Falta el nombre del paciente.");

  await ensureDatabaseReady();

  const pool = getPool();
  const client = await pool.connect();
  const ticketId = `tkt-${randomUUID().slice(0, 8)}`;

  try {
    await client.query("BEGIN");

    const maxResult = await client.query(
      `SELECT COALESCE(MAX(ticket_number), 0) + 1 AS next_num
       FROM ${TABLES.tickets}
       WHERE doctor_id = $1 AND appointment_date = $2`,
      [doctorId, appointmentDate]
    );
    const ticketNumber = Number(maxResult.rows[0].next_num);

    await client.query(
      `INSERT INTO ${TABLES.tickets}
       (id, patient_id, doctor_id, appointment_date, ticket_number, phone, patient_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ticketId, patientId, doctorId, appointmentDate, ticketNumber, phone, patientName]
    );

    await client.query("COMMIT");

    return {
      id: ticketId,
      patientId,
      patientName,
      doctorId,
      appointmentDate,
      ticketNumber,
      phone,
      status: "waiting",
      createdAt: new Date().toISOString(),
      calledAt: null
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function getTicketsByDoctor(doctorId, date) {
  if (!isClinicDatabaseConfigured()) {
    return [];
  }

  const normalizedDoctorId = normalizeEntityId(doctorId, "doctor");
  const normalizedDate = sanitizeText(date) || todayDateString();

  return runDatabaseRead(async () => {
    await ensureDatabaseReady();

    const pool = getPool();
    const result = await pool.query(
      `SELECT t.*, d.name AS doctor_name
       FROM ${TABLES.tickets} t
       LEFT JOIN ${TABLES.doctors} d ON d.id = t.doctor_id
       WHERE t.doctor_id = $1 AND t.appointment_date = $2
       ORDER BY t.ticket_number ASC`,
      [normalizedDoctorId, normalizedDate]
    );

    return result.rows.map(mapTicketRow);
  });
}

export async function getTicketsForDate(date) {
  if (!isClinicDatabaseConfigured()) {
    return [];
  }

  const normalizedDate = sanitizeText(date) || todayDateString();

  return runDatabaseRead(async () => {
    await ensureDatabaseReady();

    const pool = getPool();
    const result = await pool.query(
      `SELECT t.*, d.name AS doctor_name
       FROM ${TABLES.tickets} t
       LEFT JOIN ${TABLES.doctors} d ON d.id = t.doctor_id
       WHERE t.appointment_date = $1
       ORDER BY t.doctor_id, t.ticket_number ASC`,
      [normalizedDate]
    );

    return result.rows.map(mapTicketRow);
  });
}

export async function callNextTicket(doctorId, date) {
  if (!isClinicDatabaseConfigured()) {
    throw createStoreError(DATABASE_UNAVAILABLE_MESSAGE, 503);
  }

  const normalizedDoctorId = normalizeEntityId(doctorId, "doctor");
  const normalizedDate = sanitizeText(date) || todayDateString();

  await ensureDatabaseReady();

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT t.*, d.name AS doctor_name
       FROM ${TABLES.tickets} t
       LEFT JOIN ${TABLES.doctors} d ON d.id = t.doctor_id
       WHERE t.doctor_id = $1 AND t.appointment_date = $2 AND t.status = 'waiting'
       ORDER BY t.ticket_number ASC
       LIMIT 1
       FOR UPDATE`,
      [normalizedDoctorId, normalizedDate]
    );

    if (result.rows.length === 0) {
      throw createStoreError("No hay mas pacientes en espera.", 404);
    }

    const ticket = result.rows[0];

    await client.query(
      `UPDATE ${TABLES.tickets} SET status = 'called', called_at = NOW() WHERE id = $1`,
      [ticket.id]
    );

    await client.query("COMMIT");

    return mapTicketRow({ ...ticket, status: "called", called_at: new Date() });
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function deletePatientHistoryEntry(patientId, entryId) {
  const normalizedPatientId = normalizeEntityId(patientId, "paciente");
  const normalizedEntryId = normalizeEntityId(entryId, "entrada de historial");

  await ensureDatabaseReady();

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        DELETE FROM ${TABLES.patientHistories}
        WHERE id = $1 AND patient_id = $2
        RETURNING id, patient_id AS "patientId"
      `,
      [normalizedEntryId, normalizedPatientId]
    );

    if (result.rowCount === 0) {
      throw createStoreError("La entrada de historial ya no existe.", 404);
    }

    await client.query("COMMIT");

    return {
      id: result.rows[0].id,
      patientId: result.rows[0].patientId
    };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}
