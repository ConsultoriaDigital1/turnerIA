import { NextResponse } from "next/server";

import { createPatientHistoryEntry, getPatientHistory } from "@/lib/clinic-store";

export const dynamic = "force-dynamic";

function getErrorStatus(error) {
  return typeof error?.status === "number" ? error.status : 500;
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function getPatientId(context) {
  const params = await context.params;

  return params?.patientId;
}

export async function GET(_request, context) {
  const patientId = await getPatientId(context);

  try {
    const history = await getPatientHistory(patientId);

    return NextResponse.json({ history });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo leer el historial del paciente."
      },
      { status: getErrorStatus(error) }
    );
  }
}

export async function POST(request, context) {
  const patientId = await getPatientId(context);
  const payload = await readJsonBody(request);

  if (!payload) {
    return NextResponse.json(
      {
        error: "No se pudo leer el cuerpo JSON."
      },
      { status: 400 }
    );
  }

  try {
    const entry = await createPatientHistoryEntry(patientId, payload);

    return NextResponse.json(
      {
        entry,
        message: "Entrada de historial creada y guardada en Neon."
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo crear la entrada de historial."
      },
      { status: getErrorStatus(error) }
    );
  }
}
