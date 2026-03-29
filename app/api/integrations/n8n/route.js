// Aca publico el estado tecnico de n8n para la UI.

import { NextResponse } from "next/server";

import { getN8nStatus } from "@/lib/n8n";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    integration: getN8nStatus()
  });
}
