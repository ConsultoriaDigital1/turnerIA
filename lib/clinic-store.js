import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { CLINIC_DASHBOARD } from "@/lib/clinic-data";

const PATIENT_STATUS_VALUES = new Set(["active", "follow_up", "waiting_docs", "priority"]);
const DATABASE_UNAVAILABLE_MESSAGE = "DATABASE_URL o POSTGRES_URL no esta configurado. Las altas quedan deshabilitadas.";
const TABLES = {
  doctors: "turneria_doctors",
  doctorInsurances: "turneria_doctor_insurances",
  patients: "turneria_patients"
};

function sanitizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cloneSeedDashboard() {
  return JSON.parse(JSON.stringify(CLINIC_DASHBOARD));
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
  const seedDashboard = cloneSeedDashboard();

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

function getPool() {
  const connectionString = getConnectionString();

  if (!connectionString) {
    return null;
  }

  const globalState = getGlobalState();

  if (!globalState.pool) {
    globalState.pool = new Pool({
      connectionString,
      max: 5,
      idleTimeoutMillis: 30000,
      ssl: {
        rejectUnauthorized: false
      }
    });
  }

  return globalState.pool;
}

function normalizeInsuranceList(value) {
  const sourceValues = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);

  return [...new Set(sourceValues.map(sanitizeText).filter(Boolean))];
}

function normalizeDateValue(value, fieldLabel) {
  const normalized = sanitizeText(value);

  if (!normalized) {
    throw createStoreError(`${fieldLabel} es obligatoria.`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw createStoreError(`${fieldLabel} debe tener formato YYYY-MM-DD.`);
  }

  return normalized;
}

function normalizeNextAppointment(value) {
  const normalized = sanitizeText(value).replace("T", " ");

  if (!normalized) {
    throw createStoreError("El proximo turno es obligatorio.");
  }

  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(normalized)) {
    throw createStoreError("El proximo turno debe tener formato YYYY-MM-DD HH:MM.");
  }

  return normalized;
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

  if (insurances.length === 0) {
    throw createStoreError("Carga al menos una obra social para el doctor.");
  }

  return {
    name,
    specialty,
    room,
    shift,
    notes,
    insurances
  };
}

function normalizePatientInput(input) {
  const name = sanitizeText(input?.name);
  const insurance = sanitizeText(input?.insurance);
  const doctorId = sanitizeText(input?.doctorId);
  const phone = sanitizeText(input?.phone);
  const lastVisit = normalizeDateValue(input?.lastVisit, "La ultima visita");
  const nextAppointment = normalizeNextAppointment(input?.nextAppointment);
  const status = sanitizeText(input?.status) || "active";
  const age = normalizeAge(input?.age);

  if (!name) {
    throw createStoreError("El nombre del paciente es obligatorio.");
  }

  if (!insurance) {
    throw createStoreError("La obra social es obligatoria.");
  }

  if (!doctorId) {
    throw createStoreError("Selecciona un doctor para el paciente.");
  }

  if (!phone) {
    throw createStoreError("El telefono es obligatorio.");
  }

  if (!PATIENT_STATUS_VALUES.has(status)) {
    throw createStoreError("El estado del paciente no es valido.");
  }

  return {
    name,
    age,
    insurance,
    doctorId,
    phone,
    lastVisit,
    nextAppointment,
    status
  };
}

function mapDoctorRow(row) {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    room: row.room,
    shift: row.shift,
    notes: row.notes || "",
    insurances: Array.isArray(row.insurances) ? row.insurances.filter(Boolean) : []
  };
}

