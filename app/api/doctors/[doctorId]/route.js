import { NextResponse } from "next/server";

import { deleteDoctor, updateDoctor } from "@/lib/clinic-store";

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

async function getDoctorId(context) {
  const params = await context.params;

  return params?.doctorId;
}

export async function PUT(request, context) {
  const doctorId = await getDoctorId(context);
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
    const doctor = await updateDoctor(doctorId, payload);

    return NextResponse.json({
      doctor,
      message: "Doctor actualizado y guardado en Neon."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo actualizar el doctor."
      },
      { status: getErrorStatus(error) }
    );
  }
}

export async function PATCH(request, context) {
  return PUT(request, context);
}

export async function DELETE(_request, context) {
  const doctorId = await getDoctorId(context);

  try {
    const doctor = await deleteDoctor(doctorId);

    return NextResponse.json({
      doctor,
      message: "Doctor eliminado."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo eliminar el doctor."
      },
      { status: getErrorStatus(error) }
    );
  }
}
