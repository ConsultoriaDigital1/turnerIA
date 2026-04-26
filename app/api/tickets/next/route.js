import { NextResponse } from "next/server";

import { callNextTicket } from "@/lib/clinic-store";

export const dynamic = "force-dynamic";

function getErrorStatus(error) {
  return typeof error?.status === "number" ? error.status : 500;
}

async function notifyViaWebhook(ticket) {
  const webhookUrl = process.env.N8N_TICKET_WEBHOOK_URL;

  if (!webhookUrl) {
    return { delivered: false, reason: "N8N_TICKET_WEBHOOK_URL no configurado." };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Turneria-Source": "tickets"
      },
      body: JSON.stringify({
        phone: ticket.phone,
        patientName: ticket.patientName,
        ticketNumber: ticket.ticketNumber,
        doctorName: ticket.doctorName
      }),
      signal: controller.signal,
      cache: "no-store"
    });

    clearTimeout(timer);

    return { delivered: response.ok, status: response.status };
  } catch {
    return { delivered: false, reason: "No se pudo conectar con el webhook." };
  }
}

export async function POST(request) {
  let payload;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "No se pudo leer el cuerpo JSON." }, { status: 400 });
  }

  const { doctorId, date } = payload || {};

  if (!doctorId) {
    return NextResponse.json({ error: "Falta el doctorId." }, { status: 400 });
  }

  try {
    const ticket = await callNextTicket(doctorId, date);
    const notification = await notifyViaWebhook(ticket);

    return NextResponse.json({ ticket, notification });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo llamar al siguiente paciente." },
      { status: getErrorStatus(error) }
    );
  }
}
