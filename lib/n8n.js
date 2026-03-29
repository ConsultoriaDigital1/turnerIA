// Aca encapsulo la integracion con n8n para webhook o API sin mezclarlo con la UI.

const WEBHOOK_MODE = "webhook";
const API_MODE = "api";

function sanitize(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseBody(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return {
      raw: text
    };
  }
}

// Aca armo una config estable para que la app no lea variables sueltas en cada llamada.
export function getN8nConfig() {
  const requestedMode = sanitize(process.env.N8N_MODE).toLowerCase();
  const timeoutMs = Number(process.env.N8N_TIMEOUT_MS || 12000);

  return {
    mode: requestedMode === API_MODE ? API_MODE : WEBHOOK_MODE,
    webhookUrl: sanitize(process.env.N8N_WEBHOOK_URL),
    apiBaseUrl: sanitize(process.env.N8N_API_BASE_URL),
    apiKey: sanitize(process.env.N8N_API_KEY),
    apiPath: sanitize(process.env.N8N_API_PATH) || "/api/v1/workflows/trigger",
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 12000
  };
}

export function getN8nStatus() {
  const config = getN8nConfig();
  const configured =
    config.mode === API_MODE ? Boolean(config.apiBaseUrl && config.apiKey) : Boolean(config.webhookUrl);

  return {
    mode: config.mode,
    configured,
    target: config.mode === API_MODE ? config.apiBaseUrl || null : config.webhookUrl || null
  };
}

// Este helper concentra POST + timeout para no duplicar fetchs salientes.
async function postJson(url, { headers, body, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify(body)
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      payload: parseBody(text)
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : "No se pudo conectar con n8n."
    };
  } finally {
    clearTimeout(timer);
  }
}

// Si el modo elegido es webhook, paso por aca con el payload operativo.
async function sendViaWebhook(body, config) {
  if (!config.webhookUrl) {
    return {
      delivered: false,
      skipped: true,
      mode: WEBHOOK_MODE,
      reason: "N8N_WEBHOOK_URL no esta configurado."
    };
  }

  const result = await postJson(config.webhookUrl, {
    headers: {
      "Content-Type": "application/json",
      "X-Turneria-Source": "nextjs-dashboard"
    },
    body,
    timeoutMs: config.timeoutMs
  });

  if (!result.ok) {
    return {
      delivered: false,
      mode: WEBHOOK_MODE,
      status: result.status,
      reason: result.error || result.payload?.message || "n8n rechazo el webhook.",
      payload: result.payload || null
    };
  }

  return {
    delivered: true,
    mode: WEBHOOK_MODE,
    status: result.status,
    payload: result.payload || null
  };
}

// Si el modo elegido es API, paso por aca con bearer token y path configurado.
async function sendViaApi(body, config) {
  if (!config.apiBaseUrl || !config.apiKey) {
    return {
      delivered: false,
      skipped: true,
      mode: API_MODE,
      reason: "N8N_API_BASE_URL o N8N_API_KEY no estan configurados."
    };
  }

  const url = new URL(config.apiPath, `${config.apiBaseUrl.replace(/\/+$/, "")}/`).toString();
  const result = await postJson(url, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body,
    timeoutMs: config.timeoutMs
  });

  if (!result.ok) {
    return {
      delivered: false,
      mode: API_MODE,
      status: result.status,
      reason: result.error || result.payload?.message || "n8n rechazo la llamada API.",
      payload: result.payload || null
    };
  }

  return {
    delivered: true,
    mode: API_MODE,
    status: result.status,
    payload: result.payload || null
  };
}

// Aca decido el canal final segun la configuracion activa de n8n.
export async function sendToN8n(body) {
  const config = getN8nConfig();

  if (config.mode === API_MODE) {
    return sendViaApi(body, config);
  }

  return sendViaWebhook(body, config);
}
