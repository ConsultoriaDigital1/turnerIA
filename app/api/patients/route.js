import { NextResponse } from "next/server";

import { createPatient, getClinicDashboardData, getClinicPatients } from "@/lib/clinic-store";

export const dynamic = "force-dynamic";

function getErrorStatus(error) {
  return typeof error?.status === "number" ? error.status : 500;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const phone = searchParams.get("phone");

  // Si viene el parametro ?phone= busco solo ese paciente, util para n8n.
  // Busca por los digitos del final del telefono, tolera cualquier formato.
  if (phone) {
    const patients = await getClinicPatients({ phone });
    return NextResponse.json({ patients });
  }

  const data = await getClinicDashboardData();

  return NextResponse.json({
    patients: data.patients,
    storage: data.storage
  });
}

export async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      {
        error: "No se pudo leer el cuerpo JSON."
      },
      { status: 400 }
    );
  }

  try {
    const patient = await createPatient(payload);

    return NextResponse.json(
      {
        patient,
        message: "Paciente creado y guardado en Neon."
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo crear el paciente."
      },
      { status: getErrorStatus(error) }
    );
  }
}