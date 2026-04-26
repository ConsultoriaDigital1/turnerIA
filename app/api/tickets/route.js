import { NextResponse } from "next/server";

import { createTicket, getTicketsByDoctor, getTicketsForDate } from "@/lib/clinic-store";

export const dynamic = "force-dynamic";

function getErrorStatus(error) {
  return typeof error?.status === "number" ? error.status : 500;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const doctorId = searchParams.get("doctorId");
  const date = searchParams.get("date") || undefined;

  try {
    if (doctorId) {
      const tickets = await getTicketsByDoctor(doctorId, date);
      const waiting = tickets.filter((t) => t.status === "waiting").length;
      const called = tickets.filter((t) => t.status === "called").length;
      const done = tickets.filter((t) => t.status === "done").length;

      return NextResponse.json({ tickets, summary: { waiting, called, done } });
    }

    const tickets = await getTicketsForDate(date);

    return NextResponse.json({ tickets });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudieron obtener los tickets." },
      { status: getErrorStatus(error) }
    );
  }
}

export async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el cuerpo JSON." }, { status: 400 });
  }

  try {
    const ticket = await createTicket(payload);

    return NextResponse.json({ ticket, message: "Ticket creado." }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear el ticket." },
      { status: getErrorStatus(error) }
    );
  }
}
