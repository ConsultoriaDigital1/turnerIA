// Aca devuelvo el view model agregado del dashboard para la app.

import { NextResponse } from "next/server";

import { getClinicViewModel } from "@/lib/clinic-view-model";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ...(await getClinicViewModel({ syncGoogleAgenda: true })),
    generatedAt: new Date().toISOString()
  });
}