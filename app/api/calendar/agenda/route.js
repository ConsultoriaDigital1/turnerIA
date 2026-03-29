// Aca expongo la agenda rapida que consume el panel de calendario.

import { NextResponse } from "next/server";

import { getClinicViewModel } from "@/lib/clinic-view-model";
import { getGoogleCalendarAgenda } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const baseData = await getClinicViewModel();
  const agenda = await getGoogleCalendarAgenda(baseData.calendar);

  return NextResponse.json(
    {
      calendar: agenda.calendar,
      meta: agenda.meta
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0"
      }
    }
  );
}
