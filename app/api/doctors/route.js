import { NextResponse } from "next/server";

import { createDoctor, getClinicDashboardData } from "@/lib/clinic-store";

export const dynamic = "force-dynamic";

function getErrorStatus(error) {
  return typeof error?.status === "number" ? error.status : 500;
}

export async function GET() {
  const data = await getClinicDashboardData();

  return NextResponse.json({
    doctors: data.doctors,
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
    const doctor = await createDoctor(payload);

    return NextResponse.json(
      {
        doctor,
        message: "Doctor creado y guardado en Neon."
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo crear el doctor."
      },
      { status: getErrorStatus(error) }
    );
  }
}