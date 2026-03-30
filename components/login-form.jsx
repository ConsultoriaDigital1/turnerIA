"use client";

// Aca manejo el formulario de acceso y el redireccionamiento despues del login.

import { useSearchParams, useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm({ authConfigured, defaultEmail }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState(defaultEmail || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Aca leo respuestas JSON sin romperme si el backend devuelve HTML o cuerpo vacio.
  async function readJsonSafely(response) {
    const rawBody = await response.text();

    if (!rawBody) {
      return null;
    }

    try {
      return JSON.parse(rawBody);
    } catch {
      return {
        error: rawBody
      };
    }
  }

  // Aca mando el login, manejo errores y redirijo al destino pedido o a la home.
  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password
        })
      });
      const payload = await readJsonSafely(response);

      if (!response.ok) {
        throw new Error(payload?.error || `No se pudo iniciar sesion. HTTP ${response.status}.`);
      }

      router.replace(searchParams.get("next") || "/");
      router.refresh();
    } catch (submitError) {
      setError(submitError.message || "No se pudo iniciar sesion.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card__brand">
          <p className="brand-card__eyebrow">agenda medica inteligente</p>
          <h1 className="brand-card__title">turnerIA</h1>
          <p
            className="brand-card__eyebrow"
            style={{ marginTop: "0.5rem", marginBottom: "1rem", fontSize: "0.85rem", opacity: 0.7, letterSpacing: "0.02em", textTransform: "none" }}
          >
            by Consultoria Digital
          </p>
          <p className="subtle-copy">
            Acceso privado por JWT. El resto de la app queda bloqueado hasta iniciar sesion.
          </p>
        </div>

        {!authConfigured ? (
          <div className="inline-message inline-message--error">
            Falta configurar `AUTH_LOGIN_EMAIL`, `AUTH_LOGIN_PASSWORD` y `AUTH_JWT_SECRET`.
          </div>
        ) : null}

        {error ? <div className="inline-message inline-message--error">{error}</div> : null}

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="field field--stacked">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="recepcion@turneria.app"
              autoComplete="username"
              required
            />
          </label>

          <label className="field field--stacked">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Tu clave"
              autoComplete="current-password"
              required
            />
          </label>

          <button type="submit" className="primary-button login-form__submit" disabled={submitting || !authConfigured}>
            {submitting ? "Ingresando..." : "Iniciar sesion"}
          </button>
        </form>
      </div>
    </div>
  );
}
