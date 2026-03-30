// Aca dejo toda la logica chica de autenticacion para no repartir auth por todos lados.

import { SignJWT, jwtVerify } from "jose";

const DEFAULT_COOKIE_NAME = "turneria_session";
const DEFAULT_EXPIRES_IN = "12h";
const JWT_TIME_PERIOD_PATTERN = /^(\d+)([smhd])$/;

function sanitize(value) {
  return typeof value === "string" ? value.trim() : "";
}

function getSecretKey(secret) {
  return new TextEncoder().encode(secret);
}

function getValidJwtExpiresIn(value) {
  const normalized = sanitize(value).toLowerCase();

  if (!normalized) {
    return DEFAULT_EXPIRES_IN;
  }

  return JWT_TIME_PERIOD_PATTERN.test(normalized) ? normalized : DEFAULT_EXPIRES_IN;
}

// Aca junto toda la configuracion de auth en un solo objeto para no leer process.env por todos lados.
export function getAuthConfig() {
  return {
    loginEmail: sanitize(process.env.AUTH_LOGIN_EMAIL),
    loginPassword: sanitize(process.env.AUTH_LOGIN_PASSWORD),
    jwtSecret: sanitize(process.env.AUTH_JWT_SECRET),
    jwtExpiresIn: getValidJwtExpiresIn(process.env.AUTH_JWT_EXPIRES_IN),
    cookieName: sanitize(process.env.AUTH_COOKIE_NAME) || DEFAULT_COOKIE_NAME
  };
}

export function isAuthConfigured() {
  const config = getAuthConfig();

  return Boolean(config.loginEmail && config.loginPassword && config.jwtSecret);
}

export function getAuthCookieName() {
  return getAuthConfig().cookieName;
}

// Con esto traduzco expiraciones tipo 12h o 30m a segundos para la cookie.
export function getAuthMaxAgeSeconds() {
  const { jwtExpiresIn } = getAuthConfig();
  const match = jwtExpiresIn.match(JWT_TIME_PERIOD_PATTERN);

  if (!match) {
    return 60 * 60 * 12;
  }

  const value = Number(match[1]);
  const unit = match[2];

  if (!Number.isFinite(value) || value <= 0) {
    return 60 * 60 * 12;
  }

  if (unit === "s") {
    return value;
  }

  if (unit === "m") {
    return value * 60;
  }

  if (unit === "h") {
    return value * 60 * 60;
  }

  return value * 60 * 60 * 24;
}

// Aca firmo una sesion minima con email para no arrastrar datos de mas.
export async function signSessionToken({ email }) {
  const config = getAuthConfig();

  if (!config.jwtSecret) {
    throw new Error("AUTH_JWT_SECRET no esta configurado.");
  }

  return new SignJWT({
    email,
    type: "session"
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(config.jwtExpiresIn)
    .sign(getSecretKey(config.jwtSecret));
}

// Aca valido el JWT y devuelvo un payload chico para middleware y UI.
export async function verifySessionToken(token) {
  const config = getAuthConfig();

  if (!token || !config.jwtSecret) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecretKey(config.jwtSecret));

    if (payload.type !== "session" || typeof payload.email !== "string") {
      return null;
    }

    return {
      email: payload.email
    };
  } catch {
    return null;
  }
}

export function matchesLoginCredentials(email, password) {
  const config = getAuthConfig();

  return email === config.loginEmail && password === config.loginPassword;
}

// Aca valido la API key para integraciones externas como n8n.
export function verifyApiKey(key) {
  const configured = sanitize(process.env.API_SECRET_KEY);

  if (!configured || !key) {
    return false;
  }

  return key === configured;
}