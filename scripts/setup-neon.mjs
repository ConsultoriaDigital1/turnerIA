import pg from "pg";
const { Client } = pg;
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// Cargar variables de entorno manualmente desde .env
function loadEnv() {
  const envPath = path.join(ROOT_DIR, ".env");
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, "utf-8");
    envConfig.split("\n").forEach((line) => {
      const [key, ...value] = line.split("=");
      if (key && value) {
        process.env[key.trim()] = value.join("=").trim();
      }
    });
  }
}

async function runMigration() {
  loadEnv();

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    console.log("Conectando a Neon PostgreSQL...");
    await client.connect();
    console.log("Conexión exitosa.");

    // 1. Crear tabla de Doctores
    console.log("Creando tabla de doctores...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS doctors (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        specialty VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Crear tabla de Pacientes
    console.log("Creando tabla de pacientes...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        dni VARCHAR(50) UNIQUE,
        phone VARCHAR(50),
        doctor_id INTEGER REFERENCES doctors(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Insertar datos de prueba
    console.log("Insertando datos de prueba...");
    
    // Insertar un doctor si no existe
    const doctorRes = await client.query(`
      INSERT INTO doctors (name, specialty, email)
      VALUES ('Dr. Gonzalo', 'Cardiología', 'gonzalo@consultoriadigital.io')
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
      RETURNING id;
    `);
    const doctorId = doctorRes.rows[0].id;

    // Insertar pacientes de prueba
    await client.query(`
      INSERT INTO patients (name, dni, phone, doctor_id)
      VALUES 
        ('Juan Pérez', '12345678', '1122334455', $1),
        ('María García', '87654321', '5544332211', $1)
      ON CONFLICT (dni) DO NOTHING;
    `, [doctorId]);

    console.log("Migración completada con éxito.");
    
    // Verificar tablas
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    console.log("Tablas creadas en Neon:");
    tables.rows.forEach(row => console.log(`- ${row.table_name}`));

  } catch (err) {
    console.error("Error durante la migración:", err);
  } finally {
    await client.end();
  }
}

runMigration();
