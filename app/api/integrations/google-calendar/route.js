// Aca publico el estado tecnico de Google Calendar para la UI.

import { NextResponse } from "next/server";

import { getGoogleCalendarStatus } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    googleCalendar: getGoogleCalendarStatus()
  });
}
