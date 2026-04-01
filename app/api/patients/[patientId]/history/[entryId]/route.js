import { NextResponse } from "next/server";

import { deletePatientHistoryEntry, updatePatientHistoryEntry } from "@/lib/clinic-store";

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

async function getRouteParams(context) {
  const params = await context.params;

  return {
    patientId: params?.patientId,
    entryId: params?.entryId
  };
}

export async function PUT(request, context) {
  const { patientId, entryId } = await getRouteParams(context);
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
    const entry = await updatePatientHistoryEntry(patientId, entryId, payload);

    return NextResponse.json({
      entry,
      message: "Entrada de historial actualizada y guardada en Neon."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo actualizar la entrada de historial."
      },
      { status: getErrorStatus(error) }
    );
  }
}

export async function PATCH(request, context) {
  return PUT(request, context);
}

export async function DELETE(_request, context) {
  const { patientId, entryId } = await getRouteParams(context);

  try {
    const entry = await deletePatientHistoryEntry(patientId, entryId);

    return NextResponse.json({
      entry,
      message: "Entrada de historial eliminada."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo eliminar la entrada de historial."
      },
      { status: getErrorStatus(error) }
    );
  }
}