function mapPatientRow(row) {
  return {
    id: row.id,
    name: row.name,
    age: Number(row.age),
    insurance: row.insurance,
    doctor: row.doctor,
    specialty: row.specialty,
    phone: row.phone,
    lastVisit: row.lastVisit || "",
    nextAppointment: row.nextAppointment || "",
    status: row.status
  };
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${TABLES.doctors} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        specialty TEXT NOT NULL,
        room TEXT NOT NULL,
        shift TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${TABLES.doctorInsurances} (
        doctor_id TEXT NOT NULL REFERENCES ${TABLES.doctors}(id) ON DELETE CASCADE,
        insurance TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (doctor_id, insurance)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ${TABLES.patients} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        age INTEGER NOT NULL,
        insurance TEXT NOT NULL,
        doctor_id TEXT NOT NULL REFERENCES ${TABLES.doctors}(id) ON DELETE RESTRICT,
        phone TEXT NOT NULL,
        last_visit DATE NOT NULL,
        next_appointment TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`CREATE INDEX IF NOT EXISTS turneria_patients_doctor_id_idx ON ${TABLES.patients} (doctor_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS turneria_patients_name_idx ON ${TABLES.patients} (name)`);

    const doctorCountResult = await client.query(`SELECT COUNT(*)::int AS count FROM ${TABLES.doctors}`);
    const patientCountResult = await client.query(`SELECT COUNT(*)::int AS count FROM ${TABLES.patients}`);
    const doctorCount = doctorCountResult.rows[0]?.count || 0;
    const patientCount = patientCountResult.rows[0]?.count || 0;

    if (doctorCount === 0 && patientCount === 0) {
      await seedDatabase(client);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function seedDatabase(client) {
  const seedDashboard = cloneSeedDashboard();
  const doctorIdByName = new Map();

  for (const doctor of seedDashboard.doctors) {
    await client.query(
      `
        INSERT INTO ${TABLES.doctors} (id, name, specialty, room, shift, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id) DO NOTHING
      `,
      [doctor.id, doctor.name, doctor.specialty, doctor.room, doctor.shift, doctor.notes || ""]
    );

    doctorIdByName.set(doctor.name, doctor.id);

    for (const insurance of normalizeInsuranceList(doctor.insurances)) {
      await client.query(
        `
          INSERT INTO ${TABLES.doctorInsurances} (doctor_id, insurance)
          VALUES ($1, $2)
          ON CONFLICT (doctor_id, insurance) DO NOTHING
        `,
        [doctor.id, insurance]
      );
    }
  }

  for (const patient of seedDashboard.patients) {
    const doctorId = doctorIdByName.get(patient.doctor);

    if (!doctorId) {
      continue;
    }

    await client.query(
      `
        INSERT INTO ${TABLES.patients} (id, name, age, insurance, doctor_id, phone, last_visit, next_appointment, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO NOTHING
      `,
      [
        patient.id,
        patient.name,
        patient.age,
        patient.insurance,
        doctorId,
        patient.phone,
        patient.lastVisit,
        patient.nextAppointment,
        patient.status
      ]
    );
  }
}

async function getDoctorsFromDatabase() {
  await ensureDatabaseReady();

  const pool = getPool();
  const result = await pool.query(`
    SELECT
      d.id,
      d.name,
      d.specialty,
      d.room,
      d.shift,
      d.notes,
      COALESCE(
        ARRAY_AGG(di.insurance ORDER BY di.insurance) FILTER (WHERE di.insurance IS NOT NULL),
        '{}'::TEXT[]
      ) AS insurances
    FROM ${TABLES.doctors} d
    LEFT JOIN ${TABLES.doctorInsurances} di ON di.doctor_id = d.id
    GROUP BY d.id, d.name, d.specialty, d.room, d.shift, d.notes
    ORDER BY d.name ASC
  `);

  return result.rows.map(mapDoctorRow);
}

async function getPatientsFromDatabase() {
  await ensureDatabaseReady();

  const pool = getPool();
  const result = await pool.query(`
    SELECT
      p.id,
      p.name,
      p.age,
      p.insurance,
      d.name AS doctor,
      d.specialty,
      p.phone,
      TO_CHAR(p.last_visit, 'YYYY-MM-DD') AS "lastVisit",
      p.next_appointment AS "nextAppointment",
      p.status
    FROM ${TABLES.patients} p
    INNER JOIN ${TABLES.doctors} d ON d.id = p.doctor_id
    ORDER BY p.name ASC
  `);

  return result.rows.map(mapPatientRow);
}

export function isClinicDatabaseConfigured() {
  return Boolean(getConnectionString());
}

export async function getClinicDoctors() {
  if (!isClinicDatabaseConfigured()) {
    return cloneSeedDashboard().doctors;
  }

  return getDoctorsFromDatabase();
}

export async function getClinicPatients() {
  if (!isClinicDatabaseConfigured()) {
    return cloneSeedDashboard().patients;
  }

  return getPatientsFromDatabase();
}

export async function getClinicDashboardData() {
  const seedDashboard = cloneSeedDashboard();

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
    console.error("No se pudo leer la base de Neon, vuelvo a datos semilla.", error);

    return buildSeedDashboard(error instanceof Error ? error.message : "No se pudo leer la base de datos.");
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
        INSERT INTO ${TABLES.doctors} (id, name, specialty, room, shift, notes)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
      [doctorId, doctor.name, doctor.specialty, doctor.room, doctor.shift, doctor.notes]
    );

    for (const insurance of doctor.insurances) {
      await client.query(
        `
          INSERT INTO ${TABLES.doctorInsurances} (doctor_id, insurance)
          VALUES ($1, $2)
          ON CONFLICT (doctor_id, insurance) DO NOTHING
        `,
        [doctorId, insurance]
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return {
    id: doctorId,
    ...doctor
  };
}

export async function createPatient(input) {
  const patient = normalizePatientInput(input);

  await ensureDatabaseReady();

  const pool = getPool();
  const client = await pool.connect();
  const patientId = `pat-${randomUUID().slice(0, 8)}`;

  try {
    await client.query("BEGIN");

    const doctorResult = await client.query(
      `
        SELECT id, name, specialty
        FROM ${TABLES.doctors}
        WHERE id = $1
      `,
      [patient.doctorId]
    );

    const doctor = doctorResult.rows[0];

    if (!doctor) {
      throw createStoreError("El doctor seleccionado ya no existe en la base.");
    }

    await client.query(
      `
        INSERT INTO ${TABLES.patients} (id, name, age, insurance, doctor_id, phone, last_visit, next_appointment, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
      [
        patientId,
        patient.name,
        patient.age,
        patient.insurance,
        doctor.id,
        patient.phone,
        patient.lastVisit,
        patient.nextAppointment,
        patient.status
      ]
    );

    await client.query("COMMIT");

    return {
      id: patientId,
      name: patient.name,
      age: patient.age,
      insurance: patient.insurance,
      doctor: doctor.name,
      specialty: doctor.specialty,
      phone: patient.phone,
      lastVisit: patient.lastVisit,
      nextAppointment: patient.nextAppointment,
      status: patient.status
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}