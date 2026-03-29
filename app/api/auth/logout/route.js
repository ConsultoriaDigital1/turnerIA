// Aca cierro la sesion borrando la cookie JWT del navegador.

import { NextResponse } from "next/server";

import { getAuthCookieName } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({
    authenticated: false
  });

  response.cookies.set({
    name: getAuthCookieName(),
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });

  return response;
}
