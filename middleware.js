// Aca protejo las rutas privadas y dejo pasar solo login y endpoints publicos.

import { NextResponse } from "next/server";

import { getAuthCookieName, verifyApiKey, verifySessionToken } from "@/lib/auth";

// Aca marco las rutas publicas de frontend que no necesitan sesion.
function isPublicPath(pathname) {
  return pathname === "/login" || pathname === "/favicon.ico";
}

// Aca separo los endpoints publicos para no bloquear login y logout.
function isPublicApiPath(pathname) {
  return pathname === "/api/auth/login" || pathname === "/api/auth/logout";
}

// Aca valido la sesion en cada request privada y redirijo a login si falta auth.
export async function middleware(request) {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname) || isPublicApiPath(pathname)) {
    if (pathname === "/login") {
      const token = request.cookies.get(getAuthCookieName())?.value;
      const session = await verifySessionToken(token);

      if (session) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }

    return NextResponse.next();
  }

  // Aca permito el acceso a integraciones externas como n8n usando el header x-api-key.
  // La clave se configura en la variable de entorno API_SECRET_KEY.
  const apiKey = request.headers.get("x-api-key");

  if (apiKey && verifyApiKey(apiKey)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(getAuthCookieName())?.value;
  const session = await verifySessionToken(token);

  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        error: "No autenticado."
      },
      { status: 401 }
    );
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"]
};
