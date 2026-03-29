// Aca recibo pedidos de alta y los delego a Google Calendar.

import { NextResponse } from "next/server";

import { createGoogleCalendarEvent } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

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
    const event = await createGoogleCalendarEvent(payload);

    return NextResponse.json({
      event,
      message: "Evento creado en Google Calendar."
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo crear el evento."
      },
      { status: 400 }
    );
  }
}
