// Aca resuelvo el login, valido credenciales y dejo la cookie de sesion.

import { NextResponse } from "next/server";

import {
  getAuthCookieName,
  getAuthMaxAgeSeconds,
  isAuthConfigured,
  matchesLoginCredentials,
  signSessionToken
} from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    if (!isAuthConfigured()) {
      return NextResponse.json(
        {
          error: "La autenticacion no esta configurada en variables de entorno."
        },
        { status: 503 }
      );
    }

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

    const email = typeof payload?.email === "string" ? payload.email.trim() : "";
    const password = typeof payload?.password === "string" ? payload.password : "";

    if (!email || !password) {
      return NextResponse.json(
        {
          error: "Email y password son obligatorios."
        },
        { status: 400 }
      );
    }

    if (!matchesLoginCredentials(email, password)) {
      return NextResponse.json(
        {
          error: "Credenciales invalidas."
        },
        { status: 401 }
      );
    }

    const token = await signSessionToken({ email });
    const response = NextResponse.json({
      authenticated: true,
      user: {
        email
      }
    });

    response.cookies.set({
      name: getAuthCookieName(),
      value: token,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: getAuthMaxAgeSeconds()
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "No se pudo iniciar sesion."
      },
      { status: 500 }
    );
  }
}