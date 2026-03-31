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

// Rate limiting en memoria. En Vercel es por instancia, no global, pero igual frena abusos basicos.
const rateLimitStore = new Map();

function checkRateLimit(key, limit, windowMs) {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

function getClientIp(request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
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

    // Anti brute-force: max 10 intentos de login por IP por minuto.
    if (pathname === "/api/auth/login") {
      const ip = getClientIp(request);
      if (!checkRateLimit(`login:${ip}`, 10, 60_000)) {
        return NextResponse.json({ error: "Demasiados intentos. Esperá un momento." }, { status: 429 });
      }
    }

    return NextResponse.next();
  }

  // Aca permito el acceso a integraciones externas como n8n usando el header x-api-key.
  // La clave se configura en la variable de entorno API_SECRET_KEY.
  const apiKey = request.headers.get("x-api-key");

  if (apiKey && verifyApiKey(apiKey)) {
    // Max 60 llamadas por minuto por API key (n8n manda ~3-5 por mensaje de WhatsApp).
    if (!checkRateLimit(`apikey:${apiKey}`, 60, 60_000)) {
      return NextResponse.json({ error: "Rate limit excedido." }, { status: 429 });
    }
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
