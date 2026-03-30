import { NextResponse } from "next/server";

import { deletePatient, updatePatient } from "@/lib/clinic-store";

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

export async function PUT(request, context) {
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
    const patient = await updatePatient(patientId, payload);

    return NextResponse.json({
      patient,
      message: "Paciente actualizado y guardado en Neon."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo actualizar el paciente."
      },
      { status: getErrorStatus(error) }
    );
  }
}

export async function PATCH(request, context) {
  return PUT(request, context);
}

export async function DELETE(_request, context) {
  const patientId = await getPatientId(context);

  try {
    const patient = await deletePatient(patientId);

    return NextResponse.json({
      patient,
      message: "Paciente eliminado."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo eliminar el paciente."
      },
      { status: getErrorStatus(error) }
    );
  }
}
