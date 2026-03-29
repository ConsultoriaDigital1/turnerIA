// Aca expongo la agenda rapida que consume el panel de calendario.

import { NextResponse } from "next/server";

import { getClinicViewModel } from "@/lib/clinic-view-model";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const data = await getClinicViewModel({ syncGoogleAgenda: true });

  return NextResponse.json(
    {
      calendar: data.calendar,
      meta: data.calendarMeta
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    }
  );
}